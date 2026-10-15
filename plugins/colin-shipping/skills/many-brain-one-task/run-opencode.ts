#!/usr/bin/env bun
/**
 * run-opencode.ts — one reusable entry point for every opencode invocation
 * from the `many-brain-one-task` skill.
 *
 * Consolidates the opencode-run rules that SKILL.md used to reiterate
 * per-call (file over argv, `--` separator, `--dir .` in attach mode,
 * `--format json` + event extraction, `--dangerously-skip-permissions`
 * for local spawns). Callers just pass the knobs that differ.
 *
 * Usage (invoked inline from the Claude Code Bash tool — never via a
 * `bash wrapper.sh` form, which the sandbox rejects):
 *
 *   bun "${CLAUDE_SKILL_DIR}/run-opencode.ts" \
 *     --model opencode/gemini-3.1-pro \
 *     --title "ultra-review !2514 contracts/Gemini-3.1-Pro" \
 *     --file .tmp/ultra-review-2514/prompts/contracts.full.md \
 *     --attach http://example.test:4095 \
 *     --out .tmp/ultra-review-2514/results/contracts-gemini.out \
 *     -- "Perform the code review exactly as instructed."
 *
 * Required: --model, --file, trailing `--`, and a short message (positional).
 * Optional: --no-session-fallback disables occtl last salvage (empty JSON and timeouts).
 * See SKILL.md "How to run" for the full option list and the why.
 */

import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"

interface Values {
  model?: string
  variant?: string
  title?: string
  file?: string[]
  attach?: string
  password?: string
  dir?: string
  out?: string
  stderr?: string
  format?: string
  thinking?: boolean
  agent?: string
  "timeout-ms"?: string
  "no-session-fallback"?: boolean
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    model: { type: "string" },
    variant: { type: "string" },
    title: { type: "string" },
    file: { type: "string", multiple: true, short: "f" },
    attach: { type: "string" },
    password: { type: "string", short: "p" },
    dir: { type: "string" },
    out: { type: "string" },
    stderr: { type: "string" },
    format: { type: "string", default: "json" },
    thinking: { type: "boolean", default: false },
    agent: { type: "string" },
    "timeout-ms": { type: "string", default: "0" },
    "no-session-fallback": { type: "boolean", default: false },
  },
}) as { values: Values; positionals: string[] }

function die(msg: string, code = 2): never {
  console.error(`run-opencode: ${msg}`)
  process.exit(code)
}

if (!values.model) die("--model is required (e.g. opencode/gemini-3.1-pro)")
if (!values.file || values.file.length === 0) die("--file is required (prompt file path)")
if (values.format !== "default" && values.format !== "json") die(`--format must be "default" or "json" (got ${JSON.stringify(values.format)})`)
const timeoutMs = Number(values["timeout-ms"] ?? "0")
if (!Number.isFinite(timeoutMs) || timeoutMs < 0) die(`--timeout-ms must be a non-negative number (got ${JSON.stringify(values["timeout-ms"])})`)

// Guard: flags must never appear as positionals after `--` (common mbot-run footgun).
const flagLike = positionals.filter((p) => p.startsWith("--"))
if (flagLike.length) {
  die(
    `flag-like positionals after --: ${flagLike.join(" ")}. ` +
      `Put --variant/--title/--attach/--timeout-ms BEFORE --, not after.`,
  )
}

const message = positionals.join(" ").trim() || "Follow the attached file's instructions exactly."

const args: string[] = ["run", "--model", values.model]
if (values.variant) args.push("--variant", values.variant)
if (values.agent) args.push("--agent", values.agent)
if (values.title) args.push("--title", values.title)
for (const f of values.file) args.push("--file", f)

if (values.attach) {
  // Attach mode needs an absolute directory. Relative paths can resolve on the
  // attached server side (for example as /home/colin) instead of the caller's
  // project/worktree, which makes agents load the wrong context.
  let attach = values.attach.trim()
  if (attach && !attach.startsWith("http://") && !attach.startsWith("https://")) {
    attach = `http://${attach}`
  }
  args.push("--attach", attach.replace(/\/$/, ""))
  args.push("--dir", values.dir ? resolve(values.dir) : process.cwd())
  if (values.password) args.push("--password", values.password)
} else {
  // Local spawn: auto-approve tool prompts so the run is fully headless.
  args.push("--dangerously-skip-permissions")
  if (values.dir) args.push("--dir", values.dir)
}

if (values.thinking) args.push("--thinking")
args.push("--format", values.format)
args.push("--", message)

// opencode is a Bun-compiled binary. Bun's runtime mkdir's its XDG state
// dir (default ~/.local/state) on startup and fails with EROFS when the
// Claude Code sandbox doesn't expose that path as writable — observed in
// Seamus, where ~/.local/state IS in settings.json allowWrite but bwrap
// still refuses the mkdir. Redirect to a /tmp path the sandbox always
// allows; callers who need the real state (non-sandboxed hosts) can
// override by exporting XDG_STATE_HOME themselves.
const spawnEnv = { ...process.env }
if (!spawnEnv.XDG_STATE_HOME) {
  spawnEnv.XDG_STATE_HOME = "/tmp/opencode-state"
  mkdirSync(spawnEnv.XDG_STATE_HOME, { recursive: true })
}

function occtlEnv(): NodeJS.ProcessEnv {
  const env = { ...spawnEnv }
  if (!env.NODE_USE_ENV_PROXY) env.NODE_USE_ENV_PROXY = "1"
  if (values.password && !env.OPENCODE_SERVER_PASSWORD) {
    env.OPENCODE_SERVER_PASSWORD = values.password
  }
  const attach = values.attach
  if (attach) {
    try {
      const raw = attach.startsWith("http") ? attach : `http://${attach}`
      const u = new URL(raw)
      if (!env.OPENCODE_SERVER_HOST) env.OPENCODE_SERVER_HOST = u.hostname
      if (!env.OPENCODE_SERVER_PORT) env.OPENCODE_SERVER_PORT = u.port || "4096"
    } catch {
      /* keep existing env */
    }
  }
  return env
}

function abortSessions(sessionIds: string[]): void {
  const env = occtlEnv()
  for (const sessionId of sessionIds) {
    const occtlArgs = ["abort", sessionId]
    spawnSync("occtl", occtlArgs, { encoding: "utf8", env, timeout: 15_000 })
  }
}

function fetchSessionText(sessionIds: string[]): string {
  const env = occtlEnv()
  for (const sessionId of sessionIds) {
    const occtlArgs = ["last", sessionId, "--role", "assistant", "--text-only"]

    const res = spawnSync("occtl", occtlArgs, {
      encoding: "utf8",
      env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 20_000,
    })

    const text = res.stdout.trim()
    if (res.status === 0 && text && text !== "No messages in session.") {
      return text
    }
  }
  return ""
}

const child = spawn("opencode", args, { stdio: ["ignore", "pipe", "pipe"], env: spawnEnv })
let stdoutBuf = ""
let stderrBuf = ""
let timedOut = false
let closed = false
let persisted = false
let persistedExitCode: number | undefined
child.stdout.on("data", (b: Buffer) => { stdoutBuf += b.toString() })
child.stderr.on("data", (b: Buffer) => { stderrBuf += b.toString() })
child.on("error", (err) => die(`failed to spawn opencode: ${err.message}`, 127))

function writeTo(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

/** True when content looks like a full review body, not a short status stub. */
function isRichBody(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/\bVERDICT\s*:/i.test(t)) return true
  if (/<<<\s*(ISSUE|VERDICT|END)\s*>>>/i.test(t)) return true
  // Multiple markdown section headers imply structured multi-finding output.
  if ((t.match(/^#{1,3}\s+\S/gm) || []).length >= 3) return true
  return t.length >= 2048
}

/** True when harness text looks like a thin status / clobber risk. */
function isThinBody(text: string, existing: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (isRichBody(t)) return false
  if (t.length < 500) return true
  if (existing.length > 0 && t.length < existing.length / 4) return true
  return false
}

/**
 * Prefer an existing agent-written rich body over a thin final-assistant
 * message. Models that Write the full review to --out then emit a short
 * status (observed with GPT-5.6-Sol) would otherwise lose the review when
 * the harness overwrites --out. Keep the rich file; park the stub.
 */
function writeOutPreferRich(path: string, harnessText: string, stderrNotes: string[]): string {
  let existing = ""
  if (existsSync(path)) {
    try {
      existing = readFileSync(path, "utf8")
    } catch {
      existing = ""
    }
  }
  if (isRichBody(existing) && isThinBody(harnessText, existing)) {
    writeTo(`${path}.final-message`, harnessText)
    stderrNotes.push(
      `run-opencode: kept existing rich body at ${path} (${existing.length} bytes); ` +
        `harness final message was thin (${harnessText.trim().length} bytes) and was written to ${path}.final-message. ` +
        `Prefer harness-owned prompts that emit the full review as the final assistant message.`,
    )
    return existing
  }
  writeTo(path, harnessText)
  return harnessText
}

function persist(exitCode: number, note?: string): void {
  if (persisted) return
  persisted = true

  let output = stdoutBuf
  const sessionIds = new Set<string>()
  if (values.format === "json") {
    // `--format json` emits newline-delimited events; concatenate every
    // text part into a single blob. Non-JSON lines (banner, progress) are
    // dropped silently.
    const parts: string[] = []
    for (const line of stdoutBuf.split("\n")) {
      const t = line.trim()
      if (!t) continue
      try {
        const ev = JSON.parse(t)
        if (typeof ev?.sessionID === "string") sessionIds.add(ev.sessionID)
        if (typeof ev?.part?.sessionID === "string") sessionIds.add(ev.part.sessionID)
        if (ev?.type === "text" && typeof ev.part?.text === "string") {
          parts.push(ev.part.text)
        }
      } catch { /* ignore non-JSON framing */ }
    }
    output = parts.join("")
  }

  let stderrOutput = stderrBuf
  const sessionIdList = Array.from(sessionIds)
  if (timedOut && exitCode === 124) {
    stderrOutput += `${stderrOutput ? "\n\n" : ""}run-opencode: opencode timed out after ${timeoutMs}ms.\nmodel: ${values.model}${sessionIdList.length ? `\nsession_ids: ${sessionIdList.join(",")}` : ""}\nstdout_bytes: ${Buffer.byteLength(stdoutBuf)}\nstderr_bytes: ${Buffer.byteLength(stderrBuf)}\n`
  }
  if (note) stderrOutput += `${stderrOutput ? "\n\n" : ""}${note}\n`

  const needSessionFallback =
    !values["no-session-fallback"] &&
    sessionIdList.length > 0 &&
    (output.trim() === "" || (timedOut && !isRichBody(output)))
  if (needSessionFallback) {
    // Attach mode may stream only lifecycle events, or a timeout may kill the
    // local CLI while the remote session still has text. Abort leftovers, then
    // harvest `occtl last` — including on exit 124, not only empty exit 0.
    if (timedOut || exitCode === 124) abortSessions(sessionIdList)
    const salvaged = fetchSessionText(sessionIdList)
    if (salvaged.trim() && (isRichBody(salvaged) || salvaged.trim().length > output.trim().length)) {
      output = salvaged
    }
  }

  // If the model Write'd a full review to --out and returned empty/thin final
  // text, prefer that existing rich file over failing as "no text".
  if (exitCode === 0 && values.format === "json" && output.trim() === "" && values.out && existsSync(values.out)) {
    try {
      const existing = readFileSync(values.out, "utf8")
      if (isRichBody(existing)) {
        output = existing
        stderrOutput += `${stderrOutput ? "\n\n" : ""}run-opencode: harness final message empty; using existing rich body at ${values.out} (${existing.length} bytes).\n`
      }
    } catch { /* keep empty */ }
  }

  if (exitCode === 0 && values.format === "json" && output.trim() === "") {
    exitCode = 1
    const rawPreview = stdoutBuf.trim().slice(0, 4000)
    stderrOutput += `${stderrOutput ? "\n\n" : ""}run-opencode: provider returned no text; there could be an availability issue or the account spending limits may have been reached for this provider.\nmodel: ${values.model}${sessionIdList.length ? `\nsession_ids: ${sessionIdList.join(",")}` : ""}\nstdout_bytes: ${Buffer.byteLength(stdoutBuf)}\nstderr_bytes: ${Buffer.byteLength(stderrBuf)}${rawPreview ? `\nraw_stdout_preview:\n${rawPreview}` : ""}\n`
  }

  persistedExitCode = exitCode
  if (values.out && values.format === "json") {
    writeTo(`${values.out}.raw.jsonl`, stdoutBuf)
    if (sessionIdList.length) writeTo(`${values.out}.session`, `${sessionIdList.join("\n")}\n`)
  }

  if (values.out) {
    const clobberNotes: string[] = []
    writeOutPreferRich(values.out, output, clobberNotes)
    if (clobberNotes.length) {
      stderrOutput += `${stderrOutput ? "\n\n" : ""}${clobberNotes.join("\n")}\n`
    }
  } else {
    process.stdout.write(output)
  }

  if (values.stderr) writeTo(values.stderr, stderrOutput)
  else if (stderrOutput && (exitCode !== 0 || stderrOutput.includes("run-opencode:"))) process.stderr.write(stderrOutput)
}

const timer = timeoutMs > 0 ? setTimeout(() => {
  timedOut = true
  child.kill("SIGTERM")
  setTimeout(() => {
    if (!closed) child.kill("SIGKILL")
  }, 5000).unref()
}, timeoutMs) : undefined

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    const exitCode = 128 + (sig === "SIGTERM" ? 15 : 2)
    child.kill(sig)
    persist(exitCode, `run-opencode: received ${sig}; flushed partial output.`)
    process.exit(exitCode)
  })
}

child.on("close", (code) => {
  closed = true
  clearTimeout(timer)
  const exitCode = timedOut ? 124 : code ?? 1
  persist(exitCode)
  process.exit(persistedExitCode ?? exitCode)
})
