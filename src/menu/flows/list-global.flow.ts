import { listGlobalInstallations } from "../../core/installations/global.ts"
import { discoverSkills } from "../../core/skills/discovery.ts"
import { log } from "../../ui/logger.ts"
import * as pc from "../../ui/ansi.ts"
import type { Skill } from "../../core/types.ts"

export async function listGlobalFlow(): Promise<void> {
  const installations = await listGlobalInstallations()

  if (installations.length === 0) {
    log.step("No global installations found.")
    return
  }

  const skills = await discoverSkills()
  const skillByNameOrRef = new Map<string, Skill>()
  for (const s of skills) {
    skillByNameOrRef.set(s.ref, s)
    if (!skillByNameOrRef.has(s.name)) {
      skillByNameOrRef.set(s.name, s)
    }
  }

  log.step("Global Installations")

  let currentScope = ""
  let currentTargetDir = ""

  for (const installation of installations) {
    if (installation.scope !== currentScope) {
      currentScope = installation.scope
      currentTargetDir = ""
      log.raw(`\n  [${pc.cyan(currentScope)}]`)
    }

    if (installation.targetDir !== currentTargetDir) {
      currentTargetDir = installation.targetDir
      log.raw(`  ${pc.dim(currentTargetDir)}`)
    }

    const matchedSkill = skillByNameOrRef.get(installation.deployName)
    log.bullet(installation.deployName)
    if (matchedSkill?.sourceUrl) {
      log.raw(`    ${pc.dim("↳ " + matchedSkill.sourceUrl)}`)
    }
  }
}
