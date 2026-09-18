import path from "path"
import { access, constants } from "node:fs/promises"
import * as pc from "../../ui/ansi.ts"
import { exists } from "../../core/system/fs.ts"
import { env } from "../../env.ts"
import { ALL_IDE_KEYS, IDE_BASE_DIRS, IDE_GLOBAL_PATHS, IDE_PROJECT_PATHS, getSkillSourceDir } from "../../core/config/ide-paths.ts"
import { SKILLS_HOME, IMPORTED_DIR } from "../../core/config/user-config.ts"
import {
  hasGitHubToken,
  isGitHubTokenBypassed,
  isGitHubTokenConfiguredInEnv,
} from "../../core/imports/github/index.ts"
import { discoverCategories, discoverSkills } from "../../core/skills/discovery.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"
import { FLOW_COMPLETED } from "../constants/flow-tokens.ts"

async function findExistingParent(startPath: string): Promise<string | undefined> {
  let current = path.resolve(startPath)
  while (true) {
    if (await exists(current)) return current
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
    await access(existing, constants.W_OK)
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
  log.bullet("Skills home", `${SKILLS_HOME} ${(await exists(SKILLS_HOME)) ? pc.green("(found)") : pc.yellow("(will be created)")}`)

  // --- User's own skillsDir ---
  const skillsDir = getSkillSourceDir()
  if (skillsDir) {
    const skillRootExists = await exists(skillsDir)
    log.bullet("Own skills dir", `${skillsDir} ${skillRootExists ? pc.green("(found)") : pc.red("(missing)")}`)
  } else {
    log.bullet("Own skills dir", pc.dim("not configured  (set via Own Skills Dir)"))
  }

  // --- Imported skills dir ---
  const importedExists = await exists(IMPORTED_DIR)
  log.bullet("Imported skills", `${IMPORTED_DIR} ${importedExists ? pc.green("(found)") : pc.dim("(empty)")}`)

  // --- GitHub token ---
  if (hasGitHubToken()) {
    log.bullet("GitHub token", `${pc.green("configured")} (via GITHUB_TOKEN)`)
  } else if (isGitHubTokenConfiguredInEnv() && isGitHubTokenBypassed()) {
    log.bullet("GitHub token", `${pc.yellow("bypassed")} (session fallback to unauthenticated)`)
  } else {
    log.bullet("GitHub token", `${pc.dim("not configured")} (unauthenticated limit: 60 req/h)`)
  }

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
    const baseExists = await exists(baseDir)
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
