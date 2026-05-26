import { Command } from "commander"
import { discoverSkills } from "../core/skills/discovery.ts"
import { listGlobalInstallations } from "../core/installations/global.ts"
import { toErrorMessage } from "../core/system/errors.ts"
import { isJsonMode, printJson } from "../ui/output.ts"
import { log } from "../ui/logger.ts"
import * as pc from "../ui/ansi.ts"

export const listCmd = new Command("list")
  .description("List the skill catalog or view global installations")
  .option("--global", "View global installations across all IDEs")
  .action(async (options: { global?: boolean }) => {
    let exitCode = 0
    try {
      if (options.global) {
        const installations = await listGlobalInstallations()

        if (isJsonMode) {
          printJson({ installations })
          return process.exit(0)
        }

        if (installations.length === 0) {
          log.info("No global installations found.")
          return process.exit(0)
        }

        log.step("Global Installations")

        let currentScope = ""
        let currentTargetDir = ""
        for (const installation of installations) {
          if (installation.scope !== currentScope) {
            currentScope = installation.scope
            currentTargetDir = ""
            log.raw(`\n  [${pc.cyan(currentScope)}]`)
          }

          if (installation.targetDir !== currentTargetDir) {
            currentTargetDir = installation.targetDir
            log.raw(`  ${pc.dim(currentTargetDir)}`)
          }

          log.bullet(installation.deployName)
        }

        log.raw("")
        return process.exit(0)
      }

      const skills = await discoverSkills()

      if (isJsonMode) {
        const jsonSafeSkills = skills.map((s) => ({
          ref: s.ref,
          name: s.name,
          category: s.category || "uncategorized",
          source: s.source,
        }))
        printJson({ skills: jsonSafeSkills })
        return process.exit(0)
      }

      if (skills.length === 0) {
        log.info("No skill catalog entries found.")
        return process.exit(0)
      }

      log.step("Available Skill Catalog")

      let currentCategory = ""
      for (const skill of skills) {
        if (skill.category !== currentCategory) {
          currentCategory = skill.category
          log.raw(`\n  [${pc.cyan(currentCategory || "uncategorized")}]`)
        }
        const sourceMark = skill.source === "imported" ? pc.dim("(imported)") : ""
        log.bullet(skill.name, `${skill.description || ""} ${sourceMark}`.trim())
      }

      log.raw("")
    } catch (err: unknown) {
      if (isJsonMode) {
        printJson({ error: toErrorMessage(err) })
      } else {
        log.error("Failed to list skills", err)
      }
      exitCode = 1
    }
    process.exit(exitCode)
  })
