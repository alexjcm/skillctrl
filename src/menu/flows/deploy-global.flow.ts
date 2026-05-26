import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"

import { ALL_IDE_KEYS, IDE_BASE_DIRS } from "../../core/config/ide-paths.ts"
import { exists } from "../../core/system/fs.ts"
import { deploySkillGlobal } from "../../core/deploy/service.ts"
import type { IdeTarget, Skill, DeployResult } from "../../core/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { selectIdes } from "../prompts/select-ide.ts"
import { multiSelectSkills } from "../prompts/select-skill.ts"
import { log } from "../../ui/logger.ts"
import { renderDeployResults } from "../helpers/render-deploy-results.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { FLOW_BACK, FLOW_CANCEL, FLOW_CANCELLED, FLOW_COMPLETED, FLOW_CONFIRM } from "../constants/flow-tokens.ts"

function formatIdeSummary(ides: IdeTarget[]): string {
  if (ides.length === ALL_IDE_KEYS.length) {
    return `all (${ALL_IDE_KEYS.join(", ")})`
  }
  return ides.join(", ")
}

async function shouldCreateMissingCopilotHome(ides: readonly IdeTarget[]): Promise<boolean> {
  if (!ides.includes("copilot")) return false
  if (await exists(IDE_BASE_DIRS.copilot)) return false

  const createMissing = await clack.confirm({
    message: "Copilot home was not found. Create ~/.copilot/skills for this deploy?",
    initialValue: true,
  })

  return !clack.isCancel(createMissing) && createMissing
}

export async function deployGlobalFlow(): Promise<FlowResult> {
  type Step = "targets" | "skills" | typeof FLOW_CONFIRM

  let step: Step = "targets"
  let selectedIdes: IdeTarget[] = []
  let selectedSkills: Skill[] = []

  while (true) {
    if (step === "targets") {
      const ides = await selectIdes(false)
      if (!ides) return FLOW_CANCELLED

      selectedIdes = ides
      step = "skills"
      continue
    }

    if (step === "skills") {
      const picked = await multiSelectSkills(undefined, false)
      if (!picked) return FLOW_CANCELLED
      if (picked.length === 0) {
        log.warn("No skills selected.")
        continue
      }

      selectedSkills = picked
      step = FLOW_CONFIRM
      continue
    }

    if (selectedIdes.length === 0 || selectedSkills.length === 0) {
      step = "targets"
      continue
    }

    log.step("Summary:")
    log.bullet("Destination", "global")
    log.bullet("IDEs", formatIdeSummary(selectedIdes))
    log.bullet("Skills", String(selectedSkills.length))

    log.step("Skills to deploy:")
    for (const skill of selectedSkills) {
      log.bullet(`${pc.dim(skill.category + "/")}${skill.name}`)
    }

    const decision = await clack.select({
      message: "Proceed with deploy?",
      options: [
        { value: FLOW_CONFIRM, label: pc.bold("Confirm") },
        { value: FLOW_BACK, label: pc.dim("← Back") },
        { value: FLOW_CANCEL, label: "Cancel" },
      ],
    })

    if (clack.isCancel(decision) || decision === FLOW_CANCEL) return FLOW_CANCELLED
    if (decision === FLOW_BACK) {
      step = "skills"
      continue
    }

    try {
      const allowCreateMissingCopilotHome = await shouldCreateMissingCopilotHome(selectedIdes)
      const results = await runWithSpinner({
        startMessage: `Deploying ${selectedSkills.length} selected skill${selectedSkills.length === 1 ? "" : "s"} globally...`,
      }, async () => {
        const nextResults: DeployResult[] = []
        for (const skill of selectedSkills) {
          const skillResults = await deploySkillGlobal(skill, selectedIdes, { allowCreateMissingCopilotHome })
          nextResults.push(...skillResults)
        }
        return nextResults
      })
      renderDeployResults(results)
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err))
    }

    return FLOW_COMPLETED
  }
}
