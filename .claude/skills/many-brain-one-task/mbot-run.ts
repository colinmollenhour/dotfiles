#!/usr/bin/env bun
/**
 * mbot-run.ts — durable control plane for Many Brain One Task / ultra-review.
 *
 * OpenCode reliability (2026-08):
 * - ALL flags go before `--` (attach/variant/title must not be swallowed)
 * - Prefer `occtl run --attach host:port` (HTTP API, session sidecar, timeout salvage)
 * - Fallback: run-opencode.ts when occtl is missing or older than 1.2.0
 * - Attach smoke before fan-out; fall back to local spawn on failure
 * - Pin models against attach /config/providers when possible
 * - Default concurrency 3 for OpenCode (shared server contention)
 * - Fail-closed harvest: empty after launch = failed, not "wait forever"
 * - Timeout recovery: `occtl last` (abort leftover sessions) before marking timeout
 * - `barrier` command: wait for slots without hanging on permanent empties
 *
 * Commands:
 *   bun mbot-run.ts init --run-dir .tmp/ultra-N
 *   bun mbot-run.ts smoke --run-dir .tmp/ultra-N --attach http://seamus:4095 --model openai/gpt-5.6-sol
 *   bun mbot-run.ts launch --plan .tmp/ultra-N/plan.json
 *   bun mbot-run.ts harvest --run-dir .tmp/ultra-N
 *   bun mbot-run.ts status --run-dir .tmp/ultra-N
 *   bun mbot-run.ts barrier --run-dir .tmp/ultra-N [--timeout-ms 1200000]
 *
 * Plan JSON:
 * {
 *   "run_dir": ".tmp/ultra-N",
 *   "attach": "http://seamus:4095",
 *   "timeout_ms": 1200000,
 *   "concurrency": 3,
 *   "opencode_mode": "auto",   // auto | attach | local | skip
 *   "slots": [{ "slot", "planned_model", "provider_model_id", "harness", "prompt", "out", ... }]
 * }
 *
 * harness: opencode | occtl | grok | external
 * stdout: always one JSON object for jq.
 */

import { spawn, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const RUN_OPENCODE = join(SCRIPT_DIR, "run-opencode.ts")

const HARNESS_FOOTER =
  "Emit the COMPLETE result as your final assistant message. Do not use the Write tool on the --out path; the harness captures your final message into that file."

const MIN_OCCTL_VERSION = "1.2.0"

const DEFAULT_OPENCODE_CONCURRENCY = 3
const DEFAULT_SMOKE_TIMEOUT_MS = 45_000
const DEFAULT_SLOT_TIMEOUT_MS = 1_200_000

type OpencodeMode = "auto" | "attach" | "local" | "skip"
type SlotStatus =
  | "pending"
  | "running"
  | "ok"
  | "empty"
  | "failed"
  | "timeout"
  | "skipped"
  | "external"

interface Slot {
  slot: string
  phase?: string
  planned_model: string
  provider_model_id?: string
  harness: "opencode" | "occtl" | "grok" | "external" | string
  variant?: string
  title?: string
  prompt: string
  out: string
  display_name?: string
  backup_used?: boolean
  skip?: boolean
}

interface Plan {
  run_dir: string
  /** Project directory the participants run in. Defaults to run_dir. Set this
   *  to the repo root when prompts cite repo-relative paths. */
  project_dir?: string
  attach?: string
  password?: string
  timeout_ms?: number
  concurrency?: number
  /** Force OpenCode transport. Default auto (smoke then attach|local). */
  opencode_mode?: OpencodeMode
  smoke_timeout_ms?: number
  slots: Slot[]
}

interface Meta {
  slot: string
  phase?: string
  planned_model: string
  actual_model: string
  display_name?: string
  provider_model_id?: string
  harness: string
  planned_harness?: string
  actual_harness?: string
  attach_mode?: "attach" | "local" | "none"
  backup_used: boolean
  prompt: string
  out: string
  session_id?: string | null
  exit?: number | null
  started_at?: string
  ended_at?: string
  bytes?: number
  markers?: { verdict: number; issue: number }
  status: SlotStatus
  error?: string
  terminal?: boolean
  recovered?: boolean
}

interface State {
  phase: string
  updated_at: string
  run_dir: string
  slots: Record<string, Meta>
  opencode?: OpencodePreflight
}

interface OpencodePreflight {
  mode: OpencodeMode
  attach?: string
  attach_url?: string
  smoke_ok: boolean
  smoke_ms?: number
  smoke_error?: string
  model_requested?: string
  model_resolved?: string
  models_checked?: number
  prefer_run_opencode: boolean
  occtl_ok?: boolean
  occtl_version?: string | null
  transport?: "occtl" | "run-opencode"
  timestamp: string
}

function die(msg: string, code = 2): never {
  console.error(`mbot-run: ${msg}`)
  process.exit(code)
}

function abs(runDir: string, p: string): string {
  return isAbsolute(p) ? p : join(runDir, p)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n")
}

function nowIso(): string {
  return new Date().toISOString()
}

function countMarkers(text: string): { verdict: number; issue: number } {
  const verdict = (text.match(/\bVERDICT\s*:/gi) || []).length
  const issue =
    (text.match(/<<<\s*ISSUE\s*>>>/gi) || []).length +
    (text.match(/^#{1,3}\s+Issue\b/gim) || []).length
  return { verdict, issue }
}

function isRich(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/\bVERDICT\s*:/i.test(t)) return true
  if (/<<<\s*(ISSUE|VERDICT|END)\s*>>>/i.test(t)) return true
  if (/BEGIN_MBOD_JSON/i.test(t)) return true
  if ((t.match(/^#{1,3}\s+\S/gm) || []).length >= 3) return true
  return t.length >= 2048
}

/** Slot is finished for barrier purposes (success or permanent failure). */
function isTerminal(status: SlotStatus): boolean {
  return (
    status === "ok" ||
    status === "failed" ||
    status === "timeout" ||
    status === "empty" ||
    status === "skipped" ||
    status === "external"
  )
}

function loadState(runDir: string): State {
  const path = join(runDir, "STATE.json")
  if (existsSync(path)) return readJson<State>(path)
  return { phase: "init", updated_at: nowIso(), run_dir: runDir, slots: {} }
}

function saveState(state: State): void {
  state.updated_at = nowIso()
  writeJson(join(state.run_dir, "STATE.json"), state)
}

function normalizeAttachUrl(attach?: string): string | undefined {
  if (!attach) return undefined
  const t = attach.trim()
  if (!t) return undefined
  if (t.startsWith("http://") || t.startsWith("https://")) return t.replace(/\/$/, "")
  // host:port
  return `http://${t.replace(/\/$/, "")}`
}

function attachEnv(attach?: string, password?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  const url = normalizeAttachUrl(attach)
  if (url) {
    try {
      const u = new URL(url)
      env.OPENCODE_SERVER_HOST = u.hostname
      env.OPENCODE_SERVER_PORT = u.port || "4096"
    } catch {
      /* leave env host/port unset */
    }
  }
  if (password) env.OPENCODE_SERVER_PASSWORD = password
  return env
}

function attachHostPort(attach?: string): string | undefined {
  const url = normalizeAttachUrl(attach)
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.port ? `${u.hostname}:${u.port}` : u.hostname
  } catch {
    return attach?.replace(/^https?:\/\//, "").replace(/\/$/, "")
  }
}

function parseSemver(text: string): [number, number, number] | null {
  const m = text.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function semverGte(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return true
}

function detectOcctl(): { ok: boolean; version: string | null } {
  const res = spawnSync("occtl", ["--version"], {
    encoding: "utf8",
    timeout: 8000,
  })
  if (res.error || res.status !== 0) return { ok: false, version: null }
  const version = (res.stdout || res.stderr || "").trim() || null
  const parsed = version ? parseSemver(version) : null
  const min = parseSemver(MIN_OCCTL_VERSION)
  if (!parsed || !min || !semverGte(parsed, min)) return { ok: false, version }
  return { ok: true, version }
}

function occtlAttachArgs(attach?: string): string[] {
  const hp = attachHostPort(attach)
  return hp ? ["--attach", hp] : []
}

function occtlLastText(sessionId: string, attach?: string, password?: string): string {
  const args = [
    "last",
    sessionId,
    "--role",
    "assistant",
    "--text-only",
    ...occtlAttachArgs(attach),
  ]
  const res = spawnSync("occtl", args, {
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 10 * 1024 * 1024,
    env: attachEnv(attach, password),
  })
  const text = (res.stdout || "").trim()
  if (res.status === 0 && text && text !== "No messages in session.") return text
  return ""
}

function occtlAbortSession(sessionId: string, attach?: string, password?: string): void {
  spawnSync("occtl", ["abort", sessionId, ...occtlAttachArgs(attach)], {
    encoding: "utf8",
    timeout: 15_000,
    env: attachEnv(attach, password),
  })
}

function readSessionId(outPath: string, fallback?: string | null): string | null {
  if (fallback) return fallback
  const sessionFile = outPath + ".session"
  if (!existsSync(sessionFile)) return null
  try {
    return readFileSync(sessionFile, "utf8").trim().split("\n")[0] || null
  } catch {
    return null
  }
}

/** Salvage a thin/empty --out from the OpenCode session after timeout or empty JSON. */
function recoverSlotBody(opts: {
  outPath: string
  sessionId?: string | null
  attach?: string
  password?: string
  abortFirst?: boolean
}): { body: string; recovered: boolean; sessionId: string | null } {
  let body = ""
  if (existsSync(opts.outPath)) {
    try {
      body = readFileSync(opts.outPath, "utf8")
    } catch {
      body = ""
    }
  }
  const sessionId = readSessionId(opts.outPath, opts.sessionId)
  if (isRich(body) || !sessionId) return { body, recovered: false, sessionId }

  if (opts.abortFirst) occtlAbortSession(sessionId, opts.attach, opts.password)
  let salvaged = occtlLastText(sessionId, opts.attach, opts.password)
  if (!isRich(salvaged)) {
    occtlAbortSession(sessionId, opts.attach, opts.password)
    const again = occtlLastText(sessionId, opts.attach, opts.password)
    if (again.length > salvaged.length) salvaged = again
  }
  if (salvaged && (isRich(salvaged) || salvaged.trim().length > body.trim().length)) {
    mkdirSync(dirname(opts.outPath), { recursive: true })
    writeFileSync(opts.outPath, salvaged)
    return { body: salvaged, recovered: true, sessionId }
  }
  return { body, recovered: false, sessionId }
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let closed = false
    const timer =
      opts.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            child.kill("SIGTERM")
            setTimeout(() => {
              if (!closed) child.kill("SIGKILL")
            }, 5000).unref()
          }, opts.timeoutMs)
        : undefined
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString()
    })
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString()
    })
    child.on("error", (err) => {
      closed = true
      if (timer) clearTimeout(timer)
      resolvePromise({ code: 127, stdout, stderr: err.message + "\n" + stderr, timedOut })
    })
    child.on("close", (code) => {
      closed = true
      if (timer) clearTimeout(timer)
      resolvePromise({ code: timedOut ? 124 : (code ?? 1), stdout, stderr, timedOut })
    })
  })
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

/** Fetch provider/model ids from attach server (best effort). */
async function listAttachModels(attach: string, timeoutMs = 8000): Promise<string[]> {
  const url = normalizeAttachUrl(attach)
  if (!url) return []
  const endpoint = `${url}/config/providers`
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), timeoutMs)
    const res = await fetch(endpoint, { signal: ac.signal })
    clearTimeout(t)
    if (!res.ok) return []
    const data = (await res.json()) as {
      providers?: Array<{ id?: string; models?: Record<string, unknown> | unknown[] }>
    }
    const out: string[] = []
    for (const p of data.providers || []) {
      const pid = p.id || ""
      const models = p.models
      if (!pid || !models) continue
      if (Array.isArray(models)) {
        for (const m of models) {
          const mid = typeof m === "string" ? m : (m as { id?: string })?.id
          if (mid) out.push(`${pid}/${mid}`)
        }
      } else {
        for (const mid of Object.keys(models)) out.push(`${pid}/${mid}`)
      }
    }
    return out
  } catch {
    return []
  }
}

/**
 * Resolve a requested model against known attach models.
 * Prefer exact match; then same bare id under openai/ then opencode/.
 */
function resolveModelId(requested: string, available: string[]): string {
  if (!requested) return requested
  if (available.length === 0) return requested
  if (available.includes(requested)) return requested
  const bare = requested.includes("/") ? requested.split("/").slice(1).join("/") : requested
  for (const pref of [`openai/${bare}`, `opencode/${bare}`, bare]) {
    if (available.includes(pref)) return pref
  }
  // fuzzy: ends with bare
  const hit = available.find((m) => m.endsWith("/" + bare) || m === bare)
  return hit || requested
}

async function smokeOpencode(opts: {
  runDir: string
  attach?: string
  model: string
  password?: string
  timeoutMs: number
  forceMode?: OpencodeMode
}): Promise<OpencodePreflight> {
  const runDir = resolve(opts.runDir)
  mkdirSync(join(runDir, "results"), { recursive: true })
  const attachUrl = normalizeAttachUrl(opts.attach)
  const available = attachUrl ? await listAttachModels(attachUrl) : []
  const model = resolveModelId(opts.model, available)

  const occtl = detectOcctl()
  const transport: "occtl" | "run-opencode" = occtl.ok ? "occtl" : "run-opencode"
  const base: OpencodePreflight = {
    mode: opts.forceMode && opts.forceMode !== "auto" ? opts.forceMode : "auto",
    attach: opts.attach,
    attach_url: attachUrl,
    smoke_ok: false,
    model_requested: opts.model,
    model_resolved: model,
    models_checked: available.length,
    prefer_run_opencode: transport === "run-opencode",
    occtl_ok: occtl.ok,
    occtl_version: occtl.version,
    transport,
    timestamp: nowIso(),
  }

  if (opts.forceMode === "skip") {
    base.mode = "skip"
    base.smoke_error = "opencode_mode=skip"
    writeJson(join(runDir, "opencode-preflight.json"), base)
    return base
  }
  if (opts.forceMode === "local") {
    const local = await runSmokeOnce({
      runDir,
      model,
      attach: undefined,
      password: opts.password,
      timeoutMs: opts.timeoutMs,
      tag: "local",
      transport,
    })
    base.mode = "local"
    base.smoke_ok = local.ok
    base.smoke_ms = local.ms
    base.smoke_error = local.error
    writeJson(join(runDir, "opencode-preflight.json"), base)
    return base
  }

  // Try attach first when URL present and mode auto|attach
  if (attachUrl && opts.forceMode !== "local") {
    const att = await runSmokeOnce({
      runDir,
      model,
      attach: attachUrl,
      password: opts.password,
      timeoutMs: opts.timeoutMs,
      tag: "attach",
      transport,
    })
    if (att.ok) {
      base.mode = "attach"
      base.smoke_ok = true
      base.smoke_ms = att.ms
      writeJson(join(runDir, "opencode-preflight.json"), base)
      return base
    }
    base.smoke_error = `attach: ${att.error}`
    if (opts.forceMode === "attach") {
      base.mode = "attach"
      base.smoke_ok = false
      base.smoke_ms = att.ms
      writeJson(join(runDir, "opencode-preflight.json"), base)
      return base
    }
    // fall through to local
  }

  const local = await runSmokeOnce({
    runDir,
    model,
    attach: undefined,
    password: opts.password,
    timeoutMs: opts.timeoutMs,
    tag: "local",
    transport,
  })
  base.mode = local.ok ? "local" : "skip"
  base.smoke_ok = local.ok
  base.smoke_ms = local.ms
  if (!local.ok) {
    base.smoke_error = [base.smoke_error, `local: ${local.error}`].filter(Boolean).join("; ")
  } else if (base.smoke_error) {
    base.smoke_error = `${base.smoke_error}; recovered via local spawn`
  }
  writeJson(join(runDir, "opencode-preflight.json"), base)
  return base
}

async function runSmokeOnce(opts: {
  runDir: string
  model: string
  attach?: string
  password?: string
  timeoutMs: number
  tag: string
  transport: "occtl" | "run-opencode"
}): Promise<{ ok: boolean; ms: number; error?: string }> {
  const prompt = join(opts.runDir, `smoke-opencode-${opts.tag}.md`)
  const out = join(opts.runDir, "results", `_smoke-${opts.tag}.out`)
  const err = join(opts.runDir, "results", `_smoke-${opts.tag}.err`)
  writeFileSync(
    prompt,
    "Reply with exactly the single token OPENCODE_SMOKE_OK and nothing else. No tools.\n",
  )
  const t0 = Date.now()
  const r =
    opts.transport === "occtl"
      ? await runCmd("occtl", occtlRunArgs({
          model: opts.model,
          promptPath: prompt,
          outPath: out,
          errPath: err,
          timeoutMs: opts.timeoutMs,
          dir: opts.runDir,
          attach: opts.attach,
          password: opts.password,
          message: "Reply with exactly OPENCODE_SMOKE_OK",
        }), {
          cwd: opts.runDir,
          env: attachEnv(opts.attach, opts.password),
          timeoutMs: opts.timeoutMs + 15_000,
        })
      : await runCmd(
          "bun",
          [
            RUN_OPENCODE,
            "--model",
            opts.model,
            "--file",
            prompt,
            "--out",
            out,
            "--stderr",
            err,
            "--timeout-ms",
            String(opts.timeoutMs),
            "--dir",
            opts.runDir,
            ...(opts.attach ? ["--attach", opts.attach] : []),
            ...(opts.password ? ["--password", opts.password] : []),
            "--",
            "Reply with exactly OPENCODE_SMOKE_OK",
          ],
          {
            cwd: opts.runDir,
            env: attachEnv(opts.attach, opts.password),
            timeoutMs: opts.timeoutMs + 15_000,
          },
        )
  const ms = Date.now() - t0
  let body = ""
  if (existsSync(out)) {
    try {
      body = readFileSync(out, "utf8")
    } catch {
      body = ""
    }
  }
  const ok =
    r.code === 0 &&
    body.trim().length > 0 &&
    (/OPENCODE_SMOKE_OK/i.test(body) || body.trim().length >= 4)
  if (ok) return { ok: true, ms }
  const errText = existsSync(err)
    ? readFileSync(err, "utf8").trim().slice(0, 400)
    : r.stderr.trim().slice(0, 400)
  return {
    ok: false,
    ms,
    error: errText || `exit ${r.code}, out_bytes=${body.length}`,
  }
}

function occtlRunArgs(opts: {
  model: string
  promptPath: string
  outPath: string
  errPath?: string
  timeoutMs: number
  dir: string
  attach?: string
  password?: string
  variant?: string
  title?: string
  message: string
}): string[] {
  // ALL flags before --
  const args = ["run", "--model", opts.model]
  if (opts.variant) args.push("--variant", opts.variant)
  if (opts.title) args.push("--title", opts.title)
  args.push(
    "--file",
    opts.promptPath,
    "--out",
    opts.outPath,
    "--timeout",
    String(opts.timeoutMs),
    "--dir",
    opts.dir,
  )
  if (opts.errPath) args.push("--stderr", opts.errPath)
  if (opts.attach) {
    const hp = attachHostPort(opts.attach)
    if (hp) args.push("--attach", hp)
  } else {
    args.push("--spawn")
  }
  if (opts.password) args.push("--password", opts.password)
  args.push("--", opts.message)
  return args
}

function loadPreflight(runDir: string): OpencodePreflight | null {
  const p = join(runDir, "opencode-preflight.json")
  if (!existsSync(p)) return null
  try {
    return readJson<OpencodePreflight>(p)
  } catch {
    return null
  }
}

async function launchSlot(
  plan: Plan,
  slot: Slot,
  preflight: OpencodePreflight | null,
): Promise<Meta> {
  const runDir = resolve(plan.run_dir)
  const projectDir = plan.project_dir ? resolve(plan.project_dir) : runDir
  const promptPath = abs(runDir, slot.prompt)
  const outPath = abs(runDir, slot.out)
  const metaPath = outPath.replace(/\.out$/, "") + ".meta.json"
  const errPath = outPath + ".err"
  mkdirSync(dirname(outPath), { recursive: true })

  const plannedHarness = slot.harness
  const baseMeta: Meta = {
    slot: slot.slot,
    phase: slot.phase,
    planned_model: slot.planned_model,
    actual_model: slot.planned_model,
    display_name: slot.display_name,
    provider_model_id: slot.provider_model_id,
    harness: slot.harness,
    planned_harness: plannedHarness,
    actual_harness: plannedHarness,
    backup_used: Boolean(slot.backup_used),
    prompt: promptPath,
    out: outPath,
    started_at: nowIso(),
    status: "running",
    terminal: false,
  }

  if (slot.skip || slot.harness === "external") {
    const m: Meta = {
      ...baseMeta,
      status: slot.harness === "external" ? "external" : "skipped",
      ended_at: nowIso(),
      exit: null,
      terminal: true,
      attach_mode: "none",
    }
    writeJson(metaPath, m)
    return m
  }

  if (!existsSync(promptPath)) {
    const m: Meta = {
      ...baseMeta,
      status: "failed",
      error: `prompt missing: ${promptPath}`,
      ended_at: nowIso(),
      exit: 2,
      terminal: true,
    }
    writeJson(metaPath, m)
    return m
  }

  // Already rich result? Skip re-launch.
  if (existsSync(outPath)) {
    try {
      const existing = readFileSync(outPath, "utf8")
      if (isRich(existing)) {
        const markers = countMarkers(existing)
        const m: Meta = {
          ...baseMeta,
          status: "ok",
          bytes: existing.length,
          markers,
          ended_at: nowIso(),
          exit: 0,
          error: "already complete; skipped re-launch",
          terminal: true,
        }
        writeJson(metaPath, m)
        return m
      }
    } catch {
      /* re-run */
    }
  }

  const timeoutMs = plan.timeout_ms ?? DEFAULT_SLOT_TIMEOUT_MS
  let code = 1
  let stderr = ""
  let actualHarness = plannedHarness
  let attachMode: Meta["attach_mode"] = "none"
  let actualModel = slot.provider_model_id || slot.planned_model

  if (slot.harness === "grok") {
    actualHarness = "grok"
    const args = [
      "--prompt-file",
      promptPath,
      "--always-approve",
      "--output-format",
      "plain",
      "--reasoning-effort",
      slot.variant === "max" || slot.variant === "xhigh" ? "max" : "high",
      "--disallowed-tools",
      "Agent",
    ]
    if (slot.provider_model_id) args.push("-m", slot.provider_model_id)
    const r = await runCmd("grok", args, { cwd: projectDir, timeoutMs })
    code = r.code
    stderr = r.stderr
    writeFileSync(outPath, r.stdout)
    if (stderr) writeFileSync(errPath, stderr)
  } else if (slot.harness === "opencode" || slot.harness === "occtl") {
    // Resolve OpenCode transport from preflight
    const mode = preflight?.mode || "local"
    if (mode === "skip") {
      const m: Meta = {
        ...baseMeta,
        status: "failed",
        error: `opencode unavailable: ${preflight?.smoke_error || "skip"}`,
        ended_at: nowIso(),
        exit: 1,
        terminal: true,
        actual_harness: "opencode",
        attach_mode: "none",
      }
      writeJson(metaPath, m)
      return m
    }

    // A slot's own model always wins. preflight.model_resolved comes from the
    // single smoke probe, so letting it through here would silently collapse a
    // multi-model plan onto one model.
    if (actualModel) {
      if (preflight?.attach_url) {
        const avail = await listAttachModels(preflight.attach_url)
        actualModel = resolveModelId(actualModel, avail)
      }
    } else if (preflight?.model_resolved) {
      actualModel = preflight.model_resolved
    }

    const useAttach = mode === "attach" && Boolean(preflight?.attach_url || plan.attach)
    const attachUrl = useAttach
      ? preflight?.attach_url || normalizeAttachUrl(plan.attach)
      : undefined
    attachMode = useAttach ? "attach" : "local"

    const transport =
      preflight?.transport ?? (detectOcctl().ok ? "occtl" : "run-opencode")
    const useOcctl = transport === "occtl"
    actualHarness = useOcctl ? "occtl" : "run-opencode"

    if (useOcctl) {
      const r = await runCmd(
        "occtl",
        occtlRunArgs({
          model: actualModel,
          promptPath,
          outPath,
          errPath,
          timeoutMs,
          dir: projectDir,
          attach: attachUrl,
          password: plan.password,
          variant: slot.variant,
          title: slot.title,
          message: HARNESS_FOOTER,
        }),
        {
          cwd: projectDir,
          env: attachEnv(attachUrl, plan.password),
          timeoutMs: timeoutMs + 120_000,
        },
      )
      code = r.code
      stderr = r.stderr
      if (stderr) writeFileSync(errPath, stderr)
    } else {
      const args = [
        RUN_OPENCODE,
        "--model",
        actualModel,
        "--file",
        promptPath,
        "--out",
        outPath,
        "--timeout-ms",
        String(timeoutMs),
        "--dir",
        projectDir,
      ]
      if (slot.variant) args.push("--variant", slot.variant)
      if (slot.title) args.push("--title", slot.title)
      if (attachUrl) args.push("--attach", attachUrl)
      if (plan.password) args.push("--password", plan.password)
      args.push("--", HARNESS_FOOTER)

      const r = await runCmd("bun", args, {
        cwd: projectDir,
        env: attachEnv(attachUrl, plan.password),
        timeoutMs: timeoutMs + 120_000,
      })
      code = r.code
      stderr = r.stderr
      if (stderr) writeFileSync(errPath, stderr)
    }
  } else {
    const m: Meta = {
      ...baseMeta,
      status: "failed",
      error: `unknown harness: ${slot.harness}`,
      ended_at: nowIso(),
      exit: 2,
      terminal: true,
    }
    writeJson(metaPath, m)
    return m
  }

  // Also read stderr file if launcher wrote it
  if (!stderr && existsSync(errPath)) {
    try {
      stderr = readFileSync(errPath, "utf8")
    } catch {
      /* ignore */
    }
  }

  const recovered = recoverSlotBody({
    outPath,
    attach: attachMode === "attach" ? (preflight?.attach_url || plan.attach) : undefined,
    password: plan.password,
    abortFirst: code === 124 || code === 130 || code === 143,
  })
  const body = recovered.body
  const sessionId = recovered.sessionId
  const markers = countMarkers(body)
  const rich = isRich(body)
  let status: SlotStatus = "failed"
  if (code === 124 && rich) status = "ok" // usable timeout body
  else if (code === 124) status = "timeout"
  else if (rich) status = "ok"
  else if (code === 0 && body.trim()) status = "empty"
  else if (code === 0 && !body.trim()) status = "empty"
  else status = "failed"

  const meta: Meta = {
    ...baseMeta,
    actual_model: actualModel,
    provider_model_id: actualModel,
    actual_harness: actualHarness,
    attach_mode: attachMode,
    status,
    exit: code,
    ended_at: nowIso(),
    bytes: body.length,
    markers,
    session_id: sessionId,
    recovered: recovered.recovered || undefined,
    terminal: isTerminal(status),
    error:
      status === "ok"
        ? undefined
        : stderr.trim().slice(0, 500) ||
          (status === "empty" ? "empty body (fail-closed)" : `exit ${code}`),
  }
  writeJson(metaPath, meta)
  return meta
}

function cmdInit(runDir: string): void {
  const absDir = resolve(runDir)
  for (const sub of ["", "prompts", "results", "context"]) {
    mkdirSync(join(absDir, sub), { recursive: true })
  }
  const state: State = {
    phase: "preflight",
    updated_at: nowIso(),
    run_dir: absDir,
    slots: {},
  }
  saveState(state)
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        run_dir: absDir,
        layout: ["prompts/", "results/", "context/", "STATE.json"],
      },
      null,
      2,
    ) + "\n",
  )
}

async function cmdSmoke(opts: {
  runDir: string
  attach?: string
  model?: string
  password?: string
  timeoutMs?: number
  mode?: OpencodeMode
}): Promise<void> {
  const runDir = resolve(opts.runDir)
  mkdirSync(join(runDir, "results"), { recursive: true })
  const pf = await smokeOpencode({
    runDir,
    attach: opts.attach,
    model: opts.model || "openai/gpt-5.6-sol",
    password: opts.password,
    timeoutMs: opts.timeoutMs ?? DEFAULT_SMOKE_TIMEOUT_MS,
    forceMode: opts.mode,
  })
  const state = loadState(runDir)
  state.opencode = pf
  state.phase = "preflight"
  state.run_dir = runDir
  saveState(state)
  process.stdout.write(JSON.stringify({ ok: pf.smoke_ok || pf.mode === "local", preflight: pf }, null, 2) + "\n")
  process.exit(pf.mode === "skip" ? 1 : 0)
}

async function cmdLaunch(planPath: string): Promise<void> {
  if (!existsSync(planPath)) die(`plan not found: ${planPath}`)
  const plan = readJson<Plan>(planPath)
  if (!plan.run_dir) die("plan.run_dir is required")
  if (!Array.isArray(plan.slots) || plan.slots.length === 0) die("plan.slots must be a non-empty array")

  const runDir = resolve(plan.run_dir)
  mkdirSync(join(runDir, "results"), { recursive: true })
  plan.run_dir = runDir
  writeJson(join(runDir, "plan.json"), plan)

  const hasOpencode = plan.slots.some(
    (s) => (s.harness === "opencode" || s.harness === "occtl") && !s.skip,
  )

  // Preflight OpenCode once per launch (unless mode skip or no OC slots)
  let preflight = loadPreflight(runDir)
  if (hasOpencode) {
    const forceMode = plan.opencode_mode || "auto"
    const needSmoke =
      !preflight ||
      forceMode !== preflight.mode ||
      (forceMode === "auto" && !preflight.smoke_ok && preflight.mode === "attach")
    if (needSmoke || forceMode !== "auto") {
      const modelHint =
        plan.slots.find((s) => s.harness === "opencode" || s.harness === "occtl")
          ?.provider_model_id ||
        plan.slots.find((s) => s.harness === "opencode" || s.harness === "occtl")?.planned_model ||
        "openai/gpt-5.6-sol"
      preflight = await smokeOpencode({
        runDir,
        attach: plan.attach,
        model: modelHint,
        password: plan.password,
        timeoutMs: plan.smoke_timeout_ms ?? DEFAULT_SMOKE_TIMEOUT_MS,
        forceMode,
      })
    }
  }

  const state = loadState(runDir)
  state.phase = "launch"
  state.run_dir = runDir
  if (preflight) state.opencode = preflight
  saveState(state)

  // Concurrency: default lower when OpenCode attach is in play
  const usingAttach = preflight?.mode === "attach"
  const concurrency =
    plan.concurrency ??
    (hasOpencode ? (usingAttach ? DEFAULT_OPENCODE_CONCURRENCY : 4) : 8)

  const metas = await mapPool(plan.slots, concurrency, (slot) =>
    launchSlot(plan, slot, preflight),
  )

  for (const m of metas) {
    state.slots[m.slot] = m
  }
  state.phase = "harvest"
  saveState(state)

  const ok = metas.every(
    (m) => m.status === "ok" || m.status === "external" || m.status === "skipped",
  )
  const summary = {
    ok,
    run_dir: runDir,
    opencode_preflight: preflight,
    concurrency,
    slots: metas.map((m) => ({
      slot: m.slot,
      status: m.status,
      terminal: m.terminal,
      exit: m.exit,
      bytes: m.bytes,
      markers: m.markers,
      out: m.out,
      planned_harness: m.planned_harness,
      actual_harness: m.actual_harness,
      attach_mode: m.attach_mode,
      actual_model: m.actual_model,
      error: m.error,
    })),
    counts: {
      ok: metas.filter((m) => m.status === "ok").length,
      empty: metas.filter((m) => m.status === "empty").length,
      failed: metas.filter((m) => m.status === "failed").length,
      timeout: metas.filter((m) => m.status === "timeout").length,
      external: metas.filter((m) => m.status === "external").length,
      skipped: metas.filter((m) => m.status === "skipped").length,
      terminal: metas.filter((m) => m.terminal).length,
    },
  }
  writeJson(join(runDir, "launch-summary.json"), summary)
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
  // Exit 0 if all terminal (even with failures) when at least one ok/external — callers use counts
  // Exit 1 only if any non-terminal left (should not happen after launch)
  process.exit(metas.every((m) => m.terminal) ? (ok ? 0 : 1) : 1)
}

function harvestOne(
  outPath: string,
  slotHint?: string,
  recover?: { attach?: string; password?: string },
): Meta {
  const metaPath = outPath.replace(/\.out$/, "") + ".meta.json"
  let meta: Meta | null = null
  if (existsSync(metaPath)) {
    try {
      meta = readJson<Meta>(metaPath)
    } catch {
      meta = null
    }
  }
  const slot =
    meta?.slot || slotHint || outPath.split("/").pop()?.replace(/\.out$/, "") || "unknown"

  const salvaged = recoverSlotBody({
    outPath,
    sessionId: meta?.session_id,
    attach: recover?.attach,
    password: recover?.password,
    abortFirst: meta?.status === "timeout" || meta?.status === "empty",
  })
  const body = salvaged.body
  const bytes = body.length
  const markers = countMarkers(body)
  const rich = isRich(body)

  // Fail-closed: empty body is failed if meta already said failed/timeout, else empty/failed
  let status: SlotStatus
  if (meta?.status === "external") status = "external"
  else if (meta?.status === "skipped") status = "skipped"
  else if (rich) status = "ok"
  else if (meta?.status === "failed" || meta?.status === "timeout") status = meta.status
  else if (!existsSync(outPath) || bytes === 0) status = "failed"
  else status = "empty"

  const next: Meta = {
    slot,
    phase: meta?.phase,
    planned_model: meta?.planned_model || "unknown",
    actual_model: meta?.actual_model || meta?.planned_model || "unknown",
    display_name: meta?.display_name,
    provider_model_id: meta?.provider_model_id,
    harness: meta?.harness || "unknown",
    planned_harness: meta?.planned_harness,
    actual_harness: meta?.actual_harness,
    attach_mode: meta?.attach_mode,
    backup_used: Boolean(meta?.backup_used),
    prompt: meta?.prompt || "",
    out: outPath,
    session_id: salvaged.sessionId || meta?.session_id,
    recovered: salvaged.recovered || meta?.recovered || undefined,
    exit: meta?.exit ?? null,
    started_at: meta?.started_at,
    ended_at: nowIso(),
    bytes,
    markers,
    status,
    terminal: isTerminal(status),
    error:
      status === "ok" || status === "external" || status === "skipped"
        ? undefined
        : meta?.error || (status === "empty" ? "empty body" : "incomplete body"),
  }
  writeJson(metaPath, next)
  return next
}

function cmdHarvest(runDir: string): void {
  const absDir = resolve(runDir)
  const resultsDir = join(absDir, "results")
  if (!existsSync(resultsDir)) die(`results dir missing: ${resultsDir}`)

  const planPath = join(absDir, "plan.json")
  const preflight = loadPreflight(absDir)
  let plan: Plan | null = null
  if (existsSync(planPath)) {
    try {
      plan = readJson<Plan>(planPath)
    } catch {
      plan = null
    }
  }
  const recover = {
    attach: preflight?.attach_url || plan?.attach,
    password: plan?.password,
  }

  const outs = readdirSync(resultsDir)
    .filter((f) => f.endsWith(".out") && !f.startsWith("_smoke"))
    .map((f) => join(resultsDir, f))
    .sort()

  const metas = outs.map((p) => harvestOne(p, undefined, recover))

  const state = loadState(absDir)
  for (const [k, m] of Object.entries(state.slots)) {
    if (!metas.find((x) => x.slot === k)) {
      if (m.harness === "external" || m.status === "external") {
        if (m.out && existsSync(m.out)) metas.push(harvestOne(m.out, k, recover))
        else metas.push({ ...m, terminal: true })
      } else if (m.terminal || isTerminal(m.status)) {
        metas.push(m)
      }
    }
  }

  for (const m of metas) state.slots[m.slot] = m
  state.phase = "harvested"
  state.run_dir = absDir
  saveState(state)

  const incomplete = metas.filter((m) => !m.terminal && !isTerminal(m.status))
  const harvest = {
    ok: incomplete.length === 0,
    run_dir: absDir,
    slots: metas.map((m) => ({
      slot: m.slot,
      status: m.status,
      terminal: m.terminal ?? isTerminal(m.status),
      actual_model: m.actual_model,
      actual_harness: m.actual_harness,
      attach_mode: m.attach_mode,
      bytes: m.bytes,
      markers: m.markers,
      out: m.out,
      exit: m.exit,
      error: m.error,
    })),
    totals: {
      slots: metas.length,
      ok: metas.filter((m) => m.status === "ok" || m.status === "external").length,
      incomplete: incomplete.length,
      failed: metas.filter((m) => m.status === "failed" || m.status === "timeout" || m.status === "empty")
        .length,
      verdict_markers: metas.reduce((a, m) => a + (m.markers?.verdict || 0), 0),
      issue_markers: metas.reduce((a, m) => a + (m.markers?.issue || 0), 0),
    },
  }
  writeJson(join(absDir, "harvest.json"), harvest)
  process.stdout.write(JSON.stringify(harvest, null, 2) + "\n")
  process.exit(incomplete.length === 0 ? 0 : 1)
}

function cmdStatus(runDir: string): void {
  const absDir = resolve(runDir)
  const state = loadState(absDir)
  const harvestPath = join(absDir, "harvest.json")
  const launchPath = join(absDir, "launch-summary.json")
  const preflightPath = join(absDir, "opencode-preflight.json")
  const out: Record<string, unknown> = {
    run_dir: absDir,
    state_phase: state.phase,
    updated_at: state.updated_at,
    slot_count: Object.keys(state.slots).length,
    slots: Object.values(state.slots).map((m) => ({
      slot: m.slot,
      status: m.status,
      terminal: m.terminal ?? isTerminal(m.status),
      actual_model: m.actual_model,
      actual_harness: m.actual_harness,
      attach_mode: m.attach_mode,
      bytes: m.bytes,
      markers: m.markers,
    })),
  }
  if (existsSync(preflightPath)) out.opencode_preflight = readJson(preflightPath)
  if (existsSync(launchPath)) out.launch_summary = readJson(launchPath)
  if (existsSync(harvestPath)) out.harvest = readJson(harvestPath)
  const resultsDir = join(absDir, "results")
  if (existsSync(resultsDir)) {
    out.result_files = readdirSync(resultsDir)
      .filter((f) => f.endsWith(".out"))
      .map((f) => {
        const p = join(resultsDir, f)
        return { file: f, bytes: statSync(p).size }
      })
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n")
}

/**
 * Fail-closed wait: every planned slot is terminal (ok/failed/timeout/empty/skipped/external).
 * Does NOT hang on empty files — uses meta.status when present.
 */
async function cmdBarrier(runDir: string, timeoutMs: number, pollMs: number): Promise<void> {
  const absDir = resolve(runDir)
  const planPath = join(absDir, "plan.json")
  if (!existsSync(planPath)) die(`plan.json missing in ${absDir} — launch first`)
  const plan = readJson<Plan>(planPath)
  const expected = plan.slots.map((s) => s.slot)
  const t0 = Date.now()

  while (Date.now() - t0 < timeoutMs) {
    const state = loadState(absDir)
    // refresh from disk metas
    for (const s of plan.slots) {
      const outPath = abs(absDir, s.out)
      const metaPath = outPath.replace(/\.out$/, "") + ".meta.json"
      if (existsSync(metaPath)) {
        try {
          state.slots[s.slot] = readJson<Meta>(metaPath)
        } catch {
          /* ignore */
        }
      } else if (existsSync(outPath)) {
        // body appeared without meta yet
        try {
          const body = readFileSync(outPath, "utf8")
          if (isRich(body) || body.trim()) {
            state.slots[s.slot] = {
              slot: s.slot,
              planned_model: s.planned_model,
              actual_model: s.planned_model,
              harness: s.harness,
              backup_used: false,
              prompt: abs(absDir, s.prompt),
              out: outPath,
              status: isRich(body) ? "ok" : "empty",
              terminal: true,
              bytes: body.length,
              markers: countMarkers(body),
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    const statuses = expected.map((id) => {
      const m = state.slots[id]
      if (!m) return { slot: id, status: "pending" as SlotStatus, terminal: false }
      const terminal = m.terminal ?? isTerminal(m.status)
      return { slot: id, status: m.status, terminal, bytes: m.bytes, error: m.error }
    })
    const allTerminal = statuses.every((s) => s.terminal)
    if (allTerminal) {
      const summary = {
        ok: true,
        run_dir: absDir,
        elapsed_ms: Date.now() - t0,
        slots: statuses,
        counts: {
          ok: statuses.filter((s) => s.status === "ok" || s.status === "external").length,
          failed: statuses.filter((s) =>
            ["failed", "timeout", "empty"].includes(s.status),
          ).length,
        },
      }
      writeJson(join(absDir, "barrier.json"), summary)
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }

  // timeout — dump current state fail-closed
  const state = loadState(absDir)
  const statuses = expected.map((id) => {
    const m = state.slots[id]
    return {
      slot: id,
      status: m?.status || "pending",
      terminal: m ? (m.terminal ?? isTerminal(m.status)) : false,
      bytes: m?.bytes,
      error: m?.error || "barrier timeout",
    }
  })
  const summary = {
    ok: false,
    run_dir: absDir,
    elapsed_ms: Date.now() - t0,
    error: `barrier timeout after ${timeoutMs}ms`,
    slots: statuses,
  }
  writeJson(join(absDir, "barrier.json"), summary)
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
  process.exit(1)
}

// --- CLI ---
const argv = process.argv.slice(2)
const command = argv[0]
if (!command || command === "-h" || command === "--help") {
  process.stdout.write(`Usage:
  mbot-run.ts init --run-dir <dir>
  mbot-run.ts smoke --run-dir <dir> [--attach URL] [--model ID] [--mode auto|attach|local|skip]
  mbot-run.ts launch --plan <plan.json>
  mbot-run.ts harvest --run-dir <dir>
  mbot-run.ts status --run-dir <dir>
  mbot-run.ts barrier --run-dir <dir> [--timeout-ms N] [--poll-ms N]
`)
  process.exit(command ? 0 : 2)
}

const rest = argv.slice(1)
const { values } = parseArgs({
  args: rest,
  options: {
    "run-dir": { type: "string" },
    plan: { type: "string" },
    attach: { type: "string" },
    model: { type: "string" },
    mode: { type: "string" },
    password: { type: "string" },
    "timeout-ms": { type: "string" },
    "poll-ms": { type: "string" },
  },
}) as {
  values: {
    "run-dir"?: string
    plan?: string
    attach?: string
    model?: string
    mode?: string
    password?: string
    "timeout-ms"?: string
    "poll-ms"?: string
  }
}

if (command === "init") {
  if (!values["run-dir"]) die("--run-dir is required")
  cmdInit(values["run-dir"])
} else if (command === "smoke") {
  if (!values["run-dir"]) die("--run-dir is required")
  await cmdSmoke({
    runDir: values["run-dir"],
    attach: values.attach,
    model: values.model,
    password: values.password,
    timeoutMs: values["timeout-ms"] ? Number(values["timeout-ms"]) : undefined,
    mode: (values.mode as OpencodeMode) || "auto",
  })
} else if (command === "launch") {
  if (!values.plan) die("--plan is required")
  await cmdLaunch(values.plan)
} else if (command === "harvest") {
  if (!values["run-dir"]) die("--run-dir is required")
  cmdHarvest(values["run-dir"])
} else if (command === "status") {
  if (!values["run-dir"]) die("--run-dir is required")
  cmdStatus(values["run-dir"])
} else if (command === "barrier") {
  if (!values["run-dir"]) die("--run-dir is required")
  const timeoutMs = values["timeout-ms"] ? Number(values["timeout-ms"]) : DEFAULT_SLOT_TIMEOUT_MS
  const pollMs = values["poll-ms"] ? Number(values["poll-ms"]) : 5000
  await cmdBarrier(values["run-dir"], timeoutMs, pollMs)
} else {
  die(`unknown command: ${command}`)
}
