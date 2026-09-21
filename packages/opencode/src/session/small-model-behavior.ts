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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isInspectionToolName(toolName: string) {
  const name = toolName.toLowerCase()
  return [
    "read",
    "read_file",
    "cat",
    "grep",
    "glob",
    "find",
    "ls",
    "dir",
    "list",
    "get_page",
    "get_pages",
    "snapshot",
    "inspect",
    "search",
    "stat",
    "status",
    "diff",
    "log",
    "pwd",
  ].some((marker) => name === marker || name.endsWith(`_${marker}`) || name.includes(`_${marker}_`))
}

function isShellProgressCommand(toolInput: unknown) {
  if (!isRecord(toolInput) || typeof toolInput.command !== "string") return false
  const command = toolInput.command
  if (/\b(cat|type|get-content|rg|grep|find|ls|dir|pwd|git\s+(status|diff|log|show))\b/i.test(command)) return false
  return /\b(test|check|verify|build|compile|write|edit|patch|apply|touch|mkdir|mv|cp|rm|set-content|add-content)\b/i.test(
    command,
  )
}

export function isMcpToolName(toolName: string) {
  const name = toolName.toLowerCase()
  return name.includes("__") || name.startsWith("mcp") || name.includes("brave-devtools")
}

export function isProgressAction(toolName: string, toolInput?: unknown) {
  const name = toolName.toLowerCase()
  if (name === "edit" || name === "write" || name === "write_file" || name.includes("apply_patch")) return true
  if (
    name === "bash" ||
    name === "shell" ||
    name === "powershell" ||
    name === "pwsh" ||
    name === "cmd" ||
    name === "terminal"
  ) {
    return isShellProgressCommand(toolInput)
  }
  if (isMcpToolName(name)) return !isInspectionToolName(name)
  return false
}

export function codeModeMcpToolNames(metadata: unknown) {
  return codeModeMcpToolCalls(metadata)
    .filter((call) => call.status === "completed")
    .map((call) => call.tool)
}

export function codeModeMcpToolCalls(metadata: unknown) {
  if (!isRecord(metadata) || !Array.isArray(metadata.toolCalls)) return []
  return metadata.toolCalls.flatMap((call) => {
    if (!isRecord(call) || typeof call.tool !== "string") return []
    const status = call.status
    if (status !== "running" && status !== "completed" && status !== "error") return []
    return [{ tool: call.tool, status, input: call.input }]
  })
}

export function compactVerificationDiff(text: string, max = 16_000) {
  const normalized = text.trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}\n[current diff truncated]`
}

export function verificationMessageWindow<T extends { info: { id: string } }>(
  messages: readonly T[],
  startMessageID: string | undefined,
) {
  if (!startMessageID) return undefined
  const start = messages.findIndex((message) => message.info.id === startMessageID)
  return start < 0 ? undefined : messages.slice(start)
}
