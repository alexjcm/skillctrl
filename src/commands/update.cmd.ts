import { Command } from "commander"
import { buildUpdateReport, syncImportedSkillFromReport } from "../core/imports/updates.ts"
import { getEntry } from "../core/imports/registry.ts"
import { isJsonMode, printJson } from "../ui/output.ts"
import { log } from "../ui/logger.ts"
import * as pc from "../ui/ansi.ts"

export const updateCmd = new Command("update")
  .description("Update imported skills from their remote sources")
  .argument("[ref...]", "One or more skill references to update (e.g., category/skill-name)")
  .option("-y, --yes", "Skip confirmation prompts before overwriting local changes (no-op in headless)")
  .action(async (refs: string[], options) => {
    process.on("SIGINT", () => {
      if (isJsonMode) printJson({ error: "Interrupted by user" })
      process.exit(130)
    })
    process.on("SIGTERM", () => {
      if (isJsonMode) printJson({ error: "Terminated" })
      process.exit(143)
    })

    if (!refs || refs.length === 0) {
      if (isJsonMode) printJson({ error: "No skill specified." })
      else log.error("No skill specified. Use 'skillctrl list' to see available skills.")
      return process.exit(1)
    }

    const results = []
    const summary = { updated: 0, upToDate: 0, failed: 0, notFound: 0 }
    let exitCode = 0

    try {
      for (const ref of refs) {
        const entry = getEntry(ref)
        if (!entry) {
          results.push({ ref, status: "not-found", error: "Skill not found in registry" })
          summary.notFound++
          continue
        }

        if (!isJsonMode) log.info(`Checking ${pc.cyan(ref)}...`)

        const report = await buildUpdateReport(ref, entry)
        if (report.status === "up-to-date") {
          results.push({ ref, status: "up-to-date" })
          summary.upToDate++
        } else if (report.status === "update-available") {
          if (!isJsonMode) log.info(`Updating ${pc.cyan(ref)}...`)
          await syncImportedSkillFromReport(report)
          results.push({ ref, status: "updated" })
          summary.updated++
        } else {
          results.push({ ref, status: "failed", error: report.message || "Unreachable" })
          summary.failed++
        }
      }

      if (isJsonMode) {
        printJson({ results, summary })
        if (summary.notFound === refs.length) return process.exit(1)
        return process.exit(0)
      }

      log.raw("")
      for (const res of results) {
        if (res.status === "updated") {
          log.success(`${pc.cyan(res.ref)} updated successfully`)
        } else if (res.status === "up-to-date") {
          log.bullet(`${pc.cyan(res.ref)} is up-to-date`)
        } else if (res.status === "not-found") {
          log.warn(`${pc.cyan(res.ref)} is not an imported skill`)
        } else {
          log.error(`Failed to update ${pc.cyan(res.ref)}`, res.error)
        }
      }

      log.raw("")
      log.step("Summary")
      log.bullet("Updated", String(summary.updated))
      log.bullet("Up to date", String(summary.upToDate))
      log.bullet("Not found", String(summary.notFound))
      log.bullet("Failed", String(summary.failed))

      if (summary.notFound === refs.length) return process.exit(1)
      return process.exit(0)
    } catch (err: any) {
      if (isJsonMode) {
        printJson({ error: err.message || String(err) })
      } else {
        log.error("Failed to update", err)
      }
      exitCode = 1
    }
    process.exit(exitCode)
  })
