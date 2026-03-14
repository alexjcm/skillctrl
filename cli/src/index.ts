import { Command } from "commander"
import "./env.ts"

const program = new Command()

program
  .name("skills")
  .description("Manage and deploy AI agent skills")
  .version("1.0.0")

// === 1. CLI MODE ===
// Lazy-load commands to keep startup fast when using arguments
const { registerListCommand } = await import("./commands/list.cmd")
const { registerDeployCommand } = await import("./commands/deploy.cmd")

registerListCommand(program)
registerDeployCommand(program)

// === 2. TUI MODE ===
// No arguments → launch interactive TUI menu directly
if (process.argv.length <= 2) {
  const { runMenu } = await import("./menu/index")
  await runMenu()
  process.exit(0)
}

// Fallback to CLI parsing
program.parse(process.argv)
