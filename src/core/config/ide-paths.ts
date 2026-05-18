import path from "path"
import { env } from "../../env.ts"
import { readUserConfig } from "./user-config.ts"

/**
 * Returns the user-configured skills folder, or null when not set.
 * Callers must handle null gracefully — no error is thrown.
 */
export function getSkillSourceDir(): string | null {
  return readUserConfig()?.ownSkillsDir ?? null
}

export const IDE_GLOBAL_PATHS = {
  codex:       [path.join(env.HOME, ".agents", "skills")],
  copilot:     [path.join(env.HOME, ".copilot", "skills")],
  intellij:    [path.join(env.HOME, ".codeium", "skills")],
  windsurf:    [path.join(env.HOME, ".codeium", "windsurf", "skills")],
  junie:       [path.join(env.HOME, ".junie", "skills")],
  antigravity: [path.join(env.HOME, ".gemini", "antigravity", "skills")],
  claude:      [path.join(env.HOME, ".claude", "skills")],
  cursor:      [path.join(env.HOME, ".cursor", "skills")],
  opencode:    [path.join(env.HOME, ".config", "opencode", "skills"), path.join(env.HOME, ".claude", "skills"), path.join(env.HOME, ".agents", "skills")],
} as const satisfies Record<string, string[]>

export const IDE_BASE_DIRS = {
  codex:       path.join(env.HOME, ".agents"),
  copilot:     path.join(env.HOME, ".copilot"),
  intellij:    path.join(env.HOME, ".codeium"),
  windsurf:    path.join(env.HOME, ".codeium"),
  junie:       path.join(env.HOME, ".junie"),
  antigravity: path.join(env.HOME, ".gemini", "antigravity"),
  claude:      path.join(env.HOME, ".claude"),
  cursor:      path.join(env.HOME, ".cursor"),
  opencode:    path.join(env.HOME, ".config", "opencode"),
} as const satisfies Record<string, string>

export const IDE_PROJECT_PATHS = {
  codex:       [path.join(".agents", "skills")],
  copilot:     [path.join(".github", "skills")],
  intellij:    [path.join(".windsurf", "skills")],
  windsurf:    [path.join(".windsurf", "skills")],
  junie:       [path.join(".junie", "skills")],
  antigravity: [path.join(".agents", "skills")],
  claude:      [path.join(".claude", "skills")],
  cursor:      [path.join(".cursor", "skills"), path.join(".agents", "skills")],
  opencode:    [path.join(".opencode", "skills"), path.join(".claude", "skills"), path.join(".agents", "skills")],
} as const satisfies Record<string, string[]>

export const ALL_IDE_KEYS = [
  "codex",
  "intellij",
  "windsurf",
  "junie",
  "antigravity",
  "claude",
  "cursor",
  "opencode",
  "copilot",
] as const

export const IDE_GIT_EXCLUDE_ENABLED = {
  codex:       true,
  copilot:     false,
  intellij:    true,
  windsurf:    true,
  junie:       true,
  antigravity: true,
  claude:      true,
  cursor:      true,
  opencode:    true,
} as const satisfies Record<typeof ALL_IDE_KEYS[number], boolean>
