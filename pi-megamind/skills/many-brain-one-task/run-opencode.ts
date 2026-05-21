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
 *   bun /absolute/path/to/pi-megamind/skills/many-brain-one-task/run-opencode.ts \
 *     --model opencode/gemini-3.1-pro \
 *     --title "ultra-review !2514 craft/Gemini-3.1-Pro" \
 *     --file .tmp/ultra-review-2514/craft.full.md \
 *     --attach http://seamus:4095 \
 *     --out .tmp/ultra-review-2514/results/craft-gemini.out \
 *     -- "Perform the code review exactly as instructed."
 *
 * Required: --model, --file, trailing `--`, and a short message (positional).
 * See SKILL.md "How to run" for the full option list and the why.
 */

import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
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

const message = positionals.join(" ").trim() || "Follow the attached file's instructions exactly."

const args: string[] = ["run", "--model", values.model]
if (values.variant) args.push("--variant", values.variant)
if (values.agent) args.push("--agent", values.agent)
if (values.title) args.push("--title", values.title)
for (const f of values.file) args.push("--file", f)

if (values.attach) {
  // Attach mode: `--dir .` required so the remote session opens in the
  // current project, not the server's CWD. Password optional — opencode
  // falls back to OPENCODE_SERVER_PASSWORD when the flag is absent.
  args.push("--attach", values.attach)
  args.push("--dir", values.dir ?? ".")
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

const child = spawn("opencode", args, { stdio: ["ignore", "pipe", "pipe"], env: spawnEnv })
let stdoutBuf = ""
let stderrBuf = ""
let timedOut = false
let closed = false
child.stdout.on("data", (b: Buffer) => { stdoutBuf += b.toString() })
child.stderr.on("data", (b: Buffer) => { stderrBuf += b.toString() })
child.on("error", (err) => die(`failed to spawn opencode: ${err.message}`, 127))

const timer = timeoutMs > 0 ? setTimeout(() => {
  timedOut = true
  child.kill("SIGTERM")
  setTimeout(() => {
    if (!closed) child.kill("SIGKILL")
  }, 5000).unref()
}, timeoutMs) : undefined

child.on("close", (code) => {
  closed = true
  if (timer) clearTimeout(timer)
  let output = stdoutBuf
  const writeTo = (path: string, body: string): void => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
  }

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

  let exitCode = code ?? 1
  let stderrOutput = stderrBuf
  const sessionIdList = Array.from(sessionIds)

  if (timedOut) {
    exitCode = 124
    stderrOutput += `${stderrOutput ? "\n\n" : ""}run-opencode: opencode timed out after ${timeoutMs}ms.\nmodel: ${values.model}${sessionIdList.length ? `\nsession_ids: ${sessionIdList.join(",")}` : ""}\nstdout_bytes: ${Buffer.byteLength(stdoutBuf)}\nstderr_bytes: ${Buffer.byteLength(stderrBuf)}\n`
  }

  if (exitCode === 0 && values.format === "json" && output.trim() === "") {
    exitCode = 1
    const rawPreview = stdoutBuf.trim().slice(0, 4000)
    stderrOutput += `${stderrOutput ? "\n\n" : ""}run-opencode: provider returned no text; there could be an availability issue or the account spending limits may have been reached for this provider.\nmodel: ${values.model}${sessionIdList.length ? `\nsession_ids: ${sessionIdList.join(",")}` : ""}\nstdout_bytes: ${Buffer.byteLength(stdoutBuf)}\nstderr_bytes: ${Buffer.byteLength(stderrBuf)}${rawPreview ? `\nraw_stdout_preview:\n${rawPreview}` : ""}\n`
  }

  if (values.out && values.format === "json") {
    writeTo(`${values.out}.raw.jsonl`, stdoutBuf)
    if (sessionIdList.length) writeTo(`${values.out}.session`, `${sessionIdList.join("\n")}\n`)
  }

  if (values.out) writeTo(values.out, output)
  else process.stdout.write(output)

  if (values.stderr) writeTo(values.stderr, stderrOutput)
  else if (stderrOutput && exitCode !== 0) process.stderr.write(stderrOutput)

  process.exit(exitCode)
})
