import { discoverSkills, discoverCategories } from "../../core/skills.ts"
import { log } from "../../ui/logger.ts"
import * as pc from "../../ui/ansi.ts"

// ============================================================================
// FLOW: List skills
// ============================================================================

export async function listFlow(): Promise<void> {
  const categories = await discoverCategories()
  const skills = await discoverSkills()

  const byCategory = new Map<string, typeof skills>()
  for (const s of skills) {
    const group = byCategory.get(s.category) ?? []
    group.push(s)
    byCategory.set(s.category, group)
  }

  log.step(`${skills.length} skills in ${categories.length} categories:`)

  for (const [category, categorySkills] of byCategory) {
    log.step(`${category}/`)
    for (const s of categorySkills) {
      const label = s.source === "imported"
        ? `${s.name} ${pc.yellow("⬇ imported")}`
        : s.name
      log.bullet(label, s.description)
    }
  }
}
