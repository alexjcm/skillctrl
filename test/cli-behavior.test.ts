import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "child_process"
import path from "path"
import { isRecord } from "../src/core/system/errors.ts"

const CLI_PATH = path.join(__dirname, "../src/index.ts")
type CliExecError = Error & {
  status?: number
  stderr?: string
}

function runCli(args: string[] = []): string {
  const options: ExecFileSyncOptionsWithStringEncoding = {
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf8",
  }
  return execFileSync(process.execPath, ["--import", "tsx", CLI_PATH, ...args], options)
}

function asCliExecError(error: unknown): CliExecError {
  if (error instanceof Error && isRecord(error)) {
    return error as CliExecError
  }
  throw error
}

describe("CLI Behavior (Critical Paths)", () => {
  it("fails fast with exit 1 and stderr message when run without args in non-TTY", () => {
    try {
      // Running via child_process without a TTY simulates non-interactive environment
      runCli()
      expect.fail("Should have thrown an error")
    } catch (err: unknown) {
      const cliError = asCliExecError(err)
      expect(cliError.status).toBe(1)
      expect(cliError.stderr).toContain("no command provided")
    }
  })

  it("fails with exit 1 for unknown commands", () => {
    try {
      runCli(["unknown-cmd"])
      expect.fail("Should have thrown an error")
    } catch (err: unknown) {
      const cliError = asCliExecError(err)
      expect(cliError.status).toBe(1)
      expect(cliError.stderr).toContain("error: unknown command")
    }
  })

  it("update command without refs fails", () => {
    try {
      runCli(["update"])
      expect.fail("Should have thrown an error")
    } catch (err: unknown) {
      const cliError = asCliExecError(err)
      expect(cliError.status).toBe(1)
      expect(cliError.stderr).toContain("No skill specified")
    }
  })

  it("deploy global without --ide fails", () => {
    try {
      runCli(["deploy", "global"])
      expect.fail("Should have thrown an error")
    } catch (err: unknown) {
      const cliError = asCliExecError(err)
      expect(cliError.status).toBe(1)
      expect(cliError.stderr).toContain("error: required option '--ide <ides>' not specified")
    }
  })

  it("deploy project without --path fails", () => {
    try {
      runCli(["deploy", "project", "--ide", "all"])
      expect.fail("Should have thrown an error")
    } catch (err: unknown) {
      const cliError = asCliExecError(err)
      expect(cliError.status).toBe(1)
      expect(cliError.stderr).toContain("error: required option '--path <dir>' not specified")
    }
  })
})
