import path from "path"
import * as fs from "fs-extra"
import { IDE_PROJECT_PATHS } from "./config.ts"
import type { IdeTarget } from "./types.ts"

function normalizeRule(rule: string): string {
  const trimmed = rule.trim().replace(/\\/g, "/")
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}

export function suggestGitExcludeRulesForIdes(ides: readonly IdeTarget[]): string[] {
  const rules = new Set<string>()

  for (const ide of ides) {
    for (const relativePath of IDE_PROJECT_PATHS[ide]) {
      const normalized = relativePath.replace(/\\/g, "/")
      const topLevel = normalized.split("/").filter(Boolean)[0]
      if (!topLevel) continue

      const rule = normalizeRule(topLevel)
      if (rule) rules.add(rule)
    }
  }

  return [...rules].sort((a, b) => a.localeCompare(b))
}

function parseExistingRules(content: string): Set<string> {
  const rules = new Set<string>()
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const normalized = normalizeRule(line)
    if (!normalized) continue
    rules.add(normalized)
  }
  return rules
}

export function computeMissingGitExcludeRules(existingContent: string, desiredRules: readonly string[]): string[] {
  const existing = parseExistingRules(existingContent)
  const missing: string[] = []

  for (const rawRule of desiredRules) {
    const rule = normalizeRule(rawRule)
    if (!rule) continue
    if (!existing.has(rule)) {
      missing.push(rule)
    }
  }

  return missing
}

export function appendGitExcludeRules(existingContent: string, rulesToAppend: readonly string[]): string {
  const rules = rulesToAppend
    .map((r) => normalizeRule(r))
    .filter((r): r is string => Boolean(r))

  if (rules.length === 0) return existingContent

  let next = existingContent.replace(/\r\n/g, "\n")
  if (next.length > 0 && !next.endsWith("\n")) {
    next += "\n"
  }

  for (const rule of rules) {
    next += `${rule}\n`
  }

  return next
}

function resolveFromGitFile(projectDir: string, gitFilePath: string): string | null {
  try {
    const content = fs.readFileSync(gitFilePath, "utf8")
    const firstLine = content.split(/\r?\n/)[0]?.trim() ?? ""
    const match = /^gitdir:\s*(.+)$/i.exec(firstLine)
    const gitDirRef = match?.[1]?.trim()
    if (!gitDirRef) return null

    const resolvedGitDir = path.isAbsolute(gitDirRef)
      ? gitDirRef
      : path.resolve(projectDir, gitDirRef)

    return path.join(resolvedGitDir, "info", "exclude")
  } catch {
    return null
  }
}

export async function resolveProjectGitExcludePath(projectDir: string): Promise<string | null> {
  const gitPath = path.join(projectDir, ".git")
  if (!(await fs.pathExists(gitPath))) {
    return null
  }

  const stat = await fs.lstat(gitPath)
  if (stat.isDirectory()) {
    return path.join(gitPath, "info", "exclude")
  }

  if (stat.isFile()) {
    return resolveFromGitFile(projectDir, gitPath)
  }

  return null
}
