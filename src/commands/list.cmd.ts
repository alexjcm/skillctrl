import { Command } from "commander"
import { discoverSkills } from "../core/skills/discovery.ts"
import { isJsonMode, printJson } from "../ui/output.ts"
import { log } from "../ui/logger.ts"
import * as pc from "../ui/ansi.ts"

export const listCmd = new Command("list")
  .description("List all available skills")
  .action(async () => {
    let exitCode = 0
    try {
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
        log.info("No skills found.")
        return process.exit(0)
      }

      log.step("Available Skills")
      
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
    } catch (err: any) {
      if (isJsonMode) {
        printJson({ error: err.message || String(err) })
      } else {
        log.error("Failed to list skills", err)
      }
      exitCode = 1
    }
    process.exit(exitCode)
  })
