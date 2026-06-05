import * as clack from "@clack/prompts"
import * as pc from "../ui/ansi.ts"
import { getSkillSourceDir } from "../core/config/ide-paths.ts"
import { loadExcludedRefs } from "../core/config/excluded-skills.ts"
import { getPackageVersion } from "../core/package-version.ts"
import { deployGlobalFlow } from "./flows/deploy-global.flow.ts"
import { deployToProjectFlow } from "./flows/deploy-project.flow.ts"
import { doctorFlow } from "./flows/doctor.flow.ts"
import { listFlow } from "./flows/list.flow.ts"
import { listGlobalFlow } from "./flows/list-global.flow.ts"
import { configFlow } from "./flows/config.flow.ts"
import { importSkillFlow } from "./flows/import-skill.flow.ts"
import { checkUpdatesFlow } from "./flows/check-updates.flow.ts"
import { deleteFlow } from "./flows/delete.flow.ts"
import { EXIT_CODES } from "../core/exit-codes.ts"
import type { FlowResult } from "./flow-result.ts"
import { log } from "../ui/logger.ts"
import { FLOW_CANCELLED, FLOW_COMPLETED } from "./constants/flow-tokens.ts"

// ============================================================================
// MAIN MENU
// ============================================================================

export interface RunMenuOptions {
  linkedWorkspaceInstall?: boolean
}

export async function runMenu(options: RunMenuOptions = {}): Promise<number> {
  const version = await getPackageVersion()
  const linkedWorkspaceBadge = options.linkedWorkspaceInstall
    ? ` ${pc.dim(`(v${version} running from linked workspace)`)}`
    : ""

  clack.intro(pc.bold(pc.cyan(`✦ skillctrl${linkedWorkspaceBadge}`)))

  // First-run / migration notice is handled inside loadExcludedRefs (skills-config.ts).
  // After that call, ~/.skillctrl/config.json is guaranteed to exist.
  loadExcludedRefs()

  // Informational hint when no own skills dir is configured
  const skillsDir = getSkillSourceDir()
  if (!skillsDir) {
    log.raw(
      `  ${pc.dim("ℹ")}  ${pc.dim("No own skills dir configured.")}\n` +
      `     ${pc.dim("Set one via:")} ${pc.dim("Own Skills Dir → Set own skills dir")}`
    )
  }

  let lastAction:
    | "import-skill"
    | "check-updates"
    | "settings"
    | "list"
    | "list-global"
    | "deploy-project"
    | "deploy-global"
    | "delete"
    | "doctor"
    | undefined

  while (true) {
    const action = await clack.select({
      message: "What would you like to do?",
      initialValue: lastAction,
      options: [
        { value: "deploy-project",     label: "🚀 Deploy skills to project/workspace",       hint: "→ project/workspace" },
        { value: "deploy-global",      label: "🚀 Deploy skills globally",                   hint: "→ one or more skills (global)" },
        { value: "import-skill",       label: "📥 Import skill from GitHub",                 hint: "→ URL or owner/repo" },
        { value: "check-updates",      label: "📥 Check & update imported skills",           hint: "→ imported skills" },
        { value: "settings",           label: "⚙️ Own Skills Dir",                           hint: "→ set own skills path" },
        { value: "list",               label: "⚙️ List available skill catalog" },
        { value: "list-global",        label: "⚙️ View global installations" },
        { value: "delete",             label: "⚙️ Delete skill(s)",                          hint: "→ imported or global" },
        { value: "doctor",             label: "🔧 Doctor (diagnostics)" },
      ],
    })

    // handle cancel (Ctrl+C)
    if (clack.isCancel(action)) {
      clack.outro(pc.dim("Bye!"))
      return EXIT_CODES.CANCEL
    }

    lastAction = action

    let result: FlowResult = FLOW_COMPLETED

    switch (action) {
      case "deploy-global":
        result = await deployGlobalFlow()
        break
      case "deploy-project":
        result = await deployToProjectFlow()
        break
      case "doctor":
        result = await doctorFlow()
        break
      case "list":
        await listFlow()
        result = FLOW_COMPLETED
        break
      case "list-global":
        await listGlobalFlow()
        result = FLOW_COMPLETED
        break
      case "settings":
        result = await configFlow()
        break
      case "import-skill":
        result = await importSkillFlow()
        break
      case "check-updates":
        result = await checkUpdatesFlow()
        break
      case "delete":
        result = await deleteFlow()
        break
    }

    if (result === FLOW_CANCELLED) {
      log.warn("Action cancelled.")
    }

    // Small separator between actions (stay in menu loop)
    log.raw(pc.dim("─────────────────────────────"))
  }
}
