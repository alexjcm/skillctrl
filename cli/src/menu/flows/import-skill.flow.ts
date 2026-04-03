import * as clack from "@clack/prompts"
import * as pc from "../../ui/ansi.ts"
import {
  fetchSkillCandidatePreviewsFromInput,
  hydrateSkillCandidate,
  type SkillCandidate,
  type SkillCandidatePreview,
} from "../../core/github-fetcher.ts"
import {
  buildImportedDestinationPath,
  createInitialImportPlans,
  downloadAndSyncImportedSkill,
  findDuplicateTargetRefs,
  normalizeSourceUrl,
  type ImportAction,
  type ImportPlan,
  type PreparedImport,
} from "../../core/imported-skill-sync.ts"
import { validateSkillContent } from "../../core/quick-skill-validator.ts"
import { discoverCategories, discoverSkills } from "../../core/skills.ts"
import { getEntry, saveEntry } from "../../core/skill-imports.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"
import { promptMultiselectWithBack } from "../helpers/prompt-multiselect-with-back.ts"
import { runWithSpinner } from "../helpers/run-with-spinner.ts"
import { FLOW_BACK, FLOW_CANCEL, FLOW_CANCELLED, FLOW_COMPLETED, FLOW_CONFIRM } from "../constants/flow-tokens.ts"

type WizardStep = "url" | "select-skill" | "category" | typeof FLOW_CONFIRM

interface ImportWizardState {
  step: WizardStep
  candidates: SkillCandidatePreview[]
  selectedCandidates: SkillCandidatePreview[]
  preparedImports: PreparedImport[]
  selectedCategory: string | null
  importPlans: ImportPlan[]
}

interface ImportExecutionSummary {
  importedCount: number
  failedCount: number
  filesWritten: number
}

function actionLabel(action: ImportAction): string {
  if (action === "update-same-source") return "⟳ Update (same source)"
  if (action === "overwrite-source") return "⟳ Overwrite (new source)"
  return "✦ Import new"
}

function resetImportPreparation(state: ImportWizardState): void {
  state.preparedImports = []
  state.importPlans = []
}

function setSelectedCandidates(state: ImportWizardState, candidates: SkillCandidatePreview[]): void {
  state.selectedCandidates = candidates
  resetImportPreparation(state)
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

async function promptSelectSkills(
  candidates: SkillCandidatePreview[]
): Promise<SkillCandidatePreview[] | typeof FLOW_BACK | undefined> {
  const selected = await promptMultiselectWithBack({
    message: "Multiple skills found. Select one or more to import:",
    options: candidates.map((candidate, idx) => ({
      value: String(idx),
      label: candidate.name,
      ...(candidate.description ? { hint: pc.dim(candidate.description) } : {}),
    })),
    mixedBackWarning: "Select skills or Back, not both.",
    warn: (message) => log.warn(message),
  })

  if (selected === undefined || selected === FLOW_BACK) return selected

  const selectedSet = new Set(selected)
  return candidates.filter((_, idx) => selectedSet.has(String(idx)))
}

async function promptCategory(
  currentName: string,
  isBatch = false
): Promise<string | null | typeof FLOW_BACK | undefined> {
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
  if (selection === "__back") return FLOW_BACK

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
): Promise<ImportAction | typeof FLOW_CANCELLED> {
  const existing = getEntry(targetRef)
  const incomingSource = normalizeSourceUrl(candidate.canonicalUrl)

  let action: ImportAction = "import-new"

  if (existing) {
    const existingSource = normalizeSourceUrl(existing.source)
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
      if (clack.isCancel(replace) || !replace) return FLOW_CANCELLED
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
    if (clack.isCancel(proceed) || !proceed) return FLOW_CANCELLED
  }

  return action
}

async function planImportsForSelection(
  selectedCandidates: SkillCandidatePreview[],
  category: string | null
): Promise<
  { status: "ok"; plans: ImportPlan[] } |
  { status: typeof FLOW_CANCELLED } |
  { status: "duplicate-targets"; duplicates: string[] }
> {
  const plans = createInitialImportPlans(selectedCandidates, category)

  const duplicates = findDuplicateTargetRefs(plans.map((p) => p.targetRef))
  if (duplicates.length > 0) {
    return { status: "duplicate-targets", duplicates }
  }

  const allSkills = await discoverSkills()
  for (const plan of plans) {
    const action = await runConflictChecks(plan.preview, plan.targetRef, allSkills)
    if (action === FLOW_CANCELLED) return { status: FLOW_CANCELLED }
    plan.action = action
  }

  return { status: "ok", plans }
}

async function promptConfirm(
  imports: PreparedImport[],
  category: string | null
): Promise<typeof FLOW_CONFIRM | typeof FLOW_BACK | typeof FLOW_CANCEL> {
  log.step("Summary:")
  log.bullet("Skills", String(imports.length))

  for (const item of imports) {
    const destDir = buildImportedDestinationPath(item.candidate.name, category)
    log.raw(`  ${pc.bold(item.candidate.name)}`)
    log.bullet("Source", item.candidate.canonicalUrl)
    log.bullet("Destination", destDir)
    log.bullet("Action", actionLabel(item.action))
  }

  const decision = await clack.select({
    message: "Proceed with import?",
    options: [
      { value: FLOW_CONFIRM, label: pc.bold("Confirm") },
      { value: FLOW_BACK, label: pc.dim("← Back") },
      { value: FLOW_CANCEL, label: "Cancel" },
    ],
  })

  if (clack.isCancel(decision)) return FLOW_CANCEL
  if (decision === FLOW_CONFIRM || decision === FLOW_BACK || decision === FLOW_CANCEL) return decision
  return FLOW_CANCEL
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

async function hydratePreparedImports(importPlans: ImportPlan[]): Promise<PreparedImport[]> {
  const hydrated: PreparedImport[] = []
  for (const plan of importPlans) {
    const candidate = await hydrateSkillCandidate(plan.preview)
    hydrated.push({
      candidate,
      targetRef: plan.targetRef,
      action: plan.action,
    })
  }
  return hydrated
}

async function executeImports(preparedImports: PreparedImport[], category: string | null): Promise<ImportExecutionSummary> {
  let importedCount = 0
  let failedCount = 0
  let filesWritten = 0

  for (const item of preparedImports) {
    try {
      const written = await downloadAndSyncImportedSkill(item.candidate, category)
      saveEntry(item.targetRef, item.candidate.canonicalUrl, { remoteBasePath: item.candidate.remoteBasePath })
      importedCount++
      filesWritten += written
    } catch (err) {
      failedCount++
      log.error(`Failed to import "${item.candidate.name}"`, err)
    }
  }

  return { importedCount, failedCount, filesWritten }
}

function printImportSummary(
  preparedImports: PreparedImport[],
  selectedCategory: string | null,
  summary: ImportExecutionSummary
): FlowResult {
  const { importedCount, failedCount, filesWritten } = summary
  if (importedCount === 0) return FLOW_CANCELLED

  if (preparedImports.length === 1 && importedCount === 1 && failedCount === 0) {
    const only = preparedImports[0] as PreparedImport
    const destinationHint = buildImportedDestinationPath(only.candidate.name, selectedCategory)
    log.success(`"${only.candidate.name}" imported to ${destinationHint}`)
    log.raw(`  ${pc.dim(`Files written: ${filesWritten}`)}`)
    return FLOW_COMPLETED
  }

  log.success(`Imported: ${importedCount}`)
  if (failedCount > 0) {
    log.warn(`Failed: ${failedCount}`)
  }
  log.raw(`  ${pc.dim(`Files written: ${filesWritten}`)}`)
  return failedCount > 0 ? FLOW_CANCELLED : FLOW_COMPLETED
}

async function handleUrlStep(state: ImportWizardState): Promise<FlowResult | void> {
  const input = await promptSourceUrl()
  if (!input) return FLOW_CANCELLED

  try {
    state.candidates = await runWithSpinner(
      { startMessage: "Resolving source..." },
      () => fetchSkillCandidatePreviewsFromInput(input)
    )
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err))
    return
  }

  if (state.candidates.length === 1) {
    setSelectedCandidates(state, state.candidates[0] ? [state.candidates[0]] : [])
    state.step = "category"
    return
  }

  setSelectedCandidates(state, [])
  state.step = "select-skill"
}

async function handleSelectSkillStep(state: ImportWizardState): Promise<FlowResult | void> {
  const picked = await promptSelectSkills(state.candidates)
  if (!picked) return FLOW_CANCELLED
  if (picked === FLOW_BACK) {
    state.step = "url"
    return
  }

  setSelectedCandidates(state, picked)
  state.step = "category"
}

async function handleCategoryStep(state: ImportWizardState): Promise<FlowResult | void> {
  if (state.selectedCandidates.length === 0) {
    state.step = "url"
    return
  }

  const label = state.selectedCandidates.length === 1
    ? (state.selectedCandidates[0]?.name ?? "selected skill")
    : `${state.selectedCandidates.length} selected skills`
  const pickedCategory = await promptCategory(label, state.selectedCandidates.length > 1)
  if (pickedCategory === undefined) return FLOW_CANCELLED
  if (pickedCategory === FLOW_BACK) {
    state.step = state.candidates.length > 1 ? "select-skill" : "url"
    return
  }

  state.selectedCategory = pickedCategory
  let planning:
    | { status: "ok"; plans: ImportPlan[] }
    | { status: typeof FLOW_CANCELLED }
    | { status: "duplicate-targets"; duplicates: string[] }

  try {
    planning = await planImportsForSelection(state.selectedCandidates, state.selectedCategory)
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err))
    return FLOW_CANCELLED
  }

  if (planning.status === FLOW_CANCELLED) return FLOW_CANCELLED
  if (planning.status === "duplicate-targets") {
    log.error("Two or more selected skills map to the same destination.")
    for (const duplicate of planning.duplicates) {
      log.raw(`  ${pc.dim(duplicate)}`)
    }
    log.info("Adjust your selection and try again.")
    state.step = "select-skill"
    return
  }

  state.importPlans = planning.plans
  state.preparedImports = []
  state.step = FLOW_CONFIRM
}

async function handleConfirmStep(state: ImportWizardState): Promise<FlowResult | void> {
  if (state.importPlans.length === 0) {
    state.step = "category"
    return
  }

  if (state.preparedImports.length === 0) {
    try {
      state.preparedImports = await hydratePreparedImports(state.importPlans)
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err))
      return FLOW_CANCELLED
    }
  }

  const decision = await promptConfirm(state.preparedImports, state.selectedCategory)
  if (decision === FLOW_BACK) {
    state.step = "category"
    return
  }
  if (decision === FLOW_CANCEL) return FLOW_CANCELLED

  for (const item of state.preparedImports) {
    const validationOk = await validateBeforeImport(item.candidate)
    if (!validationOk) return FLOW_CANCELLED
  }

  let summary: ImportExecutionSummary
  try {
    summary = await runWithSpinner(
      {
        startMessage: state.preparedImports.length === 1
          ? "Importing skill..."
          : `Importing ${state.preparedImports.length} skills...`,
        successMessage: (result: ImportExecutionSummary) => {
          if (result.importedCount === 0) return "Failed"
          return result.failedCount > 0 ? "Completed with warnings" : "Completed"
        },
      },
      () => executeImports(state.preparedImports, state.selectedCategory)
    )
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err))
    return FLOW_CANCELLED
  }

  return printImportSummary(state.preparedImports, state.selectedCategory, summary)
}

export async function importSkillFlow(): Promise<FlowResult> {
  const state: ImportWizardState = {
    step: "url",
    candidates: [],
    selectedCandidates: [],
    preparedImports: [],
    selectedCategory: null,
    importPlans: [],
  }

  while (true) {
    let result: FlowResult | void

    if (state.step === "url") {
      result = await handleUrlStep(state)
    } else if (state.step === "select-skill") {
      result = await handleSelectSkillStep(state)
    } else if (state.step === "category") {
      result = await handleCategoryStep(state)
    } else {
      result = await handleConfirmStep(state)
    }

    if (result) return result
  }
}
