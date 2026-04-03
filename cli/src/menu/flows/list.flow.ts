import { discoverSkills, discoverCategories } from "../../core/skills.ts"
import { log } from "../../ui/logger.ts"
import * as pc from "../../ui/ansi.ts"

// ============================================================================
// FLOW: List skills
// ============================================================================

export async function listFlow(): Promise<void> {
  const categories = await discoverCategories()
  const skills = await discoverSkills()
  const ownCount = skills.filter((s) => s.source === "own").length
  const importedCount = skills.filter((s) => s.source === "imported").length

  if (skills.length === 0) {
    log.step("No skills available.")
    log.raw(`  ${pc.dim("Set your Own Skills Dir or import from GitHub.")}`)
    return
  }

  const byCategory = new Map<string, typeof skills>()
  for (const s of skills) {
    const group = byCategory.get(s.category) ?? []
    group.push(s)
    byCategory.set(s.category, group)
  }

  log.step(
    `${skills.length} skills (${ownCount} own, ${importedCount} imported) in ${categories.length} categories:`
  )

  for (const [category, categorySkills] of byCategory) {
    const categoryLabel = category
      ? `${category}/`
      : `/${pc.dim(" (uncategorized)")}`
    log.step(categoryLabel)

    for (const s of categorySkills) {
      const label = s.source === "imported"
        ? `${s.name} ${pc.yellow("(imported)")}`
        : s.name
      log.bullet(label, s.description)
    }
  }
}
