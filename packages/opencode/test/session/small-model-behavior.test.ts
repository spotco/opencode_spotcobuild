import { describe, expect, test } from "bun:test"
import {
  compactOriginalUserText,
  shouldTriggerActionWatchdog,
  shouldTriggerPostEditVerification,
  shouldStopPostEditVerificationTurn,
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
})
