import { tmpdir } from "node:os"
import path from "path"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { beforeEach, describe, expect, it, vi } from "vitest"

const paths = vi.hoisted(() => {
  const testRoot = `/tmp/skillctrl-copilot-${process.pid}`
  const copilotBase = `${testRoot}/.copilot`
  const copilotSkills = `${copilotBase}/skills`
  return { testRoot, copilotBase, copilotSkills }
})

vi.mock("../src/core/config/ide-paths.ts", () => ({
  IDE_GLOBAL_PATHS: {
    copilot: [paths.copilotSkills],
  },
  IDE_BASE_DIRS: {
    copilot: paths.copilotBase,
  },
  IDE_PROJECT_PATHS: {
    copilot: [".github/skills"],
  },
}))

vi.mock("../src/core/system/safe-rm.ts", () => ({
  safeRm: vi.fn(async () => {}),
  safeRmProject: vi.fn(async () => {}),
}))

import { deploySkillGlobal } from "../src/core/deploy/service.ts"
import { exists } from "../src/core/system/fs.ts"
import type { Skill } from "../src/core/types.ts"

async function mkSkillSource(): Promise<Skill> {
  const skillRoot = await mkdtemp(path.join(tmpdir(), "skillctrl-copilot-skill-"))
  await writeFile(path.join(skillRoot, "SKILL.md"), "# Sample skill")

  return {
    ref: "development/sample-skill",
    name: "sample-skill",
    category: "development",
    path: skillRoot,
    description: "Sample",
    source: "own",
  }
}

describe("deploySkillGlobal for copilot", () => {
  beforeEach(async () => {
    await rm(paths.testRoot, { recursive: true, force: true })
  })

  it("skips Copilot global deploy when ~/.copilot is missing", async () => {
    const skill = await mkSkillSource()

    const results = await deploySkillGlobal(skill, ["copilot"])

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe("skipped")
    expect(results[0]?.reason).toBe("Copilot home not found")
  })

  it("creates ~/.copilot/skills when explicitly allowed", async () => {
    const skill = await mkSkillSource()
    await mkdir(paths.testRoot, { recursive: true })

    const results = await deploySkillGlobal(skill, ["copilot"], {
      allowCreateMissingCopilotHome: true,
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe("copied")
    expect(await exists(path.join(paths.copilotSkills, "sample-skill", "SKILL.md"))).toBe(true)
  })
})
