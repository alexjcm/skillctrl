import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"
import { ALL_IDE_KEYS } from "../../core/config/ide-paths.ts"
import type { IdeTarget } from "../../core/types.ts"
import { promptMultiselectWithBack } from "../helpers/prompt-multiselect-with-back.ts"
import { FLOW_BACK } from "../constants/flow-tokens.ts"

/**
 * Prompts the user to select a single IDE.
 * Returns the selected IdeTarget, "back", or undefined on cancel.
 * isCancel checked after every prompt.
 */
export function selectIde(includeBack: true): Promise<IdeTarget | typeof FLOW_BACK | undefined>
export function selectIde(includeBack?: false): Promise<IdeTarget | undefined>
export async function selectIde(includeBack = false): Promise<IdeTarget | typeof FLOW_BACK | undefined> {
  const options: { value: IdeTarget | typeof FLOW_BACK; label: string }[] = ALL_IDE_KEYS.map((k) => ({
    value: k as IdeTarget,
    label: k,
  }))

  if (includeBack) {
    options.push({ value: FLOW_BACK, label: pc.dim("← Back") })
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
export function selectIdes(includeBack: true): Promise<IdeTarget[] | typeof FLOW_BACK | undefined>
export function selectIdes(includeBack?: false): Promise<IdeTarget[] | undefined>
export async function selectIdes(includeBack = false): Promise<IdeTarget[] | typeof FLOW_BACK | undefined> {
  const result = await promptMultiselectWithBack({
    message: "Select target IDE(s):",
    options: ALL_IDE_KEYS.map((k) => ({ value: k, label: k })),
    includeBack,
    backValue: FLOW_BACK,
    mixedBackWarning: "Select IDE(s) or Back, not both.",
  })

  if (result === undefined || result === FLOW_BACK) return result
  return ALL_IDE_KEYS.filter((ide) => result.includes(ide))
}
