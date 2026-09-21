import { Schema } from "effect"
import DESCRIPTION from "./shell.txt"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Global } from "@opencode-ai/core/global"

const PS = new Set(["powershell", "pwsh"])
const CMD = new Set(["cmd"])

export type Limits = {
  maxLines: number
  maxBytes: number
}

export function parameterSchema() {
  return Schema.Struct({
    command: Schema.String.annotate({ description: "The command to execute" }),
    timeout: Schema.optional(PositiveInt).annotate({ description: "Optional timeout in milliseconds" }),
    workdir: Schema.optional(Schema.String).annotate({
      description: `The working directory to run the command in. Defaults to the current directory. Use this instead of 'cd' commands.`,
    }),
  })
}

export const Parameters = parameterSchema()
export type Parameters = Schema.Schema.Type<typeof Parameters>

function renderPrompt(template: string, values: Record<string, string>) {
  return template.replace(/\$\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`Missing shell prompt value: ${key}`)
    return value
  })
}

function shellDisplayName(name: string) {
  if (name === "pwsh") return "PowerShell (7+)"
  if (name === "powershell") return "Windows PowerShell (5.1)"
  if (name === "cmd") return "cmd.exe"
  return name
}

function powershellNotes(name: string) {
  if (name === "pwsh") {
    return `# PowerShell (7+) — NOT bash
- Never bash heredocs (\`<<EOF\`). Use here-strings (\`@'...'@\`) or files. Chain with \`&&\`/\`||\`.
- Quote spaced paths; \`& "path"\` for spaced exes. Prefer cmdlets over aliases.`
  }
  if (name === "powershell") {
    return `# Windows PowerShell (5.1) — NOT bash
- Never bash heredocs (\`<<EOF\`). Use here-strings (\`@'...'@\`) or files.
- Dependent cmds: \`cmd1; if ($?) { cmd2 }\` (no \`&&\` on 5.1). Quote spaced paths; \`& "path"\` for spaced exes.`
  }
  return ""
}

function chainGuidance(name: string) {
  if (name === "powershell") return "Dependent: `cmd1; if ($?) { cmd2 }`."
  if (PS.has(name) || CMD.has(name)) return "Dependent: chain with `&&`."
  return "Dependent: chain with `&&` in one Bash call."
}

function bashCommandSection(chain: string, limits: Limits, defaultTimeoutMs: number) {
  return `Usage: command required; timeout default ${defaultTimeoutMs}ms. Output >${limits.maxLines} lines / ${limits.maxBytes}B truncates to a file — Read/Grep it (no head/tail). Prefer Glob/Grep/Read/Edit/Write over find/grep/cat/sed/echo. Parallel independent cmds in one message. ${chain} Use \`workdir\` not \`cd &&\`.`
}

function powershellCommandSection(
  name: string,
  chain: string,
  pathSep: string,
  limits: Limits,
  defaultTimeoutMs: number,
) {
  return `${powershellNotes(name)}

Usage: command required; timeout default ${defaultTimeoutMs}ms. Output >${limits.maxLines} lines / ${limits.maxBytes}B truncates to a file — Read/Grep (no Select-Object -First/-Last). Prefer Glob/Grep/Read/Edit/Write over Get-ChildItem/Select-String/Get-Content/Set-Content. Parallel independent cmds in one message. ${chain} Use \`workdir\` — no Set-Location/cd. Quote spaced paths (e.g. \`"path with spaces${pathSep}file.txt"\`).`
}

function cmdCommandSection(chain: string, limits: Limits, defaultTimeoutMs: number) {
  return `# cmd.exe — quote spaced paths; %VAR%; \`if exist\`; \`call\` for batch.

Usage: command required; timeout default ${defaultTimeoutMs}ms. Large output truncates to a file — Read/Grep. Prefer Glob/Grep/Read/Edit/Write. Parallel independent cmds. ${chain} Use \`workdir\` not \`cd /d\`.`
}

function profile(name: string, platform: NodeJS.Platform, limits: Limits, defaultTimeoutMs: number) {
  const isPowerShell = PS.has(name)
  const chain = chainGuidance(name)
  if (CMD.has(name)) {
    return {
      intro: `Run ${shellDisplayName(name)}.`,
      workdirSection: "Pass `workdir` instead of changing directory in the command.",
      commandSection: cmdCommandSection(chain, limits, defaultTimeoutMs),
    }
  }
  if (isPowerShell) {
    return {
      intro: `Run ${shellDisplayName(name)}.`,
      workdirSection: "Pass `workdir` instead of changing directory in the command.",
      commandSection: powershellCommandSection(
        name,
        chain,
        platform === "win32" ? "\\" : "/",
        limits,
        defaultTimeoutMs,
      ),
    }
  }
  return {
    intro: "Run bash in a persistent shell session.",
    workdirSection: "Pass `workdir` instead of `cd <dir> && ...`.",
    commandSection: bashCommandSection(chain, limits, defaultTimeoutMs),
  }
}

export function render(name: string, platform: NodeJS.Platform, limits: Limits, defaultTimeoutMs: number) {
  const selected = profile(name, platform, limits, defaultTimeoutMs)
  return {
    description: renderPrompt(DESCRIPTION, {
      intro: selected.intro,
      os: platform,
      shell: name,
      tmp: Global.Path.tmp,
      workdirSection: selected.workdirSection,
      commandSection: selected.commandSection,
    }),
    parameters: parameterSchema(),
  }
}

export * as ShellPrompt from "./prompt"
