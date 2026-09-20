import { expect, test } from "bun:test"
import { SessionCompaction } from "@opencode-ai/core/session/compaction"

test("compaction prompt preserves continuation-state sections and working files", () => {
  const prompt = SessionCompaction.buildPrompt({ context: ["conversation history"] })

  expect(prompt).toStartWith(
    "Here is the conversation so far:\n\n<conversation>\nconversation history\n</conversation>",
  )
  expect(prompt.indexOf("</conversation>")).toBeLessThan(prompt.indexOf("Create a new anchored summary"))
  expect(prompt).toContain("conversation history in the <conversation> tags above")
  expect(prompt).toContain("## Goal")
  expect(prompt).toContain("## Durable Constraints & Decisions")
  expect(prompt).toContain("## Active State")
  expect(prompt).toContain("## Next")
  expect(prompt).toContain("## Working Files")
  expect(prompt).not.toContain("### Completed")
  expect(prompt).not.toContain("## Objective")
})

test("compaction prompt gives update instructions for a prior summary", () => {
  const prompt = SessionCompaction.buildPrompt({
    context: ["new conversation"],
    previousSummary: "existing summary",
  })

  expect(prompt.indexOf("<conversation>")).toBeLessThan(prompt.indexOf("<prior-summary>"))
  expect(prompt.indexOf("</prior-summary>")).toBeLessThan(prompt.indexOf("The <prior-summary> summarizes"))
  expect(prompt).toContain(
    "Carry forward durable constraints, user directives, decisions, and parallel workstreams from the <prior-summary>",
  )
  expect(prompt).toContain("Drop finished disposable history that no longer affects future work.")
  expect(prompt).toContain("Do not accrete a Completed section.")
  expect(prompt).toContain("Update Goal and Next to reflect the current work state.")
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
