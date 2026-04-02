# Design guide and best practices for CLIs and TUIs in TypeScript

This document describes **design principles for terminal applications (CLI and TUI)** focused on modern, interactive, and **cross-platform** tools. The practices are based on standards, Unix ecosystem conventions, current tooling, and terminal UX principles. The recommended programming language is TypeScript.

---

# 1. Core principles

## Design for humans and for scripts

A modern CLI typically has **two usage modes**:

| Mode | Characteristics |
|---|---|
| Interactive | prompts, spinners, colors |
| Scriptable | clean output, no prompts |

Behavior must adapt automatically based on the environment.

General rule:

- if `stdout` is TTY → enable colors, spinners, and ANSI
- if `stdin` is TTY → enable interactive prompts
- if neither is TTY → plain output, no decoration, no prompts

---

## Follow the Unix principle

Tools should:

- do **one thing well**
- be **composable with pipes**
- produce **predictable output**

Example:

```bash
cat logs.txt | grep ERROR | sort
```

---

# 2. Output and feedback

## Detect TTY before formatting output or showing prompts

`process.stdout.isTTY` and `process.stdin.isTTY` serve different purposes — they are not interchangeable:

| Check | When to use it |
|---|---|
| `!!process.stdout.isTTY` | Decide whether to enable colors, spinners, and ANSI codes |
| `!!process.stdin.isTTY` | Decide whether to show interactive prompts |

> In Node.js, when a stream is not a TTY, `isTTY` returns `undefined` — not `false`. Using `!!` avoids ambiguous comparisons.

Disable when `stdout` is not a TTY:
- colors
- spinners
- animations
- any ANSI escape codes

Disable when `stdin` is not a TTY:
- interactive prompts (input, select, confirm)

```typescript
const hasInteractiveOutput = !!process.stdout.isTTY;
const hasInteractiveInput  = !!process.stdin.isTTY;
```

---

## Spinners in interactive mode only

Never show spinners when output is being redirected or piped.

```typescript
if (hasInteractiveOutput) {
  const spinner = createSpinner("Processing...").start();
}
```

Always close the spinner before the process exits — if the process terminates with the spinner still active, the cursor will be hidden in the user's terminal.

```typescript
const spinner = createSpinner("Processing...").start();
try {
  await doWork();
  spinner.success({ text: "Done" });
} catch (err) {
  spinner.error({ text: "Operation failed" });
  process.exit(1);
}
```

---

## stdout for data, stderr for diagnostics

Fundamental contract of the Unix ecosystem.

| Call | Stream | Use |
|---|---|---|
| `console.log` | stdout | data and real output |
| `console.warn` | stderr | warnings — goes to stderr, not stdout |
| `console.error` | stderr | errors and diagnostics |

```typescript
console.log("result");        // stdout — data and real output
console.warn("attention");    // stderr — warnings
console.error("something failed"); // stderr — errors and diagnostics
```

This enables redirections like:

```bash
mytool list > output.txt      # only real output, no errors or warnings
mytool list 2> errors.log     # only stderr (errors and warnings)
```

---

## Concise output

One line per relevant action, concise summary at the end. Not too much, not too little — a silent CLI looks broken; one that floods debug lines is unreadable.

```
✔ task-a   completed
✔ task-b   completed
⚠ task-c   skipped
✖ task-d   error

Summary: 3 successful · 1 skipped · 1 error
```

---

# 3. Commands and flags

## Standard structure

```
<tool> <subcommand> [options] [arguments]
```

Example:

```bash
mytool deploy auth-service --env production
```

---

## Args for essentials, flags for optionals

Positional arguments are for essential, unambiguous inputs. Everything optional or configurable goes as a named flag — it is more readable, self-documenting, and easy to extend without breaking compatibility.

```bash
# ✅ Named flag — clear, extensible, readable
mytool deploy auth-service --env production

# ❌ Positional arg for options — brittle and hard to remember
mytool deploy auth-service production
```

---

## Short and long flags

Standard convention:

```
-h / --help
-v / --version
-f / --force
```

Short flags (`-f`, `-v`) should be reserved **only for the most frequently used ones**. Having a short flag for everything increases the user's memory load. Only `-h` and `-v` are universal — the rest are optional.

---

## Recommended universal flags

```
--help       show help
--version    show version
```

---

## `--help` on every subcommand

Every subcommand must include a description, syntax, flags, and examples. It is the only documentation available without leaving the terminal.

---

## `--` and `-` conventions

Two Unix conventions that must be respected in tools that process files or data:

**`--` marks the end of flags.** Everything after it is treated as a positional argument, even if it starts with `-`. Essential for tools that process files whose names begin with a dash.

```bash
mytool process -- --weird-filename.txt
```

**`-` as an argument means read from stdin.** Makes the tool composable with pipes.

```bash
cat data.txt | mytool process -
mytool process --input -
```

---

# 4. Error handling

## Actionable messages

A good error explains what happened, why, and how to fix it.

```typescript
// ❌ Useless to the user
throw new Error("ENOENT: no such file or directory");

// ✅ Actionable
throw new Error(
  `Config file not found at: ${configPath}\n` +
  `Run "mytool init" to create the initial configuration.`
);
```

---

## Early validation

Validate arguments, environment variables, and configuration **before executing any operation with side effects**. A validation error that appears after 10 seconds of execution is a design error.

```typescript
// Validate at startup — fail immediately with a clear message
const ConfigSchema = z.object({
  token: z.string().min(1, "TOKEN is required — run 'mytool auth login'"),
  env: z.enum(["staging", "production"]).default("staging"),
});

export const config = ConfigSchema.parse(loadRawConfig());
```

---

## Configuration precedence

Configuration sources must follow this order of precedence (lowest to highest):

```
environment variables < config file < CLI flags
```

An explicit flag always wins over configuration. This is a widely adopted standard in tools like Docker, Git, and AWS CLI.

---

## Suggest commands on typos

```
error: unknown command "depoy"
Did you mean "deploy"?
```

---

## Standard config file locations

Store config in paths the OS expects — never in the working directory or hardcoded.

| System | Recommended path |
|---|---|
| Linux / macOS | `$XDG_CONFIG_HOME/<tool>/config.json` (default: `~/.config/<tool>/`) |
| Windows | `%APPDATA%\<tool>\config.json` |

```typescript
import os from "node:os";
import path from "node:path";

function getConfigDir(toolName: string): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), toolName);
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdg, toolName);
}
```

---

# 5. Interactivity and TUI

## Prompts in TTY only

If the process has no TTY (it is being run from a script or pipeline), do not use interactive prompts. Fail with a clear message asking for the required arguments as flags.

---

## Always detect Clack cancellation

Clack does not throw an exception when the user presses `Ctrl+C` — it returns a special symbol. Without the `isCancel()` guard, the process keeps executing code with an invalid value, producing silent bugs.

```typescript
const env = await select({
  message: "Target environment?",
  options: [{ value: "staging" }, { value: "production" }],
});

if (isCancel(env)) {
  process.exit(0); // clean exit, not an error
}
```

**Rule:** never generate a Clack prompt without the `isCancel()` guard immediately after.

---

## Confirm destructive or bulk operations

```typescript
const ok = await confirm({
  message: "Confirm deploy to production? This action cannot be undone.",
});
if (!ok || isCancel(ok)) process.exit(0);
```

---

## Handle system signals

Without signal handlers, `Ctrl+C` during a long operation leaves the system in an inconsistent state: half-written files, orphaned child processes, directories created without content.

```typescript
const cleanup = async () => {
  spinner?.error({ text: "Interrupted" });
  await fs.remove(tempDir).catch(() => {});
};

process.on("SIGINT",  async () => { await cleanup(); process.exit(130); });
process.on("SIGTERM", async () => { await cleanup(); process.exit(143); });
```

---

## Restore terminal state

TUIs must fully restore terminal state on exit, including the cursor — especially if `cursor: false` was used at any point. If the process dies unexpectedly with the cursor hidden, the user's session becomes unusable until they run `reset`.

---

## Progressive disclosure

The main menu must reveal all available options without the user having to memorize them. Each flow guides step by step.

```
What do you want to do?
  ❯ Option A
    Option B
    Option C
    Exit
```

---

## Show a summary after each action

```
✔ 4 items processed
⚠ 1 skipped
✖ 0 errors
```

---

# 6. Visual design

## Colors for semantics, not decoration

Colors must communicate state. If everything is highlighted, nothing is highlighted.

| Color | Use |
|---|---|
| Green | success, completed |
| Yellow | warning, skipped |
| Red | error |
| Gray / dim | secondary information, paths, metadata |

---

## Centralized logger — never direct `console.log`

A single module handles all application output. Commands and menu flows never call `console.log` directly.

```typescript
export const logger = {
  info:    (msg: string) => console.log(`${symbols.info}  ${msg}`),
  success: (msg: string) => console.log(`${symbols.success} ${pc.green(msg)}`),
  warn:    (msg: string) => console.warn(`${symbols.warning} ${pc.yellow(msg)}`),
  error:   (msg: string, err?: unknown) => {
    console.error(`${symbols.error} ${pc.red(msg)}`);
    if (err instanceof Error) console.error(pc.dim(err.message));
  },
};
```

The logger lives in `src/ui/` — it is part of the presentation layer, not generic utilities.

---

# 7. Exit codes

Exit codes are the contract between a CLI and the operating system and the scripts that consume it. They must be correct and consistent.

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General runtime error |
| 2 | Incorrect usage — invalid arguments or flags |
| 126 | Command found but not executable |
| 127 | Command not found |
| 130 | Terminated by `Ctrl+C` (SIGINT — 128 + 2) |
| 143 | Terminated by SIGTERM (128 + 15) |

Code `130` is especially relevant for TUIs: when the user cancels with `Ctrl+C`, the process must exit with `130`, not `1` — scripts invoking the tool can distinguish an intentional cancellation from a real error. Likewise, `143` for SIGTERM differentiates a scheduled termination (orchestrators, systemd, Docker) from a failure.

---

# 8. Global consistency

Consistency is what makes a tool truly intuitive — the user learns the pattern once and applies it everywhere.

Maintain coherence in:

- command and subcommand names
- flag structure
- output format
- error message style

---

# 9. Advanced rules for modern CLIs

## Fast startup

A CLI must start up quickly. Best practices:

- avoid heavy imports in the entry point
- load modules lazily when possible
- minimize I/O at startup — validate config only when needed

---

## Deterministic behavior

The CLI must produce **the same output for the same inputs**. The most common source of non-deterministic output in TypeScript is iterating over structures that do not guarantee order.

```typescript
// ❌ Order not guaranteed
const files = await fs.readdir(dir);

// ✅ Deterministic order
const files = (await fs.readdir(dir)).sort();
```

---

## Correct cross-platform path handling

Never build paths with string concatenation — always use `path.join()` or `path.resolve()`.

---

## Consistent experience across platforms

The CLI must behave the same on Linux, macOS, and Windows. Avoid:

- dependencies on a specific shell (`bash`, `zsh`)
- hardcoded paths with Unix separators
- non-portable external commands (`grep`, `sed`, `awk`)

Always prefer native TypeScript equivalents over system commands.

---

# 10. Recommended architecture

Separating responsibilities is what makes a CLI maintainable, testable, and scalable as it grows.

## Main layers

**`core/`** — Pure business logic.
- Does not depend on CLI or terminal libraries.
- Does not print output or use prompts.

**`commands/`** — CLI adapters to core.
- Parse arguments and flags with Commander.
- Call core and delegate the result to the UI.
- Must be thin — no business logic.

**`ui/`** — Terminal experience.
- Colors, spinners, prompts, and tables.
- Contains the centralized logger.
- Contains no business logic.

**`utils/`** — Shared utilities with no clear ownership in another layer.

## Typical structure

```
src/
  index.ts          ← entry point, registers commands, validates env
  commands/         ← one file per subcommand
  core/             ← business logic, types, Zod schemas
  ui/               ← logger, format helpers, reusable prompts
  utils/
```

## Key principles

- **core must not depend on the terminal** or CLI libraries.
- **Commands must be thin** — parse → call core → show result.
- The **centralized logger** in `ui/` controls all output.
- The **entry point** validates the environment and configuration before anything else.
- **core must be testable** without simulating a terminal.

---

# Agent summary

| Practice | Priority |
|---|---|
| stdout for data, stderr for errors and warnings | Required |
| Detect TTY: stdout for formatting, stdin for prompts | Required |
| Close spinner before `process.exit()` | Required |
| Restore cursor on exit (`\x1B[?25h`) | Required |
| Handle SIGINT (130) and SIGTERM (143) with cleanup | Required |
| `isCancel()` after every Clack prompt | Required |
| Confirm destructive or bulk operations | Required |
| Actionable error messages | Required |
| Correct exit codes (130 SIGINT · 143 SIGTERM) | Required |
| Config precedence: env < config file < flags | Required |
| Config in standard OS paths (XDG / APPDATA) | Required |
| Universal flags (`--help`, `--version`) | High |
| `--` and `-` (stdin) conventions | High |
| Consistent commands and flags | High |
| Paths with `path.join()`, never concatenation | High |
| Summary after each action | High |

# References

- **CLI Guidelines** (canonical ecosystem reference): https://clig.dev
- **Clack best practices**: https://bomb.sh/docs/clack/guides/best-practices
- **XDG Base Directory Specification** (Linux config paths): https://specifications.freedesktop.org/basedir-spec/latest/
