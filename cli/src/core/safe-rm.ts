import path from "path"
import os from "os"
import * as fs from "fs-extra"

// ============================================================================
// SAFE RM — global IDE paths
// Deletes a directory only if it starts with one of the allowed prefixes.
// all path operations use path.join/path.resolve
// ============================================================================

export async function safeRm(
  targetPath: string,
  allowedPrefixes: readonly string[]
): Promise<void> {
  if (!targetPath) throw new Error("safeRm: empty path")
  if (!(await fs.pathExists(targetPath))) return // nothing to do
  if ((await fs.lstat(targetPath)).isSymbolicLink()) {
    throw new Error(`safeRm: refusing to remove symlink: ${targetPath}`)
  }

  const real = await fs.realpath(targetPath)

  const homeDir = os.homedir()
  if (real === "/" || real === homeDir) {
    throw new Error(`safeRm: dangerous path: ${real}`)
  }

  const isAllowed = allowedPrefixes.some((prefix) =>
    real.startsWith(prefix.endsWith(path.sep) ? prefix : prefix + path.sep)
  )
  if (!isAllowed) {
    throw new Error(`safeRm: path outside safe prefix: ${real}`)
  }

  await fs.remove(real)
}

// ============================================================================
// SAFE RM PROJECT — project-level paths
// Double validation (design decision from plan):
//   1. path must start with resolvedProjectDir
//   2. path must contain /skills/ as a path segment
// ============================================================================

export async function safeRmProject(
  targetPath: string,
  projectDir: string
): Promise<void> {
  if (!targetPath) throw new Error("safeRmProject: empty path")
  if (!(await fs.pathExists(targetPath))) return // nothing to do
  if ((await fs.lstat(targetPath)).isSymbolicLink()) {
    throw new Error(`safeRmProject: refusing to remove symlink: ${targetPath}`)
  }

  const realTarget = await fs.realpath(targetPath)
  const realProject = await fs.realpath(projectDir)

  const homeDir = os.homedir()
  if (realTarget === "/" || realTarget === homeDir) {
    throw new Error(`safeRmProject: dangerous path: ${realTarget}`)
  }

  // 1. Must be inside the project root
  if (!realTarget.startsWith(realProject + path.sep)) {
    throw new Error(`safeRmProject: path outside project root: ${realTarget}`)
  }

  // 2. Must contain /skills/ as a segment (not just anywhere in a name)
  const skillsSegment = path.sep + "skills" + path.sep
  if (!realTarget.includes(skillsSegment)) {
    throw new Error(`safeRmProject: path doesn't contain /skills/: ${realTarget}`)
  }

  await fs.remove(realTarget)
}
