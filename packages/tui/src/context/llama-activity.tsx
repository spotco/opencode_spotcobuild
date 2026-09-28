import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import type { Part } from "@opencode-ai/sdk/v2"
import { useLocal } from "./local"
import { useSync } from "./sync"
import {
  fetchLlamaActivity,
  formatLlamaActivity,
  formatLlamaSpeed,
  llamaActivityEndpoint,
  type LlamaActivity,
  type LlamaActivityView,
} from "../util/llama-activity"

const [live, setLive] = createSignal<LlamaActivityView | undefined>()
const [speeds, setSpeeds] = createSignal<Record<string, string>>({})

export function llamaLiveStatus() {
  return live()
}

export function llamaMessageSpeed(messageID: string) {
  return speeds()[messageID]
}

function openPart(parts: readonly Part[]): "reasoning" | "output" | undefined {
  let current: "reasoning" | "output" | undefined
  for (const item of parts) {
    if (item.type === "reasoning" && item.time.end === undefined) current = "reasoning"
    if (item.type === "text" && item.time?.end === undefined) current = "output"
  }
  return current
}

// Polls the local llama-server while this session is busy. The prompt footer
// and the assistant message line both read the shared signals.
export function useLlamaActivityWatch(sessionID: Accessor<string | undefined>) {
  const sync = useSync()
  const local = useLocal()
  const busy = createMemo(() => {
    const id = sessionID()
    if (!id) return false
    const status = sync.data.session_status[id]
    return status !== undefined && status.type !== "idle"
  })

  createEffect(() => {
    const id = sessionID()
    if (!id || !busy()) {
      setLive(undefined)
      return
    }

    const endpoint = llamaActivityEndpoint(sync.data.provider, local.model.current())
    if (!endpoint) return

    let stopped = false
    let fetchedAt = 0
    let snapshot: LlamaActivity | undefined

    const render = () => {
      if (!snapshot) return
      const messages = sync.data.message[id] ?? []
      const assistant = [...messages].reverse().find((item) => item.role === "assistant" && !item.time.completed)
      const part = assistant ? openPart(sync.data.part[assistant.id] ?? []) : undefined
      const view = formatLlamaActivity({
        activity: snapshot,
        fetchedAt,
        part,
      })
      setLive(view)
      const speed = view?.speed || formatLlamaSpeed(snapshot.outputTokensPerSecond)
      if (speed && assistant) {
        setSpeeds((prev) => (prev[assistant.id] === speed ? prev : { ...prev, [assistant.id]: speed }))
      }
    }

    const poll = async () => {
      const next = await fetchLlamaActivity(endpoint)
      if (stopped || !next) return
      snapshot = next
      fetchedAt = Date.now()
      render()
    }

    void poll()
    const timer = setInterval(() => {
      void poll()
      render()
    }, 500)
    onCleanup(() => {
      stopped = true
      clearInterval(timer)
      setLive(undefined)
    })
  })
}
