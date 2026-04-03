import path from "path"
import { env } from "../env.ts"
import { readUserConfig } from "./user-config.ts"

/**
 * Returns the user-configured skills folder, or null when not set.
 * Callers must handle null gracefully — no error is thrown.
 */
export function getSkillSourceDir(): string | null {
  return readUserConfig()?.skillsDir ?? null
}

export const IDE_GLOBAL_PATHS = {
  intellij:    [path.join(env.HOME, ".codeium", "skills")],
  windsurf:    [path.join(env.HOME, ".codeium", "windsurf", "skills")],
  junie:       [path.join(env.HOME, ".junie", "skills")],
  antigravity: [path.join(env.HOME, ".gemini", "antigravity", "skills")],
  claude:      [path.join(env.HOME, ".claude", "skills")],
  cursor:      [path.join(env.HOME, ".cursor", "skills")],
  codex:       [path.join(env.HOME, ".agents", "skills")],
  // OpenCode native + compatibility paths (Claude/Codex-compatible)
  opencode:    [path.join(env.HOME, ".config", "opencode", "skills"), path.join(env.HOME, ".claude", "skills"), path.join(env.HOME, ".agents", "skills")],
} as const satisfies Record<string, string[]>

// Used to detect if an IDE is installed
export const IDE_BASE_DIRS = {
  intellij:    path.join(env.HOME, ".codeium"),
  windsurf:    path.join(env.HOME, ".codeium"),
  junie:       path.join(env.HOME, ".junie"),
  antigravity: path.join(env.HOME, ".gemini", "antigravity"),
  claude:      path.join(env.HOME, ".claude"),
  cursor:      path.join(env.HOME, ".cursor"),
  codex:       path.join(env.HOME, ".agents"),
  opencode:    path.join(env.HOME, ".config", "opencode"),
} as const satisfies Record<string, string>

// Project-level IDE paths (relative to project root)
export const IDE_PROJECT_PATHS = {
  intellij:    [path.join(".windsurf", "skills")],
  windsurf:    [path.join(".windsurf", "skills")],
  junie:       [path.join(".junie", "skills")],
  antigravity: [path.join(".agent", "skills")],
  claude:      [path.join(".claude", "skills")],
  cursor:      [path.join(".cursor", "skills"), path.join(".agents", "skills")],
  codex:       [path.join(".agents", "skills")],
  // OpenCode native + compatibility paths (Claude/Codex-compatible)
  opencode:    [path.join(".opencode", "skills"), path.join(".claude", "skills"), path.join(".agents", "skills")],
} as const satisfies Record<string, string[]>

// All IDEs — "all" is a UI concept, not a type. Expanded here.
export const ALL_IDE_KEYS = [
  "intellij",
  "windsurf",
  "junie",
  "antigravity",
  "claude",
  "cursor",
  "codex",
  "opencode",
] as const
