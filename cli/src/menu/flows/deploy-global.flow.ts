import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"

import { ALL_IDE_KEYS } from "../../core/config.ts"
import { deploySkillGlobal, deployAllGlobal } from "../../core/deploy.ts"
import { discoverSkills } from "../../core/skills.ts"
import type { IdeTarget } from "../../core/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { selectIde, selectIdes } from "../prompts/select-ide.ts"
import { selectSkill } from "../prompts/select-skill.ts"
import { log } from "../../ui/logger.ts"
import { renderDeployResults } from "../helpers/render-deploy-results.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { FLOW_ALL, FLOW_BACK, FLOW_CANCEL, FLOW_CANCELLED, FLOW_COMPLETED, FLOW_CONFIRM } from "../constants/flow-tokens.ts"

// ============================================================================
// EXPAND IDE: FLOW_ALL or IdeTarget → IdeTarget[]
// CLI plan: "all" expanded before calling core
// ============================================================================

function expandIde(ide: IdeTarget | typeof FLOW_ALL): IdeTarget[] {
  return ide === FLOW_ALL ? [...ALL_IDE_KEYS] : [ide]
}

// ============================================================================
// FLOW: Deploy ALL → global (unified)
// ============================================================================

function formatIdeSummary(ides: IdeTarget[]): string {
  if (ides.length === ALL_IDE_KEYS.length) {
    return `all (${ALL_IDE_KEYS.join(", ")})`
  }
  return ides.join(", ")
}

async function selectDeployAllTargets(): Promise<IdeTarget[] | typeof FLOW_BACK | undefined> {
  while (true) {
    const mode = await clack.select({
      message: "Deploy ALL skills globally to:",
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

export async function deployAllGlobalUnifiedFlow(excludedRefs: string[]): Promise<FlowResult> {
  const ides = await selectDeployAllTargets()
  if (!ides) return FLOW_CANCELLED
  if (ides === FLOW_BACK) return FLOW_BACK

  const skills = await discoverSkills()
  const eligible = skills.filter((s) => !excludedRefs.includes(s.ref))

  log.step("Summary:")
  log.bullet("Destination", "global")
  log.bullet("IDEs", formatIdeSummary(ides))
  log.bullet("Skills", String(eligible.length))

  log.step("Skills to deploy:")
  for (const s of eligible) {
    log.bullet(`${pc.dim(s.category + "/")}${s.name}`)
  }

  const targetLabel = ides.length === ALL_IDE_KEYS.length
    ? "all IDEs"
    : `${ides.length} IDE${ides.length === 1 ? "" : "s"}`

  const confirmed = await clack.confirm({
    message: `Deploy ${pc.bold(String(eligible.length))} skills to ${pc.bold(targetLabel)}?`,
  })
  if (clack.isCancel(confirmed) || !confirmed) {
    return FLOW_CANCELLED
  }

  try {
    const results = await runWithSpinner(
      { startMessage: "Deploying all skills..." },
      () => deployAllGlobal(ides, { excludedRefs })
    )
    renderDeployResults(results)
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err))
  }

  return FLOW_COMPLETED
}

// ============================================================================
// FLOW: Deploy specific skill → global
// ============================================================================

export async function deploySpecificGlobalFlow(): Promise<FlowResult> {
  type Step = "skill" | "ide" | typeof FLOW_CONFIRM

  let step: Step = "skill"
  let selectedSkill: Exclude<Awaited<ReturnType<typeof selectSkill>>, typeof FLOW_BACK | undefined> | null = null
  let selectedIde: IdeTarget | typeof FLOW_ALL | null = null

  while (true) {
    if (step === "skill") {
      const skill = await selectSkill(undefined, true)
      if (!skill) return FLOW_CANCELLED
      if (skill === FLOW_BACK) return FLOW_BACK

      selectedSkill = skill
      step = "ide"
      continue
    }

    if (step === "ide") {
      const ide = await selectIde(true, true)
      if (!ide) return FLOW_CANCELLED
      if (ide === FLOW_BACK) {
        step = "skill"
        continue
      }

      selectedIde = ide
      step = FLOW_CONFIRM
      continue
    }

    if (!selectedSkill || !selectedIde) {
      step = "skill"
      continue
    }

    const skillToDeploy = selectedSkill
    const ideToDeploy = selectedIde
    const ides = expandIde(ideToDeploy)
    log.step("Summary:")
    log.bullet("Destination", "global")
    log.bullet("IDEs", ideToDeploy === FLOW_ALL ? `all (${ALL_IDE_KEYS.join(", ")})` : ideToDeploy)
    log.bullet("Skill", skillToDeploy.ref)

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
      step = "ide"
      continue
    }

    try {
      const results = await runWithSpinner(
        { startMessage: `Deploying ${pc.bold(skillToDeploy.ref)} to ${ideToDeploy}...` },
        () => deploySkillGlobal(skillToDeploy, ides)
      )
      renderDeployResults(results)
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err))
    }

    return FLOW_COMPLETED
  }
}
