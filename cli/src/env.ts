import { z } from "zod"

// Validate process.env once at entry point, never inline.
const EnvSchema = z.object({
  HOME: z.string().min(1, "HOME environment variable is required"),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  const messages = parsed.error.issues.map((i) => `  • ${i.message}`).join("\n")
  console.error(`[skills] Environment validation failed:\n${messages}`)
  process.exit(1)
}

export const env = parsed.data
