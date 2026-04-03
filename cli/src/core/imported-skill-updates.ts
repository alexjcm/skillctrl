import path from "path"
import fg from "fast-glob"
import * as fs from "fs-extra"
import type { SkillCandidate, SkillCandidatePreview } from "./github-fetcher.ts"
import { fetchSkillCandidatePreviewsFromInput, hydrateSkillCandidate } from "./github-fetcher.ts"
import { assertSafePathSegment, resolvePathInside } from "./path-safety.ts"
import { saveEntry, type ImportEntry } from "./skill-imports.ts"
import { IMPORTED_DIR } from "./user-config.ts"

export type CheckStatus = "up-to-date" | "update-available" | "unreachable"

export interface CheckReport {
  ref: string
  entry: ImportEntry
  status: CheckStatus
  message?: string
  candidate?: SkillCandidate
  remoteBuffers?: Map<string, Buffer>
}

function splitRef(ref: string): { category: string | null; name: string } {
  const normalized = ref.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
  const parts = normalized.split("/").filter(Boolean)
  const name = parts[parts.length - 1] ?? normalized
  if (parts.length >= 2) {
    const category = parts.slice(0, -1).join("/")
    return { category, name }
  }
  return { category: null, name }
}

function localSkillPathFromRef(ref: string): string {
  const parts = ref.replace(/\\/g, "/").split("/").filter(Boolean)
  if (parts.length === 0) {
    throw new Error(`Invalid imported skill ref: "${ref}"`)
  }

  const safeRefPath = parts
    .map((segment) => assertSafePathSegment(segment, "Imported skill ref segment"))
    .join("/")

  return resolvePathInside(IMPORTED_DIR, safeRefPath, `Imported skill ref "${ref}"`)
}

function normalizeRemotePath(remotePath: string): string {
  const normalized = remotePath.replace(/^\/+/, "").replace(/\\/g, "/").trim()
  if (!normalized) {
    throw new Error(`Invalid remote file path: "${remotePath}"`)
  }
  return normalized
}

function selectCandidateForRef(ref: string, entry: ImportEntry, candidates: SkillCandidatePreview[]): SkillCandidatePreview | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0] ?? null

  if (entry.remoteBasePath) {
    const byBasePath = candidates.find((c) => c.remoteBasePath === entry.remoteBasePath)
    if (byBasePath) return byBasePath
  }

  const { name } = splitRef(ref)
  const exactByName = candidates.find((c) => c.name === name)
  if (exactByName) return exactByName

  const exactByBase = candidates.find((c) => {
    const baseName = path.posix.basename(c.remoteBasePath || "")
    return baseName === name
  })
  if (exactByBase) return exactByBase

  return null
}

async function listLocalFiles(localDir: string): Promise<string[]> {
  if (!(await fs.pathExists(localDir))) return []
  const files = await fg("**/*", {
    cwd: localDir,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
  })
  return files
    .map((f) => f.replace(/\\/g, "/").replace(/^\/+/, ""))
    .sort((a, b) => a.localeCompare(b))
}

async function fetchRemoteBuffers(candidate: SkillCandidate): Promise<Map<string, Buffer>> {
  const tasks = candidate.files.map(async (file) => {
    const response = await fetch(file.downloadUrl)
    if (!response.ok) {
      throw new Error(`Could not download ${file.remotePath} (${response.status})`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    return [normalizeRemotePath(file.remotePath), buffer] as const
  })

  const loaded = await Promise.all(tasks)
  return new Map<string, Buffer>(loaded)
}

function sameFileSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

async function compareLocalVsRemote(
  ref: string,
  candidate: SkillCandidate
): Promise<{ upToDate: boolean; remoteBuffers: Map<string, Buffer> }> {
  const localDir = localSkillPathFromRef(ref)
  const localFiles = await listLocalFiles(localDir)
  const remoteFiles = candidate.files
    .map((file) => normalizeRemotePath(file.remotePath))
    .sort((a, b) => a.localeCompare(b))

  if (!sameFileSet(localFiles, remoteFiles)) {
    const remoteBuffers = await fetchRemoteBuffers(candidate)
    return { upToDate: false, remoteBuffers }
  }

  const remoteBuffers = await fetchRemoteBuffers(candidate)
  for (const rel of remoteFiles) {
    const localPath = resolvePathInside(localDir, rel, `Remote file path "${rel}"`)
    const localBuffer = await fs.readFile(localPath)
    const remoteBuffer = remoteBuffers.get(rel)
    if (!remoteBuffer || !remoteBuffer.equals(localBuffer)) {
      return { upToDate: false, remoteBuffers }
    }
  }

  return { upToDate: true, remoteBuffers }
}

export async function buildUpdateReport(ref: string, entry: ImportEntry): Promise<CheckReport> {
  try {
    const previews = await fetchSkillCandidatePreviewsFromInput(entry.source)
    const preview = selectCandidateForRef(ref, entry, previews)
    if (!preview) {
      return {
        ref,
        entry,
        status: "unreachable",
        message: "Could not resolve a unique skill candidate from source",
      }
    }

    const candidate = await hydrateSkillCandidate(preview)
    const comparison = await compareLocalVsRemote(ref, candidate)
    return {
      ref,
      entry,
      status: comparison.upToDate ? "up-to-date" : "update-available",
      candidate,
      remoteBuffers: comparison.remoteBuffers,
    }
  } catch (err) {
    return {
      ref,
      entry,
      status: "unreachable",
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function syncImportedSkillFromReport(report: CheckReport): Promise<void> {
  if (!report.candidate || !report.remoteBuffers) {
    throw new Error(`Missing remote payload for ${report.ref}`)
  }

  const destination = localSkillPathFromRef(report.ref)
  await fs.remove(destination)
  await fs.ensureDir(destination)

  for (const [remotePath, content] of report.remoteBuffers.entries()) {
    const targetPath = resolvePathInside(destination, remotePath, `Remote file path "${remotePath}"`)
    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, content)
  }

  saveEntry(report.ref, report.candidate.canonicalUrl, { remoteBasePath: report.candidate.remoteBasePath })
}
