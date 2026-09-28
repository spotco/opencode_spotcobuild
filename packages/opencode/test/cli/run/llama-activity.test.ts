import { describe, expect, test } from "bun:test"
import {
  formatLlamaActivity,
  formatLlamaSpeed,
  llamaActivityEndpoint,
  openLlamaPart,
  parseLlamaActivity,
} from "@/cli/cmd/run/llama-activity"
import { createSessionData } from "@/cli/cmd/run/session-data"

const prompt = {
  phase: "prompt" as const,
  phaseMs: 1400,
  generation: 2,
  promptTotal: 98304,
  promptProcessed: 4096,
  promptCached: 2048,
  generated: 0,
  outputTokensPerSecond: 0,
}

describe("llama activity", () => {
  test("uses the selected local provider and strips /v1", () => {
    const endpoint = llamaActivityEndpoint(
      [
        { id: "openai", options: { baseURL: "https://api.openai.com/v1" } },
        { id: "qwen35-local", options: { baseURL: "http://127.0.0.1:8082/v1/" } },
        { id: "qwen36-local", options: { baseURL: "http://127.0.0.1:8095/v1" } },
      ],
      { providerID: "qwen36-local" },
    )

    expect(endpoint).toBe("http://127.0.0.1:8095/spotco/activity")
  })

  test("ignores non-loopback providers", () => {
    expect(llamaActivityEndpoint([{ id: "openai", options: { baseURL: "https://api.openai.com/v1" } }])).toBeUndefined()
  })

  test("formats prefill with elapsed time and token progress", () => {
    const view = formatLlamaActivity({
      activity: prompt,
      fetchedAt: 1_000,
      now: 1_700,
    })

    expect(view?.status).toBe("phase prompt processing · 2.1s · context 4096/98304 · cached 2048")
    expect(view?.speed).toBe("")
  })

  test("labels the open reasoning or output part and keeps the generation average", () => {
    const activity = {
      ...prompt,
      phase: "generating" as const,
      phaseMs: 800,
      generated: 40,
      outputTokensPerSecond: 36.24,
    }

    const reasoning = formatLlamaActivity({
      activity,
      fetchedAt: 5_000,
      now: 5_200,
      part: "reasoning",
    })
    const output = formatLlamaActivity({
      activity,
      fetchedAt: 5_000,
      now: 5_200,
      part: "output",
    })

    expect(reasoning?.status).toBe("phase reasoning · 1.0s · 36.2 tok/s")
    expect(output?.status).toBe("phase output · 1.0s · 36.2 tok/s")
    expect(output?.speed).toBe("36.2 tok/s")
    expect(formatLlamaSpeed(120)).toBe("120 tok/s")
  })

  test("parses the server payload and ignores idle for the live line", () => {
    const parsed = parseLlamaActivity({
      phase: "preparing",
      phase_ms: 250,
      generation: 1,
      prompt_total: 10,
      prompt_processed: 0,
      prompt_cached: 0,
      generated: 0,
      output_tokens_per_second: 0,
    })

    expect(parsed?.phase).toBe("preparing")
    expect(formatLlamaActivity({ activity: parsed!, fetchedAt: 0, now: 0 })?.status).toBe("phase preparing · 250ms")
    expect(parseLlamaActivity({ phase: "nope" })).toBeUndefined()
    expect(
      formatLlamaActivity({
        activity: { ...prompt, phase: "idle" },
        fetchedAt: 0,
      }),
    ).toBeUndefined()
  })

  test("follows the open assistant part", () => {
    const data = createSessionData()
    data.part.set("reason", "reasoning")
    data.part.set("text", "assistant")
    expect(openLlamaPart(data)).toBe("output")
    data.end.add("text")
    expect(openLlamaPart(data)).toBe("reasoning")
  })
})
