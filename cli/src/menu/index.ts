import * as clack from "@clack/prompts"
import pc from "picocolors"
import { SKILL_SOURCE_DIR } from "../core/config.ts"
import { deployAllGlobalFlow, deployAllChooseIdeFlow, deploySpecificGlobalFlow } from "./flows/deploy-global.flow.ts"
import { deployToProjectFlow } from "./flows/deploy-project.flow.ts"
import { doctorFlow } from "./flows/doctor.flow.ts"
import { listFlow } from "./flows/list.flow.ts"
import { EXIT_CODES } from "../core/exit-codes.ts"
import { loadExcludedRefs } from "../core/skills-config.ts"
import type { FlowResult } from "./flow-result.ts"
import { log } from "../ui/logger.ts"

// ============================================================================
// MAIN MENU
// isCancel after every prompt
// ============================================================================

export async function runMenu(): Promise<number> {
  clack.intro(pc.bold(pc.cyan("✦ Skills Manager")))

  const excludedRefs = loadExcludedRefs()

  while (true) {
    const action = await clack.select({
      message: "What would you like to do?",
      options: [
        { value: "deploy-all-global",    label: "Deploy ALL skills",          hint: "→ all IDEs (global)" },
        { value: "deploy-all-ide",       label: "Deploy ALL skills",          hint: "→ choose IDE (global)" },
        { value: "deploy-specific",      label: "Deploy specific skill",       hint: "→ global" },
        { value: "deploy-project",       label: "Deploy to project/workspace directory", hint: "→ multi-select" },
        { value: "doctor",               label: "Doctor (diagnostics)" },
        { value: "list",                 label: "List available skills" },
        { value: "help",                 label: "Help" },
        { value: "exit",                 label: pc.dim("Exit") },
      ],
    })

    // handle cancel (Ctrl+C)
    if (clack.isCancel(action)) {
      clack.outro(pc.dim("Bye!"))
      return EXIT_CODES.CANCEL
    }

    let result: FlowResult = "completed"

    switch (action) {
      case "deploy-all-global":
        result = await deployAllGlobalFlow(excludedRefs)
        break
      case "deploy-all-ide":
        result = await deployAllChooseIdeFlow(excludedRefs)
        break
      case "deploy-specific":
        result = await deploySpecificGlobalFlow()
        break
      case "deploy-project":
        result = await deployToProjectFlow(excludedRefs)
        break
      case "doctor":
        result = await doctorFlow()
        break
      case "list":
        await listFlow()
        result = "completed"
        break
      case "help":
        log.raw(`
${pc.bold("Interactive Commands:")}
  ${pc.cyan("Deploy ALL skills")}           Deploy all non-excluded skills to global IDE dirs.
  ${pc.cyan("Deploy specific skill")}       Deploy a single skill to global IDE dirs.
  ${pc.cyan("Deploy to project/workspace directory")} Deploy selected skills to a specific project/workspace.
  ${pc.cyan("Doctor (diagnostics)")}        Validate environment, skills root, and writable target paths.
  ${pc.cyan("List available skills")}       Show all skills in ${pc.dim(SKILL_SOURCE_DIR)}.

${pc.bold("CLI Flags:")}
  ${pc.dim("$ skills --help")}                Show CLI help
  ${pc.dim("$ skills --version")}             Show CLI version
  ${pc.dim("Tip: run 'skills' with no arguments to open the interactive menu")}
        `)
        result = "completed"
        break
      case "exit":
        clack.outro(pc.dim("Bye!"))
        return EXIT_CODES.SUCCESS
    }

    if (result === "cancelled") {
      log.warn("Action cancelled.")
    }

    // Small separator between actions (stay in menu loop)
    log.raw(pc.dim("─────────────────────────────"))
  }
}
