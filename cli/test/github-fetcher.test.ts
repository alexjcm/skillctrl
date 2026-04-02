import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchSkillCandidatePreviewsFromInput } from "../src/core/github-fetcher.ts"

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
  })
}

describe("github-fetcher critical behavior", () => {
  const originalToken = process.env["GITHUB_TOKEN"]

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalToken === undefined) delete process.env["GITHUB_TOKEN"]
    else process.env["GITHUB_TOKEN"] = originalToken
  })

  it("sends Authorization header when GITHUB_TOKEN is set", async () => {
    process.env["GITHUB_TOKEN"] = "test_token"
    const calls: Array<{ url: string; init?: RequestInit }> = []

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })

      if (url === "https://api.github.com/repos/openai/skills/contents/skills/.curated/security-threat-model?ref=main") {
        return jsonResponse([
          { type: "file", name: "SKILL.md", path: "skills/.curated/security-threat-model/SKILL.md", download_url: "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/security-threat-model/SKILL.md" },
        ])
      }

      throw new Error(`Unexpected URL: ${url}`)
    }))

    const previews = await fetchSkillCandidatePreviewsFromInput("https://github.com/openai/skills/tree/main/skills/.curated/security-threat-model")
    expect(previews).toHaveLength(1)

    expect(calls).toHaveLength(1)
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>
    expect(headers["Authorization"]).toBe("Bearer test_token")
    expect(headers["Accept"]).toBe("application/vnd.github+json")
  })

  it("includes retry time in rate-limit error message", async () => {
    delete process.env["GITHUB_TOKEN"]

    vi.stubGlobal("fetch", vi.fn(async () => {
      return jsonResponse(
        { message: "API rate limit exceeded" },
        403,
        {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "2000000000",
        }
      )
    }))

    await expect(
      fetchSkillCandidatePreviewsFromInput("https://github.com/openai/skills/tree/main/skills")
    ).rejects.toThrow("Retry after")

    await expect(
      fetchSkillCandidatePreviewsFromInput("https://github.com/openai/skills/tree/main/skills")
    ).rejects.toThrow("local:")
  })

  it("preview discovery does not download raw skill files", async () => {
    delete process.env["GITHUB_TOKEN"]
    const calls: string[] = []

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)

      if (url === "https://api.github.com/repos/openai/skills/contents/skills?ref=main") {
        return jsonResponse([
          { type: "dir", name: ".curated", path: "skills/.curated" },
          { type: "dir", name: ".system", path: "skills/.system" },
        ])
      }

      if (url === "https://api.github.com/repos/openai/skills/contents/skills/.curated?ref=main") {
        return jsonResponse([
          { type: "dir", name: "skill-a", path: "skills/.curated/skill-a" },
          { type: "dir", name: "skill-b", path: "skills/.curated/skill-b" },
        ])
      }

      if (url === "https://api.github.com/repos/openai/skills/contents/skills/.system?ref=main") {
        return jsonResponse([
          { type: "dir", name: "skill-c", path: "skills/.system/skill-c" },
        ])
      }

      throw new Error(`Unexpected URL: ${url}`)
    }))

    const previews = await fetchSkillCandidatePreviewsFromInput("https://github.com/openai/skills/tree/main/skills")

    expect(previews.map((p) => p.remoteBasePath).sort()).toEqual([
      "skills/.curated/skill-a",
      "skills/.curated/skill-b",
      "skills/.system/skill-c",
    ])

    expect(calls.some((url) => url.includes("raw.githubusercontent.com"))).toBe(false)
  })
})
