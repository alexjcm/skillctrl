import { Command } from "commander"
import { discoverSkills } from "../core/skills/discovery.ts"
import { deploySkillGlobal, deploySkillToProject } from "../core/deploy/service.ts"
import { ALL_IDE_KEYS } from "../core/config/ide-paths.ts"
import { readUserConfig } from "../core/config/user-config.ts"
import type { IdeTarget, DeployResult, Skill } from "../core/types.ts"
import { isJsonMode, printJson } from "../ui/output.ts"
import { log } from "../ui/logger.ts"
import * as pc from "../ui/ansi.ts"

function parseIdes(ideString: string): IdeTarget[] {
  if (ideString === "all") return [...ALL_IDE_KEYS]
  const parsed = ideString.split(",").map(i => i.trim() as IdeTarget)
  const invalid = parsed.filter(i => !ALL_IDE_KEYS.includes(i))
  if (invalid.length > 0) {
    if (isJsonMode) {
      printJson({ error: `Invalid IDEs: ${invalid.join(", ")}` })
    } else {
      log.error(`Invalid IDEs: ${invalid.join(", ")}`)
    }
    process.exit(1)
  }
  return parsed
}

function summarizeResults(results: DeployResult[]) {
  const summary = { copied: 0, skipped: 0, errors: 0 }
  for (const r of results) {
    if (r.status === "copied") summary.copied++
    else if (r.status === "skipped") summary.skipped++
    else summary.errors++
  }
  return summary
}

function handleOutput(results: DeployResult[]) {
  const summary = summarizeResults(results)

  if (isJsonMode) {
    const jsonSafeResults = results.map(r => ({
      ref: r.skill.ref,
      name: r.skill.name,
      ide: r.ide,
      status: r.status,
      targetPath: r.targetPath,
      ...(r.error ? { error: r.error } : {}),
      ...(r.reason ? { reason: r.reason } : {})
    }))
    printJson({ results: jsonSafeResults, summary })
    if (summary.copied === 0 && results.length > 0) process.exit(1)
    process.exit(0)
  }

  for (const r of results) {
    if (r.status === "copied") {
      log.success(`Copied ${pc.cyan(r.skill.name)} to ${pc.dim(r.ide)}`)
    } else if (r.status === "skipped") {
      log.warn(`Skipped ${pc.cyan(r.skill.name)} for ${pc.dim(r.ide)} (${r.reason})`)
    } else {
      log.error(`Failed ${pc.cyan(r.skill.name)} for ${pc.dim(r.ide)}`, r.error)
    }
  }

  log.raw("")
  log.step("Summary")
  log.bullet("Copied", String(summary.copied))
  log.bullet("Skipped", String(summary.skipped))
  log.bullet("Errors", String(summary.errors))

  if (summary.copied === 0 && results.length > 0) process.exit(1)
  process.exit(0)
}

async function resolveSkills(skillRef?: string): Promise<Skill[]> {
  const skills = await discoverSkills()
  if (skillRef) {
    const skill = skills.find(s => s.ref === skillRef || s.name === skillRef)
    if (!skill) {
      if (isJsonMode) printJson({ error: `Skill not found: ${skillRef}` })
      else log.error(`Skill not found: ${skillRef}`)
      process.exit(1)
    }
    return [skill]
  }
  
  const config = readUserConfig()
  const excluded = config?.excludedSkills || []
  return skills.filter(s => !excluded.includes(s.ref))
}

export const deployCmd = new Command("deploy")
  .description("Deploy skills to target environments")

deployCmd
  .command("global")
  .description("Deploy skills globally to specified IDEs")
  .requiredOption("--ide <ides>", "Comma-separated list of IDEs or 'all'")
  .option("--skill <ref>", "Specific skill to deploy")
  .option("-y, --yes", "Skip confirmation prompts (no-op in headless)")
  .action(async (options) => {
    const ides = parseIdes(options.ide)
    const skillsToDeploy = await resolveSkills(options.skill)
    const results: DeployResult[] = []

    for (const skill of skillsToDeploy) {
      const skillResults = await deploySkillGlobal(skill, ides)
      results.push(...skillResults)
    }

    handleOutput(results)
  })

deployCmd
  .command("project")
  .description("Deploy skills to a specific project directory")
  .requiredOption("--path <dir>", "Target project directory")
  .requiredOption("--ide <ides>", "Comma-separated list of IDEs or 'all'")
  .option("--skill <ref>", "Specific skill to deploy")
  .option("-y, --yes", "Skip confirmation prompts (no-op in headless)")
  .action(async (options) => {
    const ides = parseIdes(options.ide)
    const skillsToDeploy = await resolveSkills(options.skill)
    const results: DeployResult[] = []

    for (const skill of skillsToDeploy) {
      const skillResults = await deploySkillToProject(skill, ides, options.path)
      results.push(...skillResults)
    }

    handleOutput(results)
  })
