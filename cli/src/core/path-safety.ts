import path from "path"

export function assertSafePathSegment(value: string, label: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error(`${label} cannot be empty`)
  }

  if (trimmed === "." || trimmed === "..") {
    throw new Error(`${label} contains an invalid path segment`)
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`${label} cannot contain path separators`)
  }

  if (path.isAbsolute(trimmed)) {
    throw new Error(`${label} must be a relative path segment`)
  }

  if (trimmed.includes("\0")) {
    throw new Error(`${label} contains invalid characters`)
  }

  return trimmed
}

export function resolvePathInside(baseDir: string, relativePath: string, label = "Path"): string {
  const normalizedRelative = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").trim()

  if (!normalizedRelative) {
    throw new Error(`${label} is empty`)
  }

  const base = path.resolve(baseDir)
  const target = path.resolve(base, normalizedRelative)
  const relative = path.relative(base, target)
  const isInside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))

  if (!isInside) {
    throw new Error(`${label} escapes destination`)
  }

  return target
}
