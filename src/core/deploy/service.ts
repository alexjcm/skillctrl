import path from "path"
import { cp, mkdir } from "node:fs/promises"
import { IDE_GLOBAL_PATHS, IDE_PROJECT_PATHS, IDE_BASE_DIRS } from "../config/ide-paths.ts"
import { exists } from "../system/fs.ts"
import { safeRm, safeRmProject } from "../system/safe-rm.ts"
import { discoverSkills, isExcluded } from "../skills/discovery.ts"
import type { IdeTarget, Skill, DeployOptions, DeployResult, DeployRuntimeOptions } from "../types.ts"

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
    await mkdir(targetDir, { recursive: true })
    await remover(skillDest)
    await cp(skill.path, skillDest, { recursive: true, force: true })
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
  ides: IdeTarget[],
  runtimeOptions: DeployRuntimeOptions = {}
): Promise<DeployResult[]> {
  const results: DeployResult[] = []

  for (const ide of ides) {
    const targetDirs = IDE_GLOBAL_PATHS[ide]
    const baseDir = IDE_BASE_DIRS[ide]

    if (!(await exists(baseDir))) {
      if (ide === "copilot" && runtimeOptions.allowCreateMissingCopilotHome) {
        // Continue and let mkdir() create ~/.copilot/skills on demand.
      } else {
      // IDE not installed — skip silently (result captured as "skipped")
        const reason = ide === "copilot" ? "Copilot home not found" : "IDE not installed"
        for (const targetDir of targetDirs) {
          results.push({ skill, ide, targetPath: targetDir, status: "skipped", reason })
        }
        continue
      }
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
  options: DeployOptions,
  runtimeOptions: DeployRuntimeOptions = {}
): Promise<DeployResult[]> {
  const skills = await discoverSkills()
  const results: DeployResult[] = []

  for (const skill of skills) {
    if (isExcluded(skill.ref, options.excludedRefs)) continue
    const skillResults = await deploySkillGlobal(skill, ides, runtimeOptions)
    results.push(...skillResults)
  }

  return results
}
