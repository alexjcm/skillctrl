import path from "path"
import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"

import * as fs from "fs-extra"
import { ALL_IDE_KEYS } from "../../core/config.ts"
import { deploySkillToProject } from "../../core/deploy.ts"
import type { IdeTarget, DeployResult, Skill } from "../../core/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { selectIde } from "../prompts/select-ide.ts"
import { multiSelectSkills } from "../prompts/select-skill.ts"
import { log } from "../../ui/logger.ts"
import { renderDeployResults } from "../helpers/render-deploy-results.ts"
import { maybeUpdateProjectGitExclude } from "../helpers/project-git-exclude.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { FLOW_ALL, FLOW_BACK, FLOW_CANCEL, FLOW_CANCELLED, FLOW_COMPLETED, FLOW_CONFIRM } from "../constants/flow-tokens.ts"

// ============================================================================
// FLOW: Deploy to project directory
// Handles: path input, IDE, multi-select skills, confirm, spinner
// isCancel on every prompt
// ============================================================================

export async function deployToProjectFlow(excludedRefs: string[]): Promise<FlowResult> {
  type Step = "path" | "ide" | "scope" | typeof FLOW_CONFIRM

  const isGitRepo = await fs.pathExists(path.join(process.cwd(), ".git"))
  const isNpmProject = await fs.pathExists(path.join(process.cwd(), "package.json"))

  let step: Step = "path"
  let projectDir: string | null = null
  let ide: IdeTarget | typeof FLOW_ALL | null = null
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
          if (trimmed.toLowerCase() === FLOW_BACK) return
        },
      }
      if (isGitRepo || isNpmProject) {
        promptOptions.initialValue = process.cwd()
      }

      const rawPath = await clack.text(promptOptions)
      if (clack.isCancel(rawPath)) return FLOW_CANCELLED

      const normalized = rawPath.trim()
      if (normalized.toLowerCase() === FLOW_BACK) return FLOW_BACK

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
      if (!selectedIde) return FLOW_CANCELLED
      if (selectedIde === FLOW_BACK) {
        step = "path"
        continue
      }

      ide = selectedIde
      ides = ide === FLOW_ALL ? [...ALL_IDE_KEYS] : [ide]
      step = "scope"
      continue
    }

    if (step === "scope") {
      const scopeResult = await clack.select({
        message: "Which skills to deploy?",
        options: [
          { value: FLOW_ALL, label: "All skills (excluding excluded)" },
          { value: "select", label: "Select specific skills" },
          { value: FLOW_BACK, label: pc.dim("← Back") },
        ],
      })
      if (clack.isCancel(scopeResult)) return FLOW_CANCELLED
      if (scopeResult === FLOW_BACK) {
        step = "ide"
        continue
      }

      if (scopeResult === FLOW_ALL) {
        const { discoverSkills, isExcluded } = await import("../../core/skills.ts")
        const all = await discoverSkills()
        skills = all.filter((s) => !isExcluded(s.ref, excludedRefs))
      } else {
        const selectedSkills = await multiSelectSkills(undefined, true)
        if (!selectedSkills) return FLOW_CANCELLED
        if (selectedSkills === FLOW_BACK) continue
        skills = selectedSkills
      }

      if (!skills || skills.length === 0) {
        log.warn("No skills selected.")
        continue
      }

      step = FLOW_CONFIRM
      continue
    }

    if (!projectDir || !ide || !skills || skills.length === 0) {
      step = "path"
      continue
    }

    const targetProjectDir = projectDir
    const skillsToDeploy = skills

    log.step("Summary:")
    log.bullet("Destination", targetProjectDir)
    log.bullet("IDEs", ide === FLOW_ALL ? `all (${ALL_IDE_KEYS.join(", ")})` : ide)
    log.bullet("Skills", String(skillsToDeploy.length))

    log.step("Skills to deploy:")
    for (const skill of skillsToDeploy) {
      log.bullet(skill.ref)
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
      const results = await runWithSpinner(
        { startMessage: `Deploying to ${targetProjectDir}...` },
        async () => {
          const nextResults: DeployResult[] = []
          for (const skill of skillsToDeploy) {
            const deployResults = await deploySkillToProject(skill, ides, targetProjectDir)
            nextResults.push(...deployResults)
          }
          return nextResults
        }
      )
      renderDeployResults(results)
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err))
    }

    await maybeUpdateProjectGitExclude(targetProjectDir, ides)
    return FLOW_COMPLETED
  }
}
