import { describe, expect, test } from "bun:test"
import { classifyBrowserProcessControl, hasConnectedManagedMcp } from "../../src/tool/shell"

describe("browser process control guard", () => {
  test("classifies browser termination", () => {
    expect(classifyBrowserProcessControl("taskkill /IM brave.exe /F")?.kind).toBe("kill")
    expect(classifyBrowserProcessControl("Stop-Process -Name chrome")?.kind).toBe("kill")
  })

  test("classifies separate starts and debug-port manipulation", () => {
    expect(classifyBrowserProcessControl("Start-Process brave.exe")?.kind).toBe("start")
    expect(classifyBrowserProcessControl("brave.exe --remote-debugging-port=9222")?.kind).toBe("debug-port")
  })

  test("does not classify normal browser use", () => {
    expect(classifyBrowserProcessControl("open https://brave.com")).toBeUndefined()
    expect(classifyBrowserProcessControl("rg chrome source.ts")).toBeUndefined()
  })

  test("only reports a managed browser when its MCP status is connected", () => {
    expect(hasConnectedManagedMcp({ mcpStatus: { "brave-devtools": { status: "connected" } } }, ["brave-devtools"])).toBe(true)
    expect(hasConnectedManagedMcp({ mcpStatus: { "brave-devtools": { status: "failed" } } }, ["brave-devtools"])).toBe(false)
    expect(hasConnectedManagedMcp({}, ["brave-devtools"])).toBe(false)
  })
})
