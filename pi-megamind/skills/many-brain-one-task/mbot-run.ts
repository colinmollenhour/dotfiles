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
 *   bun mbot-run.ts launch --plan .tmp/ultra-N/plan.json [--detach]
 *   bun mbot-run.ts harvest --run-dir .tmp/ultra-N
 *   bun mbot-run.ts candidates --run-dir .tmp/ultra-N
 *   bun mbot-run.ts status --run-dir .tmp/ultra-N
 *   bun mbot-run.ts barrier --run-dir .tmp/ultra-N [--timeout-ms 1200000]
 *   bun mbot-run.ts usage --run-dir .tmp/ultra-N [--title-prefix P] [--since 14d]
 *
 * Per-slot wall: launch writes started_at when the worker actually starts,
 * ended_at + wall_ms when the child returns. harvest MUST NOT stamp a shared
 * batch-completion ended_at over those values.
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
import { randomUUID } from "node:crypto"
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
  defaultOpencodeAgent,
  defaultOpencodeVariant,
  inferProjectDir,
  resolvePlanPath,
} from "./mbot-paths.ts"

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
  /** OpenCode agent name. GPT slots default to colin-mbot-gpt. */
  agent?: string
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
  /** Default OpenCode agent when a slot does not set `agent`. */
  opencode_agent?: string
  /** Default OpenCode variant when a slot does not set `variant`. */
  variant?: string
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
  title?: string
  session_id?: string | null
  /** Absolute transcript path for `agentsview session sync`. */
  session_file?: string | null
  exit?: number | null
  started_at?: string
  ended_at?: string
  /** Process wall in ms (ended_at − started_at). Survives harvest. */
  wall_ms?: number
  cost_usd?: number | null
  cost_source?: "grok_json" | "occtl" | "agentsview" | "unavailable" | "none"
  usage?: Record<string, unknown>
  bytes?: number
  markers?: { verdict: number; issue: number }
  status: SlotStatus
  error?: string
  terminal?: boolean
  recovered?: boolean
}

interface UltraReviewIdentity {
  product: string
  version: string
  label: string
  header: string
  notes?: string
}

interface State {
  phase: string
  updated_at: string
  run_dir: string
  slots: Record<string, Meta>
  opencode?: OpencodePreflight
  /** Frozen at first mbot-run command of the run. Do not overwrite later. */
  ultra_review?: UltraReviewIdentity
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

const ULTRA_REVIEW_VERSION_FILE = join(SCRIPT_DIR, "ultra-review-version.json")

export function loadUltraReviewIdentity(): UltraReviewIdentity {
  let product = "Ultra Review"
  let version = "0.0"
  let notes: string | undefined
  if (existsSync(ULTRA_REVIEW_VERSION_FILE)) {
    try {
      const raw = readJson<{ product?: string; version?: string; notes?: string }>(
        ULTRA_REVIEW_VERSION_FILE,
      )
      if (raw.product?.trim()) product = raw.product.trim()
      if (raw.version?.trim()) version = raw.version.trim()
      if (raw.notes?.trim()) notes = raw.notes.trim()
    } catch {
      /* keep defaults */
    }
  }
  return {
    product,
    version,
    label: `${product} ${version}`,
    header: `AI Ultra Review ${version}`,
    notes,
  }
}

/** Freeze identity on init/launch. Never overwrite, never backfill an old run at harvest. */
function freezeUltraReview(state: State): UltraReviewIdentity {
  if (state.ultra_review?.version) return state.ultra_review
  state.ultra_review = loadUltraReviewIdentity()
  return state.ultra_review
}

function abs(runDir: string, p: string, projectDir?: string): string {
  return resolvePlanPath(p, {
    runDir,
    projectDir: projectDir || inferProjectDir(runDir),
  })
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

function wallMs(startedAt?: string, endedAt?: string): number | undefined {
  if (!startedAt || !endedAt) return undefined
  const a = Date.parse(startedAt)
  const b = Date.parse(endedAt)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined
  return b - a
}

function writeSessionSidecar(outPath: string, sessionId: string): void {
  const id = sessionId.trim()
  if (!id) return
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath + ".session", `${id}\n`)
}

interface GrokJson {
  text?: string
  sessionId?: string
  total_cost_usd?: number
  usage?: Record<string, unknown>
  modelUsage?: Record<string, unknown>
  num_turns?: number
  requestId?: string
  [key: string]: unknown
}

function parseGrokStdout(stdout: string): { text: string; parsed: GrokJson | null } {
  const trimmed = stdout.trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start < 0 || end <= start) return { text: stdout, parsed: null }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as GrokJson
    const text = typeof parsed.text === "string" ? parsed.text : stdout
    return { text, parsed }
  } catch {
    return { text: stdout, parsed: null }
  }
}

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), ".local/share")
}

function grokSessionsRoot(): string {
  return join(homedir(), ".grok", "sessions")
}

/** Locate the on-disk OpenCode session JSON for agentsview sync. */
function findOpencodeSessionFile(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null
  const raw = sessionId.replace(/^opencode:/, "").trim()
  if (!raw.startsWith("ses_")) return null
  const name = raw.endsWith(".json") ? raw : `${raw}.json`
  const root = join(xdgDataHome(), "opencode", "storage", "session")
  if (!existsSync(root)) return null
  try {
    for (const proj of readdirSync(root)) {
      const p = join(root, proj, name)
      if (existsSync(p)) return p
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Locate Grok `summary.json` (cwd-encoded / walk). */
function findGrokSessionFile(
  sessionId: string | null | undefined,
  cwd?: string,
): string | null {
  if (!sessionId) return null
  const raw = sessionId.replace(/^grok:/, "").trim()
  if (!raw) return null
  const root = grokSessionsRoot()
  if (!existsSync(root)) return null
  const candidates: string[] = []
  if (cwd) {
    candidates.push(join(root, encodeURIComponent(resolve(cwd)), raw, "summary.json"))
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  try {
    for (const dir of readdirSync(root)) {
      const p = join(root, dir, raw, "summary.json")
      if (existsSync(p)) return p
    }
  } catch {
    /* ignore */
  }
  return null
}

function resolveSessionFile(
  sessionId: string | null | undefined,
  harness: string,
  cwd?: string,
): string | null {
  if (!sessionId) return null
  const h = harness.toLowerCase()
  if (h.includes("grok")) return findGrokSessionFile(sessionId, cwd)
  if (h.includes("opencode") || h.includes("occtl")) {
    return findOpencodeSessionFile(sessionId)
  }
  return findOpencodeSessionFile(sessionId) || findGrokSessionFile(sessionId, cwd)
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

function opencodeAgentInstalled(name: string, projectDir: string): boolean {
  const files = [
    join(projectDir, ".opencode", "agents", `${name}.md`),
    join(homedir(), ".opencode", "agents", `${name}.md`),
    join(homedir(), ".config", "opencode", "agents", `${name}.md`),
  ]
  return files.some((p) => existsSync(p))
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
  agent?: string
  title?: string
  message: string
}): string[] {
  // ALL flags before --
  const args = ["run", "--model", opts.model]
  if (opts.variant) args.push("--variant", opts.variant)
  if (opts.agent) args.push("--agent", opts.agent)
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
  const projectDir = inferProjectDir(runDir, plan.project_dir)
  const promptPath = abs(runDir, slot.prompt, projectDir)
  const outPath = abs(runDir, slot.out, projectDir)
  const metaPath = outPath.replace(/\.out$/, "") + ".meta.json"
  const errPath = outPath + ".err"
  mkdirSync(dirname(outPath), { recursive: true })

  const plannedHarness = slot.harness
  let prior: Meta | null = null
  if (existsSync(metaPath)) {
    try {
      prior = readJson<Meta>(metaPath)
    } catch {
      prior = null
    }
  }
  const startedAt = nowIso()
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
    title: slot.title,
    started_at: startedAt,
    status: "running",
    terminal: false,
  }

  function finish(partial: Meta): Meta {
    // External slots with no body yet: do not stamp ended_at = started_at
    // (that produced wall_ms: 0). Harvest fills wall from file mtime later.
    const ended =
      partial.ended_at !== undefined
        ? partial.ended_at
        : partial.status === "external" && !partial.bytes
          ? undefined
          : nowIso()
    const m: Meta = {
      ...partial,
      title: partial.title || slot.title,
      ended_at: ended,
      wall_ms: partial.wall_ms ?? wallMs(partial.started_at || startedAt, ended),
    }
    writeJson(metaPath, m)
    return m
  }

  if (slot.skip || slot.harness === "external") {
    let body = ""
    if (existsSync(outPath)) {
      try {
        body = readFileSync(outPath, "utf8")
      } catch {
        body = ""
      }
    }
    const rich = isRich(body)
    let ended: string | undefined
    let wall: number | undefined
    if (rich) {
      try {
        ended = statSync(outPath).mtime.toISOString()
        wall = wallMs(startedAt, ended)
      } catch {
        ended = nowIso()
        wall = wallMs(startedAt, ended)
      }
    }
    return finish({
      ...baseMeta,
      status: slot.harness === "external" ? "external" : "skipped",
      actual_harness: slot.harness === "external" ? "external" : slot.harness,
      exit: null,
      terminal: true,
      attach_mode: "none",
      bytes: body.length,
      markers: countMarkers(body),
      ended_at: ended,
      wall_ms: wall,
    })
  }

  if (!existsSync(promptPath)) {
    return finish({
      ...baseMeta,
      status: "failed",
      error: `prompt missing: ${promptPath}`,
      exit: 2,
      terminal: true,
    })
  }

  // Already rich result? Skip re-launch. Keep original timestamps/session/cost.
  if (existsSync(outPath)) {
    try {
      const existing = readFileSync(outPath, "utf8")
      if (isRich(existing)) {
        const markers = countMarkers(existing)
        const ended = prior?.ended_at || nowIso()
        const started = prior?.started_at || startedAt
        return finish({
          ...baseMeta,
          ...(prior || {}),
          status: "ok",
          bytes: existing.length,
          markers,
          started_at: started,
          ended_at: ended,
          wall_ms: prior?.wall_ms ?? wallMs(started, ended),
          exit: prior?.exit ?? 0,
          error: "already complete; skipped re-launch",
          terminal: true,
        })
      }
    } catch {
      /* re-run */
    }
  }

  writeJson(metaPath, baseMeta)

  const timeoutMs = plan.timeout_ms ?? DEFAULT_SLOT_TIMEOUT_MS
  let code = 1
  let stderr = ""
  let actualHarness = plannedHarness
  let attachMode: Meta["attach_mode"] = "none"
  let actualModel = slot.provider_model_id || slot.planned_model
  let capturedSessionId: string | null = null
  let capturedCostUsd: number | null = null
  let capturedCostSource: Meta["cost_source"]
  let capturedUsage: Record<string, unknown> | undefined

  if (slot.harness === "grok") {
    actualHarness = "grok"
    const grokSessionId = randomUUID()
    writeSessionSidecar(outPath, grokSessionId)
    capturedSessionId = grokSessionId
    const args = [
      "--prompt-file",
      promptPath,
      "--always-approve",
      "--output-format",
      "json",
      "--session-id",
      grokSessionId,
      "--reasoning-effort",
      slot.variant === "max" || slot.variant === "xhigh" ? "max" : "high",
      "--disallowed-tools",
      "Agent",
    ]
    if (slot.provider_model_id) args.push("-m", slot.provider_model_id)
    const r = await runCmd("grok", args, { cwd: projectDir, timeoutMs })
    code = r.code
    stderr = r.stderr
    const grok = parseGrokStdout(r.stdout)
    writeFileSync(outPath, grok.text)
    if (stderr) writeFileSync(errPath, stderr)
    if (grok.parsed) {
      if (grok.parsed.sessionId) {
        capturedSessionId = grok.parsed.sessionId
        writeSessionSidecar(outPath, grok.parsed.sessionId)
      }
      if (
        typeof grok.parsed.total_cost_usd === "number" &&
        Number.isFinite(grok.parsed.total_cost_usd)
      ) {
        capturedCostUsd = grok.parsed.total_cost_usd
        capturedCostSource = "grok_json"
      }
      if (grok.parsed.usage && typeof grok.parsed.usage === "object") {
        capturedUsage = grok.parsed.usage
      }
      writeJson(outPath + ".usage.json", {
        sessionId: capturedSessionId,
        total_cost_usd: capturedCostUsd,
        usage: grok.parsed.usage,
        modelUsage: grok.parsed.modelUsage,
        num_turns: grok.parsed.num_turns,
        requestId: grok.parsed.requestId,
      })
    }
  } else if (slot.harness === "opencode" || slot.harness === "occtl") {
    // Resolve OpenCode transport from preflight
    const mode = preflight?.mode || "local"
    if (mode === "skip") {
      return finish({
        ...baseMeta,
        status: "failed",
        error: `opencode unavailable: ${preflight?.smoke_error || "skip"}`,
        exit: 1,
        terminal: true,
        actual_harness: "opencode",
        attach_mode: "none",
      })
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

    const variant =
      slot.variant !== undefined
        ? defaultOpencodeVariant(slot.variant)
        : defaultOpencodeVariant(plan.variant)
    const requestedAgent =
      slot.agent !== undefined
        ? slot.agent || undefined
        : plan.opencode_agent || defaultOpencodeAgent(actualModel)
    const agentExplicit = slot.agent !== undefined || Boolean(plan.opencode_agent)
    const agent =
      requestedAgent &&
      (agentExplicit || opencodeAgentInstalled(requestedAgent, projectDir))
        ? requestedAgent
        : undefined

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
          variant,
          agent,
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
      if (variant) args.push("--variant", variant)
      if (agent) args.push("--agent", agent)
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
    return finish({
      ...baseMeta,
      status: "failed",
      error: `unknown harness: ${slot.harness}`,
      exit: 2,
      terminal: true,
    })
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
    sessionId: capturedSessionId,
    attach: attachMode === "attach" ? (preflight?.attach_url || plan.attach) : undefined,
    password: plan.password,
    abortFirst: code === 124 || code === 130 || code === 143,
  })
  const body = recovered.body
  const sessionId = capturedSessionId || recovered.sessionId || readSessionId(outPath)
  const sessionFile = resolveSessionFile(sessionId, actualHarness, projectDir)
  const markers = countMarkers(body)
  const rich = isRich(body)
  let status: SlotStatus = "failed"
  if (code === 124 && rich) status = "ok" // usable timeout body
  else if (code === 124) status = "timeout"
  else if (rich) status = "ok"
  else if (code === 0 && body.trim()) status = "empty"
  else if (code === 0 && !body.trim()) status = "empty"
  else status = "failed"

  return finish({
    ...baseMeta,
    actual_model: actualModel,
    provider_model_id: actualModel,
    actual_harness: actualHarness,
    attach_mode: attachMode,
    status,
    exit: code,
    bytes: body.length,
    markers,
    session_id: sessionId,
    session_file: sessionFile,
    cost_usd: capturedCostUsd,
    cost_source: capturedCostSource,
    usage: capturedUsage,
    recovered: recovered.recovered || undefined,
    terminal: isTerminal(status),
    error:
      status === "ok"
        ? undefined
        : stderr.trim().slice(0, 500) ||
          (status === "empty" ? "empty body (fail-closed)" : `exit ${code}`),
  })
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
  const ultraReview = freezeUltraReview(state)
  saveState(state)
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        run_dir: absDir,
        ultra_review: ultraReview,
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

function mergePlanRegistry(runDir: string, incoming: Plan): void {
  const registryPath = join(runDir, "plan.json")
  writeJson(join(runDir, "plan-launched.json"), incoming)
  if (!existsSync(registryPath)) {
    writeJson(registryPath, incoming)
    return
  }
  let existing: Plan
  try {
    existing = readJson<Plan>(registryPath)
  } catch {
    writeJson(registryPath, incoming)
    return
  }
  const byId = new Map<string, Slot>()
  for (const s of existing.slots || []) byId.set(s.slot, s)
  for (const s of incoming.slots) byId.set(s.slot, s)
  const merged: Plan = {
    ...existing,
    ...incoming,
    slots: [...byId.values()],
  }
  writeJson(registryPath, merged)
}

function cmdLaunchDetach(planPath: string): void {
  const absPlan = resolve(planPath)
  if (!existsSync(absPlan)) die(`plan not found: ${absPlan}`)
  const incoming = readJson<Plan>(absPlan)
  if (!incoming.run_dir) die("plan.run_dir is required")
  const runDir = resolve(incoming.run_dir)
  mkdirSync(runDir, { recursive: true })
  const logPath = join(runDir, "launch-detach.log")
  const pidPath = join(runDir, "launch.pid")
  const fd = openSync(logPath, "a")
  const script = fileURLToPath(import.meta.url)
  const child = spawn(process.execPath, [script, "launch", "--plan", absPlan], {
    detached: true,
    stdio: ["ignore", fd, fd],
    cwd: process.cwd(),
    env: process.env,
  })
  closeSync(fd)
  if (child.pid == null) die("failed to spawn detached launch")
  writeFileSync(pidPath, `${child.pid}\n`)
  child.unref()
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        detached: true,
        pid: child.pid,
        log: logPath,
        pid_file: pidPath,
        run_dir: runDir,
        hint: `bun mbot-run.ts barrier --run-dir ${runDir} --timeout-ms ${incoming.timeout_ms ?? DEFAULT_SLOT_TIMEOUT_MS}`,
      },
      null,
      2,
    ) + "\n",
  )
}

async function cmdLaunch(planPath: string): Promise<void> {
  if (!existsSync(planPath)) die(`plan not found: ${planPath}`)
  const plan = readJson<Plan>(planPath)
  if (!plan.run_dir) die("plan.run_dir is required")
  if (!Array.isArray(plan.slots) || plan.slots.length === 0) die("plan.slots must be a non-empty array")

  const runDir = resolve(plan.run_dir)
  mkdirSync(join(runDir, "results"), { recursive: true })
  plan.run_dir = runDir
  plan.project_dir = inferProjectDir(runDir, plan.project_dir)
  mergePlanRegistry(runDir, plan)

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
  const ultraReview = freezeUltraReview(state)
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
    ultra_review: ultraReview,
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
      session_id: m.session_id,
      session_file: m.session_file,
      wall_ms: m.wall_ms,
      cost_usd: m.cost_usd,
      cost_source: m.cost_source,
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

  const sessionId = salvaged.sessionId || meta?.session_id || readSessionId(outPath)
  const sessionFile =
    meta?.session_file ||
    resolveSessionFile(
      sessionId,
      meta?.actual_harness || meta?.harness || "",
      dirname(outPath),
    )
  // Keep launch's per-slot ended_at. Harvest-time nowIso() would stamp the
  // same batch-completion instant on every slot and destroy wall time.
  // External slots often have wall_ms 0 / ended_at = started_at; fill from
  // the result file mtime once a body exists.
  let startedAt = meta?.started_at
  let endedAt = meta?.ended_at
  let wall = meta?.wall_ms
  const externalish =
    meta?.status === "external" ||
    meta?.harness === "external" ||
    meta?.actual_harness === "external"
  if (rich && existsSync(outPath) && (externalish || !wall)) {
    try {
      const st = statSync(outPath)
      const mtime = st.mtime.toISOString()
      if (!endedAt || wall === 0 || wall == null) endedAt = mtime
      if (!startedAt) {
        const errPath = outPath + ".err"
        if (existsSync(errPath)) {
          startedAt = statSync(errPath).birthtime.toISOString()
        }
      }
      wall = wall && wall > 0 ? wall : wallMs(startedAt, endedAt)
    } catch {
      /* keep meta times */
    }
  }
  if (!endedAt && !externalish) endedAt = nowIso()

  const next: Meta = {
    ...(meta || {
      slot,
      planned_model: "unknown",
      actual_model: "unknown",
      harness: "unknown",
      backup_used: false,
      prompt: "",
      out: outPath,
      status,
    }),
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
    title: meta?.title,
    session_id: sessionId,
    session_file: sessionFile,
    recovered: salvaged.recovered || meta?.recovered || undefined,
    exit: meta?.exit ?? null,
    started_at: startedAt,
    ended_at: endedAt,
    wall_ms: wall ?? wallMs(startedAt, endedAt),
    cost_usd: meta?.cost_usd,
    cost_source: meta?.cost_source,
    usage: meta?.usage,
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
    ultra_review: state.ultra_review ?? null,
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
      session_id: m.session_id,
      wall_ms: m.wall_ms,
      cost_usd: m.cost_usd,
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
    ultra_review: state.ultra_review ?? null,
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
  const projectDir = inferProjectDir(absDir, plan.project_dir)
  const expected = plan.slots.map((s) => s.slot)
  const t0 = Date.now()

  while (Date.now() - t0 < timeoutMs) {
    const state = loadState(absDir)
    // refresh from disk metas
    for (const s of plan.slots) {
      const outPath = abs(absDir, s.out, projectDir)
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
              prompt: abs(absDir, s.prompt, projectDir),
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

const AGENTSVIEW_USAGE = join(SCRIPT_DIR, "agentsview-usage.ts")
const CANDIDATES_HELPER = join(SCRIPT_DIR, "mbot-candidates.ts")

function envParentSessionIds(): string[] {
  const keys = [
    "OPENCODE_SESSION",
    "OPENCODE_SESSION_ID",
    "OCCTL_SESSION",
    "GROK_SESSION_ID",
  ]
  const out: string[] = []
  for (const k of keys) {
    const v = process.env[k]?.trim()
    if (v) out.push(v)
  }
  return out
}

function cmdUsage(opts: {
  runDir: string
  titlePrefix?: string
  since?: string
  out?: string
  includeClaudeChildren?: boolean
  parentSessionIds?: string[]
  noAgentsview?: boolean
}): void {
  if (!existsSync(AGENTSVIEW_USAGE)) {
    die(`usage helper missing: ${AGENTSVIEW_USAGE}`)
  }
  const args = [AGENTSVIEW_USAGE, "--run-dir", opts.runDir]
  if (opts.titlePrefix) args.push("--title-prefix", opts.titlePrefix)
  if (opts.since) args.push("--since", opts.since)
  if (opts.out) args.push("--out", opts.out)
  if (opts.includeClaudeChildren) args.push("--include-claude-children")
  for (const id of opts.parentSessionIds || []) {
    args.push("--parent-session-id", id)
  }
  if (opts.noAgentsview) args.push("--no-agentsview")
  const r = spawnSync("bun", args, {
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  })
  process.exit(r.status ?? 1)
}

function cmdCandidates(runDir: string): void {
  if (!existsSync(CANDIDATES_HELPER)) die(`candidates helper missing: ${CANDIDATES_HELPER}`)
  const r = spawnSync("bun", [CANDIDATES_HELPER, "--run-dir", runDir], {
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  })
  process.exit(r.status ?? 1)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0]
  if (!command || command === "-h" || command === "--help") {
    process.stdout.write(`Usage:
  mbot-run.ts init --run-dir <dir>
  mbot-run.ts smoke --run-dir <dir> [--attach URL] [--model ID] [--mode auto|attach|local|skip]
  mbot-run.ts launch --plan <plan.json> [--detach]
  mbot-run.ts harvest --run-dir <dir>
  mbot-run.ts candidates --run-dir <dir>
  mbot-run.ts status --run-dir <dir>
  mbot-run.ts barrier --run-dir <dir> [--timeout-ms N] [--poll-ms N]
  mbot-run.ts usage --run-dir <dir> [--title-prefix P] [--since 14d] [--include-claude-children] [--parent-session-id ID] [--out path]
  mbot-run.ts version
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
      "title-prefix": { type: "string" },
      since: { type: "string" },
      out: { type: "string" },
      "include-claude-children": { type: "boolean" },
      "parent-session-id": { type: "string", multiple: true },
      "no-agentsview": { type: "boolean" },
      detach: { type: "boolean" },
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
      "title-prefix"?: string
      since?: string
      out?: string
      "include-claude-children"?: boolean
      "parent-session-id"?: string | string[]
      "no-agentsview"?: boolean
      detach?: boolean
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
    if (values.detach) {
      cmdLaunchDetach(values.plan)
      return
    }
    await cmdLaunch(values.plan)
  } else if (command === "harvest") {
    if (!values["run-dir"]) die("--run-dir is required")
    cmdHarvest(values["run-dir"])
  } else if (command === "candidates") {
    if (!values["run-dir"]) die("--run-dir is required")
    cmdCandidates(values["run-dir"])
  } else if (command === "status") {
    if (!values["run-dir"]) die("--run-dir is required")
    cmdStatus(values["run-dir"])
  } else if (command === "barrier") {
    if (!values["run-dir"]) die("--run-dir is required")
    const timeoutMs = values["timeout-ms"] ? Number(values["timeout-ms"]) : DEFAULT_SLOT_TIMEOUT_MS
    const pollMs = values["poll-ms"] ? Number(values["poll-ms"]) : 5000
    await cmdBarrier(values["run-dir"], timeoutMs, pollMs)
  } else if (command === "version") {
    process.stdout.write(JSON.stringify(loadUltraReviewIdentity(), null, 2) + "\n")
  } else if (command === "usage") {
    if (!values["run-dir"]) die("--run-dir is required")
    const p = values["parent-session-id"]
    const fromFlags = Array.isArray(p) ? p : p ? [p] : []
    const parentSessionIds = [...fromFlags, ...envParentSessionIds()]
    cmdUsage({
      runDir: values["run-dir"],
      titlePrefix: values["title-prefix"],
      since: values.since,
      out: values.out,
      includeClaudeChildren: Boolean(values["include-claude-children"]),
      parentSessionIds,
      noAgentsview: Boolean(values["no-agentsview"]),
    })
  } else {
    die(`unknown command: ${command}`)
  }
}

if (import.meta.main) {
  await main()
}
