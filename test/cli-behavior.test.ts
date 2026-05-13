import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { execSync } from "child_process"
import path from "path"

const CLI_PATH = path.join(__dirname, "../src/index.ts")
const TSX_CMD = `npx tsx ${CLI_PATH}`

describe("CLI Behavior (Critical Paths)", () => {
  it("fails fast with exit 1 and stderr message when run without args in non-TTY", () => {
    try {
      // Running via child_process without a TTY simulates non-interactive environment
      execSync(TSX_CMD, { stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" })
      expect.fail("Should have thrown an error")
    } catch (err: any) {
      expect(err.status).toBe(1)
      expect(err.stderr).toContain("no command provided")
    }
  })

  it("fails with exit 1 for unknown commands", () => {
    try {
      execSync(`${TSX_CMD} unknown-cmd`, { stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" })
      expect.fail("Should have thrown an error")
    } catch (err: any) {
      expect(err.status).toBe(1)
      expect(err.stderr).toContain("error: unknown command")
    }
  })

  it("update command without refs fails", () => {
    try {
      execSync(`${TSX_CMD} update`, { stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" })
      expect.fail("Should have thrown an error")
    } catch (err: any) {
      expect(err.status).toBe(1)
      expect(err.stderr).toContain("No skill specified")
    }
  })

  it("deploy global without --ide fails", () => {
    try {
      execSync(`${TSX_CMD} deploy global`, { stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" })
      expect.fail("Should have thrown an error")
    } catch (err: any) {
      expect(err.status).toBe(1)
      expect(err.stderr).toContain("error: required option '--ide <ides>' not specified")
    }
  })

  it("deploy project without --path fails", () => {
    try {
      execSync(`${TSX_CMD} deploy project --ide all`, { stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" })
      expect.fail("Should have thrown an error")
    } catch (err: any) {
      expect(err.status).toBe(1)
      expect(err.stderr).toContain("error: required option '--path <dir>' not specified")
    }
  })
})
