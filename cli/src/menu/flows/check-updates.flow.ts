import path from "path"
import * as clack from "@clack/prompts"
import fg from "fast-glob"
import * as fs from "fs-extra"
import type { SkillCandidate, SkillCandidatePreview } from "../../core/github-fetcher.ts"
import { fetchSkillCandidatePreviewsFromInput, hydrateSkillCandidate } from "../../core/github-fetcher.ts"
import { getAllEntries, saveEntry, type ImportEntry } from "../../core/skill-imports.ts"
import { IMPORTED_DIR } from "../../core/user-config.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"

type CheckStatus = "up-to-date" | "update-available" | "unreachable"

interface CheckReport {
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
  return path.join(IMPORTED_DIR, ...parts)
}

function normalizeRemotePath(remotePath: string): string {
  return remotePath.replace(/^\/+/, "").replace(/\\/g, "/")
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

async function compareLocalVsRemote(ref: string, candidate: SkillCandidate): Promise<{ upToDate: boolean; remoteBuffers: Map<string, Buffer> }> {
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
    const localPath = path.join(localDir, ...rel.split("/"))
    const localBuffer = await fs.readFile(localPath)
    const remoteBuffer = remoteBuffers.get(rel)
    if (!remoteBuffer || !remoteBuffer.equals(localBuffer)) {
      return { upToDate: false, remoteBuffers }
    }
  }

  return { upToDate: true, remoteBuffers }
}

async function buildReport(ref: string, entry: ImportEntry): Promise<CheckReport> {
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

function renderReport(report: CheckReport): void {
  if (report.status === "up-to-date") {
    log.raw(`  ✔ ${report.ref}  — Up to date`)
    return
  }
  if (report.status === "update-available") {
    log.raw(`  ↑ ${report.ref}  — Update available`)
    return
  }
  log.raw(`  ✖ ${report.ref}  — Source unreachable${report.message ? ` (${report.message})` : ""}`)
}

async function syncSkillFromReport(report: CheckReport): Promise<void> {
  if (!report.candidate || !report.remoteBuffers) {
    throw new Error(`Missing remote payload for ${report.ref}`)
  }

  const destination = localSkillPathFromRef(report.ref)
  await fs.remove(destination)
  await fs.ensureDir(destination)

  for (const [remotePath, content] of report.remoteBuffers.entries()) {
    const targetPath = path.join(destination, ...remotePath.split("/"))
    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, content)
  }

  saveEntry(report.ref, report.candidate.canonicalUrl, { remoteBasePath: report.candidate.remoteBasePath })
}

async function selectReportsToUpdate(candidates: CheckReport[]): Promise<CheckReport[] | undefined> {
  if (candidates.length === 0) return []

  const selected = await clack.multiselect({
    message: "Select imported skills to update:",
    required: true,
    options: candidates.map((report) => ({
      value: report.ref,
      label: report.ref,
      hint: report.entry.source,
    })),
  })

  if (clack.isCancel(selected)) return undefined
  const selectedSet = new Set(selected)
  return candidates.filter((report) => selectedSet.has(report.ref))
}

export async function checkUpdatesFlow(): Promise<FlowResult> {
  const entries = getAllEntries()
  if (entries.length === 0) {
    log.info("No imported skills found.")
    log.raw("  Use \"Import skill from GitHub\" to add your first one.")
    return "completed"
  }

  if (entries.length * 3 > 50) {
    log.warn("This check may approach GitHub's unauthenticated API rate limit (60 req/hour).")
  }

  const spin = clack.spinner()
  spin.start(`Checking ${entries.length} imported skill${entries.length === 1 ? "" : "s"}...`)

  const reports: CheckReport[] = []
  for (const [ref, entry] of entries) {
    const report = await buildReport(ref, entry)
    reports.push(report)
  }

  spin.stop("Check completed")

  for (const report of reports) {
    renderReport(report)
  }

  const updatesAvailable = reports.filter((report) => report.status === "update-available")
  if (updatesAvailable.length === 0) {
    log.success("All imported skills are up to date.")
    return "completed"
  }

  const decision = await clack.select({
    message: "Update options:",
    options: [
      { value: "select", label: "Select to update", hint: "recommended" },
      { value: "all", label: "Update all available" },
      { value: "cancel", label: "Cancel" },
    ],
  })
  if (clack.isCancel(decision) || decision === "cancel") return "cancelled"

  let selectedReports = updatesAvailable
  if (decision === "all") {
    const confirmAll = await clack.confirm({
      message:
        `Update all ${updatesAvailable.length} skill${updatesAvailable.length === 1 ? "" : "s"}?\n` +
        "This sync is destructive: local changes in imported skills will be overwritten.",
      initialValue: false,
    })
    if (clack.isCancel(confirmAll) || !confirmAll) return "cancelled"
  } else if (decision === "select") {
    const chosen = await selectReportsToUpdate(updatesAvailable)
    if (chosen === undefined) return "cancelled"
    selectedReports = chosen
    if (selectedReports.length === 0) return "cancelled"
  }

  const updateSpin = clack.spinner()
  updateSpin.start(`Updating ${selectedReports.length} skill${selectedReports.length === 1 ? "" : "s"}...`)

  let updated = 0
  let failed = 0
  for (const report of selectedReports) {
    try {
      await syncSkillFromReport(report)
      updated++
    } catch (err) {
      failed++
      log.error(`Failed to update ${report.ref}`, err)
    }
  }

  updateSpin.stop("Update finished")
  log.info(`Updated: ${updated}`)
  if (failed > 0) {
    log.warn(`Failed: ${failed}`)
  }

  return failed > 0 ? "cancelled" : "completed"
}
