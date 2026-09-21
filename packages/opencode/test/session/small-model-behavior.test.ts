import { describe, expect, test } from "bun:test"
import {
  compactOriginalUserText,
  shouldTriggerActionWatchdog,
  shouldTriggerPostEditVerification,
  shouldStopPostEditVerificationTurn,
  codeModeMcpToolCalls,
  codeModeMcpToolNames,
  compactVerificationDiff,
  isInspectionToolName,
  isProgressAction,
  verificationMessageWindow,
} from "../../src/session/small-model-behavior"

describe("small-model action watchdog", () => {
  const base = {
    enabled: true,
    finish: "length",
    hasAction: false,
    forcedContinuations: 0,
    maxForcedContinuations: 1,
    hasError: false,
    aborted: false,
  }

  test("continues a length-limited no-action turn", () => {
    expect(shouldTriggerActionWatchdog(base)).toBe(true)
  })

  test("does not continue after an action or normal stop", () => {
    expect(shouldTriggerActionWatchdog({ ...base, hasAction: true })).toBe(false)
    expect(shouldTriggerActionWatchdog({ ...base, finish: "stop" })).toBe(false)
  })

  test("does not retry errors, cancellation, or a second time", () => {
    expect(shouldTriggerActionWatchdog({ ...base, hasError: true })).toBe(false)
    expect(shouldTriggerActionWatchdog({ ...base, aborted: true })).toBe(false)
    expect(shouldTriggerActionWatchdog({ ...base, forcedContinuations: 1 })).toBe(false)
  })
})

describe("small-model post-edit verification", () => {
  const base = {
    enabled: true,
    filesChanged: true,
    triggered: false,
    passes: 0,
    maxPasses: 1,
    hasError: false,
    aborted: false,
  }

  test("runs once after edits", () => {
    expect(shouldTriggerPostEditVerification(base)).toBe(true)
    expect(shouldTriggerPostEditVerification({ ...base, triggered: true })).toBe(false)
    expect(shouldTriggerPostEditVerification({ ...base, passes: 1 })).toBe(false)
  })

  test("requires changes and respects cancellation/errors", () => {
    expect(shouldTriggerPostEditVerification({ ...base, filesChanged: false })).toBe(false)
    expect(shouldTriggerPostEditVerification({ ...base, hasError: true })).toBe(false)
    expect(shouldTriggerPostEditVerification({ ...base, aborted: true })).toBe(false)
  })

  test("bounds the original request included in the review", () => {
    expect(compactOriginalUserText("hello")).toBe("hello")
    expect(compactOriginalUserText("x".repeat(10), 5)).toContain("[original request truncated]")
  })

  test("stops an open-ended reviewer at its turn budget", () => {
    expect(shouldStopPostEditVerificationTurn({ finish: "tool-calls", turns: 8, maxTurns: 8 })).toBe(true)
    expect(shouldStopPostEditVerificationTurn({ finish: "tool-calls", turns: 7, maxTurns: 8 })).toBe(false)
    expect(shouldStopPostEditVerificationTurn({ finish: "stop", turns: 8, maxTurns: 8 })).toBe(false)
  })

  test("keeps inspection separate from successful progress actions", () => {
    expect(isInspectionToolName("read_file")).toBe(true)
    expect(isInspectionToolName("brave-devtools.list_network_requests")).toBe(true)
    expect(isInspectionToolName("brave-devtools.get_network_request")).toBe(true)
    expect(isInspectionToolName("brave-devtools_get_network_request")).toBe(true)
    expect(isInspectionToolName("brave-devtools.click")).toBe(false)
    expect(isInspectionToolName("foo.click_and_get_result")).toBe(false)
    expect(isInspectionToolName("foo.update_and_get_status")).toBe(false)
    expect(isProgressAction("read_file", { filePath: "src/app.ts" })).toBe(false)
    expect(isProgressAction("brave-devtools.get_network_request")).toBe(false)
    expect(isProgressAction("brave-devtools_get_network_request")).toBe(false)
    expect(isProgressAction("brave-devtools.click")).toBe(true)
    expect(isProgressAction("edit", { filePath: "src/app.ts" })).toBe(true)
    expect(isProgressAction("shell", { command: "git status --short" })).toBe(false)
    expect(isProgressAction("shell", { command: "npm test" })).toBe(true)
  })

  test("extracts Code Mode child MCP calls and bounds the verification diff", () => {
    expect(
      codeModeMcpToolNames({
        toolCalls: [
          { tool: "brave-devtools_get_page", status: "completed" },
          { tool: "brave-devtools_click", status: "error" },
        ],
      }),
    ).toEqual(["brave-devtools_get_page"])
    expect(
      codeModeMcpToolCalls({
        toolCalls: [
          { tool: "brave-devtools_get_page", status: "completed" },
          { tool: "brave-devtools_click", status: "error" },
        ],
      }),
    ).toEqual([
      { tool: "brave-devtools_get_page", status: "completed", input: undefined },
      { tool: "brave-devtools_click", status: "error", input: undefined },
    ])
    expect(compactVerificationDiff("x".repeat(10), 5)).toContain("[current diff truncated]")
  })

  test("keeps the verifier transcript after its synthetic start message", () => {
    const messages = [
      { info: { id: "original-user" } },
      { info: { id: "original-assistant" } },
      { info: { id: "verification-user" } },
      { info: { id: "verification-assistant" } },
      { info: { id: "verification-followup" } },
    ]
    expect(verificationMessageWindow(messages, "verification-user")).toEqual(messages.slice(2))
    expect(verificationMessageWindow(messages, "missing")).toBeUndefined()
    expect(verificationMessageWindow(messages, undefined)).toBeUndefined()
  })
})
