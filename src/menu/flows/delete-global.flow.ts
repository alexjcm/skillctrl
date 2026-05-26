import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"
import { ALL_IDE_KEYS } from "../../core/config/ide-paths.ts"
import {
  listKnownGlobalRemovalCandidates,
  removeKnownGlobalSkillsByDeployNames,
} from "../../core/removal/global.ts"
import type { IdeTarget } from "../../core/types.ts"
import type { RemovalResult } from "../../core/removal/types.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"
import { promptMultiselectWithBack } from "../helpers/prompt-multiselect-with-back.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { selectIdes } from "../prompts/select-ide.ts"
import { FLOW_ALL, FLOW_BACK, FLOW_CANCELLED, FLOW_COMPLETED } from "../constants/flow-tokens.ts"

function formatIdesSummary(ides: IdeTarget[]): string {
  if (ides.length === ALL_IDE_KEYS.length) {
    return `all (${ALL_IDE_KEYS.join(", ")})`
  }
  return ides.join(", ")
}

function refsHint(refs: string[]): string {
  if (refs.length === 0) return "known skill"
  if (refs.length <= 2) return refs.join(", ")
  const first = refs.slice(0, 2).join(", ")
  return `${first} (+${refs.length - 2} more)`
}

function renderGlobalRemovalResults(results: RemovalResult[]): FlowResult {
  const deleted = results.filter((result) => result.status === "deleted")
  const skipped = results.filter((result) => result.status === "skipped")
  const errored = results.filter((result) => result.status === "error")

  const notInstalledIdes = new Set(
    skipped
      .filter((result) => result.reason === "IDE not installed" && result.ide)
      .map((result) => result.ide as string)
  )
  const missingTargets = skipped.filter((result) => result.reason === "Not installed at target path")
  const unknownNames = skipped.filter((result) => result.reason === "Unknown skill name (not in known catalog)")

  log.success(`Deleted: ${deleted.length}`)
  if (notInstalledIdes.size > 0) {
    log.warn(`IDEs not installed: ${[...notInstalledIdes].join(", ")}`)
  }
  if (missingTargets.length > 0) {
    log.info(`Not installed at target path: ${missingTargets.length}`)
  }
  if (unknownNames.length > 0) {
    log.info(`Unknown names skipped: ${unknownNames.length}`)
  }

  if (errored.length > 0) {
    log.warn(`Errors: ${errored.length}`)
    for (const result of errored) {
      const ideLabel = result.ide ? `${result.ide} ` : ""
      log.error(`${ideLabel}${result.itemId} → ${result.targetPath}: ${result.error ?? "unknown error"}`)
    }
  }

  return errored.length > 0 ? FLOW_CANCELLED : FLOW_COMPLETED
}

async function selectGlobalTargets(): Promise<IdeTarget[] | undefined> {
  return selectIdes(false)
}

async function selectGlobalSkillNames(
  candidates: Awaited<ReturnType<typeof listKnownGlobalRemovalCandidates>>
): Promise<string[] | typeof FLOW_BACK | undefined> {
  while (true) {
    const skillMode = await clack.select({
      message: "Which globally installed known skills do you want to delete?",
      options: [
        { value: FLOW_ALL, label: "Delete all known skills", hint: "destructive" },
        { value: "select", label: "Select specific skills" },
        { value: FLOW_BACK, label: pc.dim("← Back") },
      ],
    })
    if (clack.isCancel(skillMode)) return undefined
    if (skillMode === FLOW_BACK) return FLOW_BACK

    if (skillMode === FLOW_ALL) {
      return candidates.map((candidate) => candidate.deployName)
    }

    const options = candidates.map((candidate) => {
      if (candidate.hasCollision) {
        return {
          value: candidate.deployName,
          label: `${candidate.deployName} ${pc.yellow("(name collision)")}`,
          hint: refsHint(candidate.refs),
        }
      }
      return {
        value: candidate.deployName,
        label: candidate.deployName,
        hint: refsHint(candidate.refs),
      }
    })

    const picked = await promptMultiselectWithBack({
      message: "Select globally installed known skills to delete:",
      options,
      includeBack: true,
      backValue: FLOW_BACK,
      mixedBackWarning: "Select skills or Back, not both.",
    })

    if (picked === FLOW_BACK) continue
    return picked
  }
}

export async function deleteGlobalFlow(): Promise<FlowResult> {
  const selectedIdes = await selectGlobalTargets()
  if (!selectedIdes) return FLOW_CANCELLED

  const candidates = await listKnownGlobalRemovalCandidates()
  if (candidates.length === 0) {
    log.info("No known skills available for global deletion.")
    return FLOW_COMPLETED
  }

  const selectedNames = await selectGlobalSkillNames(candidates)
  if (!selectedNames) return FLOW_CANCELLED
  if (selectedNames === FLOW_BACK) return FLOW_BACK

  log.step("Summary:")
  log.bullet("Destination", "global")
  log.bullet("IDEs", formatIdesSummary(selectedIdes))
  log.bullet("Items", String(selectedNames.length))

  log.step("Deployed skill folders to delete:")
  for (const deployName of selectedNames) {
    const candidate = candidates.find((item) => item.deployName === deployName)
    const detail = candidate ? refsHint(candidate.refs) : "unknown"
    log.bullet(deployName, detail)
  }

  const confirmed = await clack.confirm({
    message:
      `${pc.bold(pc.red(`Delete ${String(selectedNames.length)} global skill folder${selectedNames.length === 1 ? "" : "s"}?`))}\n` +
      `${pc.red("This removes installed folders from selected IDE global paths.")}`,
    initialValue: false,
  })
  if (clack.isCancel(confirmed) || !confirmed) return FLOW_CANCELLED

  const results = await runWithSpinner(
    {
      startMessage: selectedNames.length === 1
        ? "Deleting global skill..."
        : `Deleting ${selectedNames.length} global skills...`,
      successMessage: (items: RemovalResult[]) => {
        const errors = items.filter((item) => item.status === "error").length
        return errors > 0 ? "Completed with warnings" : "Completed"
      },
    },
    () => removeKnownGlobalSkillsByDeployNames(selectedIdes, selectedNames)
  )

  return renderGlobalRemovalResults(results)
}
