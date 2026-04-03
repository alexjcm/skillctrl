import * as clack from "@clack/prompts"
import {
  buildUpdateReport,
  syncImportedSkillFromReport,
  type CheckReport,
} from "../../core/imported-skill-updates.ts"
import { getAllEntries } from "../../core/skill-imports.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"
import { promptMultiselectWithBack } from "../helpers/prompt-multiselect-with-back.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { FLOW_ALL, FLOW_BACK, FLOW_CANCEL, FLOW_CANCELLED, FLOW_COMPLETED } from "../constants/flow-tokens.ts"

function renderReport(report: CheckReport): void {
  if (report.status === "up-to-date") {
    log.raw(`  ✔ ${report.ref}  — Up to date`)
    return
  }
  if (report.status === "update-available") {
    log.raw(`  ↑ ${report.ref}  — Update available`)
    return
  }
  log.raw(`  ✖ ${report.ref}  — Source unreachable${report.message ? ` (${report.message})` : ""}`)
}

async function selectReportsToUpdate(candidates: CheckReport[]): Promise<CheckReport[] | typeof FLOW_BACK | undefined> {
  if (candidates.length === 0) return []

  const selected = await promptMultiselectWithBack({
    message: "Select imported skills to update:",
    options: candidates.map((report) => ({
      value: report.ref,
      label: report.ref,
      hint: report.entry.source,
    })),
    mixedBackWarning: "Select skills or Back, not both.",
  })

  if (selected === undefined || selected === FLOW_BACK) return selected
  const selectedSet = new Set(selected)
  return candidates.filter((report) => selectedSet.has(report.ref))
}

export async function checkUpdatesFlow(): Promise<FlowResult> {
  const entries = getAllEntries()
  if (entries.length === 0) {
    log.info("No imported skills found.")
    log.raw("  Use \"Import skill from GitHub\" to add your first one.")
    return FLOW_COMPLETED
  }

  if (entries.length * 3 > 50) {
    log.warn("This check may approach GitHub's unauthenticated API rate limit (60 req/hour).")
  }

  const reports = await runWithSpinner(
    {
      startMessage: `Checking ${entries.length} imported skill${entries.length === 1 ? "" : "s"}...`,
    },
    async () => {
      const nextReports: CheckReport[] = []
      for (const [ref, entry] of entries) {
        const report = await buildUpdateReport(ref, entry)
        nextReports.push(report)
      }
      return nextReports
    }
  )

  for (const report of reports) {
    renderReport(report)
  }

  const updatesAvailable = reports.filter((report) => report.status === "update-available")
  if (updatesAvailable.length === 0) {
    log.success("All imported skills are up to date.")
    return FLOW_COMPLETED
  }

  let selectedReports: CheckReport[] | null = null
  while (!selectedReports) {
    const decision = await clack.select({
      message: "Update options:",
      options: [
        { value: "select", label: "Select to update", hint: "recommended" },
        { value: FLOW_ALL, label: "Update all available" },
        { value: FLOW_CANCEL, label: "Cancel" },
      ],
    })
    if (clack.isCancel(decision) || decision === FLOW_CANCEL) return FLOW_CANCELLED

    if (decision === FLOW_ALL) {
      const confirmAll = await clack.confirm({
        message:
          `Update all ${updatesAvailable.length} skill${updatesAvailable.length === 1 ? "" : "s"}?\n` +
          "This sync is destructive: local changes in imported skills will be overwritten.",
        initialValue: false,
      })
      if (clack.isCancel(confirmAll) || !confirmAll) return FLOW_CANCELLED
      selectedReports = updatesAvailable
      continue
    }

    const chosen = await selectReportsToUpdate(updatesAvailable)
    if (chosen === undefined) return FLOW_CANCELLED
    if (chosen === FLOW_BACK) continue
    selectedReports = chosen
  }

  const summary = await runWithSpinner(
    {
      startMessage: `Updating ${selectedReports.length} skill${selectedReports.length === 1 ? "" : "s"}...`,
      successMessage: (result: { updated: number; failed: number }) =>
        result.failed > 0 ? "Completed with warnings" : "Completed",
    },
    async () => {
      let updated = 0
      let failed = 0
      for (const report of selectedReports) {
        try {
          await syncImportedSkillFromReport(report)
          updated++
        } catch (err) {
          failed++
          log.error(`Failed to update ${report.ref}`, err)
        }
      }
      return { updated, failed }
    }
  )

  const { updated, failed } = summary
  log.info(`Updated: ${updated}`)
  if (failed > 0) {
    log.warn(`Failed: ${failed}`)
  }

  return failed > 0 ? FLOW_CANCELLED : FLOW_COMPLETED
}
