import * as clack from "@clack/prompts"
import pc from "picocolors"
import { ALL_IDE_KEYS } from "../../core/config.ts"
import type { IdeTarget } from "../../core/types.ts"

/**
 * Prompts the user to select a single IDE (or all).
 * Returns the selected IdeTarget, "all", "back", or undefined on cancel.
 * isCancel checked after every prompt.
 */
export async function selectIde(includeAll = true, includeBack = false): Promise<IdeTarget | "all" | "back" | undefined> {
  const options: { value: IdeTarget | "all" | "back"; label: string }[] = includeAll
    ? [{ value: "all", label: pc.bold("all IDEs") }, ...ALL_IDE_KEYS.map((k) => ({ value: k as IdeTarget, label: k }))]
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
