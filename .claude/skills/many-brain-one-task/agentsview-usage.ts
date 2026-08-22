#!/usr/bin/env bun
/**
 * agentsview-usage.ts — harvest per-slot wall, cost, peak context, and compactions
 * for an MBOT / ultra run via agentsview.
 *
 * Reads results/*.meta.json (+ *.session sidecars, plan.json titles), queries agentsview
 * session usage + session get, optionally rediscovers OpenCode sessions by structured
 * title prefix, and writes agentsview-usage.json under the run dir.
 *
 * Usage:
 *   bun agentsview-usage.ts --run-dir .tmp/ultra-N
 *   bun agentsview-usage.ts --run-dir .tmp/ultra-N --title-prefix 'ultra|shipstream/server|!2783'
 *   bun agentsview-usage.ts --run-dir .tmp/ultra-N --since 14d --include-claude-children
 *   bun agentsview-usage.ts --run-dir .tmp/ultra-N --no-agentsview   # wall from meta only
 *
 * stdout: one JSON summary (same shape as the written file). Exit 0 always when the run
 * dir is readable; cost gaps are recorded, not fatal.
 */

import { spawnSync } from "node:child_process"
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { parseArgs } from "node:util"

// --- types ---

interface SlotMeta {
  slot?: string
  phase?: string
  planned_model?: string
  actual_model?: string
  display_name?: string
  provider_model_id?: string
  harness?: string
  actual_harness?: string
  backup_used?: boolean
  prompt?: string
  out?: string
  session_id?: string | null
  session_file?: string | null
  title?: string
  exit?: number | null
  started_at?: string
  ended_at?: string
  completed_at?: string
  wall_ms?: number
  cost_usd?: number | null
  cost_source?: string
  usage?: Record<string, unknown>
  status?: string
  [key: string]: unknown
}

interface PlanSlot {
  slot?: string
  title?: string
  out?: string
  planned_model?: string
  harness?: string
}

interface PlanFile {
  run_dir?: string
  slots?: PlanSlot[]
}

interface AgentsviewUsage {
  session_id?: string
  agent?: string
  project?: string
  total_output_tokens?: number
  peak_context_tokens?: number
  has_token_data?: boolean
  cost?: { microdollars?: number }
  has_cost?: boolean
  cost_source?: string
  models?: string[]
  error?: string
}

interface AgentsviewSession {
  id?: string
  agent?: string
  first_message?: string
  display_name?: string | null
  started_at?: string
  ended_at?: string
  total_output_tokens?: number
  peak_context_tokens?: number
  has_peak_context_tokens?: boolean
  compaction_count?: number
  mid_task_compaction_count?: number
  context_pressure_max?: number | null
  message_count?: number
  user_message_count?: number
  parent_session_id?: string | null
  relationship_type?: string
  project?: string
  cwd?: string
}

/** parent = orchestrator session; slice = participant thread; unknown = unmatched */
type SessionRole = "parent" | "slice" | "unknown"

interface SlotUsage {
  slot: string
  /** parent | slice | unknown — parent rows are synthetic (not plan slots). */
  role: SessionRole
  actual_model: string
  display_name?: string
  harness: string
  status?: string
  session_id: string | null
  agentsview_id: string | null
  parent_session_id: string | null
  title: string | null
  started_at: string | null
  ended_at: string | null
  wall_seconds: number | null
  wall_source: "meta" | "meta_wall_ms" | "agentsview" | "none"
  cost_usd: number | null
  cost_microdollars: number | null
  has_cost: boolean
  cost_source: "agentsview" | "grok_json" | "meta" | "occtl" | "unavailable" | "none"
  total_output_tokens: number | null
  peak_context_tokens: number | null
  /** True when agentsview reported a peak (including 0). */
  has_peak_context: boolean
  compaction_count: number | null
  mid_task_compaction_count: number | null
  context_pressure_max: number | null
  message_count: number | null
  models: string[]
  match:
    | "meta_session"
    | "session_file"
    | "title"
    | "claude_child"
    | "parent_session"
    | "none"
  error?: string
}

interface ModelRollup {
  actual_model: string
  slots: number
  sessions_matched: number
  sessions_missing: number
  wall_seconds: number
  cost_usd: number
  cost_microdollars: number
  has_partial_cost: boolean
  /** Max peak_context_tokens across matched slots for this model. */
  peak_context_max: number | null
  /** Mean peak among slots with has_peak_context. */
  peak_context_avg: number | null
  slots_with_peak: number
  compaction_count: number
  mid_task_compaction_count: number
  slots_with_compaction: number
  context_pressure_max: number | null
}

interface RoleRollup {
  role: SessionRole
  sessions: number
  sessions_matched: number
  wall_seconds: number
  cost_usd: number
  cost_microdollars: number
  peak_context_max: number | null
  peak_context_avg: number | null
  peak_context_min: number | null
  slots_with_peak: number
  compaction_count: number
  mid_task_compaction_count: number
  slots_with_compaction: number
  context_pressure_max: number | null
  /** Heuristic notes for ultra interpretation */
  notes: string[]
}

interface UsageReport {
  ok: boolean
  run_dir: string
  generated_at: string
  agentsview_available: boolean
  agentsview_error?: string
  title_prefix: string | null
  since: string
  include_claude_children: boolean
  parent_session_ids: string[]
  /** All rows: plan slots (role=slice|unknown) + synthetic parent rows. */
  slots: SlotUsage[]
  /** Participant plan slots only (excludes synthetic parents). */
  slices: SlotUsage[]
  /** Orchestrator sessions discovered via agent parent_session_id or --parent-session-id. */
  parents: SlotUsage[]
  by_model: ModelRollup[]
  /** Slice-only by_model (excludes parents so Opus parent doesn't inflate slice stats). */
  by_model_slices: ModelRollup[]
  by_role: RoleRollup[]
  totals: {
    slots: number
    sessions_matched: number
    sessions_missing: number
    wall_agent_seconds: number
    wall_run_seconds: number | null
    run_started_at: string | null
    run_ended_at: string | null
    cost_usd: number
    cost_microdollars: number
    has_partial_cost: boolean
    peak_context_max: number | null
    peak_context_avg: number | null
    slots_with_peak: number
    compaction_count: number
    mid_task_compaction_count: number
    slots_with_compaction: number
    context_pressure_max: number | null
  }
  discovered_extra: Array<{
    agentsview_id: string
    title: string | null
    started_at: string | null
    ended_at: string | null
    wall_seconds: number | null
    cost_usd: number | null
    cost_microdollars: number | null
    has_cost: boolean
    peak_context_tokens: number | null
    compaction_count: number | null
    mid_task_compaction_count: number | null
    models: string[]
  }>
  out_path: string
}

// --- utils ---

function die(msg: string, code = 2): never {
  process.stderr.write(`agentsview-usage: ${msg}\n`)
  process.exit(code)
}

function nowIso(): string {
  return new Date().toISOString()
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}

function parseIsoMs(s: string | null | undefined): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function wallSeconds(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const a = parseIsoMs(start)
  const b = parseIsoMs(end)
  if (a == null || b == null || b < a) return null
  return Math.round((b - a) / 1000)
}

function microToUsd(micro: number | null | undefined): number | null {
  if (micro == null || !Number.isFinite(micro)) return null
  return Math.round(micro) / 1_000_000
}

function which(bin: string): string | null {
  const r = spawnSync("which", [bin], { encoding: "utf8" })
  if (r.status !== 0) return null
  const p = (r.stdout || "").trim().split("\n")[0]
  return p || null
}

function runAgentsview(
  args: string[],
  timeoutMs = 30_000,
): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const r = spawnSync("agentsview", args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  })
  return {
    ok: r.status === 0,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    status: r.status,
  }
}

/** Prefer opencode:ses_… form; also accept raw ses_… / agent-… / uuid. */
function normalizeSessionId(id: string | null | undefined): string | null {
  if (!id) return null
  const s = id.trim()
  if (!s) return null
  // Already qualified or non-opencode
  if (s.includes(":")) return s
  if (s.startsWith("ses_")) return `opencode:${s}`
  return s
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sessionIdCandidates(id: string, harness?: string): string[] {
  const n = normalizeSessionId(id)
  if (!n) return []
  const out = [n]
  if (n.startsWith("opencode:")) {
    const raw = n.slice("opencode:".length)
    if (raw) out.push(raw)
  } else if (n.startsWith("ses_")) {
    out.push(`opencode:${n}`)
  } else if (n.startsWith("grok:")) {
    const raw = n.slice("grok:".length)
    if (raw) out.push(raw)
  } else if (UUID_RE.test(n)) {
    const h = (harness || "").toLowerCase()
    if (h.includes("grok")) out.push(`grok:${n}`)
    else {
      out.push(`grok:${n}`)
      out.push(`claude:${n}`)
    }
  }
  return [...new Set(out)]
}

function readSessionFile(paths: string[]): string | null {
  for (const p of paths) {
    if (!p || !existsSync(p)) continue
    try {
      const line = readFileSync(p, "utf8").trim().split("\n")[0]?.trim()
      if (line) return line
    } catch {
      /* ignore */
    }
  }
  return null
}

function slotNameFromMetaPath(metaPath: string): string {
  const base = metaPath.split("/").pop() || "unknown"
  return base.replace(/\.meta\.json$/, "")
}

/**
 * Resolve the harness --out path. Older metas store project-relative paths
 * (`.tmp/ultra-N/results/x.out`) which are wrong when resolved under run-dir;
 * prefer the sibling of the meta file when it exists.
 */
function outPathFromMeta(runDir: string, meta: SlotMeta, metaPath: string): string {
  const sibling = metaPath.replace(/\.meta\.json$/, ".out")
  if (existsSync(sibling)) return sibling

  if (meta.out) {
    if (isAbsolute(meta.out) && existsSync(meta.out)) return meta.out
    const fromRun = resolve(runDir, meta.out)
    if (existsSync(fromRun)) return fromRun
    // project-relative: .tmp/ultra-N/results/foo.out → runDir/results/foo.out
    const basen = meta.out.replace(/^.*\/results\//, "")
    const fromResults = join(runDir, "results", basen)
    if (existsSync(fromResults)) return fromResults
  }
  return sibling
}

function sessionSidecarPaths(outPath: string, metaPath: string): string[] {
  return [
    metaPath.replace(/\.meta\.json$/, ".out.session"),
    outPath + ".session",
    outPath.replace(/\.out$/, "") + ".session",
  ]
}

function usageSidecarPaths(outPath: string, metaPath: string): string[] {
  return [
    outPath + ".usage.json",
    metaPath.replace(/\.meta\.json$/, ".out.usage.json"),
    outPath.replace(/\.out$/, "") + ".usage.json",
  ]
}

function readUsageSidecar(paths: string[]): {
  sessionId?: string
  total_cost_usd?: number
} | null {
  for (const p of paths) {
    if (!p || !existsSync(p)) continue
    try {
      const u = readJson<{ sessionId?: string; total_cost_usd?: number }>(p)
      if (u && (u.sessionId || typeof u.total_cost_usd === "number")) return u
    } catch {
      /* ignore */
    }
  }
  return null
}

function syncSessionPath(path: string): boolean {
  if (!path || !existsSync(path)) return false
  const r = runAgentsview(["session", "sync", path, "--json"], 45_000)
  return r.ok
}

/** Longest common title prefix ending at a pipe boundary when possible. */
function commonTitlePrefix(titles: string[]): string | null {
  const cleaned = titles.map((t) => t.trim()).filter(Boolean)
  if (cleaned.length === 0) return null
  if (cleaned.length === 1) {
    // ultra|proj|!N|… → ultra|proj|!N
    const parts = cleaned[0].split("|")
    if (parts.length >= 3) return parts.slice(0, 3).join("|")
    return cleaned[0]
  }
  let prefix = cleaned[0]
  for (let i = 1; i < cleaned.length; i++) {
    const t = cleaned[i]
    let j = 0
    while (j < prefix.length && j < t.length && prefix[j] === t[j]) j++
    prefix = prefix.slice(0, j)
  }
  // Trim to last complete pipe field
  const pipe = prefix.lastIndexOf("|")
  if (pipe > 0) prefix = prefix.slice(0, pipe)
  // Prefer ultra|project|!iid when present
  const m = prefix.match(/^(ultra\|[^|]+\|![^|]+)/)
  if (m) return m[1]
  return prefix.length >= 8 ? prefix : null
}

function loadMetas(resultsDir: string): Array<{ path: string; meta: SlotMeta }> {
  if (!existsSync(resultsDir)) return []
  return readdirSync(resultsDir)
    .filter((f) => f.endsWith(".meta.json"))
    .sort()
    .map((f) => {
      const path = join(resultsDir, f)
      try {
        return { path, meta: readJson<SlotMeta>(path) }
      } catch {
        return { path, meta: { slot: slotNameFromMetaPath(path) } }
      }
    })
}

function loadPlan(runDir: string): PlanFile | null {
  const p = join(runDir, "plan.json")
  if (!existsSync(p)) return null
  try {
    return readJson<PlanFile>(p)
  } catch {
    return null
  }
}

function titleForSlot(
  slot: string,
  outRel: string | undefined,
  plan: PlanFile | null,
  meta: SlotMeta,
): string | null {
  if (typeof meta.title === "string" && meta.title.trim()) return meta.title.trim()
  if (!plan?.slots) return null
  for (const s of plan.slots) {
    if (s.slot === slot && s.title) return s.title
    if (outRel && s.out && (s.out === outRel || s.out.endsWith(outRel)) && s.title) {
      return s.title
    }
    if (s.out && meta.out && (s.out === meta.out || meta.out.endsWith(s.out)) && s.title) {
      return s.title
    }
  }
  return null
}

const usageCache = new Map<string, AgentsviewUsage | null>()
const sessionGetCache = new Map<string, AgentsviewSession | null>()

function fetchUsage(
  sessionId: string,
  retries = 2,
  harness?: string,
): AgentsviewUsage | null {
  const keys = sessionIdCandidates(sessionId, harness)
  for (const key of keys) {
    if (usageCache.has(key)) {
      const hit = usageCache.get(key)
      if (hit) return hit
    }
  }
  // If any candidate is cached as a definitive miss, still try other uncached forms.
  for (const key of keys) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const r = runAgentsview(["session", "usage", key, "--json"], 45_000)
      if (!r.ok) {
        if (attempt < retries) continue
        break
      }
      try {
        const u = JSON.parse(r.stdout) as AgentsviewUsage
        for (const k of keys) usageCache.set(k, u)
        if (u.session_id) usageCache.set(u.session_id, u)
        return u
      } catch {
        if (attempt < retries) continue
      }
    }
  }
  for (const k of keys) {
    if (!usageCache.has(k)) usageCache.set(k, null)
  }
  return null
}

function fetchSessionGet(sessionId: string, harness?: string): AgentsviewSession | null {
  const keys = sessionIdCandidates(sessionId, harness)
  for (const key of keys) {
    if (sessionGetCache.has(key)) {
      const hit = sessionGetCache.get(key)
      if (hit) return hit
    }
  }
  for (const key of keys) {
    const r = runAgentsview(["session", "get", key, "--json"], 30_000)
    if (!r.ok) continue
    try {
      const s = JSON.parse(r.stdout) as AgentsviewSession
      for (const k of keys) sessionGetCache.set(k, s)
      if (s.id) sessionGetCache.set(s.id, s)
      return s
    } catch {
      /* try next */
    }
  }
  for (const k of keys) {
    if (!sessionGetCache.has(k)) sessionGetCache.set(k, null)
  }
  return null
}

/**
 * Enrich a slot from agentsview `session get`: wall (if missing), peak context,
 * compaction counts, message_count, context_pressure_max.
 */
function applySessionSignals(
  row: SlotUsage,
  sessionId: string | null,
): void {
  if (!sessionId) return
  const s = fetchSessionGet(sessionId)
  if (!s) return

  if (row.wall_seconds == null) {
    const w = wallSeconds(s.started_at, s.ended_at)
    if (w != null) {
      row.wall_seconds = w
      row.wall_source = "agentsview"
      row.started_at = row.started_at || s.started_at || null
      row.ended_at = row.ended_at || s.ended_at || null
    }
  } else {
    row.started_at = row.started_at || s.started_at || null
    row.ended_at = row.ended_at || s.ended_at || null
  }

  // Peak: prefer usage value if set; otherwise session get
  const peakFromGet =
    s.has_peak_context_tokens || (s.peak_context_tokens != null && s.peak_context_tokens > 0)
      ? s.peak_context_tokens ?? null
      : s.peak_context_tokens != null
        ? s.peak_context_tokens
        : null
  if (row.peak_context_tokens == null && peakFromGet != null) {
    row.peak_context_tokens = peakFromGet
    row.has_peak_context = Boolean(s.has_peak_context_tokens) || peakFromGet > 0
  } else if (row.peak_context_tokens != null) {
    row.has_peak_context = true
  }

  if (typeof s.compaction_count === "number") {
    row.compaction_count = s.compaction_count
  }
  if (typeof s.mid_task_compaction_count === "number") {
    row.mid_task_compaction_count = s.mid_task_compaction_count
  }
  if (s.context_pressure_max != null && Number.isFinite(s.context_pressure_max)) {
    row.context_pressure_max = s.context_pressure_max
  }
  if (typeof s.message_count === "number") {
    row.message_count = s.message_count
  }
  if (!row.agentsview_id && s.id) row.agentsview_id = s.id
  if (s.parent_session_id) row.parent_session_id = s.parent_session_id
}

/** True if first_message looks like an ultra/MBOT participant prompt. */
function looksLikeSlicePrompt(fm: string | null | undefined): boolean {
  if (!fm) return false
  const t = fm.toLowerCase()
  return (
    t.includes("ultra-review") ||
    t.includes("ultra review") ||
    t.includes("code-review participant") ||
    t.includes("you are a participant") ||
    t.includes("you are one participant") ||
    t.includes("many-brain-one-task") ||
    t.includes("/roles/") ||
    t.includes("verdict:") ||
    /read and follow exactly:.*\.tmp\/ultra/i.test(fm)
  )
}

/** True if first_message looks like the ultra/MBOT parent orchestrator. */
function looksLikeParentPrompt(
  fm: string | null | undefined,
  runDir: string,
): boolean {
  if (!fm) return false
  const t = fm.toLowerCase()
  const runBase = runDir.split("/").filter(Boolean).pop() || ""
  if (runBase && fm.includes(runBase)) return true
  if (fm.includes(runDir)) return true
  return (
    t.includes("colin-ultra-review") ||
    t.includes("workflow-ultra") ||
    t.includes("bot ultra-review") ||
    t.includes("ultra code review") ||
    (t.includes("many-brain-one-task") && t.includes("review this merge"))
  )
}

function sessionToParentRow(
  s: AgentsviewSession,
  usage: AgentsviewUsage | null,
): SlotUsage {
  const fields = mapUsageToSlotFields(usage)
  const wall = wallSeconds(s.started_at, s.ended_at)
  const row: SlotUsage = {
    slot: `parent:${s.id || "unknown"}`,
    role: "parent",
    actual_model:
      (usage?.models && usage.models[0]) ||
      (s.agent === "claude" ? "claude-parent" : s.agent || "unknown"),
    display_name: s.display_name || undefined,
    harness: "parent",
    status: "parent",
    session_id: s.id || null,
    agentsview_id: fields.agentsview_id || s.id || null,
    parent_session_id: null,
    title: s.first_message?.slice(0, 120) || null,
    started_at: s.started_at || null,
    ended_at: s.ended_at || null,
    wall_seconds: wall,
    wall_source: wall != null ? "agentsview" : "none",
    cost_usd: fields.cost_usd,
    cost_microdollars: fields.cost_microdollars,
    has_cost: fields.has_cost,
    cost_source: fields.cost_source,
    total_output_tokens: fields.total_output_tokens ?? s.total_output_tokens ?? null,
    peak_context_tokens: fields.peak_context_tokens ?? s.peak_context_tokens ?? null,
    has_peak_context:
      fields.peak_context_tokens != null ||
      Boolean(s.has_peak_context_tokens) ||
      (s.peak_context_tokens != null && s.peak_context_tokens > 0),
    compaction_count:
      typeof s.compaction_count === "number" ? s.compaction_count : null,
    mid_task_compaction_count:
      typeof s.mid_task_compaction_count === "number"
        ? s.mid_task_compaction_count
        : null,
    context_pressure_max: s.context_pressure_max ?? null,
    message_count: typeof s.message_count === "number" ? s.message_count : null,
    models: fields.models.length ? fields.models : usage?.models || [],
    match: "parent_session",
  }
  if (s.id) applySessionSignals(row, s.id)
  // Prefer real model id from usage
  if (usage?.models?.[0]) row.actual_model = usage.models[0]
  return row
}

function emptyModelRollup(key: string): ModelRollup {
  return {
    actual_model: key,
    slots: 0,
    sessions_matched: 0,
    sessions_missing: 0,
    wall_seconds: 0,
    cost_usd: 0,
    cost_microdollars: 0,
    has_partial_cost: false,
    peak_context_max: null,
    peak_context_avg: null,
    slots_with_peak: 0,
    compaction_count: 0,
    mid_task_compaction_count: 0,
    slots_with_compaction: 0,
    context_pressure_max: null,
  }
}

function rollupSlots(list: SlotUsage[], keyFn: (s: SlotUsage) => string): ModelRollup[] {
  const map = new Map<string, ModelRollup>()
  for (const s of list) {
    const key = keyFn(s)
    let row = map.get(key)
    if (!row) {
      row = emptyModelRollup(key)
      map.set(key, row)
    }
    row.slots++
    if (s.has_cost && s.cost_microdollars != null) {
      row.sessions_matched++
      row.cost_microdollars += s.cost_microdollars
      row.cost_usd = microToUsd(row.cost_microdollars) ?? 0
    } else {
      row.sessions_missing++
      row.has_partial_cost = true
    }
    if (s.wall_seconds != null) row.wall_seconds += s.wall_seconds
    if (s.has_peak_context && s.peak_context_tokens != null) {
      row.slots_with_peak++
      row.peak_context_max =
        row.peak_context_max == null
          ? s.peak_context_tokens
          : Math.max(row.peak_context_max, s.peak_context_tokens)
      const prevSum = (row.peak_context_avg ?? 0) * (row.slots_with_peak - 1)
      row.peak_context_avg = (prevSum + s.peak_context_tokens) / row.slots_with_peak
    }
    if (s.compaction_count != null) {
      row.compaction_count += s.compaction_count
      if (s.compaction_count > 0) row.slots_with_compaction++
    }
    if (s.mid_task_compaction_count != null) {
      row.mid_task_compaction_count += s.mid_task_compaction_count
    }
    if (s.context_pressure_max != null) {
      row.context_pressure_max =
        row.context_pressure_max == null
          ? s.context_pressure_max
          : Math.max(row.context_pressure_max, s.context_pressure_max)
    }
  }
  for (const row of map.values()) {
    if (row.peak_context_avg != null) {
      row.peak_context_avg = Math.round(row.peak_context_avg)
    }
  }
  return [...map.values()].sort((a, b) => a.actual_model.localeCompare(b.actual_model))
}

function rollupRole(role: SessionRole, list: SlotUsage[]): RoleRollup {
  const peaks = list
    .filter((s) => s.has_peak_context && s.peak_context_tokens != null)
    .map((s) => s.peak_context_tokens as number)
  let costMicro = 0
  let matched = 0
  let wall = 0
  let compact = 0
  let mid = 0
  let compactSlots = 0
  let pressure: number | null = null
  for (const s of list) {
    if (s.has_cost && s.cost_microdollars != null) {
      matched++
      costMicro += s.cost_microdollars
    }
    if (s.wall_seconds != null) wall += s.wall_seconds
    if (s.compaction_count != null) {
      compact += s.compaction_count
      if (s.compaction_count > 0) compactSlots++
    }
    if (s.mid_task_compaction_count != null) mid += s.mid_task_compaction_count
    if (s.context_pressure_max != null) {
      pressure =
        pressure == null
          ? s.context_pressure_max
          : Math.max(pressure, s.context_pressure_max)
    }
  }
  const notes: string[] = []
  if (role === "parent") {
    if (compact > 0 || mid > 0) {
      notes.push(
        `Parent compacted ${compact}× total (${mid} mid-task) — control-plane recall risk; keep STATE.json / harvest JSON as source of truth.`,
      )
    }
    if (peaks.length && Math.max(...peaks) >= 200_000) {
      notes.push(
        `Parent peak context ${Math.max(...peaks).toLocaleString()} ≥ 200k — orchestrator is context-heavy; prefer disk over chat for findings.`,
      )
    }
    if (peaks.length && Math.max(...peaks) >= 400_000) {
      notes.push(
        `Parent peak context ${Math.max(...peaks).toLocaleString()} is very high — expect quality drop after compaction; thin control plane harder.`,
      )
    }
  }
  if (role === "slice") {
    if (peaks.length) {
      const max = Math.max(...peaks)
      const min = Math.min(...peaks)
      const avg = Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length)
      if (max >= 250_000) {
        notes.push(
          `Largest slice peak ${max.toLocaleString()} ≥ 250k — some buckets/prompts may be too large; consider tighter bucket diffs or less context packing.`,
        )
      } else if (avg >= 150_000) {
        notes.push(
          `Slice peak avg ${avg.toLocaleString()} is high — room to shrink per-role context packs if precision suffers.`,
        )
      } else if (avg < 40_000 && max < 60_000) {
        notes.push(
          `Slice peaks are low (avg ${avg.toLocaleString()}, max ${max.toLocaleString()}) — slices may be under-fed; consider richer bucket indexes if recall is weak.`,
        )
      } else {
        notes.push(
          `Slice peaks look moderate (min ${min.toLocaleString()} / avg ${avg.toLocaleString()} / max ${max.toLocaleString()}).`,
        )
      }
      if (compact > 0) {
        notes.push(
          `${compactSlots} slice(s) compacted (${compact} total) — those threads may have lost early evidence.`,
        )
      }
    }
  }
  return {
    role,
    sessions: list.length,
    sessions_matched: matched,
    wall_seconds: wall,
    cost_usd: microToUsd(costMicro) ?? 0,
    cost_microdollars: costMicro,
    peak_context_max: peaks.length ? Math.max(...peaks) : null,
    peak_context_avg: peaks.length
      ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length)
      : null,
    peak_context_min: peaks.length ? Math.min(...peaks) : null,
    slots_with_peak: peaks.length,
    compaction_count: compact,
    mid_task_compaction_count: mid,
    slots_with_compaction: compactSlots,
    context_pressure_max: pressure,
    notes,
  }
}

function listSessions(opts: {
  agent?: string
  since: string
  includeChildren?: boolean
  includeOneShot?: boolean
  includeAutomated?: boolean
  limit?: number
}): AgentsviewSession[] {
  const args = ["session", "list", "--json", "--since", opts.since, "--limit", String(opts.limit ?? 500)]
  if (opts.agent) args.push("--agent", opts.agent)
  if (opts.includeChildren) args.push("--include-children")
  if (opts.includeOneShot !== false) args.push("--include-one-shot")
  if (opts.includeAutomated !== false) args.push("--include-automated")
  const r = runAgentsview(args, 60_000)
  if (!r.ok) return []
  try {
    const parsed = JSON.parse(r.stdout) as { sessions?: AgentsviewSession[] } | AgentsviewSession[]
    if (Array.isArray(parsed)) return parsed
    return parsed.sessions || []
  } catch {
    return []
  }
}

function mapUsageToSlotFields(u: AgentsviewUsage | null): Pick<
  SlotUsage,
  | "agentsview_id"
  | "cost_usd"
  | "cost_microdollars"
  | "has_cost"
  | "cost_source"
  | "total_output_tokens"
  | "peak_context_tokens"
  | "models"
> {
  if (!u) {
    return {
      agentsview_id: null,
      cost_usd: null,
      cost_microdollars: null,
      has_cost: false,
      cost_source: "none",
      total_output_tokens: null,
      peak_context_tokens: null,
      models: [],
    }
  }
  const micro = u.has_cost && u.cost?.microdollars != null ? u.cost.microdollars : null
  return {
    agentsview_id: u.session_id || null,
    cost_usd: microToUsd(micro),
    cost_microdollars: micro,
    has_cost: Boolean(u.has_cost && micro != null),
    cost_source: u.has_cost ? "agentsview" : "unavailable",
    total_output_tokens: u.total_output_tokens ?? null,
    peak_context_tokens: u.peak_context_tokens ?? null,
    models: u.models || [],
  }
}

// --- main ---

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "run-dir": { type: "string" },
      out: { type: "string" },
      "title-prefix": { type: "string" },
      since: { type: "string", default: "14d" },
      "include-claude-children": { type: "boolean", default: false },
      "parent-session-id": { type: "string", multiple: true },
      "no-agentsview": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  }) as {
    values: {
      "run-dir"?: string
      out?: string
      "title-prefix"?: string
      since?: string
      "include-claude-children"?: boolean
      "parent-session-id"?: string | string[]
      "no-agentsview"?: boolean
      help?: boolean
    }
  }

  if (values.help || !values["run-dir"]) {
    process.stdout.write(`Usage:
  bun agentsview-usage.ts --run-dir <dir>
  bun agentsview-usage.ts --run-dir <dir> --title-prefix 'ultra|project|!N'
  bun agentsview-usage.ts --run-dir <dir> --since 7d --include-claude-children
  bun agentsview-usage.ts --run-dir <dir> --parent-session-id <uuid>   # repeatable
  bun agentsview-usage.ts --run-dir <dir> --no-agentsview

Writes <run-dir>/agentsview-usage.json with parent vs slice separation.
Parents are discovered from agent parent_session_id, run-dir mentions, or --parent-session-id.
`)
    process.exit(values.help ? 0 : 2)
  }

  const runDir = resolve(values["run-dir"])
  if (!existsSync(runDir)) die(`run-dir not found: ${runDir}`)
  const resultsDir = join(runDir, "results")
  const outPath = values.out
    ? resolve(values.out)
    : join(runDir, "agentsview-usage.json")
  const since = values.since || "14d"
  const includeClaude = Boolean(values["include-claude-children"])
  const skipAv = Boolean(values["no-agentsview"])

  let agentsviewAvailable = false
  let agentsviewError: string | undefined
  if (!skipAv) {
    if (!which("agentsview")) {
      agentsviewError = "agentsview not on PATH"
    } else {
      agentsviewAvailable = true
    }
  } else {
    agentsviewError = "disabled via --no-agentsview"
  }

  const plan = loadPlan(runDir)
  const metas = loadMetas(resultsDir)
  if (metas.length === 0) {
    die(`no results/*.meta.json under ${resultsDir}`)
  }

  // Titles for prefix discovery
  const planTitles = (plan?.slots || []).map((s) => s.title || "").filter(Boolean)
  const metaTitles: string[] = []
  for (const { meta, path } of metas) {
    const slot = meta.slot || slotNameFromMetaPath(path)
    const outAbs = outPathFromMeta(runDir, meta, path)
    const outRel = outAbs.startsWith(runDir + "/")
      ? outAbs.slice(runDir.length + 1)
      : meta.out
    const t = titleForSlot(slot, outRel, plan, meta)
    if (t) metaTitles.push(t)
  }
  const titlePrefix =
    values["title-prefix"]?.trim() ||
    commonTitlePrefix([...planTitles, ...metaTitles]) ||
    null

  // Build slot rows
  const slots: SlotUsage[] = []
  const matchedAvIds = new Set<string>()

  for (const { path, meta } of metas) {
    const slot = meta.slot || slotNameFromMetaPath(path)
    const outAbs = outPathFromMeta(runDir, meta, path)
    const outRel = outAbs.startsWith(runDir + "/")
      ? outAbs.slice(runDir.length + 1)
      : typeof meta.out === "string"
        ? meta.out
        : undefined
    const title = titleForSlot(slot, outRel, plan, meta)
    const harness = meta.harness || meta.actual_harness || "unknown"
    const sidecarUsage = readUsageSidecar(usageSidecarPaths(outAbs, path))
    const fromMeta = meta.session_id?.trim() || null
    const fromFile = readSessionFile(sessionSidecarPaths(outAbs, path))
    const sessionId = fromMeta || fromFile || sidecarUsage?.sessionId || null
    const match: SlotUsage["match"] = fromMeta
      ? "meta_session"
      : fromFile
        ? "session_file"
        : sidecarUsage?.sessionId
          ? "session_file"
          : "none"

    // Prefer started_at; end is ended_at or completed_at
    const startedAt = meta.started_at || null
    const endedAt = meta.ended_at || meta.completed_at || null
    let wall: number | null = null
    let wallSource: SlotUsage["wall_source"] = "none"
    if (typeof meta.wall_ms === "number" && Number.isFinite(meta.wall_ms) && meta.wall_ms >= 0) {
      wall = Math.round(meta.wall_ms / 1000)
      wallSource = "meta_wall_ms"
    } else {
      wall = wallSeconds(startedAt, endedAt)
      wallSource = wall != null ? "meta" : "none"
    }

    if (agentsviewAvailable) {
      if (typeof meta.session_file === "string" && meta.session_file) {
        syncSessionPath(meta.session_file)
      } else if (sessionId && /^ses_/.test(sessionId.replace(/^opencode:/, ""))) {
        const raw = sessionId.replace(/^opencode:/, "")
        const name = raw.endsWith(".json") ? raw : `${raw}.json`
        const root = join(
          process.env.XDG_DATA_HOME || join(process.env.HOME || "", ".local/share"),
          "opencode",
          "storage",
          "session",
        )
        if (existsSync(root)) {
          try {
            for (const proj of readdirSync(root)) {
              const p = join(root, proj, name)
              if (existsSync(p)) {
                syncSessionPath(p)
                break
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    }

    let usage: AgentsviewUsage | null = null
    if (agentsviewAvailable && sessionId) {
      usage = fetchUsage(sessionId, 2, String(harness))
      if (usage?.session_id) {
        matchedAvIds.add(usage.session_id)
        matchedAvIds.add(normalizeSessionId(sessionId) || sessionId)
      }
    }

    const costFields = mapUsageToSlotFields(usage)
    const metaCost =
      typeof meta.cost_usd === "number" && Number.isFinite(meta.cost_usd)
        ? meta.cost_usd
        : typeof sidecarUsage?.total_cost_usd === "number" &&
            Number.isFinite(sidecarUsage.total_cost_usd)
          ? sidecarUsage.total_cost_usd
          : null
    if (metaCost != null) {
      costFields.cost_usd = metaCost
      costFields.cost_microdollars = Math.round(metaCost * 1_000_000)
      costFields.has_cost = true
      const src = meta.cost_source
      costFields.cost_source =
        src === "grok_json" || src === "occtl" || src === "meta" || src === "agentsview"
          ? src
          : sidecarUsage?.total_cost_usd != null
            ? "grok_json"
            : "meta"
    } else if (!agentsviewAvailable && !skipAv) {
      costFields.cost_source = "unavailable"
    } else if (!agentsviewAvailable && skipAv) {
      costFields.cost_source = "none"
    } else if (sessionId && !usage) {
      costFields.cost_source = "unavailable"
      costFields.agentsview_id = normalizeSessionId(sessionId)
    }

    const row: SlotUsage = {
      slot,
      role: "slice",
      actual_model: meta.actual_model || meta.planned_model || "unknown",
      display_name: meta.display_name,
      harness: meta.harness || "unknown",
      status: meta.status,
      session_id: sessionId,
      agentsview_id: costFields.agentsview_id,
      parent_session_id: null,
      title,
      started_at: startedAt,
      ended_at: endedAt,
      wall_seconds: wall,
      wall_source: wallSource,
      cost_usd: costFields.cost_usd,
      cost_microdollars: costFields.cost_microdollars,
      has_cost: costFields.has_cost,
      cost_source: costFields.cost_source,
      total_output_tokens: costFields.total_output_tokens,
      peak_context_tokens: costFields.peak_context_tokens,
      has_peak_context: costFields.peak_context_tokens != null,
      compaction_count: null,
      mid_task_compaction_count: null,
      context_pressure_max: null,
      message_count: null,
      models: costFields.models,
      match,
      error:
        sessionId && agentsviewAvailable && !usage
          ? "agentsview session usage miss"
          : undefined,
    }
    if (agentsviewAvailable) {
      applySessionSignals(row, row.agentsview_id || sessionId)
    }
    // Mark unmatched slices for rollup clarity
    if (!row.session_id && !row.agentsview_id) row.role = "unknown"
    slots.push(row)
  }

  // Identical harvest-time ended_at is not per-slot work time. Drop it so
  // agentsview session times (or wall_ms) can replace it; do not report
  // queue-to-batch-end as agent-minutes.
  {
    const stamped = slots.filter((s) => s.wall_source === "meta" && s.ended_at)
    if (stamped.length >= 3) {
      const counts = new Map<string, number>()
      for (const s of stamped) {
        const k = s.ended_at as string
        counts.set(k, (counts.get(k) || 0) + 1)
      }
      let top = 0
      for (const n of counts.values()) if (n > top) top = n
      if (top >= Math.max(3, Math.ceil(stamped.length / 2))) {
        for (const s of slots) {
          if (s.wall_source !== "meta") continue
          s.wall_seconds = null
          s.wall_source = "none"
          s.error = [s.error, "wall discarded: identical batch ended_at"]
            .filter(Boolean)
            .join("; ")
        }
      }
    }
  }

  // Rediscover OpenCode sessions by title prefix
  const discoveredExtra: UsageReport["discovered_extra"] = []
  if (agentsviewAvailable && titlePrefix) {
    const opencodeSessions = listSessions({
      agent: "opencode",
      since,
      includeOneShot: true,
      includeAutomated: true,
      limit: 500,
    })
    const prefix = titlePrefix
    const extras = opencodeSessions.filter(
      (s) =>
        typeof s.first_message === "string" &&
        s.first_message.startsWith(prefix) &&
        s.id &&
        !matchedAvIds.has(s.id) &&
        !matchedAvIds.has(normalizeSessionId(s.id) || ""),
    )

    // Try attach extras to unmatched slots by exact title
    const byTitle = new Map<string, AgentsviewSession>()
    for (const s of opencodeSessions) {
      if (s.first_message) byTitle.set(s.first_message, s)
    }

    for (const row of slots) {
      if (row.has_cost || !row.title) continue
      const s = byTitle.get(row.title)
      if (!s?.id) continue
      const usage = fetchUsage(s.id)
      if (!usage) continue
      const fields = mapUsageToSlotFields(usage)
      row.agentsview_id = fields.agentsview_id
      row.session_id = row.session_id || s.id
      row.cost_usd = fields.cost_usd
      row.cost_microdollars = fields.cost_microdollars
      row.has_cost = fields.has_cost
      row.cost_source = fields.cost_source
      row.total_output_tokens = fields.total_output_tokens
      row.peak_context_tokens = fields.peak_context_tokens
      row.has_peak_context = fields.peak_context_tokens != null
      row.models = fields.models
      row.match = "title"
      row.error = undefined
      applySessionSignals(row, s.id)
      if (row.wall_seconds == null) {
        const w = wallSeconds(s.started_at, s.ended_at)
        if (w != null) {
          row.wall_seconds = w
          row.wall_source = "agentsview"
          row.started_at = row.started_at || s.started_at || null
          row.ended_at = row.ended_at || s.ended_at || null
        }
      }
      if (usage.session_id) matchedAvIds.add(usage.session_id)
      matchedAvIds.add(s.id)
    }

    for (const s of extras) {
      if (!s.id || matchedAvIds.has(s.id)) continue
      // Skip if title already claimed by a slot
      if (s.first_message && slots.some((r) => r.title === s.first_message && r.has_cost)) {
        continue
      }
      const usage = fetchUsage(s.id)
      const fields = mapUsageToSlotFields(usage)
      const w = wallSeconds(s.started_at, s.ended_at)
      // Pull compaction/peak for extras via session get
      const sig = fetchSessionGet(s.id)
      discoveredExtra.push({
        agentsview_id: fields.agentsview_id || s.id,
        title: s.first_message || null,
        started_at: s.started_at || null,
        ended_at: s.ended_at || null,
        wall_seconds: w,
        cost_usd: fields.cost_usd,
        cost_microdollars: fields.cost_microdollars,
        has_cost: fields.has_cost,
        peak_context_tokens:
          fields.peak_context_tokens ?? sig?.peak_context_tokens ?? null,
        compaction_count:
          typeof sig?.compaction_count === "number" ? sig.compaction_count : null,
        mid_task_compaction_count:
          typeof sig?.mid_task_compaction_count === "number"
            ? sig.mid_task_compaction_count
            : null,
        models: fields.models,
      })
      if (s.id) matchedAvIds.add(s.id)
      if (fields.agentsview_id) matchedAvIds.add(fields.agentsview_id)
    }
  }

  // Optional: match Claude agent children by time window for external slots lacking session_id.
  // Prefer prompts that look like ultra slices; reject foreign-parent children later via parent filter.
  if (agentsviewAvailable && includeClaude) {
    const starts = slots
      .map((s) => parseIsoMs(s.started_at))
      .filter((t): t is number => t != null)
    const ends = slots
      .map((s) => parseIsoMs(s.ended_at))
      .filter((t): t is number => t != null)
    if (starts.length && ends.length) {
      const windowStart = Math.min(...starts) - 60_000
      const windowEnd = Math.max(...ends) + 60_000
      const children = listSessions({
        agent: "claude",
        since,
        includeChildren: true,
        includeOneShot: true,
        includeAutomated: true,
        limit: 500,
      }).filter((s) => {
        if (!s.id?.startsWith("agent-")) return false
        const a = parseIsoMs(s.started_at)
        const b = parseIsoMs(s.ended_at) ?? a
        if (a == null) return false
        if (!(a >= windowStart && (b ?? a) <= windowEnd)) return false
        // Prefer slice-looking prompts; still allow if parent will be validated later
        return looksLikeSlicePrompt(s.first_message) || true
      })

      const unmatched = slots.filter(
        (s) =>
          !s.has_cost &&
          (s.harness === "external" ||
            s.harness === "claude" ||
            s.actual_model.includes("claude") ||
            s.actual_model.includes("opus") ||
            s.actual_model.includes("sonnet")),
      )
      const used = new Set<string>()
      for (const row of unmatched) {
        const rowStart = parseIsoMs(row.started_at)
        if (rowStart == null) continue
        let best: AgentsviewSession | null = null
        let bestDist = Infinity
        for (const c of children) {
          if (!c.id || used.has(c.id) || matchedAvIds.has(c.id)) continue
          const cs = parseIsoMs(c.started_at)
          if (cs == null) continue
          // Prefer slice-looking prompts strongly
          const sliceBonus = looksLikeSlicePrompt(c.first_message) ? 0 : 5 * 60_000
          const dist = Math.abs(cs - rowStart) + sliceBonus
          if (dist < bestDist && dist < 20 * 60_000) {
            bestDist = dist
            best = c
          }
        }
        if (!best?.id) continue
        // Reject if session get shows a non-slice prompt and no ultra parent (checked after parent discovery)
        const usage = fetchUsage(best.id)
        if (!usage) continue
        const fields = mapUsageToSlotFields(usage)
        row.session_id = row.session_id || best.id
        row.agentsview_id = fields.agentsview_id
        row.cost_usd = fields.cost_usd
        row.cost_microdollars = fields.cost_microdollars
        row.has_cost = fields.has_cost
        row.cost_source = fields.cost_source
        row.total_output_tokens = fields.total_output_tokens
        row.peak_context_tokens = fields.peak_context_tokens
        row.has_peak_context = fields.peak_context_tokens != null
        row.models = fields.models
        row.match = "claude_child"
        row.role = "slice"
        row.error = undefined
        applySessionSignals(row, best.id)
        if (row.wall_seconds == null) {
          const w = wallSeconds(best.started_at, best.ended_at)
          if (w != null) {
            row.wall_seconds = w
            row.wall_source = "agentsview"
          }
        }
        used.add(best.id)
        matchedAvIds.add(best.id)
        if (fields.agentsview_id) matchedAvIds.add(fields.agentsview_id)
      }
    }
  }

  // --- Parent discovery (separate Opus orchestrator from Opus slices) ---
  // Scope tightly to THIS run so historical ultra parents don't pollute by_role.
  const explicitParents = values["parent-session-id"]
  const explicitList = (
    Array.isArray(explicitParents)
      ? explicitParents
      : explicitParents
        ? [explicitParents]
        : []
  )
    .map((s) => s.trim())
    .filter(Boolean)

  const runBase = runDir.split("/").filter(Boolean).pop() || ""

  // Candidate parents from children's parent_session_id
  const childParentCounts = new Map<string, number>()
  for (const row of slots) {
    if (row.parent_session_id) {
      childParentCounts.set(
        row.parent_session_id,
        (childParentCounts.get(row.parent_session_id) || 0) + 1,
      )
    }
  }

  // Auto: sessions that mention this run dir (true orchestrator for this artifact tree)
  const runDirParents = new Set<string>()
  if (agentsviewAvailable && (runBase || runDir)) {
    const parentCandidates = [
      ...listSessions({
        agent: "claude",
        since,
        includeChildren: false,
        includeOneShot: true,
        includeAutomated: true,
        limit: 200,
      }),
      ...listSessions({
        agent: "opencode",
        since,
        includeChildren: false,
        includeOneShot: true,
        includeAutomated: true,
        limit: 200,
      }),
      ...listSessions({
        since,
        includeChildren: false,
        includeOneShot: true,
        includeAutomated: true,
        limit: 200,
      }),
    ]
    for (const s of parentCandidates) {
      if (!s.id || s.id.startsWith("agent-")) continue
      const fm = s.first_message || ""
      if (
        (runBase && fm.includes(runBase)) ||
        fm.includes(runDir) ||
        (runBase && fm.includes(`.tmp/${runBase}`)) ||
        looksLikeParentPrompt(fm, runDir)
      ) {
        runDirParents.add(s.id)
      }
    }
  }

  // Resolve ultraParents:
  // 1) explicit flags win entirely when provided
  // 2) else parents that mention this run dir
  // 3) else the majority parent_session_id among matched agent children
  // 4) else any child parent whose session get looks like a parent for this run
  const ultraParents = new Set<string>()
  if (explicitList.length > 0) {
    for (const id of explicitList) ultraParents.add(id)
  } else if (runDirParents.size > 0) {
    for (const id of runDirParents) ultraParents.add(id)
  } else if (childParentCounts.size > 0) {
    const ranked = [...childParentCounts.entries()].sort((a, b) => b[1] - a[1])
    const top = ranked[0]
    if (top && top[1] >= 2) {
      ultraParents.add(top[0])
    } else {
      for (const [pid] of ranked) {
        const s = fetchSessionGet(pid)
        if (s && looksLikeParentPrompt(s.first_message, runDir)) ultraParents.add(pid)
      }
    }
  }

  // Also keep any child-parent that is already in ultraParents' set only — don't expand
  // Drop slice matches that don't belong to ultraParents (when we have any)
  for (const row of slots) {
    if (row.match !== "claude_child" || !row.agentsview_id) continue
    const s = fetchSessionGet(row.agentsview_id)
    const promptOk = looksLikeSlicePrompt(s?.first_message)
    const parentOk =
      ultraParents.size === 0
        ? promptOk
        : row.parent_session_id != null && ultraParents.has(row.parent_session_id)

    // If we know ultra parents, require membership OR (slice prompt AND parent is run-dir parent)
    if (ultraParents.size > 0) {
      if (!parentOk) {
        // Allow orphan slice-looking prompts only if parent unknown
        if (!(promptOk && !row.parent_session_id)) {
          row.session_id = null
          row.agentsview_id = null
          row.parent_session_id = null
          row.has_cost = false
          row.cost_usd = null
          row.cost_microdollars = null
          row.cost_source = "none"
          row.peak_context_tokens = null
          row.has_peak_context = false
          row.compaction_count = null
          row.mid_task_compaction_count = null
          row.message_count = null
          row.match = "none"
          row.role = "unknown"
          row.error = "cleared: not a child of this run's parent"
          continue
        }
      }
    } else if (!promptOk) {
      row.session_id = null
      row.agentsview_id = null
      row.parent_session_id = null
      row.has_cost = false
      row.cost_usd = null
      row.cost_microdollars = null
      row.cost_source = "none"
      row.peak_context_tokens = null
      row.has_peak_context = false
      row.compaction_count = null
      row.mid_task_compaction_count = null
      row.message_count = null
      row.match = "none"
      row.role = "unknown"
      row.error = "cleared: foreign parent / non-slice agent"
      continue
    }
    row.role = "slice"
    // Promote child's parent into ultraParents if we had none
    if (ultraParents.size === 0 && row.parent_session_id) {
      ultraParents.add(row.parent_session_id)
    }
  }

  // After filtering, if still no parents, use majority child parent
  if (ultraParents.size === 0 && childParentCounts.size > 0) {
    const top = [...childParentCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) ultraParents.add(top[0])
  }

  // Build synthetic parent rows (only this run)
  const parents: SlotUsage[] = []
  if (agentsviewAvailable) {
    for (const pid of ultraParents) {
      const s = fetchSessionGet(pid)
      if (!s?.id) continue
      const usage = fetchUsage(pid)
      const prow = sessionToParentRow(s, usage)
      if (usage?.models?.[0]) prow.actual_model = usage.models[0]
      parents.push(prow)
      matchedAvIds.add(pid)
    }
  }

  const slices = slots.filter((s) => s.role === "slice" || s.role === "unknown")
  // Combined list for consumers that want everything
  const allRows = [...parents, ...slots]

  // Rollups — by_model includes parents (legacy); by_model_slices is slice-only
  const by_model = rollupSlots(allRows, (s) =>
    s.role === "parent"
      ? `${s.actual_model} (parent)`
      : s.actual_model || "unknown",
  )
  const by_model_slices = rollupSlots(
    slots.filter((s) => s.role === "slice"),
    (s) => s.actual_model || "unknown",
  )
  const by_role = [
    rollupRole("parent", parents),
    rollupRole(
      "slice",
      slots.filter((s) => s.role === "slice"),
    ),
  ]

  const starts = slots
    .map((s) => parseIsoMs(s.started_at))
    .filter((t): t is number => t != null)
  const ends = slots
    .map((s) => parseIsoMs(s.ended_at))
    .filter((t): t is number => t != null)
  const runStart = starts.length ? Math.min(...starts) : null
  const runEnd = ends.length ? Math.max(...ends) : null

  let totalMicro = 0
  let matched = 0
  let missing = 0
  let wallAgent = 0
  let partial = false
  let peakMax: number | null = null
  let peakSum = 0
  let peakN = 0
  let compactSum = 0
  let midCompactSum = 0
  let compactSlots = 0
  let pressureMax: number | null = null
  for (const s of slots) {
    if (s.has_cost && s.cost_microdollars != null) {
      matched++
      totalMicro += s.cost_microdollars
    } else {
      missing++
      partial = true
    }
    if (s.wall_seconds != null) wallAgent += s.wall_seconds
    if (s.has_peak_context && s.peak_context_tokens != null) {
      peakN++
      peakSum += s.peak_context_tokens
      peakMax =
        peakMax == null ? s.peak_context_tokens : Math.max(peakMax, s.peak_context_tokens)
    }
    if (s.compaction_count != null) {
      compactSum += s.compaction_count
      if (s.compaction_count > 0) compactSlots++
    }
    if (s.mid_task_compaction_count != null) {
      midCompactSum += s.mid_task_compaction_count
    }
    if (s.context_pressure_max != null) {
      pressureMax =
        pressureMax == null
          ? s.context_pressure_max
          : Math.max(pressureMax, s.context_pressure_max)
    }
  }
  // Include discovered_extra costs in totals? Yes — they are part of the run but not
  // slot-attributed (retries without meta, etc.)
  let extraMicro = 0
  for (const e of discoveredExtra) {
    if (e.has_cost && e.cost_microdollars != null) extraMicro += e.cost_microdollars
    if (e.peak_context_tokens != null) {
      peakN++
      peakSum += e.peak_context_tokens
      peakMax =
        peakMax == null
          ? e.peak_context_tokens
          : Math.max(peakMax, e.peak_context_tokens)
    }
    if (e.compaction_count != null) {
      compactSum += e.compaction_count
      if (e.compaction_count > 0) compactSlots++
    }
    if (e.mid_task_compaction_count != null) {
      midCompactSum += e.mid_task_compaction_count
    }
  }

  // Totals below are slice-only so parent Opus doesn't dominate peak/cost mix
  const report: UsageReport = {
    ok: true,
    run_dir: runDir,
    generated_at: nowIso(),
    agentsview_available: agentsviewAvailable,
    agentsview_error: agentsviewError,
    title_prefix: titlePrefix,
    since,
    include_claude_children: includeClaude,
    parent_session_ids: [...ultraParents],
    slots: allRows,
    slices,
    parents,
    by_model,
    by_model_slices,
    by_role,
    totals: {
      slots: slots.length,
      sessions_matched: matched,
      sessions_missing: missing,
      wall_agent_seconds: wallAgent,
      wall_run_seconds:
        runStart != null && runEnd != null && runEnd >= runStart
          ? Math.round((runEnd - runStart) / 1000)
          : null,
      run_started_at: runStart != null ? new Date(runStart).toISOString() : null,
      run_ended_at: runEnd != null ? new Date(runEnd).toISOString() : null,
      cost_usd: (microToUsd(totalMicro + extraMicro) ?? 0),
      cost_microdollars: totalMicro + extraMicro,
      has_partial_cost: partial,
      peak_context_max: peakMax,
      peak_context_avg: peakN > 0 ? Math.round(peakSum / peakN) : null,
      slots_with_peak: peakN,
      compaction_count: compactSum,
      mid_task_compaction_count: midCompactSum,
      slots_with_compaction: compactSlots,
      context_pressure_max: pressureMax,
    },
    discovered_extra: discoveredExtra,
    out_path: outPath,
  }

  writeJson(outPath, report)
  process.stdout.write(JSON.stringify(report, null, 2) + "\n")
}

main()
