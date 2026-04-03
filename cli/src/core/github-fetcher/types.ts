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

export type GitHubContentFile = {
  type: "file"
  name: string
  path: string
  download_url: string | null
}

export type GitHubContentDir = {
  type: "dir"
  name: string
  path: string
}

export type GitHubContentEntry = GitHubContentFile | GitHubContentDir | { type: string; name: string; path: string }

export type RepoInfo = {
  default_branch?: string
}

export type GitTreeEntry = {
  path: string
  type: string
}

export type GitTreePayload = {
  truncated?: boolean
  tree?: unknown
}
