import path from "path"
import { constants as fsConstants } from "fs"
import * as fs from "fs-extra"
import * as pc from "../../ui/ansi.ts"
import { env } from "../../env.ts"
import { ALL_IDE_KEYS, IDE_BASE_DIRS, IDE_GLOBAL_PATHS, IDE_PROJECT_PATHS, getSkillSourceDir } from "../../core/config.ts"
import { SKILLS_HOME, IMPORTED_DIR } from "../../core/user-config.ts"
import { discoverCategories, discoverSkills } from "../../core/skills.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"
import { FLOW_COMPLETED } from "../constants/flow-tokens.ts"

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
  log.step("Doctor (diagnostics)")

  log.bullet("HOME", env.HOME)
  log.bullet("Skills home", `${SKILLS_HOME} ${(await fs.pathExists(SKILLS_HOME)) ? pc.green("(found)") : pc.yellow("(will be created)")}`)

  // --- User's own skillsDir ---
  const skillsDir = getSkillSourceDir()
  if (skillsDir) {
    const skillRootExists = await fs.pathExists(skillsDir)
    log.bullet("Own skills dir", `${skillsDir} ${skillRootExists ? pc.green("(found)") : pc.red("(missing)")}`)
  } else {
    log.bullet("Own skills dir", pc.dim("not configured  (set via Own Skills Dir)"))
  }

  // --- Imported skills dir ---
  const importedExists = await fs.pathExists(IMPORTED_DIR)
  log.bullet("Imported skills", `${IMPORTED_DIR} ${importedExists ? pc.green("(found)") : pc.dim("(empty)")}`)

  // --- Catalog summary ---
  try {
    const categories = await discoverCategories()
    const skills = await discoverSkills()
    const ownCount = skills.filter((s) => s.source === "own").length
    const importedCount = skills.filter((s) => s.source === "imported").length
    log.bullet(
      "Catalog",
      `${categories.length} categories, ${skills.length} skills` +
      (importedCount > 0 ? ` (${ownCount} own, ${importedCount} imported)` : "")
    )
  } catch (err) {
    log.error("Could not scan skills catalog", err)
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
  return FLOW_COMPLETED
}
