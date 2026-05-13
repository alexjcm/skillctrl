import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("CLI -> TUI Regression", () => {
  let exitMock: ReturnType<typeof vi.spyOn>
  let consoleErrorMock: ReturnType<typeof vi.spyOn>
  let originalArgv: string[]
  
  beforeEach(() => {
    originalArgv = [...process.argv]
    exitMock = vi.spyOn(process, "exit").mockImplementation(() => {
      return undefined as never
    })
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {})
    
    // Clear the module cache so index.ts runs fresh each time
    vi.resetModules()
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
    
    // Reset TTY state safely
    if ("isTTY" in process.stdin) {
      Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true })
    }
    if ("isTTY" in process.stdout) {
      Object.defineProperty(process.stdout, "isTTY", { value: undefined, configurable: true })
    }
  })

  it("when run without args in a TTY, it attempts to launch the TUI menu", async () => {
    // 1. Mock the TUI menu module
    const runMenuMock = vi.fn().mockResolvedValue(0)
    vi.doMock("../src/menu/index.ts", () => ({
      runMenu: runMenuMock
    }))

    // 2. Setup TTY environment and argv
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true })
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true })
    process.argv = ["node", "skillctrl"]

    // 3. Dynamically import index.ts to execute it
    await import("../src/index.ts")

    // 4. Verify runMenu was called
    expect(runMenuMock).toHaveBeenCalled()
    expect(exitMock).toHaveBeenCalledWith(0)
  })

  it("when run without args in non-TTY, it fails fast without launching TUI", async () => {
    // 1. Mock the TUI menu module to ensure it's NEVER called
    const runMenuMock = vi.fn().mockResolvedValue(0)
    vi.doMock("../src/menu/index.ts", () => ({
      runMenu: runMenuMock
    }))

    // 2. Setup non-TTY environment and argv
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true })
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true })
    process.argv = ["node", "skillctrl"]

    // 3. Dynamically import index.ts
    await import("../src/index.ts")

    // 4. Verify runMenu was NOT called, and it exited with 1
    expect(runMenuMock).not.toHaveBeenCalled()
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining("no command provided"))
    expect(exitMock).toHaveBeenCalledWith(1)
  })
})
