import path from "path"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { SkillsConfigSchema } from "./types.ts"
import { log } from "../ui/logger.ts"

export function loadExcludedRefs(): string[] {
  return loadExcludedRefsFromPath()
}

export function loadExcludedRefsFromPath(configPath?: string): string[] {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const cfgPath = configPath ?? path.join(__dirname, "..", "..", "skills.config.json")

  try {
    const raw = readFileSync(cfgPath, "utf8")
    const parsedJson = JSON.parse(raw) as unknown
    const parsed = SkillsConfigSchema.safeParse(parsedJson)

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ")
      log.warn(`Invalid skills.config.json. Using no exclusions. (${issues})`)
      return []
    }

    return parsed.data.excludedSkills
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }

    if (err instanceof SyntaxError) {
      log.warn("Invalid JSON in skills.config.json. Using no exclusions.")
      return []
    }

    log.warn(`Could not read skills.config.json. Using no exclusions. (${err instanceof Error ? err.message : String(err)})`)
    return []
  }
}
