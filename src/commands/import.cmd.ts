import { Command } from "commander"
import { fetchSkillCandidatePreviewsFromInput, hydrateSkillCandidate } from "../core/imports/github/index.ts"
import { downloadAndSyncImportedSkill, buildImportedTargetRef } from "../core/imports/sync.ts"
import { validateSkillContent } from "../core/skills/validator.ts"
import { isJsonMode, printJson } from "../ui/output.ts"
import { log } from "../ui/logger.ts"
import * as pc from "../ui/ansi.ts"

export const importCmd = new Command("import")
  .description("Import skills from an external source")
  .argument("<source>", "Source URL or owner/repo format")
  .option("--skill <name>", "Specific skill name to import if multiple candidates are found")
  .option("--all", "Import all candidates found in the source")
  .option("--category <cat>", "Override or set the category for the imported skill(s)")
  .option("-y, --yes", "Skip confirmation prompts and ignore validation warnings")
  .action(async (source, options) => {
    process.on("SIGINT", () => {
      if (isJsonMode) printJson({ error: "Interrupted by user" })
      process.exit(130)
    })
    process.on("SIGTERM", () => {
      if (isJsonMode) printJson({ error: "Terminated" })
      process.exit(143)
    })

    let exitCode = 0

    try {
      if (!isJsonMode) log.info(`Fetching candidates from ${pc.cyan(source)}...`)

      const previews = await fetchSkillCandidatePreviewsFromInput(source)

      if (previews.length === 0) {
        if (isJsonMode) printJson({ error: "No skills found at source" })
        else log.error("No skills found at source.")
        return process.exit(1)
      }

      let toImport = previews

      if (options.skill) {
        toImport = previews.filter((p) => p.name === options.skill)
        if (toImport.length === 0) {
          if (isJsonMode) printJson({ error: `Skill '${options.skill}' not found in candidates` })
          else log.error(`Skill '${options.skill}' not found in candidates.`)
          return process.exit(1)
        }
      } else if (!options.all && previews.length > 1) {
        if (isJsonMode) {
          printJson({
            error: "Multiple candidates found. Use --all or --skill",
            candidates: previews.map((p) => p.name),
          })
        } else {
          log.error("Multiple candidates found. Use --all to import all, or --skill <name> to pick one.")
          previews.forEach((p) => log.bullet(p.name))
        }
        return process.exit(1)
      }

      const imported = []
      const failed = []

      for (const preview of toImport) {
        try {
          const candidate = await hydrateSkillCandidate(preview)
          const validation = validateSkillContent(candidate.skillMdContent)
          let warning: string | undefined

          if (!validation.valid) {
            warning = validation.reason
            if (!options.yes) {
              if (isJsonMode) {
                failed.push({ name: candidate.name, error: `Validation failed: ${validation.reason}` })
              } else {
                log.error(`Validation failed for ${pc.cyan(candidate.name)}: ${validation.reason}. Use --yes to override.`)
              }
              continue
            }
          }

          const fileCount = await downloadAndSyncImportedSkill(candidate, options.category || null)

          imported.push({
            ref: buildImportedTargetRef(candidate.name, options.category || null),
            name: candidate.name,
            source: candidate.canonicalUrl,
            files: fileCount,
            ...(warning ? { warning } : {}),
          })
        } catch (err: any) {
          failed.push({ name: preview.name, error: err.message || String(err) })
        }
      }

      if (isJsonMode) {
        printJson({
          imported,
          failed,
          summary: { imported: imported.length, failed: failed.length },
        })
        if (imported.length === 0 && failed.length > 0) return process.exit(1)
        return process.exit(0)
      }

      for (const item of imported) {
        log.success(`Imported ${pc.cyan(item.name)} (${item.files} files)`)
        if (item.warning) log.warn(`Warning: ${item.warning}`)
      }
      for (const item of failed) {
        log.error(`Failed to import ${pc.cyan(item.name)}`, item.error)
      }

      log.raw("")
      log.step("Summary")
      log.bullet("Imported", String(imported.length))
      log.bullet("Failed", String(failed.length))

      if (imported.length === 0 && failed.length > 0) return process.exit(1)
      return process.exit(0)
    } catch (err: any) {
      if (isJsonMode) {
        printJson({ error: err.message || String(err) })
      } else {
        log.error("Failed to import", err)
      }
      exitCode = 1
    }
    process.exit(exitCode)
  })
