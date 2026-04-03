import path from "path"
import * as fs from "fs-extra"
import { IDE_GLOBAL_PATHS, IDE_PROJECT_PATHS, IDE_BASE_DIRS } from "./config.ts"
import { safeRm, safeRmProject } from "./safe-rm.ts"
import { discoverSkills, isExcluded } from "./skills.ts"
import type { IdeTarget, Skill, DeployOptions, DeployResult } from "./types.ts"

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Copies a skill folder to a single target directory.
 * Returns a DeployResult — never throws, errors are captured in the result.
 */
async function copySkillTo(
  skill: Skill,
  ide: IdeTarget,
  targetDir: string,
  remover: (skillDestPath: string) => Promise<void>
): Promise<DeployResult> {
  const skillDest = path.join(targetDir, skill.name)



  try {
    await fs.ensureDir(targetDir)
    await remover(skillDest)
    await fs.copy(skill.path, skillDest, { overwrite: true })
    return { skill, ide, targetPath: skillDest, status: "copied" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { skill, ide, targetPath: skillDest, status: "error", error: message }
  }
}

// ============================================================================
// DEPLOY SKILL — global (one skill, one or more real IDEs)
// pure logic, no UI, retorna data
// ============================================================================

export async function deploySkillGlobal(
  skill: Skill,
  ides: IdeTarget[]
): Promise<DeployResult[]> {
  const results: DeployResult[] = []

  for (const ide of ides) {
    const targetDirs = IDE_GLOBAL_PATHS[ide]
    const baseDir = IDE_BASE_DIRS[ide]

    if (!(await fs.pathExists(baseDir))) {
      // IDE not installed — skip silently (result captured as "skipped")
      for (const targetDir of targetDirs) {
        results.push({ skill, ide, targetPath: targetDir, status: "skipped", reason: "IDE not installed" })
      }
      continue
    }

    // allowedPrefixes for safeRm = all global paths of this IDE
    const allowedPrefixes = Object.values(IDE_GLOBAL_PATHS).flat()

    for (const targetDir of targetDirs) {
      const result = await copySkillTo(
        skill,
        ide,
        targetDir,
        async (dest) => safeRm(dest, allowedPrefixes)
      )
      results.push(result)
    }
  }

  return results
}

// ============================================================================
// DEPLOY SKILL — project (one skill, one or more real IDEs, project dir)
// ============================================================================

export async function deploySkillToProject(
  skill: Skill,
  ides: IdeTarget[],
  projectDir: string
): Promise<DeployResult[]> {
  const results: DeployResult[] = []

  for (const ide of ides) {
    const relativePaths = IDE_PROJECT_PATHS[ide]

    for (const relPath of relativePaths) {
      // path.join(), never concatenation
      const targetDir = path.join(projectDir, relPath)

      const result = await copySkillTo(
        skill,
        ide,
        targetDir,
        async (dest) => safeRmProject(dest, projectDir)
      )
      results.push(result)
    }
  }

  return results
}

// ============================================================================
// DEPLOY ALL — global
// ============================================================================

export async function deployAllGlobal(
  ides: IdeTarget[],
  options: DeployOptions
): Promise<DeployResult[]> {
  const skills = await discoverSkills()
  const results: DeployResult[] = []

  for (const skill of skills) {
    if (isExcluded(skill.ref, options.excludedRefs)) continue
    const skillResults = await deploySkillGlobal(skill, ides)
    results.push(...skillResults)
  }

  return results
}
