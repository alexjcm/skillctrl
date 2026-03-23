import { z } from "zod"
import { EXIT_CODES } from "./core/exit-codes.ts"
import { log } from "./ui/logger.ts"
import os from "os"

function resolveHomeDir(): string {
  const home = process.env["HOME"]
  if (home && home.trim()) return home

  const userProfile = process.env["USERPROFILE"]
  if (userProfile && userProfile.trim()) return userProfile

  const homeDrive = process.env["HOMEDRIVE"]
  const homePath = process.env["HOMEPATH"]
  if (homeDrive && homePath) return `${homeDrive}${homePath}`

  const fromOs = os.homedir()
  return fromOs ?? ""
}

// Validate resolved runtime environment once at entry point.
const EnvSchema = z.object({
  HOME: z.string().min(1, "Could not resolve a home directory from environment"),
})

const parsed = EnvSchema.safeParse({
  HOME: resolveHomeDir(),
})

if (!parsed.success) {
  const messages = parsed.error.issues.map((i) => `  • ${i.message}`).join("\n")
  log.error(`Environment validation failed:\n${messages}`)
  process.exit(EXIT_CODES.ERROR)
}

export const env = parsed.data
