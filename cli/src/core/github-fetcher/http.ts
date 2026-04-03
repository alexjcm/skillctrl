import {
  MSG_NETWORK,
  MSG_RATE_LIMIT,
  MSG_REPO_TREE_TOO_LARGE,
} from "./constants.ts"

export class GitHubApiError extends Error {
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

export function formatRateLimitRetryMessage(resetIso: string | undefined): string {
  if (!resetIso) return MSG_RATE_LIMIT
  const parsed = new Date(resetIso)
  if (Number.isNaN(parsed.getTime())) {
    return `${MSG_RATE_LIMIT} Retry after ${resetIso}.`
  }
  return `${MSG_RATE_LIMIT} Retry after ${resetIso} (local: ${parsed.toLocaleString()}).`
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

async function performFetch(url: string, includeApiAccept: boolean): Promise<Response> {
  try {
    return await fetch(url, {
      headers: buildGitHubHeaders(includeApiAccept),
    })
  } catch {
    throw new Error(MSG_NETWORK)
  }
}

function asApiError(response: Response, fallbackMessage: string, messageFromBody?: string): GitHubApiError {
  const message = messageFromBody ?? fallbackMessage
  const remaining = response.headers.get("x-ratelimit-remaining")
  const resetAt = extractRateLimitResetIso(response.headers)

  if (response.status === 403 && (remaining === "0" || /rate limit/i.test(message))) {
    return new GitHubApiError(response.status, MSG_RATE_LIMIT, resetAt)
  }

  return new GitHubApiError(response.status, message, resetAt)
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await performFetch(url, true)

  if (!response.ok) {
    const fallbackMessage = `GitHub API request failed (${response.status})`
    let message: string | undefined

    try {
      const body = await response.json() as { message?: string }
      message = body.message
    } catch {
      // ignore parse errors and keep fallback
    }

    throw asApiError(response, fallbackMessage, message)
  }

  return response.json()
}

export async function fetchJsonWithByteLimit(url: string, maxBytes: number): Promise<unknown> {
  const response = await performFetch(url, true)

  if (!response.ok) {
    const fallbackMessage = `GitHub API request failed (${response.status})`
    let message: string | undefined

    try {
      const body = await response.json() as { message?: string }
      message = body.message
    } catch {
      // ignore parse errors and keep fallback
    }

    throw asApiError(response, fallbackMessage, message)
  }

  const text = await readResponseTextWithLimit(response, maxBytes)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error("Invalid GitHub API JSON response")
  }
}

export async function fetchText(url: string): Promise<string> {
  const response = await performFetch(url, false)

  if (!response.ok) {
    const resetAt = extractRateLimitResetIso(response.headers)
    const remaining = response.headers.get("x-ratelimit-remaining")
    if (response.status === 403 && remaining === "0") {
      throw new GitHubApiError(response.status, MSG_RATE_LIMIT, resetAt)
    }
    throw new GitHubApiError(response.status, `GitHub raw file request failed (${response.status})`, resetAt)
  }

  return response.text()
}
