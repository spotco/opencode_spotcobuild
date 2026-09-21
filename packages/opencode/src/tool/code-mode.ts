import * as Tool from "./tool"
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { Cause, Effect, Schema } from "effect"
import { CodeMode, Tool as SandboxTool, toolError } from "@opencode-ai/codemode"
import { MCP } from "@/mcp"
import { McpCatalog } from "@/mcp/catalog"
import { Agent } from "@/agent/agent"
import { Session } from "@/session/session"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Config } from "@/config/config"

export const CODE_MODE_TOOL = "execute"

/** Default estimated-token budget for Code Mode MCP catalog inlining when unset. */
export const DEFAULT_CATALOG_BUDGET = 2000

const DESCRIPTION = "Run a confined orchestration script with access to connected MCP tools."

export const Parameters = Schema.Struct({
  code: Schema.String.annotate({
    description: "Script body executed by the confined interpreter.",
  }),
})

type CallEntry = { tool: string; status: "running" | "completed" | "error"; input?: Record<string, unknown> }

type Metadata = {
  toolCalls: CallEntry[]
  error?: boolean
}

type Attachment = NonNullable<Tool.ExecuteResult["attachments"]>[number]

type CatalogEntry = {
  path: string
  key: string
  server: string
  local: string
  tool: MCP.McpTool
}

function groupByServer(mcpTools: Record<string, MCP.McpTool>, servers: readonly string[]): Map<string, CatalogEntry[]> {
  const byLongest = [...servers].sort((a, b) => b.length - a.length)
  const groups = new Map<string, CatalogEntry[]>()
  for (const key of Object.keys(mcpTools).sort((a, b) => a.localeCompare(b))) {
    const server =
      byLongest.find((name) => key.startsWith(name + "_")) ?? (key.includes("_") ? key.slice(0, key.indexOf("_")) : key)
    const local = server && key.startsWith(server + "_") ? key.slice(server.length + 1) : key
    const entry: CatalogEntry = {
      path: `${server}.${local}`,
      key,
      server,
      local,
      tool: mcpTools[key]!,
    }
    groups.set(server, [...(groups.get(server) ?? []), entry])
  }
  return groups
}

export function describeCatalog(
  mcpTools: Record<string, MCP.McpTool>,
  servers: readonly string[],
  catalogBudget?: number,
): string {
  return CodeMode.make({
    tools: toolTree(
      [...groupByServer(mcpTools, servers).values()].flat(),
      () => () => Effect.fail(toolError("Tool preview is not executable.")),
    ),
    discovery: { catalogBudget: catalogBudget ?? DEFAULT_CATALOG_BUDGET },
  }).instructions()
}

const lastSegment = (uri: string) => {
  const trimmed = uri.split(/[?#]/, 1)[0]!.replace(/\/+$/, "")
  const segment = trimmed.slice(trimmed.lastIndexOf("/") + 1)
  return segment.length > 0 ? segment : undefined
}

const dataUrl = (mime: string, base64: string) => `data:${mime};base64,${base64}`

class McpValidationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "McpValidationError"
  }
}

const isMcpValidationMessage = (message: string) =>
  /(?:invalid\s+(?:argument|input|parameter)|validation\s+(?:error|failed)|schema\s+(?:error|validation)|missing\s+required(?:\s+(?:argument|input|parameter|field|property))?|unknown\s+(?:field|property|argument|parameter)|additional\s+propert|unsupported\s+(?:field|argument|parameter)|expected\s+.+\s+(?:got|received))/i.test(
    message,
  )

const normalizeInvocationArgs = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(normalizeInvocationArgs).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${normalizeInvocationArgs((value as Record<string, unknown>)[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? String(value)
}

const labelMcpValue = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return { kind: "array", items: value, count: value.length }
  if (value !== null && typeof value === "object") return { kind: "json", value }
  if (value === null || value === undefined) return { kind: "null", value: null }
  return { kind: "scalar", value }
}

function projectMcpResult(
  result: CallToolResult,
  collect: (attachment: Attachment) => void,
  preserveStructured: boolean,
): unknown {
  const text: string[] = []
  let files = 0
  let images = 0
  const push = (attachment: Attachment) => {
    files += 1
    if (attachment.mime.startsWith("image/")) images += 1
    collect(attachment)
  }
  for (const block of result.content) {
    switch (block.type) {
      case "text":
        text.push(block.text)
        break
      case "image":
      case "audio":
        push({ type: "file", mime: block.mimeType, url: dataUrl(block.mimeType, block.data) })
        break
      case "resource": {
        if ("text" in block.resource) {
          text.push(block.resource.text)
          break
        }
        const mime = block.resource.mimeType ?? "application/octet-stream"
        push({ type: "file", mime, url: dataUrl(mime, block.resource.blob), filename: lastSegment(block.resource.uri) })
        break
      }
      case "resource_link":
        // A link is a reference, not fetchable media; hand it to the program instead of the attachment channel.
        text.push(`${block.name}: ${block.uri}`)
        break
    }
  }

  if (result.structuredContent !== undefined && preserveStructured) return result.structuredContent
  if (result.structuredContent !== undefined) return labelMcpValue(result.structuredContent)
  if (text.length > 0) {
    const value = text.join("\n")
    return { kind: "text", text: value, length: value.length }
  }
  if (files > 0) {
    const noun = files === images ? "image" : "file"
    return {
      kind: "files",
      count: files,
      images,
      text: `[${files} ${noun}${files === 1 ? "" : "s"} attached to the result]`,
    }
  }
  return { kind: "null", value: null }
}

type Run = (input: unknown) => Effect.Effect<unknown, unknown>

function toolTree(catalog: readonly CatalogEntry[], run: (entry: CatalogEntry) => Run) {
  const tree: Record<string, Record<string, SandboxTool.Definition>> = {}
  for (const entry of catalog) {
    const namespace = (tree[entry.server] ??= {})
    namespace[entry.local] = SandboxTool.make({
      description: entry.tool.def.description ?? "",
      input: entry.tool.def.inputSchema as SandboxTool.JsonSchema,
      output: entry.tool.def.outputSchema as SandboxTool.JsonSchema | undefined,
      run: run(entry),
    })
  }
  return tree
}

const invokeChildTool = Effect.fn("CodeMode.invokeChildTool")(function* (input: {
  plugin: Plugin.Interface
  entry: CatalogEntry
  args: Record<string, unknown>
  callID: string
  ctx: Tool.Context
}) {
  yield* input.plugin.trigger(
    "tool.execute.before",
    { tool: input.entry.key, sessionID: input.ctx.sessionID, callID: input.callID },
    { args: input.args },
  )
  const result: CallToolResult = yield* Effect.gen(function* () {
    yield* input.ctx.ask({ permission: input.entry.key, metadata: {}, patterns: ["*"], always: ["*"] })
    // Deliberately mirrors McpCatalog.convertTool's transport call so the MCP service stays free of tool-loop concerns.
    return yield* Effect.promise(async () => {
      let raw: CallToolResult
      try {
        raw = await input.entry.tool.client.callTool(
          { name: input.entry.tool.def.name, arguments: input.args },
          CallToolResultSchema,
          {
            resetTimeoutOnProgress: true,
            signal: input.ctx.abort,
            timeout: input.entry.tool.timeout,
            // The MCP SDK only sends a progress token when this hook is present, enabling timeout resets.
            onprogress: () => {},
          },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw isMcpValidationMessage(message) ? new McpValidationError(message, error) : error
      }
      if (raw.isError) {
        const message =
          raw.content
            .flatMap((item) => (item.type === "text" ? [item.text] : []))
            .filter((text) => text.trim())
            .join("\n\n") || "MCP tool returned an error"
        throw isMcpValidationMessage(message) ? new McpValidationError(message) : new Error(message)
      }
      return raw
    })
  }).pipe(
    Effect.withSpan("Tool.execute", {
      attributes: {
        "tool.name": input.entry.key,
        "tool.call_id": input.callID,
        "session.id": input.ctx.sessionID,
        "message.id": input.ctx.messageID,
      },
    }),
  )
  yield* input.plugin.trigger(
    "tool.execute.after",
    { tool: input.entry.key, sessionID: input.ctx.sessionID, callID: input.callID, args: input.args },
    result,
  )
  return result
})

export const CodeModeTool = Tool.define(
  CODE_MODE_TOOL,
  Effect.gen(function* () {
    const mcp = yield* MCP.Service
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const plugin = yield* Plugin.Service
    const config = yield* Config.Service

    const init: Tool.DefWithoutID<typeof Parameters, Metadata> = {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: Effect.fn("CodeMode.execute")(function* (params, ctx) {
        if (ctx.abort.aborted) {
          return {
            title: CODE_MODE_TOOL,
            metadata: { toolCalls: [], error: true },
            output: "Execution cancelled.",
          } satisfies Tool.ExecuteResult<Metadata>
        }
        const agent = yield* agents.get(ctx.agent)
        const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
        const ruleset = Permission.merge(agent.permission, session.permission ?? [])
        const mcpTools = Permission.visibleTools(yield* mcp.tools(), ruleset)
        const servers = Object.keys(yield* mcp.clients()).map(McpCatalog.sanitize)
        const catalog = [...groupByServer(mcpTools, servers).values()].flat()
        const cfg = yield* config.get()
        const catalogBudget = cfg.experimental?.codemode?.catalog_budget ?? DEFAULT_CATALOG_BUDGET

        const calls: CallEntry[] = []
        const attachments: Attachment[] = []
        const recentValidationErrors = new Map<string, { message: string; at: number }>()
        const publish = () =>
          ctx.metadata({ title: CODE_MODE_TOOL, metadata: { toolCalls: calls.map((c) => ({ ...c })) } })

        const liveSignature = (entry: CatalogEntry) => {
          const preview = CodeMode.make({
            tools: toolTree([entry], () => () => Effect.fail(toolError("Tool preview is not executable."))),
          })
          return preview.catalog().find((item) => item.path === entry.path)?.signature ?? entry.path
        }

        let childCalls = 0
        const callTool = (entry: CatalogEntry) => (input: unknown) =>
          Effect.gen(function* () {
            childCalls += 1
            const args = (input ?? {}) as Record<string, unknown>
            const retryKey = `${entry.key}\u0000${normalizeInvocationArgs(args)}`
            const previous = recentValidationErrors.get(retryKey)
            if (previous !== undefined && Date.now() - previous.at < 60_000) {
              return yield* Effect.fail(
                toolError(
                  `Identical invalid invocation blocked for ${entry.path}. Read the previous validation error, use tools.$codemode.search for the live signature, and change the arguments before retrying. Previous validation: ${previous.message}`,
                ),
              )
            }
            if (previous !== undefined) recentValidationErrors.delete(retryKey)
            const result = yield* invokeChildTool({
              plugin,
              entry,
              args,
              callID: `${ctx.callID ?? entry.key}/${childCalls}`,
              ctx,
            }).pipe(
              Effect.catchCause((cause) => {
                const error = Cause.squash(cause)
                if (error instanceof McpValidationError) {
                  const message = `${error.message}\nLive signature: ${liveSignature(entry)}`
                  recentValidationErrors.set(retryKey, { message, at: Date.now() })
                  return Effect.fail(toolError(message, error))
                }
                return Effect.fail(error)
              }),
            )
            return projectMcpResult(
              result,
              (attachment: Attachment) => void attachments.push(attachment),
              entry.tool.def.outputSchema !== undefined,
            )
          }).pipe(
            Effect.catchCause((cause) => {
              if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt
              const error = Cause.squash(cause)
              return Effect.fail(toolError(error instanceof Error ? error.message : String(error), error))
            }),
          )

        const runtime = CodeMode.make({
          tools: toolTree(catalog, callTool),
          discovery: { catalogBudget },
          onToolCallStart: ({ index, name, input }) =>
            Effect.suspend(() => {
              const shown = (() => {
                if (input === null || input === undefined) return
                if (typeof input === "object" && !Array.isArray(input)) {
                  const value = input as Record<string, unknown>
                  return Object.keys(value).length > 0 ? value : undefined
                }
                return { input }
              })()
              calls[index] = { tool: name, status: "running", ...(shown ? { input: shown } : {}) }
              return publish()
            }),
          onToolCallEnd: ({ index, outcome }) =>
            Effect.suspend(() => {
              const current = calls[index]
              if (current) calls[index] = { ...current, status: outcome === "success" ? "completed" : "error" }
              return publish()
            }),
        })

        const abort = Effect.callback<void>((resume) => {
          if (ctx.abort.aborted) return resume(Effect.void)
          const handler = () => resume(Effect.void)
          ctx.abort.addEventListener("abort", handler, { once: true })
          return Effect.sync(() => ctx.abort.removeEventListener("abort", handler))
        })
        const cancelled = (): CodeMode.Result => ({
          ok: false,
          error: { kind: "ExecutionFailure", message: "Execution cancelled." },
          toolCalls: calls.map((call) => ({ name: call.tool })),
        })

        const result = yield* Effect.raceFirst(runtime.execute(params.code), abort.pipe(Effect.map(cancelled)))
        const logs = result.logs ?? []
        const withLogs = (text: string) => {
          if (logs.length === 0) return text
          return text.length > 0 ? `${text}\n\nLogs:\n${logs.join("\n")}` : `Logs:\n${logs.join("\n")}`
        }

        if (!result.ok) {
          if (ctx.abort.aborted) {
            return {
              title: CODE_MODE_TOOL,
              metadata: { toolCalls: calls, error: true },
              output: "Execution cancelled.",
            } satisfies Tool.ExecuteResult<Metadata>
          }
          const hints = (result.error.suggestions ?? []).filter((hint) => !result.error.message.includes(hint))
          return yield* Effect.fail(new Error(withLogs([result.error.message, ...hints].join("\n"))))
        }

        // The interpreter validates returned values as plain JSON, so stringify cannot throw;
        // it yields undefined only for a program that returns undefined.
        const output =
          typeof result.value === "string"
            ? result.value
            : (JSON.stringify(result.value, null, 2) ?? String(result.value))

        return {
          title: CODE_MODE_TOOL,
          metadata: { toolCalls: calls },
          output: withLogs(output),
          ...(attachments.length > 0 ? { attachments } : {}),
        } satisfies Tool.ExecuteResult<Metadata>
      }, Effect.orDie),
    }
    return init
  }),
)
