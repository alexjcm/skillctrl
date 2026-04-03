import path from "path"
import * as clack from "@clack/prompts"
import * as fs from "fs-extra"
import {
  appendGitExcludeRules,
  computeMissingGitExcludeRules,
  resolveProjectGitExcludePath,
  suggestGitExcludeRulesForIdes,
} from "../../core/project-git-exclude.ts"
import type { IdeTarget } from "../../core/types.ts"
import { log } from "../../ui/logger.ts"

export async function maybeUpdateProjectGitExclude(projectDir: string, ides: IdeTarget[]): Promise<void> {
  const gitExcludePath = await resolveProjectGitExcludePath(projectDir)
  if (!gitExcludePath) return

  const desiredRules = suggestGitExcludeRulesForIdes(ides)
  if (desiredRules.length === 0) return

  const action = await clack.select({
    message: "Git local excludes for generated skill directories:",
    options: [
      { value: "exclude-now", label: "Exclude now", hint: ".git/info/exclude (local)" },
      { value: "skip", label: "Do not exclude" },
    ],
  })

  if (clack.isCancel(action) || action !== "exclude-now") return

  try {
    const current = (await fs.pathExists(gitExcludePath))
      ? await fs.readFile(gitExcludePath, "utf-8")
      : ""
    const missingRules = computeMissingGitExcludeRules(current, desiredRules)

    const rel = path.relative(projectDir, gitExcludePath)
    const displayPath = rel && !rel.startsWith("..") ? rel : gitExcludePath

    log.step("Git exclude preview:")
    log.bullet("File", displayPath)
    log.bullet("Note", "Local only, not committed to repository history")

    if (missingRules.length === 0) {
      log.info("No new exclusion rules to add.")
      return
    }

    log.bullet("Rules to add", String(missingRules.length))
    for (const rule of missingRules) {
      log.raw(`  • ${rule}`)
    }

    const confirmApply = await clack.confirm({
      message: "Apply these exclusion rules now?",
      initialValue: true,
    })

    if (clack.isCancel(confirmApply) || !confirmApply) {
      log.info("Git exclusion update skipped.")
      return
    }

    const next = appendGitExcludeRules(current, missingRules)
    await fs.outputFile(gitExcludePath, next, "utf-8")
    log.success(`Git exclusion rules updated: ${missingRules.length} added.`)
  } catch (err) {
    log.warn(`Could not update git local excludes: ${err instanceof Error ? err.message : String(err)}`)
  }
}
