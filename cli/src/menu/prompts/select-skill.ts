import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"
import { discoverSkills } from "../../core/skills.ts"
import type { Skill } from "../../core/types.ts"

/**
 * Prompts the user to select a single skill.
 * If category is omitted, lists all skills across all categories.
 * Shows name + description for richer context.
 * isCancel checked after every prompt.
 */
export async function selectSkill(category?: string, includeBack = false): Promise<Skill | "back" | undefined> {
  const skills = await discoverSkills(category ? [category] : undefined)

  if (skills.length === 0) {
    clack.log.warning(`No skills found${category ? ` in category "${category}"` : ""}`)
    return undefined
  }

  const options = skills.map((s) => ({
    value: s as Skill | "back",
    label: category ? s.name : `${pc.dim(s.category + "/")}${s.name}`,
    ...(s.description ? { hint: pc.dim(s.description) } : {}),
  }))

  if (includeBack) {
    options.push({ value: "back", label: pc.dim("← Back") })
  }

  const result = await clack.select({
    message: category ? `Select skill (${category}):` : "Select skill:",
    options,
  })

  if (clack.isCancel(result)) {
    return undefined
  }

  return result
}

/**
 * Prompts the user to select multiple skills across all categories.
 * Used in the "Deploy to project" flow.
 * isCancel checked after every prompt.
 */
export async function multiSelectSkills(category?: string, includeBack = false): Promise<Skill[] | "back" | undefined> {
  const skills = await discoverSkills(category ? [category] : undefined)

  if (skills.length === 0) {
    clack.log.warning(`No skills found${category ? ` in category "${category}"` : ""}`)
    return []
  }

  while (true) {
    const result = await clack.multiselect({
      message: "Select skills to deploy:",
      options: [
        ...skills.map((s) => ({
          value: s as Skill | "back",
          label: `${pc.dim(s.category + "/")}${s.name}`,
          ...(s.description ? { hint: pc.dim(s.description) } : {}),
        })),
        ...(includeBack ? [{ value: "back" as const, label: pc.dim("← Back") }] : []),
      ],
      required: false,
    })

    if (clack.isCancel(result)) {
      return undefined
    }

    const values = new Set(result as Array<Skill | "back">)
    if (values.has("back")) {
      if (values.size === 1) return "back"
      clack.log.warning("Select skills or Back, not both.")
      continue
    }

    const selectedSkills = skills.filter((skill) => values.has(skill))
    if (selectedSkills.length === 0) {
      clack.log.warning("Press Space to select, Enter to submit.")
      continue
    }

    return selectedSkills
  }
}
