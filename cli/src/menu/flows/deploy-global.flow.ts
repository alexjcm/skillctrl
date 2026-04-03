import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"

import { ALL_IDE_KEYS } from "../../core/config.ts"
import { deploySkillGlobal, deployAllGlobal } from "../../core/deploy.ts"
import { discoverSkills } from "../../core/skills.ts"
import type { IdeTarget, DeployResult } from "../../core/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { selectIde, selectIdes } from "../prompts/select-ide.ts"
import { selectSkill } from "../prompts/select-skill.ts"
import { log } from "../../ui/logger.ts"

// ============================================================================
// SHARED: render deploy results in menu context
// ============================================================================

function renderMenuResults(results: DeployResult[]): void {
  const copied = results.filter((r) => r.status === "copied").length
  const skipped = results.filter((r) => r.status === "skipped" && r.reason !== "IDE not installed").length
  const uninstalledIdes = new Set(
    results.filter((r) => r.status === "skipped" && r.reason === "IDE not installed").map((r) => r.ide)
  )
  const errors = results.filter((r) => r.status === "error")

  if (errors.length > 0) {
    for (const r of errors) {
      log.error(`${r.skill.ref} → ${r.targetPath}: ${r.error ?? "unknown error"}`)
    }
  }

  const parts = [
    copied > 0 ? `${pc.green("✔")} ${pc.green(`${copied} skill${copied === 1 ? "" : "s"} copied`)}` : null,
    skipped > 0 ? `${pc.yellow("⚠")} ${pc.yellow(`${skipped} skipped`)}` : null,
    uninstalledIdes.size > 0 ? `${pc.yellow("⚠")} ${pc.yellow(`IDEs not installed: ${Array.from(uninstalledIdes).join(", ")}`)}` : null,
    errors.length > 0 ? `${pc.red("✖")} ${pc.red(`${errors.length} errors`)}` : null,
  ].filter(Boolean)

  log.raw(parts.join("  "))
}

// ============================================================================
// EXPAND IDE: "all" or IdeTarget → IdeTarget[]
// CLI plan: "all" expanded before calling core
// ============================================================================

function expandIde(ide: IdeTarget | "all"): IdeTarget[] {
  return ide === "all" ? [...ALL_IDE_KEYS] : [ide]
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

async function selectDeployAllTargets(): Promise<IdeTarget[] | "back" | undefined> {
  while (true) {
    const mode = await clack.select({
      message: "Deploy ALL skills globally to:",
      options: [
        { value: "all", label: "All IDEs" },
        { value: "select", label: "Select IDE(s)" },
        { value: "back", label: pc.dim("← Back") },
      ],
    })

    if (clack.isCancel(mode)) return undefined
    if (mode === "back") return "back"
    if (mode === "all") return [...ALL_IDE_KEYS]

    const selected = await selectIdes(true)
    if (!selected) return undefined
    if (selected === "back") continue
    return selected
  }
}

export async function deployAllGlobalUnifiedFlow(excludedRefs: string[]): Promise<FlowResult> {
  const ides = await selectDeployAllTargets()
  if (!ides) return "cancelled"
  if (ides === "back") return "back"

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
    return "cancelled"
  }

  const spin = clack.spinner()
  spin.start("Deploying all skills...")

  try {
    const results = await deployAllGlobal(ides, { excludedRefs })
    spin.stop("Completed")
    renderMenuResults(results)
  } catch (err) {
    spin.stop("Failed")
    log.error(err instanceof Error ? err.message : String(err))
  }

  return "completed"
}

// ============================================================================
// FLOW: Deploy specific skill → global
// ============================================================================

export async function deploySpecificGlobalFlow(): Promise<FlowResult> {
  type Step = "skill" | "ide" | "confirm"

  let step: Step = "skill"
  let selectedSkill: Exclude<Awaited<ReturnType<typeof selectSkill>>, "back" | undefined> | null = null
  let selectedIde: IdeTarget | "all" | null = null

  while (true) {
    if (step === "skill") {
      const skill = await selectSkill(undefined, true)
      if (!skill) return "cancelled"
      if (skill === "back") return "back"

      selectedSkill = skill
      step = "ide"
      continue
    }

    if (step === "ide") {
      const ide = await selectIde(true, true)
      if (!ide) return "cancelled"
      if (ide === "back") {
        step = "skill"
        continue
      }

      selectedIde = ide
      step = "confirm"
      continue
    }

    if (!selectedSkill || !selectedIde) {
      step = "skill"
      continue
    }

    const ides = expandIde(selectedIde)
    log.step("Summary:")
    log.bullet("Destination", "global")
    log.bullet("IDEs", selectedIde === "all" ? `all (${ALL_IDE_KEYS.join(", ")})` : selectedIde)
    log.bullet("Skill", selectedSkill.ref)

    const decision = await clack.select({
      message: "Proceed with deploy?",
      options: [
        { value: "confirm", label: pc.bold("Confirm") },
        { value: "back", label: pc.dim("← Back") },
        { value: "cancel", label: "Cancel" },
      ],
    })

    if (clack.isCancel(decision) || decision === "cancel") return "cancelled"
    if (decision === "back") {
      step = "ide"
      continue
    }

    const spin = clack.spinner()
    spin.start(`Deploying ${pc.bold(selectedSkill.ref)} to ${selectedIde}...`)

    try {
      const results = await deploySkillGlobal(selectedSkill, ides)
      spin.stop("Completed")
      renderMenuResults(results)
    } catch (err) {
      spin.stop("Failed")
      log.error(err instanceof Error ? err.message : String(err))
    }

    return "completed"
  }
}
