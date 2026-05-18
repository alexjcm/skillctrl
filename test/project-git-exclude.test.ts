import { tmpdir } from "node:os"
import path from "path"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import {
  appendGitExcludeRules,
  computeMissingGitExcludeRules,
  resolveProjectGitExcludePath,
  suggestGitExcludeRulesForIdes,
} from "../src/core/deploy/git-exclude.ts"

async function mkTmp(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

describe("suggestGitExcludeRulesForIdes", () => {
  it("returns rules derived from selected IDE project paths", () => {
    expect(suggestGitExcludeRulesForIdes(["codex"])).toEqual([".agents/"])
    expect(suggestGitExcludeRulesForIdes(["copilot"])).toEqual([])
    expect(suggestGitExcludeRulesForIdes(["cursor"])).toEqual([".agents/", ".cursor/"])
    expect(suggestGitExcludeRulesForIdes(["junie"])).toEqual([".junie/"])
    expect(suggestGitExcludeRulesForIdes(["opencode"])).toEqual([".agents/", ".claude/", ".opencode/"])
    expect(suggestGitExcludeRulesForIdes(["copilot", "cursor"])).toEqual([".agents/", ".cursor/"])
  })
})

describe("computeMissingGitExcludeRules", () => {
  it("adds only exact missing rules after trim normalization", () => {
    const existing = "# keep local ignores\n.cursor/\n .claude/ \n"
    const desired = [".cursor/", ".claude/", ".agents/"]
    expect(computeMissingGitExcludeRules(existing, desired)).toEqual([".agents/"])
  })
})

describe("appendGitExcludeRules", () => {
  it("appends rules with stable newline handling", () => {
    expect(appendGitExcludeRules("existing", [".agents/"])).toBe("existing\n.agents/\n")
    expect(appendGitExcludeRules("", [".agents/"])).toBe(".agents/\n")
  })
})

describe("resolveProjectGitExcludePath", () => {
  it("returns null when project has no .git", async () => {
    const project = await mkTmp("skills-no-git-")
    await expect(resolveProjectGitExcludePath(project)).resolves.toBeNull()
    await rm(project, { recursive: true, force: true })
  })

  it("resolves .git/info/exclude for standard repos", async () => {
    const project = await mkTmp("skills-git-dir-")
    await mkdir(path.join(project, ".git"), { recursive: true })

    await expect(resolveProjectGitExcludePath(project)).resolves.toBe(
      path.join(project, ".git", "info", "exclude")
    )
    await rm(project, { recursive: true, force: true })
  })

  it("resolves .git file pointers (worktree style)", async () => {
    const root = await mkTmp("skills-git-file-")
    const project = path.join(root, "project")
    const gitMeta = path.join(root, "meta", "worktree-a")

    await mkdir(project, { recursive: true })
    await mkdir(gitMeta, { recursive: true })
    await writeFile(path.join(project, ".git"), "gitdir: ../meta/worktree-a\n", "utf8")

    await expect(resolveProjectGitExcludePath(project)).resolves.toBe(
      path.join(gitMeta, "info", "exclude")
    )
    await rm(root, { recursive: true, force: true })
  })
})
