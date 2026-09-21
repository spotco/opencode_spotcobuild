import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

describe("installation version", () => {
  test("source keeps InstallationVersion as baseVersion and display-only mark", () => {
    const src = readFileSync(path.join(import.meta.dir, "../src/installation/version.ts"), "utf8")
    expect(src).toContain("export const InstallationVersion = baseVersion")
    expect(src).toContain("export const InstallationDisplayVersion")
    expect(src).toMatch(/InstallationDisplayVersion[\s\S]*spotcobuildMark/)
    // Guard against regressing to appending the mark onto InstallationVersion.
    expect(src).not.toMatch(/export const InstallationVersion\s*=\s*spotcobuildMark/)
    expect(src).not.toMatch(
      /export const InstallationVersion\s*=\s*spotcobuildMark\s*\?\s*`\$\{baseVersion\} \$\{spotcobuildMark\}`/,
    )
  })
})
