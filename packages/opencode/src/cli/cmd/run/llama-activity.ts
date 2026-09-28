import type { SessionData } from "./session-data"

export {
  fetchLlamaActivity,
  formatLlamaActivity,
  formatLlamaSpeed,
  llamaActivityEndpoint,
  parseLlamaActivity,
  type LlamaActivity,
  type LlamaActivityView,
} from "@opencode-ai/tui/util/llama-activity"

export function openLlamaPart(data: SessionData): "reasoning" | "output" | undefined {
  let part: "reasoning" | "output" | undefined
  for (const [id, kind] of data.part) {
    if (data.end.has(id) || kind === "user") {
      continue
    }
    part = kind === "reasoning" ? "reasoning" : "output"
  }
  return part
}
