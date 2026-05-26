import { beforeEach, describe, expect, it, vi } from "vitest"
import { mkdir, rm, writeFile } from "node:fs/promises"

const paths = vi.hoisted(() => {
  const root = `/tmp/skillctrl-global-installations-${process.pid}`
  const claudeBase = `${root}/.claude`
  const claudeSkills = `${claudeBase}/skills`
  const codexBase = `${root}/.agents`
  const codexSkills = `${codexBase}/skills`
  const openCodeBase = `${root}/.config/opencode`
  const openCodeSkills = `${openCodeBase}/skills`

  return {
    root,
    claudeBase,
    claudeSkills,
    codexBase,
    codexSkills,
    openCodeBase,
    openCodeSkills,
  }
})

vi.mock("../src/core/config/ide-paths.ts", () => ({
  GLOBAL_INSTALLATION_TARGETS: [
    { scope: "agents", baseDir: paths.codexBase, targetDir: paths.codexSkills },
    { scope: "claude", baseDir: paths.claudeBase, targetDir: paths.claudeSkills },
    { scope: "opencode", baseDir: paths.openCodeBase, targetDir: paths.openCodeSkills },
  ],
}))

import { listGlobalInstallations } from "../src/core/installations/global.ts"

describe("listGlobalInstallations", () => {
  beforeEach(async () => {
    await rm(paths.root, { recursive: true, force: true })
  })

  it("lists real global skill directories from physical scopes while skipping invalid entries", async () => {
    await mkdir(paths.claudeSkills, { recursive: true })
    await mkdir(paths.codexSkills, { recursive: true })
    await mkdir(paths.openCodeSkills, { recursive: true })
    await mkdir(`${paths.claudeSkills}/alpha-skill`, { recursive: true })
    await mkdir(`${paths.claudeSkills}/beta-skill`, { recursive: true })
    await mkdir(`${paths.codexSkills}/gamma-skill`, { recursive: true })
    await mkdir(`${paths.openCodeSkills}/native-open-code`, { recursive: true })
    await writeFile(`${paths.claudeSkills}/README.txt`, "ignore me")
    await mkdir(`${paths.claudeSkills}/.hidden-skill`, { recursive: true })
    await mkdir(paths.openCodeBase, { recursive: true })
    await mkdir(`${paths.claudeSkills}/shared-claude`, { recursive: true })
    await mkdir(`${paths.codexSkills}/shared-codex`, { recursive: true })

    const installations = await listGlobalInstallations()

    expect(installations).toEqual([
      { scope: "agents", targetDir: paths.codexSkills, deployName: "gamma-skill" },
      { scope: "agents", targetDir: paths.codexSkills, deployName: "shared-codex" },
      { scope: "claude", targetDir: paths.claudeSkills, deployName: "alpha-skill" },
      { scope: "claude", targetDir: paths.claudeSkills, deployName: "beta-skill" },
      { scope: "claude", targetDir: paths.claudeSkills, deployName: "shared-claude" },
      { scope: "opencode", targetDir: paths.openCodeSkills, deployName: "native-open-code" },
    ])
  })
})
