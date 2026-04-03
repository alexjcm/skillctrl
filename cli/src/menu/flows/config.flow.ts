import path from "path"
import os from "os"
import * as clack from "@clack/prompts"
import * as fs from "fs-extra"
import * as pc from "../../ui/ansi.ts"
import { readUserConfig, saveUserConfig, SKILLS_HOME } from "../../core/user-config.ts"
import { discoverSkills } from "../../core/skills.ts"
import { log } from "../../ui/logger.ts"
import type { FlowResult } from "../flow-result.ts"
import { FLOW_BACK, FLOW_CANCELLED, FLOW_COMPLETED } from "../constants/flow-tokens.ts"

// ============================================================================
// CONFIG FLOW
// Accessible from the main menu as "Own Skills Dir".
// Allows the user to view or change skillsDir.
// ============================================================================

export async function configFlow(): Promise<FlowResult> {
  const cfg = readUserConfig() ?? { excludedSkills: [] }
  const current = cfg.skillsDir
  const defaultPath = path.join(os.homedir(), "my-skills")
  const setLabel = current ? "Change own skills dir" : "Set own skills dir"

  log.raw(`  ${pc.bold("Skills home:")} ${SKILLS_HOME}`)
  log.raw(
    `  ${pc.bold("Own skills dir:")} ${current ? pc.green(current) : pc.dim("not configured")}`
  )
  log.raw(`  ${pc.dim("Tip: This does not move files; it only changes where the CLI reads own skills.")}`)
  log.raw("")

  const action = await clack.select({
    message: "What would you like to do?",
    options: [
      { value: "set", label: setLabel, hint: current ? `currently: ${current}` : `default: ${defaultPath}` },
      { value: FLOW_BACK, label: pc.dim("← Back") },
    ],
  })

  if (clack.isCancel(action)) return FLOW_CANCELLED
  if (action === FLOW_BACK) return FLOW_BACK

  // ----------- set / change -----------
  const input = await clack.text({
    message: "Absolute path to your skills dir:",
    placeholder: current ?? defaultPath,
    initialValue: current ?? defaultPath,
    validate(value) {
      const trimmed = (value ?? "").trim()
      if (!trimmed) return "Path cannot be empty."
      if (!trimmed.startsWith("/") && !/^[A-Z]:\\/i.test(trimmed)) {
        return "Please enter an absolute path (starts with / on Unix, C:\\ on Windows)."
      }
    },
  })

  if (clack.isCancel(input)) return FLOW_CANCELLED

  const newPath = (typeof input === "string" ? input : "").trim()

  // Check if it exists; if not, offer to create it
  if (!(await fs.pathExists(newPath))) {
    const create = await clack.confirm({
      message: `"${newPath}" does not exist. Create it?`,
      initialValue: true,
    })
    if (clack.isCancel(create) || !create) {
      log.warn("Folder not created. Setting was not saved.")
      return FLOW_CANCELLED
    }
    await fs.ensureDir(newPath)
    log.success(`Created ${newPath}`)
  }

  saveUserConfig({ ...cfg, skillsDir: newPath })
  let ownSkillsCount = 0
  try {
    const allSkills = await discoverSkills()
    ownSkillsCount = allSkills.filter((skill) => skill.source === "own").length
  } catch {
    // Non-fatal; keep confirmation message concise even if scan fails.
  }

  log.success(`Own skills dir updated: ${pc.green(newPath)}`)
  if (ownSkillsCount > 0) {
    log.info(`Detected ${ownSkillsCount} own skill${ownSkillsCount === 1 ? "" : "s"} in this folder.`)
  } else {
    log.warn("Detected 0 own skills in this folder.")
  }
  return FLOW_COMPLETED
}
