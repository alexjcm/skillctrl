import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

export async function getPackageVersion(): Promise<string> {
  try {
    // Most reliable approach: use current working directory
    // This works regardless of where the file is located
    const packageJsonPath = resolve(process.cwd(), "package.json")
    const packageJson = await readFile(packageJsonPath, "utf-8")
    const packageData = JSON.parse(packageJson)
    return packageData.version
  } catch (error) {
    console.error("Error reading package version:", error)
    return "unknown"
  }
}
