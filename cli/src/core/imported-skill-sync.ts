import path from "path"
import * as fs from "fs-extra"
import type { SkillCandidate, SkillCandidatePreview } from "./github-fetcher.ts"
import { assertSafePathSegment, resolvePathInside } from "./path-safety.ts"
import { IMPORTED_DIR } from "./user-config.ts"

export type ImportAction = "import-new" | "update-same-source" | "overwrite-source"

export interface ImportPlan {
  preview: SkillCandidatePreview
  targetRef: string
  action: ImportAction
}

export interface PreparedImport {
  candidate: SkillCandidate
  targetRef: string
  action: ImportAction
}

export function normalizeSourceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

export function buildImportedTargetRef(name: string, category: string | null): string {
  const safeName = assertSafePathSegment(name, "Skill name")
  if (!category) return safeName
  const safeCategory = assertSafePathSegment(category, "Category")
  return `${safeCategory}/${safeName}`
}

export function buildImportedDestinationPath(name: string, category: string | null): string {
  const safeName = assertSafePathSegment(name, "Skill name")
  if (!category) return path.join(IMPORTED_DIR, safeName)
  const safeCategory = assertSafePathSegment(category, "Category")
  return path.join(IMPORTED_DIR, safeCategory, safeName)
}

export function createInitialImportPlans(
  selectedCandidates: SkillCandidatePreview[],
  category: string | null
): ImportPlan[] {
  return selectedCandidates.map((candidate) => ({
    preview: candidate,
    targetRef: buildImportedTargetRef(candidate.name, category),
    action: "import-new" as const,
  }))
}

export function findDuplicateTargetRefs(refs: string[]): string[] {
  const counts = new Map<string, number>()
  for (const ref of refs) {
    counts.set(ref, (counts.get(ref) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ref]) => ref)
    .sort((a, b) => a.localeCompare(b))
}

function normalizeRemoteRelativePath(remotePath: string): string {
  const normalized = remotePath.replace(/\\/g, "/").replace(/^\/+/, "").trim()
  if (!normalized) {
    throw new Error(`Invalid remote file path: "${remotePath}"`)
  }
  return normalized
}

export async function downloadAndSyncImportedSkill(candidate: SkillCandidate, category: string | null): Promise<number> {
  const destination = buildImportedDestinationPath(candidate.name, category)

  await fs.remove(destination)
  await fs.ensureDir(destination)

  const downloads = candidate.files.map(async (file) => {
    const relative = normalizeRemoteRelativePath(file.remotePath)
    const targetPath = resolvePathInside(destination, relative, `Remote file path "${file.remotePath}"`)
    await fs.ensureDir(path.dirname(targetPath))

    const response = await fetch(file.downloadUrl)
    if (!response.ok) {
      throw new Error(`Could not download ${file.remotePath} (${response.status})`)
    }

    const content = Buffer.from(await response.arrayBuffer())
    await fs.writeFile(targetPath, content)
  })

  await Promise.all(downloads)
  return candidate.files.length
}
