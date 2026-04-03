import path from "path"
import { describe, expect, it } from "vitest"
import { assertSafePathSegment, resolvePathInside } from "../src/core/path-safety.ts"

describe("assertSafePathSegment", () => {
  it("accepts a normal path segment", () => {
    expect(assertSafePathSegment("skill-name", "Skill name")).toBe("skill-name")
  })

  it("rejects dangerous path values", () => {
    expect(() => assertSafePathSegment("../escape", "Skill name")).toThrow("path separators")
    expect(() => assertSafePathSegment("..", "Skill name")).toThrow("invalid path segment")
    expect(() => assertSafePathSegment("/absolute", "Skill name")).toThrow("path separators")
    expect(() => assertSafePathSegment("", "Skill name")).toThrow("cannot be empty")
  })
})

describe("resolvePathInside", () => {
  it("resolves nested paths inside the base directory", () => {
    const base = path.resolve("tmp-base")
    const target = resolvePathInside(base, "nested/SKILL.md", "Remote file path")
    expect(target).toBe(path.resolve(base, "nested", "SKILL.md"))
  })

  it("blocks escaping paths", () => {
    const base = path.resolve("tmp-base")
    expect(() => resolvePathInside(base, "../outside.txt", "Remote file path")).toThrow("escapes destination")
  })
})
