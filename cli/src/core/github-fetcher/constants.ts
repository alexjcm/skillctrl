export const MSG_INVALID_URL = "Invalid GitHub URL. Paste a github.com link or use 'owner/repo' shorthand."
export const MSG_PATH_NOT_FOUND = "Path not found. Check the URL and make sure the repository is public."
export const MSG_RATE_LIMIT = "GitHub rate limit reached (60 req/hour). Please wait a few minutes and try again."
export const MSG_NO_SKILLS = "No skills found here. Each skill directory must contain a SKILL.md file."
export const MSG_REPO_TREE_TOO_LARGE =
  "Repository is too large to scan automatically. Paste a direct URL to the skills dir."
export const MSG_NETWORK = "Could not reach GitHub. Check your internet connection."

export const MAX_CONCURRENT_REQUESTS = 8
export const TREE_PAYLOAD_MAX_BYTES = 8 * 1024 * 1024

export const REPO_SCAN_PATHS = ["skills", "skills/.curated", "skills/.system", "skills/.experimental", ""]
