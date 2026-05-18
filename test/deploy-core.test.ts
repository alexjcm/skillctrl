import { tmpdir } from "node:os"
import path from "path"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { exists } from "../src/core/system/fs.ts"
import { describe, it, expect } from "vitest"
import { deploySkillToProject } from "../src/core/deploy/service.ts"
import type { Skill } from "../src/core/types.ts"

async function mkTmp(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

describe("deploySkillToProject", () => {
  it("copies one skill to all configured project targets for cursor", async () => {
    const tmp = await mkTmp("skills-deploy-project-")
    const skillDir = path.join(tmp, "skill-source")
    const projectDir = path.join(tmp, "project")

    await mkdir(skillDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(skillDir, "SKILL.md"), "# Sample skill")
    await writeFile(path.join(skillDir, "notes.txt"), "content")

    const skill: Skill = {
      ref: "development/sample-skill",
      name: "sample-skill",
      category: "development",
      path: skillDir,
      description: "Sample",
    }

    const results = await deploySkillToProject(skill, ["cursor"], projectDir)
    expect(results.every((r) => r.status === "copied")).toBe(true)
    expect(results).toHaveLength(2)

    const targetA = path.join(projectDir, ".cursor", "skills", "sample-skill", "SKILL.md")
    const targetB = path.join(projectDir, ".agents", "skills", "sample-skill", "SKILL.md")
    expect(await exists(targetA)).toBe(true)
    expect(await exists(targetB)).toBe(true)
  })

  it("copies one skill to OpenCode native and compatibility project paths", async () => {
    const tmp = await mkTmp("skills-deploy-project-opencode-")
    const skillDir = path.join(tmp, "skill-source")
    const projectDir = path.join(tmp, "project")

    await mkdir(skillDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(skillDir, "SKILL.md"), "# Sample skill")
    await writeFile(path.join(skillDir, "notes.txt"), "content")

    const skill: Skill = {
      ref: "development/sample-skill",
      name: "sample-skill",
      category: "development",
      path: skillDir,
      description: "Sample",
    }

    const results = await deploySkillToProject(skill, ["opencode"], projectDir)
    expect(results.every((r) => r.status === "copied")).toBe(true)
    expect(results).toHaveLength(3)

    const targetA = path.join(projectDir, ".opencode", "skills", "sample-skill", "SKILL.md")
    const targetB = path.join(projectDir, ".claude", "skills", "sample-skill", "SKILL.md")
    const targetC = path.join(projectDir, ".agents", "skills", "sample-skill", "SKILL.md")
    expect(await exists(targetA)).toBe(true)
    expect(await exists(targetB)).toBe(true)
    expect(await exists(targetC)).toBe(true)
  })

  it("copies one skill to Junie project path", async () => {
    const tmp = await mkTmp("skills-deploy-project-junie-")
    const skillDir = path.join(tmp, "skill-source")
    const projectDir = path.join(tmp, "project")

    await mkdir(skillDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(skillDir, "SKILL.md"), "# Sample skill")

    const skill: Skill = {
      ref: "development/sample-skill",
      name: "sample-skill",
      category: "development",
      path: skillDir,
      description: "Sample",
    }

    const results = await deploySkillToProject(skill, ["junie"], projectDir)
    expect(results.every((r) => r.status === "copied")).toBe(true)
    expect(results).toHaveLength(1)

    const target = path.join(projectDir, ".junie", "skills", "sample-skill", "SKILL.md")
    expect(await exists(target)).toBe(true)
  })

  it("copies one skill to Copilot native project path", async () => {
    const tmp = await mkTmp("skills-deploy-project-copilot-")
    const skillDir = path.join(tmp, "skill-source")
    const projectDir = path.join(tmp, "project")

    await mkdir(skillDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(skillDir, "SKILL.md"), "# Sample skill")

    const skill: Skill = {
      ref: "development/sample-skill",
      name: "sample-skill",
      category: "development",
      path: skillDir,
      description: "Sample",
    }

    const results = await deploySkillToProject(skill, ["copilot"], projectDir)
    expect(results.every((r) => r.status === "copied")).toBe(true)
    expect(results).toHaveLength(1)

    const target = path.join(projectDir, ".github", "skills", "sample-skill", "SKILL.md")
    expect(await exists(target)).toBe(true)
  })

  it("replaces existing deployed folder content", async () => {
    const tmp = await mkTmp("skills-deploy-project-replace-")
    const skillDir = path.join(tmp, "skill-source")
    const projectDir = path.join(tmp, "project")
    const existingTarget = path.join(projectDir, ".claude", "skills", "sample-skill")

    await mkdir(skillDir, { recursive: true })
    await mkdir(existingTarget, { recursive: true })
    await writeFile(path.join(existingTarget, "old.txt"), "old")
    await writeFile(path.join(skillDir, "SKILL.md"), "# New skill")

    const skill: Skill = {
      ref: "development/sample-skill",
      name: "sample-skill",
      category: "development",
      path: skillDir,
      description: "Sample",
    }

    const results = await deploySkillToProject(skill, ["claude"], projectDir)
    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe("copied")

    expect(await exists(path.join(existingTarget, "old.txt"))).toBe(false)
    expect(await exists(path.join(existingTarget, "SKILL.md"))).toBe(true)
  })
})
