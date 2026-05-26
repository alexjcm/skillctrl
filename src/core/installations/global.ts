import path from "path"
import { readdir } from "node:fs/promises"
import { GLOBAL_INSTALLATION_TARGETS } from "../config/ide-paths.ts"
import { exists } from "../system/fs.ts"
import type { GlobalInstallation } from "../types.ts"

function compareInstallations(a: GlobalInstallation, b: GlobalInstallation): number {
  const scopeCmp = a.scope.localeCompare(b.scope)
  if (scopeCmp !== 0) return scopeCmp

  const dirCmp = a.targetDir.localeCompare(b.targetDir)
  if (dirCmp !== 0) return dirCmp

  return a.deployName.localeCompare(b.deployName)
}

export async function listGlobalInstallations(): Promise<GlobalInstallation[]> {
  const seen = new Set<string>()
  const installations: GlobalInstallation[] = []

  for (const target of GLOBAL_INSTALLATION_TARGETS) {
    const { scope, baseDir, targetDir } = target
    if (!(await exists(baseDir))) continue

    if (!(await exists(targetDir))) continue

    let entries
    try {
      entries = await readdir(targetDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue

      const installation = {
        scope,
        targetDir,
        deployName: entry.name,
      } satisfies GlobalInstallation

      const key = `${installation.scope}\u0000${path.normalize(installation.targetDir)}\u0000${installation.deployName}`
      if (seen.has(key)) continue

      seen.add(key)
      installations.push(installation)
    }
  }

  installations.sort(compareInstallations)
  return installations
}
