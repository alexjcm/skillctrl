import { listGlobalInstallations } from "../../core/installations/global.ts"
import { log } from "../../ui/logger.ts"
import * as pc from "../../ui/ansi.ts"

export async function listGlobalFlow(): Promise<void> {
  const installations = await listGlobalInstallations()

  if (installations.length === 0) {
    log.step("No global installations found.")
    return
  }

  log.step("Global Installations")

  let currentScope = ""
  let currentTargetDir = ""

  for (const installation of installations) {
    if (installation.scope !== currentScope) {
      currentScope = installation.scope
      currentTargetDir = ""
      log.raw(`\n  [${pc.cyan(currentScope)}]`)
    }

    if (installation.targetDir !== currentTargetDir) {
      currentTargetDir = installation.targetDir
      log.raw(`  ${pc.dim(currentTargetDir)}`)
    }

    log.bullet(installation.deployName)
  }
}
