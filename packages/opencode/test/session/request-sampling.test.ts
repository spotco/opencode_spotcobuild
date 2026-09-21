import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLMRequestPrep } from "../../src/session/llm/request"

const plugin = {
  trigger: (_name: string, _input: unknown, output: unknown) => Effect.succeed(output),
  list: () => Effect.succeed([]),
  init: () => Effect.void,
} as any

function model(providerID: string, options: Record<string, unknown>) {
  return {
    id: `${providerID}/model`,
    providerID,
    api: { id: "model", url: "http://localhost/v1", npm: "@ai-sdk/openai-compatible" },
    name: "local test model",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    limit: { context: 65536, output: 8192 },
    cost: { input: 0, output: 0 },
    status: "active",
    options,
    headers: {},
  } as any
}

async function prepare(providerID: string, options: Record<string, unknown>) {
  return Effect.runPromise(
    LLMRequestPrep.prepare({
      user: {
        id: "msg_user-test",
        sessionID: "ses_test",
        role: "user",
        time: { created: Date.now() },
        agent: "build",
        model: { providerID, modelID: "model" },
      } as any,
      sessionID: "ses_test",
      model: model(providerID, options),
      agent: { name: "build", mode: "primary", options: {}, permission: [] } as any,
      system: [],
      messages: [{ role: "user", content: "Hello" }],
      tools: {},
      provider: { id: providerID, options: {} } as any,
      auth: undefined,
      plugin,
      flags: { outputTokenMax: 32000, client: "test" } as any,
      isWorkflow: false,
    }),
  )
}

describe("local sampler request wiring", () => {
  test("promotes local sampler values into the effective request", async () => {
    const result = await prepare("qwen-local", {
      temperature: 0.6,
      top_p: 0.95,
      top_k: 20,
      min_p: 0,
      presence_penalty: 0,
      repetition_penalty: 1,
    })
    expect(result.params.temperature).toBe(0.6)
    expect(result.params.topP).toBe(0.95)
    expect(result.params.topK).toBe(20)
    expect(result.params.presencePenalty).toBe(0)
    expect(result.params.options.min_p).toBe(0)
    expect(result.params.options.repetition_penalty).toBe(1)
  })

  test("does not invent local top-level sampler defaults for cloud-compatible providers", async () => {
    const result = await prepare("cloud-compatible", { temperature: 0.2, top_k: 4, min_p: 0.1 })
    expect(result.params.temperature).toBeUndefined()
    expect(result.params.topP).toBeUndefined()
    expect(result.params.topK).toBeUndefined()
    expect(result.params.options.top_k).toBe(4)
    expect(result.params.options.min_p).toBe(0.1)
  })
})
