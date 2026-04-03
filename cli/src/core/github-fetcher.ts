import path from "path"
import { parseGitHubUrl, type GitHubRef } from "./github-url.ts"

export interface GitHubFile {
  remotePath: string
  downloadUrl: string
}

export interface SkillCandidate {
  name: string
  description?: string
  skillMdContent: string
  remoteBasePath: string
  canonicalUrl: string
  files: GitHubFile[]
}

export interface SkillCandidatePreview {
  name: string
  description?: string
  remoteBasePath: string
  canonicalUrl: string
  owner: string
  repo: string
  branch: string
}

type GitHubContentFile = {
  type: "file"
  name: string
  path: string
  download_url: string | null
}

type GitHubContentDir = {
  type: "dir"
  name: string
  path: string
}

type GitHubContentEntry = GitHubContentFile | GitHubContentDir | { type: string; name: string; path: string }

type RepoInfo = {
  default_branch?: string
}

const MSG_INVALID_URL = "Invalid GitHub URL. Paste a github.com link or use 'owner/repo' shorthand."
const MSG_PATH_NOT_FOUND = "Path not found. Check the URL and make sure the repository is public."
const MSG_RATE_LIMIT = "GitHub rate limit reached (60 req/hour). Please wait a few minutes and try again."
const MSG_NO_SKILLS = "No skills found here. Each skill directory must contain a SKILL.md file."
const MSG_REPO_TREE_TOO_LARGE =
  "Repository is too large to scan automatically. Paste a direct URL to the skills dir."
const MSG_NETWORK = "Could not reach GitHub. Check your internet connection."
const MAX_CONCURRENT_REQUESTS = 8
const TREE_PAYLOAD_MAX_BYTES = 8 * 1024 * 1024

const REPO_SCAN_PATHS = ["skills", "skills/.curated", "skills/.system", "skills/.experimental", ""]

class GitHubApiError extends Error {
  readonly status: number
  readonly rateLimitResetAt: string | undefined

  constructor(status: number, message: string, rateLimitResetAt?: string) {
    super(message)
    this.status = status
    this.rateLimitResetAt = rateLimitResetAt
  }
}

function authHeaderFromEnv(): string | undefined {
  const token = process.env["GITHUB_TOKEN"]?.trim()
  return token ? `Bearer ${token}` : undefined
}

function buildGitHubHeaders(includeApiAccept = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeApiAccept) {
    headers["Accept"] = "application/vnd.github+json"
  }
  const auth = authHeaderFromEnv()
  if (auth) {
    headers["Authorization"] = auth
  }
  return headers
}

function extractRateLimitResetIso(headers: Headers): string | undefined {
  const epochRaw = headers.get("x-ratelimit-reset")
  if (!epochRaw) return undefined
  const epoch = Number(epochRaw)
  if (!Number.isFinite(epoch) || epoch <= 0) return undefined
  return new Date(epoch * 1000).toISOString()
}

function formatRateLimitRetryMessage(resetIso: string | undefined): string {
  if (!resetIso) return MSG_RATE_LIMIT
  const parsed = new Date(resetIso)
  if (Number.isNaN(parsed.getTime())) {
    return `${MSG_RATE_LIMIT} Retry after ${resetIso}.`
  }
  return `${MSG_RATE_LIMIT} Retry after ${resetIso} (local: ${parsed.toLocaleString()}).`
}

async function mapSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return []

  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  async function runWorker(): Promise<void> {
    while (true) {
      const index = cursor
      cursor++
      if (index >= items.length) return
      try {
        const value = await worker(items[index] as T, index)
        results[index] = { status: "fulfilled", value }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

function normalizeRemotePath(remotePath: string): string {
  return remotePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

function buildContentsApiUrl(owner: string, repo: string, contentPath: string, branch?: string | null): string {
  const normalized = normalizeRemotePath(contentPath)
  const encodedPath = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  const base = `https://api.github.com/repos/${owner}/${repo}/contents`
  const url = encodedPath ? `${base}/${encodedPath}` : base
  if (!branch) return url

  const params = new URLSearchParams({ ref: branch })
  return `${url}?${params.toString()}`
}

function buildRepoApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}`
}

function buildGitTreeApiUrl(owner: string, repo: string, branch: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
}

function parseContentLength(headers: Headers): number | undefined {
  const raw = headers.get("content-length")
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

async function readResponseTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = parseContentLength(response.headers)
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new Error(MSG_REPO_TREE_TOO_LARGE)
  }

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      throw new Error(MSG_REPO_TREE_TOO_LARGE)
    }
    return new TextDecoder().decode(buffer)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ""

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    if (!chunk.value) continue

    totalBytes += chunk.value.byteLength
    if (totalBytes > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        // ignore cancellation errors
      }
      throw new Error(MSG_REPO_TREE_TOO_LARGE)
    }

    text += decoder.decode(chunk.value, { stream: true })
  }

  text += decoder.decode()
  return text
}

async function fetchJsonWithByteLimit(url: string, maxBytes: number): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: buildGitHubHeaders(true),
    })
  } catch {
    throw new Error(MSG_NETWORK)
  }

  if (!response.ok) {
    const fallbackMessage = `GitHub API request failed (${response.status})`
    let message = fallbackMessage

    try {
      const body = await response.json() as { message?: string }
      if (body.message) message = body.message
    } catch {
      // ignore parse errors and keep fallback
    }

    const remaining = response.headers.get("x-ratelimit-remaining")
    const resetAt = extractRateLimitResetIso(response.headers)
    if (response.status === 403 && (remaining === "0" || /rate limit/i.test(message))) {
      throw new GitHubApiError(response.status, MSG_RATE_LIMIT, resetAt)
    }

    throw new GitHubApiError(response.status, message, resetAt)
  }

  const text = await readResponseTextWithLimit(response, maxBytes)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error("Invalid GitHub API JSON response")
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: buildGitHubHeaders(true),
    })
  } catch {
    throw new Error(MSG_NETWORK)
  }

  if (!response.ok) {
    const fallbackMessage = `GitHub API request failed (${response.status})`
    let message = fallbackMessage

    try {
      const body = await response.json() as { message?: string }
      if (body.message) message = body.message
    } catch {
      // ignore parse errors and keep fallback
    }

    const remaining = response.headers.get("x-ratelimit-remaining")
    const resetAt = extractRateLimitResetIso(response.headers)
    if (response.status === 403 && (remaining === "0" || /rate limit/i.test(message))) {
      throw new GitHubApiError(response.status, MSG_RATE_LIMIT, resetAt)
    }

    throw new GitHubApiError(response.status, message, resetAt)
  }

  return response.json()
}

async function fetchText(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: buildGitHubHeaders(false),
    })
  } catch {
    throw new Error(MSG_NETWORK)
  }

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining")
    const resetAt = extractRateLimitResetIso(response.headers)
    if (response.status === 403 && remaining === "0") {
      throw new GitHubApiError(response.status, MSG_RATE_LIMIT, resetAt)
    }
    throw new GitHubApiError(response.status, `GitHub raw file request failed (${response.status})`, resetAt)
  }

  return response.text()
}

function toDirectoryListing(payload: unknown): GitHubContentEntry[] {
  if (!Array.isArray(payload)) {
    throw new Error(MSG_NO_SKILLS)
  }

  return payload
    .filter((entry): entry is GitHubContentEntry => {
      if (!entry || typeof entry !== "object") return false
      const maybe = entry as { type?: unknown; name?: unknown; path?: unknown }
      return typeof maybe.type === "string" && typeof maybe.name === "string" && typeof maybe.path === "string"
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function toFile(payload: unknown): GitHubContentFile {
  if (!payload || typeof payload !== "object") {
    throw new Error(MSG_NO_SKILLS)
  }

  const maybe = payload as GitHubContentFile
  if (maybe.type !== "file" || typeof maybe.name !== "string" || typeof maybe.path !== "string") {
    throw new Error(MSG_NO_SKILLS)
  }

  return maybe
}

function directoryHasSkillMd(listing: GitHubContentEntry[]): boolean {
  return listing.some((entry) => entry.type === "file" && entry.name === "SKILL.md")
}

function listDirectoryPaths(listing: GitHubContentEntry[]): string[] {
  return listing
    .filter((entry): entry is GitHubContentDir => entry.type === "dir")
    .map((entry) => entry.path)
}

async function getContents(
  owner: string,
  repo: string,
  contentPath: string,
  branch?: string | null
): Promise<unknown> {
  const url = buildContentsApiUrl(owner, repo, contentPath, branch)
  return fetchJson(url)
}

async function getDirectoryListingOrNull(
  owner: string,
  repo: string,
  branch: string,
  contentPath: string
): Promise<GitHubContentEntry[] | null> {
  try {
    const payload = await getContents(owner, repo, contentPath, branch)
    if (!Array.isArray(payload)) return null
    return toDirectoryListing(payload)
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return null
    throw err
  }
}

async function getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const url = buildRepoApiUrl(owner, repo)
  const payload = await fetchJson(url)
  if (!payload || typeof payload !== "object") {
    throw new Error(MSG_PATH_NOT_FOUND)
  }
  return payload as RepoInfo
}

function parseSkillDescription(content: string): string | undefined {
  const lines = content.split("\n")

  let i = 0
  if (lines[0]?.trim() === "---") {
    i = 1
    while (i < lines.length && lines[i]?.trim() !== "---") i++
    i++
  }

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? ""
    if (!line || line.startsWith("#")) {
      i++
      continue
    }
    return line.length > 120 ? line.slice(0, 117) + "..." : line
  }

  return undefined
}

function parseFrontmatterName(content: string): string | undefined {
  const lines = content.split("\n")
  if (lines[0]?.trim() !== "---") return undefined

  let i = 1
  while (i < lines.length && lines[i]?.trim() !== "---") {
    const line = lines[i]?.trim() ?? ""
    const match = /^name\s*:\s*(.+)$/i.exec(line)
    if (match) {
      return match[1]?.trim().replace(/^['"]|['"]$/g, "") || undefined
    }
    i++
  }

  return undefined
}

function canonicalSkillUrl(owner: string, repo: string, branch: string, remoteBasePath: string): string {
  const normalized = normalizeRemotePath(remoteBasePath)
  if (!normalized) {
    return `https://github.com/${owner}/${repo}/tree/${branch}`
  }
  return `https://github.com/${owner}/${repo}/tree/${branch}/${normalized}`
}

function relativeRemotePath(basePath: string, absolutePath: string): string {
  const normalizedBase = normalizeRemotePath(basePath)
  const normalizedAbs = normalizeRemotePath(absolutePath)

  if (!normalizedBase) return normalizedAbs
  if (normalizedAbs === normalizedBase) return ""

  const prefix = `${normalizedBase}/`
  if (normalizedAbs.startsWith(prefix)) {
    return normalizedAbs.slice(prefix.length)
  }

  return normalizedAbs
}

async function collectSkillRootsFromDirectory(
  owner: string,
  repo: string,
  branch: string,
  directoryPath: string,
  listing: GitHubContentEntry[]
): Promise<string[]> {
  if (directoryHasSkillMd(listing)) {
    return [normalizeRemotePath(directoryPath)]
  }

  const subdirs = listDirectoryPaths(listing)
  if (subdirs.length === 0) return []

  // 2-level detection (current dir -> subdir -> child dir):
  // 1) If subdir has SKILL.md directly, it's a skill root.
  // 2) Otherwise, treat each child directory as a candidate root (container pattern).
  const checks = await mapSettledWithConcurrency(
    subdirs,
    MAX_CONCURRENT_REQUESTS,
    async (subdirPath) => {
      const subListing = await getDirectoryListingOrNull(owner, repo, branch, subdirPath)
      if (!subListing) return [] as string[]
      if (directoryHasSkillMd(subListing)) return [normalizeRemotePath(subdirPath)]
      return listDirectoryPaths(subListing).map((p) => normalizeRemotePath(p))
    }
  )

  const roots: string[] = []
  for (const result of checks) {
    if (result.status === "fulfilled") {
      roots.push(...result.value)
    }
  }

  return [...new Set(roots)]
}

async function fetchSkillFiles(owner: string, repo: string, branch: string, remoteBasePath: string): Promise<GitHubFile[]> {
  const payload = await getContents(owner, repo, remoteBasePath, branch)
  const listing = toDirectoryListing(payload)

  const rootFiles = listing.filter((entry): entry is GitHubContentFile => entry.type === "file")
  const subdirs = listing.filter((entry): entry is GitHubContentDir => entry.type === "dir")

  const nestedResults = await mapSettledWithConcurrency(
    subdirs,
    MAX_CONCURRENT_REQUESTS,
    async (dir) => {
      const nestedPayload = await getContents(owner, repo, dir.path, branch)
      const nestedListing = toDirectoryListing(nestedPayload)
      return nestedListing.filter((entry): entry is GitHubContentFile => entry.type === "file")
    }
  )

  const allFiles: GitHubContentFile[] = [...rootFiles]
  for (const result of nestedResults) {
    if (result.status === "fulfilled") {
      allFiles.push(...result.value)
    }
  }

  const dedup = new Map<string, GitHubFile>()
  for (const file of allFiles) {
    if (!file.download_url) continue
    const rel = relativeRemotePath(remoteBasePath, file.path)
    if (!rel) continue

    dedup.set(rel, {
      remotePath: rel,
      downloadUrl: file.download_url,
    })
  }

  return [...dedup.values()].sort((a, b) => a.remotePath.localeCompare(b.remotePath))
}

async function fetchSkillCandidate(owner: string, repo: string, branch: string, remoteBasePath: string): Promise<SkillCandidate> {
  const files = await fetchSkillFiles(owner, repo, branch, remoteBasePath)
  const skillMd = files.find((file) => file.remotePath === "SKILL.md")

  if (!skillMd) {
    throw new Error(MSG_NO_SKILLS)
  }

  const skillMdContent = await fetchText(skillMd.downloadUrl)

  const fallbackName = normalizeRemotePath(remoteBasePath)
    ? path.basename(normalizeRemotePath(remoteBasePath))
    : repo

  const frontmatterName = parseFrontmatterName(skillMdContent)
  const name = frontmatterName && frontmatterName.trim() ? frontmatterName.trim() : fallbackName
  const description = parseSkillDescription(skillMdContent)

  return {
    name,
    ...(description ? { description } : {}),
    skillMdContent,
    remoteBasePath: normalizeRemotePath(remoteBasePath),
    canonicalUrl: canonicalSkillUrl(owner, repo, branch, remoteBasePath),
    files,
  }
}

function previewFromRoot(owner: string, repo: string, branch: string, remoteBasePath: string): SkillCandidatePreview {
  const normalizedPath = normalizeRemotePath(remoteBasePath)
  const name = normalizedPath ? path.basename(normalizedPath) : repo
  return {
    name,
    remoteBasePath: normalizedPath,
    canonicalUrl: canonicalSkillUrl(owner, repo, branch, normalizedPath),
    owner,
    repo,
    branch,
  }
}

type GitTreeEntry = {
  path: string
  type: string
}

type GitTreePayload = {
  truncated?: boolean
  tree?: unknown
}

function rootsFromGitTreePayload(payload: unknown): { roots: string[]; truncated: boolean } {
  if (!payload || typeof payload !== "object") {
    throw new Error(MSG_NO_SKILLS)
  }

  const data = payload as GitTreePayload
  const truncated = data.truncated === true
  if (!Array.isArray(data.tree)) {
    return { roots: [], truncated }
  }

  const roots = new Set<string>()
  for (const entry of data.tree) {
    if (!entry || typeof entry !== "object") continue
    const maybe = entry as Partial<GitTreeEntry>
    if (maybe.type !== "blob" || typeof maybe.path !== "string") continue
    if (!(maybe.path === "SKILL.md" || maybe.path.endsWith("/SKILL.md"))) continue

    const dir = path.posix.dirname(maybe.path)
    const root = dir === "." ? "" : normalizeRemotePath(dir)
    roots.add(root)
  }

  return { roots: [...roots].sort((a, b) => a.localeCompare(b)), truncated }
}

async function discoverSkillRootsViaRepoTree(owner: string, repo: string, branch: string): Promise<string[]> {
  const payload = await fetchJsonWithByteLimit(buildGitTreeApiUrl(owner, repo, branch), TREE_PAYLOAD_MAX_BYTES)
  const parsed = rootsFromGitTreePayload(payload)
  if (parsed.truncated) {
    throw new Error(MSG_REPO_TREE_TOO_LARGE)
  }
  return parsed.roots
}

async function fetchPreviewCandidatesFromRef(ref: GitHubRef): Promise<SkillCandidatePreview[]> {
  const roots: string[] = []
  if (!ref.isRepoLevel) {
    if (!ref.branch) {
      throw new Error(MSG_PATH_NOT_FOUND)
    }
    const branch = ref.branch
    const targetPath = normalizeRemotePath(ref.path ?? "")
    const payload = await getContents(ref.owner, ref.repo, targetPath, branch)

    if (Array.isArray(payload)) {
      const listing = toDirectoryListing(payload)
      roots.push(...await collectSkillRootsFromDirectory(ref.owner, ref.repo, branch, targetPath, listing))
    } else {
      const file = toFile(payload)
      if (file.name !== "SKILL.md") {
        throw new Error(MSG_NO_SKILLS)
      }
      roots.push(normalizeRemotePath(path.posix.dirname(file.path) === "." ? "" : path.posix.dirname(file.path)))
    }

    let uniqueRoots = [...new Set(roots.filter((r) => r !== "" || targetPath === ""))]
    if (uniqueRoots.length === 0 && targetPath === "skills") {
      const fallbackResults = await mapSettledWithConcurrency(
        ["skills/.curated", "skills/.system", "skills/.experimental"],
        3,
        async (location) => discoverSkillRootsAtLocation(ref.owner, ref.repo, branch, location)
      )
      const fallbackRoots: string[] = []
      for (const result of fallbackResults) {
        if (result.status === "fulfilled") fallbackRoots.push(...result.value)
      }
      uniqueRoots = [...new Set(fallbackRoots)]
    }

    if (uniqueRoots.length === 0) throw new Error(MSG_NO_SKILLS)
    return uniqueRoots.map((root) => previewFromRoot(ref.owner, ref.repo, branch, root))
  }

  const repoInfo = await getRepoInfo(ref.owner, ref.repo)
  const defaultBranch = repoInfo.default_branch?.trim()
  if (!defaultBranch) {
    throw new Error(MSG_PATH_NOT_FOUND)
  }

  const probeResults = await mapSettledWithConcurrency(
    REPO_SCAN_PATHS,
    REPO_SCAN_PATHS.length,
    async (location) => discoverSkillRootsAtLocation(ref.owner, ref.repo, defaultBranch, location)
  )

  const orderedRoots: string[] = []
  for (const result of probeResults) {
    if (result.status === "fulfilled") orderedRoots.push(...result.value)
  }
  let uniqueRoots = [...new Set(orderedRoots)]
  if (uniqueRoots.length === 0) {
    uniqueRoots = [...new Set(await discoverSkillRootsViaRepoTree(ref.owner, ref.repo, defaultBranch))]
  }
  if (uniqueRoots.length === 0) {
    throw new Error(MSG_NO_SKILLS)
  }

  const previews = uniqueRoots.map((root) => previewFromRoot(ref.owner, ref.repo, defaultBranch, root))
  const byName = new Map<string, SkillCandidatePreview>()
  for (const preview of previews) {
    if (!byName.has(preview.name)) {
      byName.set(preview.name, preview)
    }
  }
  return [...byName.values()]
}

async function discoverSkillRootsAtLocation(
  owner: string,
  repo: string,
  branch: string,
  location: string
): Promise<string[]> {
  if (!location) {
    try {
      const payload = await getContents(owner, repo, "SKILL.md", branch)
      const file = toFile(payload)
      return file.name === "SKILL.md" ? [""] : []
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 404) return []
      throw err
    }
  }

  let payload: unknown
  try {
    payload = await getContents(owner, repo, location, branch)
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return []
    throw err
  }

  if (!Array.isArray(payload)) {
    return []
  }

  const listing = toDirectoryListing(payload)
  return collectSkillRootsFromDirectory(owner, repo, branch, location, listing)
}

function normalizeError(err: unknown): Error {
  if (err instanceof GitHubApiError) {
    if (err.status === 404) return new Error(MSG_PATH_NOT_FOUND)
    if (err.status === 403) {
      return new Error(formatRateLimitRetryMessage(err.rateLimitResetAt))
    }
    return new Error(`GitHub API error (${err.status}). Please try again.`)
  }

  if (err instanceof Error && (
    err.message === MSG_INVALID_URL ||
    err.message === MSG_PATH_NOT_FOUND ||
    err.message === MSG_RATE_LIMIT ||
    err.message === MSG_REPO_TREE_TOO_LARGE ||
    err.message === MSG_NO_SKILLS ||
    err.message === MSG_NETWORK
  )) {
    return err
  }

  if (err instanceof Error) {
    return err
  }

  return new Error(MSG_NETWORK)
}

export async function fetchSkillCandidatePreviewsFromRef(ref: GitHubRef): Promise<SkillCandidatePreview[]> {
  try {
    return await fetchPreviewCandidatesFromRef(ref)
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function fetchSkillCandidatePreviewsFromInput(input: string): Promise<SkillCandidatePreview[]> {
  const ref = parseGitHubUrl(input)
  return fetchSkillCandidatePreviewsFromRef(ref)
}

export async function hydrateSkillCandidate(preview: SkillCandidatePreview): Promise<SkillCandidate> {
  try {
    return await fetchSkillCandidate(preview.owner, preview.repo, preview.branch, preview.remoteBasePath)
  } catch (err) {
    throw normalizeError(err)
  }
}
