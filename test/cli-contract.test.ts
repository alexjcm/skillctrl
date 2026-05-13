import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { listCmd } from "../src/commands/list.cmd.ts"
import { deployCmd } from "../src/commands/deploy.cmd.ts"
import { importCmd } from "../src/commands/import.cmd.ts"
import * as output from "../src/ui/output.ts"
import * as discovery from "../src/core/skills/discovery.ts"
import * as deployService from "../src/core/deploy/service.ts"
import * as github from "../src/core/imports/github/index.ts"
import * as sync from "../src/core/imports/sync.ts"

vi.mock("../src/core/skills/discovery.ts")
vi.mock("../src/core/deploy/service.ts")
vi.mock("../src/core/imports/github/index.ts")
vi.mock("../src/core/imports/sync.ts")
vi.mock("../src/core/config/user-config.ts", () => ({
  readUserConfig: vi.fn(() => ({ excludedSkills: [] }))
}))

describe("CLI JSON Contracts", () => {
  let exitMock: ReturnType<typeof vi.spyOn>
  let printJsonSpy: ReturnType<typeof vi.spyOn>

  let exitCodeReceived: number | undefined

  beforeEach(() => {
    output.setJsonMode(true)
    exitCodeReceived = undefined
    
    exitMock = vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCodeReceived = code as number
      return undefined as never
    })
    
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    printJsonSpy = vi.spyOn(output, "printJson").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    output.setJsonMode(false)
  })

  it("list --json contract", async () => {
    vi.mocked(discovery.discoverSkills).mockResolvedValue([
      { ref: "cat/skill-name", name: "skill-name", category: "cat", source: "own", path: "fake" }
    ])

    await listCmd.parseAsync(["node", "test"])
    expect(exitCodeReceived).toBe(0)

    expect(printJsonSpy).toHaveBeenCalledWith({
      skills: [
        { ref: "cat/skill-name", name: "skill-name", category: "cat", source: "own" }
      ]
    })
  })

  it("deploy global --json contract", async () => {
    vi.mocked(discovery.discoverSkills).mockResolvedValue([
      { ref: "cat/skill", name: "skill", category: "cat", source: "own", path: "fake" }
    ])
    vi.mocked(deployService.deploySkillGlobal).mockResolvedValue([
      { skill: { ref: "cat/skill", name: "skill", category: "cat", source: "own", path: "fake" }, ide: "claude", status: "copied", targetPath: "/fake/path" },
      { skill: { ref: "cat/skill", name: "skill", category: "cat", source: "own", path: "fake" }, ide: "cursor", status: "error", error: "Permission denied", targetPath: "/fake/path2" }
    ])

    await deployCmd.parseAsync(["node", "test", "global", "--ide", "claude,cursor"])
    expect(exitCodeReceived).toBe(0)

    expect(printJsonSpy).toHaveBeenCalledWith({
      results: [
        { ref: "cat/skill", name: "skill", ide: "claude", status: "copied", targetPath: "/fake/path" },
        { ref: "cat/skill", name: "skill", ide: "cursor", status: "error", targetPath: "/fake/path2", error: "Permission denied" }
      ],
      summary: { copied: 1, skipped: 0, errors: 1 }
    })
  })

  it("import <source> --json contract", async () => {
    vi.mocked(github.fetchSkillCandidatePreviewsFromInput).mockResolvedValue([
      { name: "skill", canonicalUrl: "https://github.com/o/r/tree/m/skill", owner: "o", repo: "r", branch: "m", remoteBasePath: "skill" }
    ])
    vi.mocked(github.hydrateSkillCandidate).mockResolvedValue({
      name: "skill",
      canonicalUrl: "https://github.com/o/r/tree/m/skill",
      skillMdContent: "---\nname: skill\ndescription: desc\n---\n",
      remoteBasePath: "skill",
      files: []
    })
    vi.mocked(sync.downloadAndSyncImportedSkill).mockResolvedValue(3)
    vi.mocked(sync.buildImportedTargetRef).mockReturnValue("skill")

    await importCmd.parseAsync(["node", "test", "owner/repo", "--yes"])
    expect(exitCodeReceived).toBe(0)

    expect(printJsonSpy).toHaveBeenCalledWith({
      imported: [{ ref: "skill", name: "skill", source: "https://github.com/o/r/tree/m/skill", files: 3 }],
      failed: [],
      summary: { imported: 1, failed: 0 }
    })
  })
})
