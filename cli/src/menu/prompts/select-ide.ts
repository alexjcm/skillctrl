import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"
import { ALL_IDE_KEYS } from "../../core/config.ts"
import type { IdeTarget } from "../../core/types.ts"

/**
 * Prompts the user to select a single IDE (or all).
 * Returns the selected IdeTarget, "all", "back", or undefined on cancel.
 * isCancel checked after every prompt.
 */
export async function selectIde(includeAll = true, includeBack = false): Promise<IdeTarget | "all" | "back" | undefined> {
  const options: { value: IdeTarget | "all" | "back"; label: string }[] = includeAll
    ? [{ value: "all", label: pc.bold("All IDEs") }, ...ALL_IDE_KEYS.map((k) => ({ value: k as IdeTarget, label: k }))]
    : ALL_IDE_KEYS.map((k) => ({ value: k as IdeTarget, label: k }))

  if (includeBack) {
    options.push({ value: "back", label: pc.dim("← Back") })
  }

  const result = await clack.select({
    message: "Select target IDE:",
    options,
  })

  if (clack.isCancel(result)) {
    return undefined
  }

  return result
}

/**
 * Prompts the user to select one or more IDEs.
 * Returns selected IDEs, "back", or undefined on cancel.
 * Includes optional back item inside multiselect.
 */
export async function selectIdes(includeBack = false): Promise<IdeTarget[] | "back" | undefined> {
  while (true) {
    const result = await clack.multiselect({
      message: "Select target IDE(s):",
      required: false,
      options: [
        ...ALL_IDE_KEYS.map((k) => ({ value: k as IdeTarget, label: k })),
        ...(includeBack ? [{ value: "back" as const, label: pc.dim("← Back") }] : []),
      ],
    })

    if (clack.isCancel(result)) {
      return undefined
    }

    const values = new Set(result as Array<IdeTarget | "back">)
    if (values.has("back")) {
      if (values.size === 1) return "back"
      clack.log.warning("Select IDE(s) or Back, not both.")
      continue
    }

    const selected = ALL_IDE_KEYS.filter((ide) => values.has(ide))
    if (selected.length === 0) {
      clack.log.warning("Press Space to select, Enter to submit.")
      continue
    }

    return selected
  }
}
