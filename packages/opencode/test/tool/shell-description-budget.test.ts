import { expect, test } from "bun:test"
import { ShellPrompt } from "@/tool/shell/prompt"

const LIMITS = { maxLines: 2000, maxBytes: 50_000 }
const TIMEOUT_MS = 120_000
const MAX_POWERSHELL_DESCRIPTION_CHARS = 1500

test("PowerShell shell description stays lean and keeps critical guidance", () => {
  const { description } = ShellPrompt.render("powershell", "win32", LIMITS, TIMEOUT_MS)

  expect(description.length).toBeLessThanOrEqual(MAX_POWERSHELL_DESCRIPTION_CHARS)
  expect(description).toContain("PowerShell")
  expect(description.toLowerCase()).toContain("not bash")
  expect(description).toContain("workdir")
  expect(description.toLowerCase()).toMatch(/heredoc|<<eof/)
  expect(description.toLowerCase()).toContain("commit")
})

test("pwsh shell description stays under the same budget", () => {
  const { description } = ShellPrompt.render("pwsh", "win32", LIMITS, TIMEOUT_MS)
  expect(description.length).toBeLessThanOrEqual(MAX_POWERSHELL_DESCRIPTION_CHARS)
  expect(description).toContain("PowerShell")
  expect(description).toContain("workdir")
})
