import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"

import { ALL_IDE_KEYS, IDE_BASE_DIRS } from "../../core/config/ide-paths.ts"
import { exists } from "../../core/system/fs.ts"
import { deploySkillGlobal, deployAllGlobal } from "../../core/deploy/service.ts"
import { discoverSkills } from "../../core/skills/discovery.ts"
import type { IdeTarget, Skill, DeployResult } from "../../core/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { selectIdes } from "../prompts/select-ide.ts"
import { multiSelectSkills } from "../prompts/select-skill.ts"
import { log } from "../../ui/logger.ts"
import { renderDeployResults } from "../helpers/render-deploy-results.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { FLOW_ALL, FLOW_BACK, FLOW_CANCEL, FLOW_CANCELLED, FLOW_COMPLETED, FLOW_CONFIRM } from "../constants/flow-tokens.ts"

function formatIdeSummary(ides: IdeTarget[]): string {
  if (ides.length === ALL_IDE_KEYS.length) {
    return `all (${ALL_IDE_KEYS.join(", ")})`
  }
  return ides.join(", ")
}

async function selectDeployTargets(): Promise<IdeTarget[] | typeof FLOW_BACK | undefined> {
  while (true) {
    const mode = await clack.select({
      message: "Deploy global skills to:",
      options: [
        { value: FLOW_ALL, label: "All IDEs" },
        { value: "select", label: "Select IDE(s)" },
        { value: FLOW_BACK, label: pc.dim("← Back") },
      ],
    })

    if (clack.isCancel(mode)) return undefined
    if (mode === FLOW_BACK) return FLOW_BACK
    if (mode === FLOW_ALL) return [...ALL_IDE_KEYS]

    const selected = await selectIdes(true)
    if (!selected) return undefined
    if (selected === FLOW_BACK) continue
    return selected
  }
}

type GlobalScope = "all" | "selected"

async function shouldCreateMissingCopilotHome(ides: readonly IdeTarget[]): Promise<boolean> {
  if (!ides.includes("copilot")) return false
  if (await exists(IDE_BASE_DIRS.copilot)) return false

  const createMissing = await clack.confirm({
    message: "Copilot home was not found. Create ~/.copilot/skills for this deploy?",
    initialValue: true,
  })

  return !clack.isCancel(createMissing) && createMissing
}

export async function deployGlobalFlow(excludedRefs: string[]): Promise<FlowResult> {
  type Step = "targets" | "scope" | typeof FLOW_CONFIRM

  let step: Step = "targets"
  let selectedIdes: IdeTarget[] = []
  let selectedScope: GlobalScope = "all"
  let selectedSkills: Skill[] = []

  while (true) {
    if (step === "targets") {
      const ides = await selectDeployTargets()
      if (!ides) return FLOW_CANCELLED
      if (ides === FLOW_BACK) return FLOW_BACK

      selectedIdes = ides
      step = "scope"
      continue
    }

    if (step === "scope") {
      const scope = await clack.select({
        message: "Which global deploy scope?",
        options: [
          { value: FLOW_ALL, label: "All skills", hint: "respects excluded skills" },
          { value: "select", label: "Select skill(s)" },
          { value: FLOW_BACK, label: pc.dim("← Back") },
        ],
      })

      if (clack.isCancel(scope)) return FLOW_CANCELLED
      if (scope === FLOW_BACK) {
        step = "targets"
        continue
      }

      if (scope === FLOW_ALL) {
        const all = await discoverSkills()
        selectedScope = "all"
        selectedSkills = all.filter((s) => !excludedRefs.includes(s.ref))
        if (selectedSkills.length === 0) {
          log.warn("No deployable skills found (all are excluded or catalog is empty).")
          continue
        }
        step = FLOW_CONFIRM
        continue
      }

      const picked = await multiSelectSkills(undefined, true)
      if (!picked) return FLOW_CANCELLED
      if (picked === FLOW_BACK) continue
      if (picked.length === 0) {
        log.warn("No skills selected.")
        continue
      }

      selectedScope = "selected"
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
    log.bullet("Scope", selectedScope === "all" ? "all skills" : "selected skills")
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
      step = "scope"
      continue
    }

    try {
      const allowCreateMissingCopilotHome = await shouldCreateMissingCopilotHome(selectedIdes)
      const results = await runWithSpinner({
        startMessage: selectedScope === "all"
          ? "Deploying all skills globally..."
          : `Deploying ${selectedSkills.length} selected skill${selectedSkills.length === 1 ? "" : "s"} globally...`,
      }, async () => {
        if (selectedScope === "all") {
          return deployAllGlobal(selectedIdes, { excludedRefs }, { allowCreateMissingCopilotHome })
        }

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
