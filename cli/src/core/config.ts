import path from "path"
import { fileURLToPath } from "url"
import { env } from "../env.ts"

// ============================================================================
// SOURCE
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SKILL_SOURCE_DIR = path.resolve(__dirname, "..", "..", "..", "skills")

// ============================================================================
// GLOBAL IDE PATHS
// All paths built with path.join()
// ============================================================================

export const IDE_GLOBAL_PATHS = {
  intellij:    [path.join(env.HOME, ".codeium", "skills")],
  windsurf:    [path.join(env.HOME, ".codeium", "windsurf", "skills")],
  antigravity: [path.join(env.HOME, ".gemini", "antigravity", "skills")],
  claude:      [path.join(env.HOME, ".claude", "skills")],
  cursor:      [path.join(env.HOME, ".cursor", "skills")],
  codex:       [path.join(env.HOME, ".codex", "skills")],
} as const satisfies Record<string, string[]>

// ============================================================================
// IDE BASE DIRS (used to detect if an IDE is installed)
// ============================================================================

export const IDE_BASE_DIRS = {
  intellij:    path.join(env.HOME, ".codeium"),
  windsurf:    path.join(env.HOME, ".codeium"),
  antigravity: path.join(env.HOME, ".gemini", "antigravity"),
  claude:      path.join(env.HOME, ".claude"),
  cursor:      path.join(env.HOME, ".cursor"),
  codex:       path.join(env.HOME, ".codex"),
} as const satisfies Record<string, string>

// ============================================================================
// PROJECT-LEVEL IDE PATHS (relative to project root)
// ============================================================================

export const IDE_PROJECT_PATHS = {
  intellij:    [path.join(".windsurf", "skills")],
  windsurf:    [path.join(".windsurf", "skills")],
  antigravity: [path.join(".agent", "skills")],
  claude:      [path.join(".claude", "skills")],
  cursor:      [path.join(".cursor", "skills"), path.join(".agents", "skills")],
  codex:       [path.join(".agents", "skills")],
} as const satisfies Record<string, string[]>

// ============================================================================
// ALL IDEs — "all" is a UI concept, not a type. Expanded here.
// ============================================================================

export const ALL_IDE_KEYS = [
  "intellij",
  "windsurf",
  "antigravity",
  "claude",
  "cursor",
  "codex",
] as const
