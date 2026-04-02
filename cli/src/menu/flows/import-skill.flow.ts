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
import { validateSkillContent } from "../../core/quick-skill-validator.ts"
import { discoverCategories, discoverSkills } from "../../core/skills.ts"
import { getEntry, saveEntry } from "../../core/skill-imports.ts"
import { IMPORTED_DIR } from "../../core/user-config.ts"
import type { FlowResult } from "../flow-result.ts"
import { log } from "../../ui/logger.ts"

type WizardStep = "url" | "select-skill" | "category" | "confirm"
type ImportAction = "import-new" | "update-same-source" | "overwrite-source"

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

function buildTargetRef(name: string, category: string | null): string {
  return category ? `${category}/${name}` : name
}

function buildDestinationPath(name: string, category: string | null): string {
  return category
    ? path.join(IMPORTED_DIR, category, name)
    : path.join(IMPORTED_DIR, name)
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

async function promptSelectSkill(candidates: SkillCandidatePreview[]): Promise<SkillCandidatePreview | "back" | undefined> {
  const selected = await clack.select({
    message: "Multiple skills found. Which one do you want to import?",
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
  if (selected === "__back") return "back"
  const index = Number(selected)
  return candidates[index]
}

async function promptCategory(currentName: string): Promise<string | null | "back" | undefined> {
  const categories = (await discoverCategories()).filter(Boolean)

  if (categories.length === 0) {
    log.info("No categories found. You can skip or create one.")
    log.raw(`  ${pc.dim("Common examples: development, architecture, tools, ml-tools, devops")}`)
  }

  const selection = await clack.select({
    message: `Save "${currentName}" to which category? (optional)`,
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

async function runConflictChecks(candidate: SkillCandidatePreview, targetRef: string): Promise<ImportAction | "cancelled"> {
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

  const allSkills = await discoverSkills()
  const sameNameDifferentLocation = allSkills
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

async function promptConfirm(
  candidate: SkillCandidate,
  category: string | null,
  targetRef: string,
  action: ImportAction
): Promise<"confirm" | "back" | "cancel"> {
  const destDir = buildDestinationPath(candidate.name, category)

  log.step("Summary")
  log.bullet("Skill", candidate.name)
  log.bullet("Source", candidate.canonicalUrl)
  log.bullet("Ref", targetRef)
  log.bullet("Dest", destDir)
  log.bullet("Files", String(candidate.files.length))
  log.bullet("Action", actionLabel(action))

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
    const relative = file.remotePath.replace(/^\/+/, "")
    if (!relative) return

    const targetPath = path.join(destination, ...relative.split("/"))
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
  let selectedCandidate: SkillCandidatePreview | null = null
  let hydratedCandidate: SkillCandidate | null = null
  let selectedCategory: string | null = null
  let currentAction: ImportAction = "import-new"

  while (true) {
    if (step === "url") {
      const input = await promptSourceUrl()
      if (!input) return "cancelled"
      const spin = clack.spinner()
      spin.start("Resolving source...")

      try {
        candidates = await fetchSkillCandidatePreviewsFromInput(input)
        spin.stop("Source resolved")
      } catch (err) {
        spin.stop("Failed")
        log.error(err instanceof Error ? err.message : String(err))
        continue
      }

      if (candidates.length === 1) {
        selectedCandidate = candidates[0] ?? null
        hydratedCandidate = null
        step = "category"
      } else {
        selectedCandidate = null
        hydratedCandidate = null
        step = "select-skill"
      }
      continue
    }

    if (step === "select-skill") {
      const picked = await promptSelectSkill(candidates)
      if (!picked) return "cancelled"
      if (picked === "back") {
        step = "url"
        continue
      }
      selectedCandidate = picked
      hydratedCandidate = null
      step = "category"
      continue
    }

    if (step === "category") {
      if (!selectedCandidate) {
        step = "url"
        continue
      }

      const pickedCategory = await promptCategory(selectedCandidate.name)
      if (pickedCategory === undefined) return "cancelled"
      if (pickedCategory === "back") {
        step = candidates.length > 1 ? "select-skill" : "url"
        continue
      }

      selectedCategory = pickedCategory
      const targetRef = buildTargetRef(selectedCandidate.name, selectedCategory)
      const conflictCheck = await runConflictChecks(selectedCandidate, targetRef)
      if (conflictCheck === "cancelled") return "cancelled"

      currentAction = conflictCheck
      hydratedCandidate = null
      step = "confirm"
      continue
    }

    if (!selectedCandidate) {
      step = "url"
      continue
    }

    const targetRef = buildTargetRef(selectedCandidate.name, selectedCategory)
    if (!hydratedCandidate) {
      const hydrateSpin = clack.spinner()
      hydrateSpin.start("Preparing selected skill...")
      try {
        hydratedCandidate = await hydrateSkillCandidate(selectedCandidate)
        hydrateSpin.stop("Skill details loaded")
      } catch (err) {
        hydrateSpin.stop("Failed")
        log.error(err instanceof Error ? err.message : String(err))
        return "cancelled"
      }
    }

    const decision = await promptConfirm(hydratedCandidate, selectedCategory, targetRef, currentAction)

    if (decision === "back") {
      step = "category"
      continue
    }
    if (decision === "cancel") {
      return "cancelled"
    }

    const validationOk = await validateBeforeImport(hydratedCandidate)
    if (!validationOk) return "cancelled"

    const spin = clack.spinner()
    spin.start("Importing skill...")
    try {
      await downloadAndSync(hydratedCandidate, selectedCategory)
      saveEntry(targetRef, hydratedCandidate.canonicalUrl, { remoteBasePath: hydratedCandidate.remoteBasePath })
      spin.stop("Import completed")
    } catch (err) {
      spin.stop("Import failed")
      log.error(err instanceof Error ? err.message : String(err))
      return "cancelled"
    }

    const destinationHint = selectedCategory
      ? path.join(IMPORTED_DIR, selectedCategory)
      : IMPORTED_DIR
    log.success(`"${hydratedCandidate.name}" imported to ${destinationHint}`)
    log.info(`Files written: ${hydratedCandidate.files.length}`)
    log.raw(`  ${pc.dim("Tip: Run 'skills' and choose a deploy option to push it to your IDEs.")}`)
    return "completed"
  }
}
