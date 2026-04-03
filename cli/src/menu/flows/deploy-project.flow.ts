import path from "path"
import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"

import * as fs from "fs-extra"
import { ALL_IDE_KEYS } from "../../core/config.ts"
import { deploySkillToProject } from "../../core/deploy.ts"
import {
  appendGitExcludeRules,
  computeMissingGitExcludeRules,
  resolveProjectGitExcludePath,
  suggestGitExcludeRulesForIdes,
} from "../../core/project-git-exclude.ts"
import type { IdeTarget, DeployResult, Skill } from "../../core/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { selectIde } from "../prompts/select-ide.ts"
import { multiSelectSkills } from "../prompts/select-skill.ts"
import { log } from "../../ui/logger.ts"

// ============================================================================
// RENDER results
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
// FLOW: Deploy to project directory
// Handles: path input, IDE, multi-select skills, confirm, spinner
// isCancel on every prompt
// ============================================================================

export async function deployToProjectFlow(excludedRefs: string[]): Promise<FlowResult> {
  type Step = "path" | "ide" | "scope" | "confirm"

  const isGitRepo = await fs.pathExists(path.join(process.cwd(), ".git"))
  const isNpmProject = await fs.pathExists(path.join(process.cwd(), "package.json"))

  let step: Step = "path"
  let projectDir: string | null = null
  let ide: IdeTarget | "all" | null = null
  let ides: IdeTarget[] = []
  let skills: Skill[] | null = null

  while (true) {
    if (step === "path") {
      const promptOptions: Parameters<typeof clack.text>[0] = {
        message: "Enter project/workspace directory path:",
        placeholder: process.cwd(),
        validate: (value) => {
          const trimmed = value?.trim() ?? ""
          if (!trimmed) return "Path cannot be empty"
          if (trimmed.toLowerCase() === "back") return
        },
      }
      if (isGitRepo || isNpmProject) {
        promptOptions.initialValue = process.cwd()
      }

      const rawPath = await clack.text(promptOptions)
      if (clack.isCancel(rawPath)) return "cancelled"

      const normalized = rawPath.trim()
      if (normalized.toLowerCase() === "back") return "back"

      const resolved = path.resolve(normalized || process.cwd())
      if (!(await fs.pathExists(resolved))) {
        log.error(`Directory does not exist: ${resolved}`)
        continue
      }

      projectDir = resolved
      step = "ide"
      continue
    }

    if (step === "ide") {
      const selectedIde = await selectIde(true, true)
      if (!selectedIde) return "cancelled"
      if (selectedIde === "back") {
        step = "path"
        continue
      }

      ide = selectedIde
      ides = ide === "all" ? [...ALL_IDE_KEYS] : [ide]
      step = "scope"
      continue
    }

    if (step === "scope") {
      const scopeResult = await clack.select({
        message: "Which skills to deploy?",
        options: [
          { value: "all", label: "All skills (excluding excluded)" },
          { value: "select", label: "Select specific skills" },
          { value: "back", label: pc.dim("← Back") },
        ],
      })
      if (clack.isCancel(scopeResult)) return "cancelled"
      if (scopeResult === "back") {
        step = "ide"
        continue
      }

      if (scopeResult === "all") {
        const { discoverSkills, isExcluded } = await import("../../core/skills.ts")
        const all = await discoverSkills()
        skills = all.filter((s) => !isExcluded(s.ref, excludedRefs))
      } else {
        const selectedSkills = await multiSelectSkills(undefined, true)
        if (!selectedSkills) return "cancelled"
        if (selectedSkills === "back") continue
        skills = selectedSkills
      }

      if (!skills || skills.length === 0) {
        log.warn("No skills selected.")
        continue
      }

      step = "confirm"
      continue
    }

    if (!projectDir || !ide || !skills || skills.length === 0) {
      step = "path"
      continue
    }

    log.step("Summary:")
    log.bullet("Destination", projectDir)
    log.bullet("IDEs", ide === "all" ? `all (${ALL_IDE_KEYS.join(", ")})` : ide)
    log.bullet("Skills", String(skills.length))

    log.step("Skills to deploy:")
    for (const skill of skills) {
      log.bullet(skill.ref)
    }

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
      step = "scope"
      continue
    }

    const spin = clack.spinner()
    spin.start(`Deploying to ${projectDir}...`)

    try {
      const results: DeployResult[] = []
      for (const skill of skills) {
        const r = await deploySkillToProject(skill, ides, projectDir)
        results.push(...r)
      }

      spin.stop("Completed")
      renderMenuResults(results)
    } catch (err) {
      spin.stop("Failed")
      log.error(err instanceof Error ? err.message : String(err))
    }

    const gitExcludePath = await resolveProjectGitExcludePath(projectDir)
    if (gitExcludePath) {
      const desiredRules = suggestGitExcludeRulesForIdes(ides)
      if (desiredRules.length > 0) {
        const action = await clack.select({
          message: "Git local excludes for generated skill directories:",
          options: [
            { value: "exclude-now", label: "Exclude now", hint: ".git/info/exclude (local)" },
            { value: "skip", label: "Do not exclude" },
          ],
        })

        if (!clack.isCancel(action) && action === "exclude-now") {
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
            } else {
              log.bullet("Rules to add", String(missingRules.length))
              for (const rule of missingRules) {
                log.raw(`  • ${rule}`)
              }

              const confirmApply = await clack.confirm({
                message: "Apply these exclusion rules now?",
                initialValue: true,
              })

              if (!clack.isCancel(confirmApply) && confirmApply) {
                const next = appendGitExcludeRules(current, missingRules)
                await fs.outputFile(gitExcludePath, next, "utf-8")
                log.success(`Git exclusion rules updated: ${missingRules.length} added.`)
              } else {
                log.info("Git exclusion update skipped.")
              }
            }
          } catch (err) {
            log.warn(`Could not update git local excludes: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
    }

    return "completed"
  }
}
