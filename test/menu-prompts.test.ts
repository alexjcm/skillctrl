import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  promptMultiselectWithBack: vi.fn(),
}))

vi.mock("@clack/prompts", () => ({
  select: mocks.select,
  isCancel: vi.fn(() => false),
}))

vi.mock("../src/menu/helpers/prompt-multiselect-with-back.ts", () => ({
  promptMultiselectWithBack: mocks.promptMultiselectWithBack,
}))

import { selectIde, selectIdes } from "../src/menu/prompts/select-ide.ts"
import { FLOW_BACK } from "../src/menu/constants/flow-tokens.ts"

describe("menu prompt helpers", () => {
  beforeEach(() => {
    mocks.select.mockReset()
    mocks.promptMultiselectWithBack.mockReset()
  })

  it("selectIde does not offer 'All IDEs' and can include Back", async () => {
    mocks.select.mockResolvedValue("windsurf")

    const selected = await selectIde(true)

    expect(selected).toBe("windsurf")
    expect(mocks.select).toHaveBeenCalledWith({
      message: "Select target IDE:",
      options: expect.arrayContaining([
        { value: "windsurf", label: "windsurf" },
        { value: FLOW_BACK, label: expect.any(String) },
      ]),
    })

    const options = mocks.select.mock.calls[0]?.[0]?.options ?? []
    expect(options.some((option: { label: string }) => option.label === "All IDEs")).toBe(false)
  })

  it("selectIdes forwards includeBack=false to the multiselect helper", async () => {
    mocks.promptMultiselectWithBack.mockResolvedValue(["claude", "cursor"])

    const selected = await selectIdes(false)

    expect(selected).toEqual(["claude", "cursor"])
    expect(mocks.promptMultiselectWithBack).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select target IDE(s):",
        includeBack: false,
      })
    )
  })
})
