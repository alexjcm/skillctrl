import path from "path"
import * as clack from "@clack/prompts"
import * as fs from "fs-extra"
import * as pc from "../../ui/ansi.ts"
import {
  fetchSkillCandidatePreviewsFromInput,
  hydrateSkillCandidate,
  type SkillCandidate,
  type SkillCandidatePreview,
} from "../../core/github-fetcher.ts"
import { assertSafePathSegment, resolvePathInside } from "../../core/path-safety.ts"
import { validateSkillContent } from "../../core/quick-skill-validator.ts"
import { discoverCategories, discoverSkills } from "../../core/skills.ts"
import { getEntry, saveEntry } from "../../core/skill-imports.ts"
import { IMPORTED_DIR } from "../../core/user-config.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"

type WizardStep = "url" | "select-skill" | "category" | "confirm"
type ImportAction = "import-new" | "update-same-source" | "overwrite-source"
type ImportPlan = {
  preview: SkillCandidatePreview
  targetRef: string
  action: ImportAction
}
type PreparedImport = {
  candidate: SkillCandidate
  targetRef: string
  action: ImportAction
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

function buildTargetRef(name: string, category: string | null): string {
  const safeName = assertSafePathSegment(name, "Skill name")
  if (!category) return safeName
  const safeCategory = assertSafePathSegment(category, "Category")
  return `${safeCategory}/${safeName}`
}

function buildDestinationPath(name: string, category: string | null): string {
  const safeName = assertSafePathSegment(name, "Skill name")
  if (!category) return path.join(IMPORTED_DIR, safeName)
  const safeCategory = assertSafePathSegment(category, "Category")
  return path.join(IMPORTED_DIR, safeCategory, safeName)
}

function normalizeRemoteRelativePath(remotePath: string): string {
  const normalized = remotePath.replace(/\\/g, "/").replace(/^\/+/, "").trim()
  if (!normalized) {
    throw new Error(`Invalid remote file path: "${remotePath}"`)
  }
  return normalized
}

function actionLabel(action: ImportAction): string {
  if (action === "update-same-source") return "⟳ Update (same source)"
  if (action === "overwrite-source") return "⟳ Overwrite (new source)"
  return "✦ Import new"
}

async function promptSourceUrl(): Promise<string | undefined> {
  const raw = await clack.text({
    message: "Source (directory URL, SKILL.md URL, or owner/repo):",
    placeholder: "e.g. openai/skills or https://github.com/openai/skills/tree/main/skills/.curated/security-threat-model",
    validate: (value) => {
      if (!value?.trim()) return "Source cannot be empty"
    },
  })
  if (clack.isCancel(raw)) return undefined
  return raw.trim()
}

async function promptSelectSkills(candidates: SkillCandidatePreview[]): Promise<SkillCandidatePreview[] | "back" | undefined> {
  while (true) {
    const selected = await clack.multiselect({
      message: "Multiple skills found. Select one or more to import:",
      required: false,
      options: [
        ...candidates.map((candidate, idx) => ({
          value: String(idx),
          label: candidate.name,
          ...(candidate.description ? { hint: pc.dim(candidate.description) } : {}),
        })),
        { value: "__back", label: pc.dim("← Back") },
      ],
    })

    if (clack.isCancel(selected)) return undefined

    const values = new Set(selected as string[])
    if (values.has("__back")) {
      if (values.size === 1) return "back"
      log.warn("Select skills or Back, not both.")
      continue
    }

    const picked = candidates.filter((_, idx) => values.has(String(idx)))
    if (picked.length === 0) {
      log.warn("Press Space to select, Enter to submit.")
      continue
    }

    return picked
  }
}

async function promptCategory(currentName: string, isBatch = false): Promise<string | null | "back" | undefined> {
  const categories = (await discoverCategories()).filter(Boolean)

  if (categories.length === 0) {
    log.info("No categories found. You can skip or create one.")
    log.raw(`  ${pc.dim("Common examples: development, architecture, tools, ml-tools, devops")}`)
  }

  const selection = await clack.select({
    message: isBatch
      ? `Save ${pc.bold(currentName)} to which category? (optional)`
      : `Save "${currentName}" to which category? (optional)`,
    options: [
      { value: "__none", label: "— No category" },
      ...categories.map((category) => ({ value: category, label: category })),
      { value: "__create", label: "+ Create new category..." },
      { value: "__back", label: pc.dim("← Back") },
    ],
  })

  if (clack.isCancel(selection)) return undefined
  if (selection === "__none") return null
  if (selection === "__back") return "back"

  if (selection === "__create") {
    const rawCategory = await clack.text({
      message: "Category name (lowercase, letters, numbers, hyphens):",
      placeholder: "e.g. architecture",
      validate: (value) => {
        const val = value?.trim() ?? ""
        if (!val) return "Category name cannot be empty"
        if (!/^[a-z][a-z0-9-]+$/.test(val)) {
          return "Use lowercase letters, numbers, hyphens; min 2 chars; no spaces"
        }
      },
    })
    if (clack.isCancel(rawCategory)) return undefined
    return rawCategory.trim()
  }

  return selection
}

async function runConflictChecks(
  candidate: SkillCandidatePreview,
  targetRef: string,
  allSkills?: Awaited<ReturnType<typeof discoverSkills>>
): Promise<ImportAction | "cancelled"> {
  const existing = getEntry(targetRef)
  const incomingSource = normalizeUrl(candidate.canonicalUrl)

  let action: ImportAction = "import-new"

  if (existing) {
    const existingSource = normalizeUrl(existing.source)
    if (existingSource === incomingSource) {
      action = "update-same-source"
    } else {
      const replace = await clack.confirm({
        message:
          `Skill "${pc.bold(targetRef)}" already exists from a different source.\n` +
          `Current: ${pc.dim(existing.source)}\n` +
          `New:     ${pc.dim(candidate.canonicalUrl)}\n` +
          "Replace it?",
        initialValue: false,
      })
      if (clack.isCancel(replace) || !replace) return "cancelled"
      action = "overwrite-source"
    }
  }

  const knownSkills = allSkills ?? await discoverSkills()
  const sameNameDifferentLocation = knownSkills
    .filter((skill) => skill.name === candidate.name && skill.ref !== targetRef)
    .map((skill) => skill.ref)

  if (sameNameDifferentLocation.length > 0) {
    const refsPreview = sameNameDifferentLocation.slice(0, 3).join(", ")
    const extra = sameNameDifferentLocation.length > 3 ? ` (+${sameNameDifferentLocation.length - 3} more)` : ""
    const proceed = await clack.confirm({
      message:
        `A skill named "${pc.bold(candidate.name)}" already exists at: ${pc.dim(refsPreview)}${extra}\n` +
        "Importing here will create a second copy. Continue?",
      initialValue: false,
    })
    if (clack.isCancel(proceed) || !proceed) return "cancelled"
  }

  return action
}

function findDuplicateTargetRefs(refs: string[]): string[] {
  const counts = new Map<string, number>()
  for (const ref of refs) {
    counts.set(ref, (counts.get(ref) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ref]) => ref)
    .sort((a, b) => a.localeCompare(b))
}

async function planImportsForSelection(
  selectedCandidates: SkillCandidatePreview[],
  category: string | null
): Promise<{ status: "ok"; plans: ImportPlan[] } | { status: "cancelled" } | { status: "duplicate-targets"; duplicates: string[] }> {
  const plans: ImportPlan[] = []

  for (const candidate of selectedCandidates) {
    const targetRef = buildTargetRef(candidate.name, category)
    plans.push({
      preview: candidate,
      targetRef,
      action: "import-new",
    })
  }

  const duplicates = findDuplicateTargetRefs(plans.map((p) => p.targetRef))
  if (duplicates.length > 0) {
    return { status: "duplicate-targets", duplicates }
  }

  const allSkills = await discoverSkills()
  for (const plan of plans) {
    const action = await runConflictChecks(plan.preview, plan.targetRef, allSkills)
    if (action === "cancelled") return { status: "cancelled" }
    plan.action = action
  }

  return { status: "ok", plans }
}

async function promptConfirm(
  imports: PreparedImport[],
  category: string | null
): Promise<"confirm" | "back" | "cancel"> {
  log.step("Summary:")
  log.bullet("Skills", String(imports.length))

  for (const item of imports) {
    const destDir = buildDestinationPath(item.candidate.name, category)
    log.raw(`  ${pc.bold(item.candidate.name)}`)
    log.bullet("Source", item.candidate.canonicalUrl)
    log.bullet("Destination", destDir)
    log.bullet("Action", actionLabel(item.action))
  }

  const decision = await clack.select({
    message: "Proceed with import?",
    options: [
      { value: "confirm", label: pc.bold("Confirm") },
      { value: "back", label: pc.dim("← Back") },
      { value: "cancel", label: "Cancel" },
    ],
  })

  if (clack.isCancel(decision)) return "cancel"
  if (decision === "confirm" || decision === "back" || decision === "cancel") return decision
  return "cancel"
}

async function validateBeforeImport(candidate: SkillCandidate): Promise<boolean> {
  const result = validateSkillContent(candidate.skillMdContent)
  if (result.valid) return true

  const proceed = await clack.confirm({
    message:
      `This skill may not follow the Agent Skills standard:\n` +
      `${result.reason ?? "Unknown validation issue"}\n` +
      "Import anyway?",
    initialValue: false,
  })

  return !clack.isCancel(proceed) && proceed
}

async function downloadAndSync(candidate: SkillCandidate, category: string | null): Promise<void> {
  const destination = buildDestinationPath(candidate.name, category)

  await fs.remove(destination)
  await fs.ensureDir(destination)

  const downloads = candidate.files.map(async (file) => {
    const relative = normalizeRemoteRelativePath(file.remotePath)
    const targetPath = resolvePathInside(destination, relative, `Remote file path "${file.remotePath}"`)
    await fs.ensureDir(path.dirname(targetPath))

    const response = await fetch(file.downloadUrl)
    if (!response.ok) {
      throw new Error(`Could not download ${file.remotePath} (${response.status})`)
    }

    const content = Buffer.from(await response.arrayBuffer())
    await fs.writeFile(targetPath, content)
  })

  await Promise.all(downloads)
}

export async function importSkillFlow(): Promise<FlowResult> {
  let step: WizardStep = "url"
  let candidates: SkillCandidatePreview[] = []
  let selectedCandidates: SkillCandidatePreview[] = []
  let preparedImports: PreparedImport[] = []
  let selectedCategory: string | null = null
  let importPlans: ImportPlan[] = []

  while (true) {
    if (step === "url") {
      const input = await promptSourceUrl()
      if (!input) return "cancelled"
      const spin = clack.spinner()
      spin.start("Resolving source...")

      try {
        candidates = await fetchSkillCandidatePreviewsFromInput(input)
        spin.stop("Completed")
      } catch (err) {
        spin.stop("Failed")
        log.error(err instanceof Error ? err.message : String(err))
        continue
      }

      if (candidates.length === 1) {
        selectedCandidates = candidates[0] ? [candidates[0]] : []
        preparedImports = []
        importPlans = []
        step = "category"
      } else {
        selectedCandidates = []
        preparedImports = []
        importPlans = []
        step = "select-skill"
      }
      continue
    }

    if (step === "select-skill") {
      const picked = await promptSelectSkills(candidates)
      if (!picked) return "cancelled"
      if (picked === "back") {
        step = "url"
        continue
      }
      selectedCandidates = picked
      preparedImports = []
      importPlans = []
      step = "category"
      continue
    }

    if (step === "category") {
      if (selectedCandidates.length === 0) {
        step = "url"
        continue
      }

      const label = selectedCandidates.length === 1
        ? (selectedCandidates[0]?.name ?? "selected skill")
        : `${selectedCandidates.length} selected skills`
      const pickedCategory = await promptCategory(label, selectedCandidates.length > 1)
      if (pickedCategory === undefined) return "cancelled"
      if (pickedCategory === "back") {
        step = candidates.length > 1 ? "select-skill" : "url"
        continue
      }

      selectedCategory = pickedCategory
      let planning:
        | { status: "ok"; plans: ImportPlan[] }
        | { status: "cancelled" }
        | { status: "duplicate-targets"; duplicates: string[] }
      try {
        planning = await planImportsForSelection(selectedCandidates, selectedCategory)
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err))
        return "cancelled"
      }

      if (planning.status === "cancelled") return "cancelled"
      if (planning.status === "duplicate-targets") {
        log.error("Two or more selected skills map to the same destination.")
        for (const duplicate of planning.duplicates) {
          log.raw(`  ${pc.dim(duplicate)}`)
        }
        log.info("Adjust your selection and try again.")
        step = "select-skill"
        continue
      }

      importPlans = planning.plans
      preparedImports = []
      step = "confirm"
      continue
    }

    if (importPlans.length === 0) {
      step = "category"
      continue
    }

    if (preparedImports.length === 0) {
      const hydrated: PreparedImport[] = []
      try {
        for (const plan of importPlans) {
          const candidate = await hydrateSkillCandidate(plan.preview)
          hydrated.push({
            candidate,
            targetRef: plan.targetRef,
            action: plan.action,
          })
        }
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err))
        return "cancelled"
      }
      preparedImports = hydrated
    }

    const decision = await promptConfirm(preparedImports, selectedCategory)

    if (decision === "back") {
      step = "category"
      continue
    }
    if (decision === "cancel") {
      return "cancelled"
    }

    for (const item of preparedImports) {
      const validationOk = await validateBeforeImport(item.candidate)
      if (!validationOk) return "cancelled"
    }

    const spin = clack.spinner()
    spin.start(preparedImports.length === 1 ? "Importing skill..." : `Importing ${preparedImports.length} skills...`)
    let importedCount = 0
    let failedCount = 0
    let filesWritten = 0

    try {
      for (const item of preparedImports) {
        try {
          await downloadAndSync(item.candidate, selectedCategory)
          saveEntry(item.targetRef, item.candidate.canonicalUrl, { remoteBasePath: item.candidate.remoteBasePath })
          importedCount++
          filesWritten += item.candidate.files.length
        } catch (err) {
          failedCount++
          log.error(`Failed to import "${item.candidate.name}"`, err)
        }
      }

      if (importedCount === 0) {
        spin.stop("Failed")
        return "cancelled"
      }

      spin.stop(failedCount > 0 ? "Completed with warnings" : "Completed")
    } catch (err) {
      spin.stop("Failed")
      log.error(err instanceof Error ? err.message : String(err))
      return "cancelled"
    }

    if (preparedImports.length === 1 && importedCount === 1 && failedCount === 0) {
      const only = preparedImports[0] as PreparedImport
      const destinationHint = buildDestinationPath(only.candidate.name, selectedCategory)
      log.success(`"${only.candidate.name}" imported to ${destinationHint}`)
      log.raw(`  ${pc.dim(`Files written: ${filesWritten}`)}`)
      return "completed"
    }

    log.success(`Imported: ${importedCount}`)
    if (failedCount > 0) {
      log.warn(`Failed: ${failedCount}`)
    }
    log.raw(`  ${pc.dim(`Files written: ${filesWritten}`)}`)
    return failedCount > 0 ? "cancelled" : "completed"
  }
}
