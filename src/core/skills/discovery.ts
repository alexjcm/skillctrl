import path from "path"
import fg from "fast-glob"
import { readdir, readFile } from "node:fs/promises"
import { exists, existsSync } from "../system/fs.ts"
import { isErrnoException } from "../system/errors.ts"
import { getSkillSourceDir } from "../config/ide-paths.ts"
import { IMPORTED_DIR } from "../config/user-config.ts"
import type { Skill } from "../types.ts"

// ============================================================================
// DISCOVER CATEGORIES
// Merges categories from both the user's own skillsDir and ~/.skillctrl/imported/.
// No hardcoded list — adding a folder = new category.
// ============================================================================

export async function discoverCategories(): Promise<string[]> {
  const roots: string[] = []
  const ownDir = getSkillSourceDir()
  if (ownDir) roots.push(ownDir)
  if (await exists(IMPORTED_DIR)) roots.push(IMPORTED_DIR)

  const allCategories = new Set<string>()
  for (const root of roots) {
    try {
      const entries = await readdir(root, { withFileTypes: true })
      entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .forEach((e) => {
          // Only treat as a category if it does NOT directly contain SKILL.md
          // (i.e. it is not itself an uncategorized skill folder)
          const possibleSkillMd = path.join(root, e.name, "SKILL.md")
          if (!existsSync(possibleSkillMd)) {
            allCategories.add(e.name)
          }
        })
    } catch (err: unknown) {
      if (!isErrnoException(err) || err.code !== "ENOENT") throw err
    }
  }
  return [...allCategories].sort()
}

// ============================================================================
// PARSE DESCRIPTION
// Extracts the first meaningful line from a SKILL.md as a short description.
// Skips the frontmatter block (--- ... ---) and the H1 title line.
// ============================================================================

async function parseSkillDescription(skillMdPath: string): Promise<string | undefined> {
  try {
    const content = await readFile(skillMdPath, "utf8")
    const lines = content.split("\n")

    let i = 0

    // Skip frontmatter if present
    if (lines[0]?.trim() === "---") {
      i = 1
      while (i < lines.length && lines[i]?.trim() !== "---") i++
      i++ // skip closing ---
    }

    // Skip blank lines and H1
    while (i < lines.length) {
      const line = lines[i]?.trim() ?? ""
      if (line === "" || line.startsWith("#")) {
        i++
        continue
      }
      return line.length > 80 ? line.slice(0, 77) + "..." : line
    }
  } catch (err: unknown) {
    // Non-fatal — description is optional
    if (!isErrnoException(err) || err.code !== "ENOENT") {
      // swallow silently
    }
  }
  return undefined
}

// ============================================================================
// DISCOVER SKILLS FROM A SINGLE ROOT
// Detects skills at two structural depths:
//   {root}/*/SKILL.md          → uncategorized (category = "")
//   {root}/*/*/SKILL.md        → categorized
//
// Ambiguity guard: if a dir at depth 1 contains SKILL.md, it is treated as
// an uncategorized skill regardless of whether it also has subdirs with SKILL.md.
// ============================================================================

async function discoverSkillsInRoot(
  root: string,
  source: "own" | "imported"
): Promise<Skill[]> {
  if (!(await exists(root))) return []

  const globRoot = root.replace(/\\/g, "/")

  // Both depths in one glob call
  const allMdPaths = await fg(
    [
      `${globRoot}/*/SKILL.md`,
      `${globRoot}/*/*/SKILL.md`,
    ],
    { onlyFiles: true, dot: false }
  )
  allMdPaths.sort()

  const skills: Skill[] = []
  // Track uncategorized skill dirs to skip their subdirs (ambiguity guard)
  const uncategorizedDirs = new Set<string>()

  for (const mdPath of allMdPaths) {
    const skillDir = path.dirname(mdPath)
    const parentDir = path.dirname(skillDir)

    const isDirectUnderRoot = path.normalize(parentDir) === path.normalize(root)

    if (isDirectUnderRoot) {
      // Uncategorized (depth 1): root/skill-name/SKILL.md
      const name = path.basename(skillDir)
      const ref = name
      uncategorizedDirs.add(path.normalize(skillDir))
      const description = await parseSkillDescription(mdPath)
      skills.push({ ref, name, category: "", path: skillDir, ...(description ? { description } : {}), source })
    } else {
      // Categorized (depth 2): root/category/skill-name/SKILL.md
      // Skip if the category dir itself was already claimed as an uncategorized skill
      if (uncategorizedDirs.has(path.normalize(parentDir))) continue

      const name = path.basename(skillDir)
      const categoryDir = parentDir
      const category = path.basename(categoryDir)
      const ref = path.join(category, name)
      const description = await parseSkillDescription(mdPath)
      skills.push({ ref, name, category, path: skillDir, ...(description ? { description } : {}), source })
    }
  }

  return skills
}

// ============================================================================
// DISCOVER SKILLS — public API
// Scans up to two roots: user's own skillsDir (if set) + ~/.skillctrl/imported/.
// ============================================================================

export async function discoverSkills(categories?: string[]): Promise<Skill[]> {
  const skills: Skill[] = []

  // Root 1: user's own skills
  const ownDir = getSkillSourceDir()
  if (ownDir) {
    const ownSkills = await discoverSkillsInRoot(ownDir, "own")
    if (categories) {
      skills.push(...ownSkills.filter((s) => categories.includes(s.category) || categories.includes(s.ref)))
    } else {
      skills.push(...ownSkills)
    }
  }

  // Root 2: imported (always, if dir exists)
  const importedSkills = await discoverSkillsInRoot(IMPORTED_DIR, "imported")
  if (categories) {
    skills.push(...importedSkills.filter((s) => categories.includes(s.category) || categories.includes(s.ref)))
  } else {
    skills.push(...importedSkills)
  }

  // Stable sort: category asc, name asc
  skills.sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category)
    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name)
  })

  return skills
}
