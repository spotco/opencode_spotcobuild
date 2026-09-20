import { expect, test } from "bun:test"
import { SessionCompaction } from "@opencode-ai/core/session/compaction"

test("compaction prompt defaults to upstream summary style sections", () => {
  const prompt = SessionCompaction.buildPrompt({ context: ["conversation history"] })

  expect(prompt).toStartWith(
    "Here is the conversation so far:\n\n<conversation>\nconversation history\n</conversation>",
  )
  expect(prompt.indexOf("</conversation>")).toBeLessThan(prompt.indexOf("Create a new anchored summary"))
  expect(prompt).toContain("conversation history in the <conversation> tags above")
  expect(prompt).toContain("## Objective")
  expect(prompt).toContain("## Important Details")
  expect(prompt).toContain("### Completed")
  expect(prompt).toContain("### Active")
  expect(prompt).toContain("### Blocked")
  expect(prompt).toContain("## Next Move")
  expect(prompt).toContain("## Relevant Files")
  expect(prompt).not.toContain("## Goal")
  expect(prompt).not.toContain("## Working Files")
})

test("compaction prompt continuation style uses goal/durable sections", () => {
  const prompt = SessionCompaction.buildPrompt({
    context: ["conversation history"],
    checkpointStyle: "continuation",
  })

  expect(prompt).toContain("## Goal")
  expect(prompt).toContain("## Durable Constraints & Decisions")
  expect(prompt).toContain("## Active State")
  expect(prompt).toContain("## Next")
  expect(prompt).toContain("## Working Files")
  expect(prompt).not.toContain("### Completed")
  expect(prompt).not.toContain("## Objective")
})

test("compaction prompt gives update instructions for a prior summary (default style)", () => {
  const prompt = SessionCompaction.buildPrompt({
    context: ["new conversation"],
    previousSummary: "existing summary",
  })

  expect(prompt.indexOf("<conversation>")).toBeLessThan(prompt.indexOf("<prior-summary>"))
  expect(prompt.indexOf("</prior-summary>")).toBeLessThan(prompt.indexOf("The <prior-summary> summarizes"))
  expect(prompt).toContain(
    "Carry forward objectives, constraints, user directives, decisions, and parallel workstreams from the <prior-summary>",
  )
  expect(prompt).toContain('Update "Objective" and "Next Move" to reflect the current work state.')
  expect(prompt).toContain("## Objective")
})

test("compaction prompt gives continuation update instructions for prior summary", () => {
  const prompt = SessionCompaction.buildPrompt({
    context: ["new conversation"],
    previousSummary: "existing summary",
    checkpointStyle: "continuation",
  })

  expect(prompt).toContain(
    "Carry forward durable constraints, user directives, decisions, and parallel workstreams from the <prior-summary>",
  )
  expect(prompt).toContain("Drop finished disposable history that no longer affects future work.")
  expect(prompt).toContain("Do not accrete a Completed section.")
  expect(prompt).toContain("Update Goal and Next to reflect the current work state.")
  expect(prompt).toContain("## Goal")
})

test("summary_max_tokens default constant remains 4096", () => {
  expect(SessionCompaction.DEFAULT_SUMMARY_MAX_TOKENS).toBe(4096)
  // Default style must remain "summary" when unset.
  expect(SessionCompaction.buildPrompt({ context: ["x"] })).toContain("## Objective")
  expect(SessionCompaction.buildPrompt({ context: ["x"] })).not.toContain("## Goal")
})

test("compaction describes tool media without embedding base64", () => {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
  const serialized = SessionCompaction.serializeToolContent([
    { type: "text", text: "Image read successfully" },
    {
      type: "file",
      uri: `data:image/png;base64,${base64}`,
      mime: "image/png",
      name: "pixel.png",
    },
  ])

  expect(serialized).toBe("Image read successfully\n[Attached image/png: pixel.png]")
  expect(serialized).not.toContain(base64)
})
