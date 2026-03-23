import path from "path"
import { constants as fsConstants } from "fs"
import * as fs from "fs-extra"
import pc from "picocolors"
import { env } from "../../env.ts"
import { SKILL_SOURCE_DIR, ALL_IDE_KEYS, IDE_BASE_DIRS, IDE_GLOBAL_PATHS, IDE_PROJECT_PATHS } from "../../core/config.ts"
import { discoverCategories, discoverSkills } from "../../core/skills.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"

async function findExistingParent(startPath: string): Promise<string | undefined> {
  let current = path.resolve(startPath)
  while (true) {
    if (await fs.pathExists(current)) return current
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

async function isWritablePath(targetPath: string): Promise<{ ok: boolean; checked: string; reason?: string }> {
  const existing = await findExistingParent(targetPath)
  if (!existing) {
    return { ok: false, checked: targetPath, reason: "No existing parent directory found" }
  }

  try {
    await fs.access(existing, fsConstants.W_OK)
    return { ok: true, checked: existing }
  } catch (err) {
    return {
      ok: false,
      checked: existing,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function doctorFlow(): Promise<FlowResult> {
  log.step("Doctor: Environment Diagnostics")

  log.bullet("HOME", env.HOME)

  const skillRootExists = await fs.pathExists(SKILL_SOURCE_DIR)
  log.bullet("Skills root", `${SKILL_SOURCE_DIR} ${skillRootExists ? pc.green("(found)") : pc.red("(missing)")}`)

  if (skillRootExists) {
    try {
      const categories = await discoverCategories()
      const skills = await discoverSkills()
      log.bullet("Catalog", `${categories.length} categories, ${skills.length} skills`)
    } catch (err) {
      log.error("Could not scan skills catalog", err)
    }
  }

  log.step("Targets:")
  for (const ide of ALL_IDE_KEYS) {
    const baseDir = IDE_BASE_DIRS[ide]
    const baseExists = await fs.pathExists(baseDir)
    log.bullet(`${ide} base`, `${baseDir} ${baseExists ? pc.green("(detected)") : pc.yellow("(not found)")}`)

    for (const target of IDE_GLOBAL_PATHS[ide]) {
      const writable = await isWritablePath(target)
      if (writable.ok) {
        log.bullet(`${ide} global`, `${target} ${pc.green("(writable via " + writable.checked + ")")}`)
      } else {
        log.bullet(`${ide} global`, `${target} ${pc.red("(not writable)")}`)
      }
    }

    const projectPaths = IDE_PROJECT_PATHS[ide].join(", ")
    log.bullet(`${ide} project`, projectPaths)
  }

  log.success("Doctor completed.")
  return "completed"
}
