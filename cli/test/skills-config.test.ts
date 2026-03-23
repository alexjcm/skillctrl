import os from "os"
import path from "path"
import * as fs from "fs-extra"
import { describe, it, expect } from "vitest"
import { loadExcludedRefsFromPath } from "../src/core/skills-config.ts"

async function mkTmp(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

describe("loadExcludedRefsFromPath", () => {
  it("returns excluded skills from valid config", async () => {
    const dir = await mkTmp("skills-config-valid-")
    const cfgPath = path.join(dir, "skills.config.json")
    await fs.writeJSON(cfgPath, {
      excludedSkills: ["development/example-skill", "tools/another-skill"],
    })

    const refs = loadExcludedRefsFromPath(cfgPath)
    expect(refs).toEqual(["development/example-skill", "tools/another-skill"])
  })

  it("returns empty list when file is missing", async () => {
    const dir = await mkTmp("skills-config-missing-")
    const refs = loadExcludedRefsFromPath(path.join(dir, "missing.json"))
    expect(refs).toEqual([])
  })

  it("returns empty list when config is invalid json", async () => {
    const dir = await mkTmp("skills-config-invalid-json-")
    const cfgPath = path.join(dir, "skills.config.json")
    await fs.writeFile(cfgPath, "{invalid-json")

    const refs = loadExcludedRefsFromPath(cfgPath)
    expect(refs).toEqual([])
  })

  it("returns empty list when schema is invalid", async () => {
    const dir = await mkTmp("skills-config-invalid-schema-")
    const cfgPath = path.join(dir, "skills.config.json")
    await fs.writeJSON(cfgPath, {
      excludedSkills: [123],
    })

    const refs = loadExcludedRefsFromPath(cfgPath)
    expect(refs).toEqual([])
  })
})

