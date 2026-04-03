import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"
import { discoverSkills } from "../../core/skills.ts"
import type { Skill } from "../../core/types.ts"
import { promptMultiselectWithBack } from "../helpers/prompt-multiselect-with-back.ts"
import { FLOW_BACK } from "../constants/flow-tokens.ts"

/**
 * Prompts the user to select a single skill.
 * If category is omitted, lists all skills across all categories.
 * Shows name + description for richer context.
 * isCancel checked after every prompt.
 */
export async function selectSkill(category?: string, includeBack = false): Promise<Skill | typeof FLOW_BACK | undefined> {
  const skills = await discoverSkills(category ? [category] : undefined)

  if (skills.length === 0) {
    clack.log.warning(`No skills found${category ? ` in category "${category}"` : ""}`)
    return undefined
  }

  const options = skills.map((s) => ({
    value: s as Skill | typeof FLOW_BACK,
    label: category ? s.name : `${pc.dim(s.category + "/")}${s.name}`,
    ...(s.description ? { hint: pc.dim(s.description) } : {}),
  }))

  if (includeBack) {
    options.push({ value: FLOW_BACK, label: pc.dim("← Back") })
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
export async function multiSelectSkills(
  category?: string,
  includeBack = false
): Promise<Skill[] | typeof FLOW_BACK | undefined> {
  const skills = await discoverSkills(category ? [category] : undefined)

  if (skills.length === 0) {
    clack.log.warning(`No skills found${category ? ` in category "${category}"` : ""}`)
    return []
  }

  const result = await promptMultiselectWithBack({
    message: "Select skills to deploy:",
    options: skills.map((s) => ({
      value: s.ref,
      label: `${pc.dim(s.category + "/")}${s.name}`,
      ...(s.description ? { hint: pc.dim(s.description) } : {}),
    })),
    includeBack,
    backValue: FLOW_BACK,
    mixedBackWarning: "Select skills or Back, not both.",
  })

  if (result === undefined || result === FLOW_BACK) return result
  const selectedSet = new Set(result)
  return skills.filter((skill) => selectedSet.has(skill.ref))
}
