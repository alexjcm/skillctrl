import { ALL_IDE_KEYS } from "./config/ide-paths.ts"

// ============================================================================
// IDE TARGET — only real IDE names, never "all" (CLI plan design decision)
// ============================================================================

export type IdeTarget = typeof ALL_IDE_KEYS[number]

// ============================================================================
// SKILL
// ============================================================================

export interface Skill {
  /** Relative path from its root, e.g. "development/writing-junit-tests" */
  ref: string
  /** Folder name, e.g. "writing-junit-tests" */
  name: string
  /** Category folder name, e.g. "development". Empty string when uncategorized. */
  category: string
  /** Absolute path to the skill folder */
  path: string
  /** First non-empty line of SKILL.md after the frontmatter/title, used as description in menus */
  description?: string
  /** Whether this skill belongs to the user's own skillsDir or was downloaded via import */
  source: "own" | "imported"
}

// ============================================================================
// DEPLOY OPTIONS
// ============================================================================

export interface DeployOptions {
  /** Skill refs to skip (loaded from skills.config.json) */
  excludedRefs: string[]
}

export interface DeployRuntimeOptions {
  /** Allow creating Copilot's native user skills directory when ~/.copilot does not exist yet. */
  allowCreateMissingCopilotHome?: boolean
}

// ============================================================================
// DEPLOY RESULT (returned by core functions, UI decides how to display)
// ============================================================================

export type DeployStatus = "copied" | "skipped" | "error"

export interface DeployResult {
  skill: Skill
  ide: IdeTarget
  targetPath: string
  status: DeployStatus
  /** Present when status === "error" */
  error?: string
  /** Present when status === "skipped" to explain why */
  reason?: string
}

// ============================================================================
// SKILLS CONFIG (skills.config.json shape)
// ============================================================================

export interface SkillsConfig {
  excludedSkills: string[]
}
