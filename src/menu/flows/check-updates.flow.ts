import * as clack from "@clack/prompts"
import {
  buildUpdateReport,
  syncImportedSkillFromReport,
  type CheckReport,
} from "../../core/imports/updates.ts"
import { getAllEntries } from "../../core/imports/registry.ts"
import {
  hasGitHubToken,
  setBypassGitHubToken,
  MSG_AUTH_FAILED,
} from "../../core/imports/github/index.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"
import * as pc from "../../ui/ansi.ts"
import { promptMultiselectWithBack } from "../helpers/prompt-multiselect-with-back.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { FLOW_ALL, FLOW_BACK, FLOW_CANCEL, FLOW_CANCELLED, FLOW_COMPLETED } from "../constants/flow-tokens.ts"

function isAuthError(message?: string): boolean {
  if (!message) return false
  return message === MSG_AUTH_FAILED || message.includes("401") || message.includes("Bad credentials")
}

function renderReport(report: CheckReport): void {
  const sourceUrl = report.entry.source
  if (report.status === "up-to-date") {
    log.raw(`  ✔ ${report.ref}  — Up to date`)
    if (sourceUrl) log.raw(`    ${pc.dim("↳ " + sourceUrl)}`)
    return
  }
  if (report.status === "update-available") {
    log.raw(`  ↑ ${report.ref}  — Update available`)
    if (sourceUrl) log.raw(`    ${pc.dim("↳ " + sourceUrl)}`)
    return
  }
  log.raw(`  ✖ ${report.ref}  — Source unreachable${report.message ? ` (${report.message})` : ""}`)
  if (sourceUrl) log.raw(`    ${pc.dim("↳ " + sourceUrl)}`)
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

  if (hasGitHubToken()) {
    log.info("Using GitHub token from GITHUB_TOKEN.")
  } else if (entries.length * 3 > 50) {
    log.warn("Running unauthenticated. This check may approach GitHub's API rate limit (60 req/hour). Set GITHUB_TOKEN to increase limits.")
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
        if (report.status === "unreachable" && isAuthError(report.message) && hasGitHubToken()) {
          // Stop checking remaining skills when authentication fails on an active token
          break
        }
      }
      return nextReports
    }
  )

  const authErrorReport = reports.find((r) => r.status === "unreachable" && isAuthError(r.message))
  if (authErrorReport && hasGitHubToken()) {
    renderReport(authErrorReport)
    log.error("GitHub API returned 401 Unauthorized.")
    log.warn("Your GITHUB_TOKEN appears to be invalid or expired.")

    const decision = await clack.select({
      message: "What would you like to do?",
      options: [
        { value: "retry-unauthenticated", label: "Retry without token", hint: "unauthenticated, 60 req/h limit" },
        { value: FLOW_CANCEL, label: "Cancel" },
      ],
    })

    if (clack.isCancel(decision) || decision === FLOW_CANCEL) {
      return FLOW_CANCELLED
    }

    if (decision === "retry-unauthenticated") {
      setBypassGitHubToken(true)
      log.info("Retrying check without GitHub token...")
      return checkUpdatesFlow()
    }
  }

  for (const report of reports) {
    renderReport(report)
  }

  const updatesAvailable = reports.filter((report) => report.status === "update-available")
  const unreachable = reports.filter((report) => report.status === "unreachable")
  const upToDate = reports.filter((report) => report.status === "up-to-date")

  if (updatesAvailable.length === 0) {
    if (unreachable.length === 0) {
      log.success("All imported skills are up to date.")
    } else if (upToDate.length === 0) {
      log.error("Could not check remote sources (all skills failed to connect).")
    } else {
      log.warn(`Check completed with warnings: ${upToDate.length} up to date, ${unreachable.length} unreachable.`)
    }
    return unreachable.length > 0 && upToDate.length === 0 ? FLOW_CANCELLED : FLOW_COMPLETED
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
