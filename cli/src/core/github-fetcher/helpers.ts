import path from "path"
import { MSG_NO_SKILLS } from "./constants.ts"
import type {
  GitHubContentDir,
  GitHubContentEntry,
  GitHubContentFile,
  GitTreeEntry,
  GitTreePayload,
} from "./types.ts"

export async function mapSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return []

  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  async function runWorker(): Promise<void> {
    while (true) {
      const index = cursor
      cursor++
      if (index >= items.length) return
      try {
        const value = await worker(items[index] as T, index)
        results[index] = { status: "fulfilled", value }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

export function normalizeRemotePath(remotePath: string): string {
  return remotePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

export function buildContentsApiUrl(owner: string, repo: string, contentPath: string, branch?: string | null): string {
  const normalized = normalizeRemotePath(contentPath)
  const encodedPath = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  const base = `https://api.github.com/repos/${owner}/${repo}/contents`
  const url = encodedPath ? `${base}/${encodedPath}` : base
  if (!branch) return url

  const params = new URLSearchParams({ ref: branch })
  return `${url}?${params.toString()}`
}

export function buildRepoApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}`
}

export function buildGitTreeApiUrl(owner: string, repo: string, branch: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
}

export function toDirectoryListing(payload: unknown): GitHubContentEntry[] {
  if (!Array.isArray(payload)) {
    throw new Error(MSG_NO_SKILLS)
  }

  return payload
    .filter((entry): entry is GitHubContentEntry => {
      if (!entry || typeof entry !== "object") return false
      const maybe = entry as { type?: unknown; name?: unknown; path?: unknown }
      return typeof maybe.type === "string" && typeof maybe.name === "string" && typeof maybe.path === "string"
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function toFile(payload: unknown): GitHubContentFile {
  if (!payload || typeof payload !== "object") {
    throw new Error(MSG_NO_SKILLS)
  }

  const maybe = payload as GitHubContentFile
  if (maybe.type !== "file" || typeof maybe.name !== "string" || typeof maybe.path !== "string") {
    throw new Error(MSG_NO_SKILLS)
  }

  return maybe
}

export function directoryHasSkillMd(listing: GitHubContentEntry[]): boolean {
  return listing.some((entry) => entry.type === "file" && entry.name === "SKILL.md")
}

export function listDirectoryPaths(listing: GitHubContentEntry[]): string[] {
  return listing
    .filter((entry): entry is GitHubContentDir => entry.type === "dir")
    .map((entry) => entry.path)
}

export function parseSkillDescription(content: string): string | undefined {
  const lines = content.split("\n")

  let i = 0
  if (lines[0]?.trim() === "---") {
    i = 1
    while (i < lines.length && lines[i]?.trim() !== "---") i++
    i++
  }

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? ""
    if (!line || line.startsWith("#")) {
      i++
      continue
    }
    return line.length > 120 ? line.slice(0, 117) + "..." : line
  }

  return undefined
}

export function parseFrontmatterName(content: string): string | undefined {
  const lines = content.split("\n")
  if (lines[0]?.trim() !== "---") return undefined

  let i = 1
  while (i < lines.length && lines[i]?.trim() !== "---") {
    const line = lines[i]?.trim() ?? ""
    const match = /^name\s*:\s*(.+)$/i.exec(line)
    if (match) {
      return match[1]?.trim().replace(/^['"]|['"]$/g, "") || undefined
    }
    i++
  }

  return undefined
}

export function canonicalSkillUrl(owner: string, repo: string, branch: string, remoteBasePath: string): string {
  const normalized = normalizeRemotePath(remoteBasePath)
  if (!normalized) {
    return `https://github.com/${owner}/${repo}/tree/${branch}`
  }
  return `https://github.com/${owner}/${repo}/tree/${branch}/${normalized}`
}

export function relativeRemotePath(basePath: string, absolutePath: string): string {
  const normalizedBase = normalizeRemotePath(basePath)
  const normalizedAbs = normalizeRemotePath(absolutePath)

  if (!normalizedBase) return normalizedAbs
  if (normalizedAbs === normalizedBase) return ""

  const prefix = `${normalizedBase}/`
  if (normalizedAbs.startsWith(prefix)) {
    return normalizedAbs.slice(prefix.length)
  }

  return normalizedAbs
}

export function rootsFromGitTreePayload(payload: unknown): { roots: string[]; truncated: boolean } {
  if (!payload || typeof payload !== "object") {
    throw new Error(MSG_NO_SKILLS)
  }

  const data = payload as GitTreePayload
  const truncated = data.truncated === true
  if (!Array.isArray(data.tree)) {
    return { roots: [], truncated }
  }

  const roots = new Set<string>()
  for (const entry of data.tree) {
    if (!entry || typeof entry !== "object") continue
    const maybe = entry as Partial<GitTreeEntry>
    if (maybe.type !== "blob" || typeof maybe.path !== "string") continue
    if (!(maybe.path === "SKILL.md" || maybe.path.endsWith("/SKILL.md"))) continue

    const dir = path.posix.dirname(maybe.path)
    const root = dir === "." ? "" : normalizeRemotePath(dir)
    roots.add(root)
  }

  return { roots: [...roots].sort((a, b) => a.localeCompare(b)), truncated }
}
