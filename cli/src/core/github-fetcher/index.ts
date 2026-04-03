import path from "path"
import { parseGitHubUrl, type GitHubRef } from "../github-url.ts"
import {
  MAX_CONCURRENT_REQUESTS,
  MSG_INVALID_URL,
  MSG_NETWORK,
  MSG_NO_SKILLS,
  MSG_PATH_NOT_FOUND,
  MSG_RATE_LIMIT,
  MSG_REPO_TREE_TOO_LARGE,
  REPO_SCAN_PATHS,
  TREE_PAYLOAD_MAX_BYTES,
} from "./constants.ts"
import { fetchJson, fetchJsonWithByteLimit, fetchText, formatRateLimitRetryMessage, GitHubApiError } from "./http.ts"
import {
  buildContentsApiUrl,
  buildGitTreeApiUrl,
  buildRepoApiUrl,
  canonicalSkillUrl,
  directoryHasSkillMd,
  listDirectoryPaths,
  mapSettledWithConcurrency,
  normalizeRemotePath,
  parseFrontmatterName,
  parseSkillDescription,
  relativeRemotePath,
  rootsFromGitTreePayload,
  toDirectoryListing,
  toFile,
} from "./helpers.ts"
import type { GitHubContentDir, GitHubContentEntry, GitHubContentFile, RepoInfo, SkillCandidate, SkillCandidatePreview } from "./types.ts"

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

async function fetchSkillFiles(owner: string, repo: string, branch: string, remoteBasePath: string) {
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

  const dedup = new Map<string, { remotePath: string; downloadUrl: string }>()
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

async function discoverSkillRootsViaRepoTree(owner: string, repo: string, branch: string): Promise<string[]> {
  const payload = await fetchJsonWithByteLimit(buildGitTreeApiUrl(owner, repo, branch), TREE_PAYLOAD_MAX_BYTES)
  const parsed = rootsFromGitTreePayload(payload)
  if (parsed.truncated) {
    throw new Error(MSG_REPO_TREE_TOO_LARGE)
  }
  return parsed.roots
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

export type { GitHubFile, SkillCandidate, SkillCandidatePreview } from "./types.ts"
