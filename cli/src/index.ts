import { Command } from "commander"
import { EXIT_CODES } from "./core/exit-codes.ts"
import { log } from "./ui/logger.ts"
import "./env.ts"

const program = new Command()

// Ensure cursor is always restored when the process exits
process.on("exit", () => {
  if (process.stdout.isTTY) {
    // Restore cursor visibility in case it was hidden by a prompt/spinner.
    process.stdout.write("\x1B[?25h")
  }
})

program
  .name("skills")
  .description("Manage and deploy AI agent skills")
  .version("1.0.0")
  .showHelpAfterError("(run with --help for usage)")
  .addHelpText(
    "after",
    `
Behavior:
  no arguments   open the interactive TUI menu

Examples:
  $ skills
  $ skills --help
  $ skills --version
`
  )

// === 1. TUI MODE ===
// No arguments → launch interactive TUI menu directly
if (process.argv.length <= 2) {
  try {
    const { runMenu } = await import("./menu/index")
    const exitCode = await runMenu()
    process.exit(exitCode)
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err))
    process.exit(EXIT_CODES.ERROR)
  }
}

// Fallback to CLI parsing (help/version only)
program.parse(process.argv)
