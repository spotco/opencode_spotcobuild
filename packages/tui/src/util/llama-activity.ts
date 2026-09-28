// Live llama.cpp phase shared by the main TUI and the direct-mode footer.
//
// SpotcoBuild llama-server prints "──── OUTPUT ────" when a request is
// accepted, then spends a long time in prompt prefill before the first token.
// GET /spotco/activity stays readable during that decode.

import { duration } from "./locale"

export type LlamaActivityPhase = "idle" | "preparing" | "prompt" | "generating"

export type LlamaActivity = {
  phase: LlamaActivityPhase
  phaseMs: number
  generation: number
  promptTotal: number
  promptProcessed: number
  promptCached: number
  generated: number
  outputTokensPerSecond: number
}

export type LlamaActivityView = {
  live: boolean
  status: string
  speed: string
}

export type LlamaActivityProvider = {
  id?: string
  options?: {
    baseURL?: unknown
  }
}

export type LlamaActivityModel = {
  providerID?: string
}

const PHASES = new Set<LlamaActivityPhase>(["idle", "preparing", "prompt", "generating"])

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function loopbackBase(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return
  }

  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    return
  }

  const path = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")
  const port = url.port ? `:${url.port}` : ""
  return `${url.protocol}//${url.hostname}${port}${path}`
}

export function llamaActivityEndpoint(
  providers: readonly LlamaActivityProvider[] | undefined,
  model?: LlamaActivityModel,
): string | undefined {
  if (!providers || providers.length === 0) {
    return
  }

  const ordered = model?.providerID
    ? [
        ...providers.filter((item) => item.id === model.providerID),
        ...providers.filter((item) => item.id !== model.providerID),
      ]
    : [...providers]

  for (const provider of ordered) {
    const base = provider.options?.baseURL
    if (typeof base !== "string" || base.length === 0) {
      continue
    }
    const root = loopbackBase(base)
    if (root) {
      return `${root}/spotco/activity`
    }
  }

  return
}

export function parseLlamaActivity(value: unknown): LlamaActivity | undefined {
  if (!value || typeof value !== "object") {
    return
  }

  const body = value as Record<string, unknown>
  const phase = body.phase
  if (typeof phase !== "string" || !PHASES.has(phase as LlamaActivityPhase)) {
    return
  }

  return {
    phase: phase as LlamaActivityPhase,
    phaseMs: Math.max(0, numberField(body.phase_ms)),
    generation: numberField(body.generation),
    promptTotal: Math.max(0, Math.floor(numberField(body.prompt_total))),
    promptProcessed: Math.max(0, Math.floor(numberField(body.prompt_processed))),
    promptCached: Math.max(0, Math.floor(numberField(body.prompt_cached))),
    generated: Math.max(0, Math.floor(numberField(body.generated))),
    outputTokensPerSecond: Math.max(0, numberField(body.output_tokens_per_second)),
  }
}

export async function fetchLlamaActivity(url: string): Promise<LlamaActivity | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(400) })
    if (!response.ok) {
      return
    }
    return parseLlamaActivity(await response.json())
  } catch {
    return
  }
}

export function formatLlamaSpeed(tokensPerSecond: number): string {
  if (!(tokensPerSecond > 0)) {
    return ""
  }
  return `${tokensPerSecond.toFixed(tokensPerSecond >= 100 ? 0 : 1)} tok/s`
}

export function formatLlamaActivity(input: {
  activity: LlamaActivity
  fetchedAt: number
  now?: number
  part?: "reasoning" | "output"
}): LlamaActivityView | undefined {
  const activity = input.activity
  if (activity.phase === "idle") {
    return
  }

  const now = input.now ?? Date.now()
  const elapsed = Math.max(0, activity.phaseMs + Math.max(0, now - input.fetchedAt))
  const label =
    activity.phase === "preparing"
      ? "phase preparing"
      : activity.phase === "prompt"
        ? "phase prompt processing"
        : input.part === "reasoning"
          ? "phase reasoning"
          : input.part === "output"
            ? "phase output"
            : "phase generating"

  let status = `${label} · ${duration(elapsed)}`
  if (activity.phase === "prompt" && activity.promptTotal > 0) {
    status += ` · context ${activity.promptProcessed}/${activity.promptTotal}`
    if (activity.promptCached > 0) {
      status += ` · cached ${activity.promptCached}`
    }
  }

  const speed = activity.phase === "generating" ? formatLlamaSpeed(activity.outputTokensPerSecond) : ""
  if (speed) {
    status += ` · ${speed}`
  }

  return {
    live: true,
    status,
    speed,
  }
}
