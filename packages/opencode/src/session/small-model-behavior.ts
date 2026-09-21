export const ACTION_WATCHDOG_MARKER = "[SpotcoBuild action watchdog]"
export const VERIFICATION_MARKER = "[SpotcoBuild post-edit verification]"

export type ActionWatchdogDecisionInput = {
  enabled: boolean
  finish: string | undefined
  hasAction: boolean
  forcedContinuations: number
  maxForcedContinuations: number
  hasError: boolean
  aborted: boolean
}

export function shouldTriggerActionWatchdog(input: ActionWatchdogDecisionInput) {
  return (
    input.enabled &&
    input.finish === "length" &&
    !input.hasAction &&
    !input.hasError &&
    !input.aborted &&
    input.forcedContinuations < input.maxForcedContinuations
  )
}

export type VerificationDecisionInput = {
  enabled: boolean
  filesChanged: boolean
  triggered: boolean
  passes: number
  maxPasses: number
  hasError: boolean
  aborted: boolean
}

export function shouldTriggerPostEditVerification(input: VerificationDecisionInput) {
  return (
    input.enabled &&
    input.filesChanged &&
    !input.triggered &&
    input.passes < input.maxPasses &&
    !input.hasError &&
    !input.aborted
  )
}

export function shouldStopPostEditVerificationTurn(input: {
  finish: string | undefined
  turns: number
  maxTurns: number
}) {
  return input.finish === "tool-calls" && input.turns >= input.maxTurns
}

export function compactOriginalUserText(text: string, max = 12_000) {
  const normalized = text.trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}\n[original request truncated]`
}
