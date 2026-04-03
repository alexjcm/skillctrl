import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"
import { FLOW_BACK } from "../constants/flow-tokens.ts"

export interface MultiselectOption {
  value: string
  label: string
  hint?: string
}

export interface PromptMultiselectWithBackOptions {
  message: string
  options: MultiselectOption[]
  includeBack?: boolean
  backValue?: string
  backLabel?: string
  allowEmpty?: boolean
  emptySelectionWarning?: string
  mixedBackWarning?: string
  warn?: (message: string) => void
}

export async function promptMultiselectWithBack(
  options: PromptMultiselectWithBackOptions
): Promise<string[] | typeof FLOW_BACK | undefined> {
  const {
    message,
    options: choiceOptions,
    includeBack = true,
    backValue = "__back",
    backLabel = pc.dim("← Back"),
    allowEmpty = false,
    emptySelectionWarning = "Press Space to select, Enter to submit.",
    mixedBackWarning = "Select options or Back, not both.",
    warn = clack.log.warning,
  } = options

  while (true) {
    const selected = await clack.multiselect({
      message,
      required: false,
      options: includeBack
        ? [...choiceOptions, { value: backValue, label: backLabel }]
        : choiceOptions,
    })

    if (clack.isCancel(selected)) return undefined

    const values = new Set(selected as string[])

    if (includeBack && values.has(backValue)) {
      if (values.size === 1) return FLOW_BACK
      warn(mixedBackWarning)
      continue
    }

    if (!allowEmpty && values.size === 0) {
      warn(emptySelectionWarning)
      continue
    }

    return [...values]
  }
}
