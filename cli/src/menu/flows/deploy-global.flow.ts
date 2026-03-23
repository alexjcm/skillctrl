import * as clack from "@clack/prompts"
import pc from "picocolors"

import { ALL_IDE_KEYS } from "../../core/config.ts"
import { deploySkillGlobal, deployAllGlobal } from "../../core/deploy.ts"
import { discoverSkills } from "../../core/skills.ts"
import type { IdeTarget, DeployResult } from "../../core/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { selectIde } from "../prompts/select-ide.ts"
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
// FLOW: Deploy ALL → global (all IDEs)
// ============================================================================

export async function deployAllGlobalFlow(excludedRefs: string[]): Promise<FlowResult> {
  const skills = await discoverSkills()
  const eligible = skills.filter((s) => !excludedRefs.includes(s.ref))

  log.step("Summary:")
  log.bullet("Destination", "global")
  log.bullet("IDEs", `all (${ALL_IDE_KEYS.join(", ")})`)
  log.bullet("Skills", String(eligible.length))

  log.step("Skills to deploy:")
  for (const s of eligible) {
    log.bullet(`${pc.dim(s.category + "/")}${s.name}`)
  }

  const confirmed = await clack.confirm({
    message: `Deploy ${pc.bold(String(eligible.length))} skills to ${pc.bold("all IDEs")}?`,
  })
  if (clack.isCancel(confirmed) || !confirmed) {
    return "cancelled"
  }

  const spin = clack.spinner()
  spin.start("Deploying all skills...")

  try {
    const results = await deployAllGlobal([...ALL_IDE_KEYS], { excludedRefs })
    spin.stop("Done")
    renderMenuResults(results)
  } catch (err) {
    spin.stop("Failed")
    log.error(err instanceof Error ? err.message : String(err))
  }

  return "completed"
}

// ============================================================================
// FLOW: Deploy ALL → choose IDE
// ============================================================================

export async function deployAllChooseIdeFlow(excludedRefs: string[]): Promise<FlowResult> {
  const ide = await selectIde(true, true)
  if (!ide) return "cancelled"
  if (ide === "back") return "back"

  const ides = expandIde(ide)
  const skills = await discoverSkills()
  const eligible = skills.filter((s) => !excludedRefs.includes(s.ref))

  log.step("Summary:")
  log.bullet("Destination", "global")
  log.bullet("IDEs", ide === "all" ? `all (${ALL_IDE_KEYS.join(", ")})` : ide)
  log.bullet("Skills", String(eligible.length))

  log.step("Skills to deploy:")
  for (const s of eligible) {
    log.bullet(`${pc.dim(s.category + "/")}${s.name}`)
  }

  const confirmed = await clack.confirm({
    message: `Deploy ${pc.bold(String(eligible.length))} skills to ${pc.bold(ide)}?`,
  })
  if (clack.isCancel(confirmed) || !confirmed) {
    return "cancelled"
  }

  const spin = clack.spinner()
  spin.start(`Deploying all skills to ${ide}...`)

  try {
    const results = await deployAllGlobal(ides, { excludedRefs })
    spin.stop("Done")
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
  const skill = await selectSkill(undefined, true)
  if (!skill) return "cancelled"
  if (skill === "back") return "back"

  const ide = await selectIde(true, true)
  if (!ide) return "cancelled"
  if (ide === "back") return "back"

  const ides = expandIde(ide)

  log.step("Summary:")
  log.bullet("Destination", "global")
  log.bullet("IDEs", ide === "all" ? `all (${ALL_IDE_KEYS.join(", ")})` : ide)
  log.bullet("Skill", skill.ref)

  const confirmed = await clack.confirm({
    message: `Deploy ${pc.bold(skill.ref)} to ${pc.bold(ide)}?`,
  })
  if (clack.isCancel(confirmed) || !confirmed) {
    return "cancelled"
  }

  const spin = clack.spinner()
  spin.start(`Deploying ${pc.bold(skill.ref)} to ${ide}...`)

  try {
    const results = await deploySkillGlobal(skill, ides)
    spin.stop("Done")
    renderMenuResults(results)
  } catch (err) {
    spin.stop("Failed")
    log.error(err instanceof Error ? err.message : String(err))
  }

  return "completed"
}
