/**
 * OpenCode HTTP client for mbot-run. No occtl binary.
 *
 * OpenCode 2 serves the web UI on the old paths and the API under `/api`.
 * OpenCode 1 (the Seamus bot serve) keeps `/config/providers` and `/session`.
 * This module drives both. Auth is HTTP Basic (`opencode` + the server
 * password) when the server requires it. An ephemeral `opencode serve`
 * prints its password on stdout; that value stays in memory.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"

export type OpencodeApi = "v1" | "v2"

export interface ProbeResult {
  ok: boolean
  api?: OpencodeApi
  models: string[]
  ms: number
  error?: string
  version?: string
}

export interface V2RunResult {
  code: number
  text: string
  sessionId: string | null
  costUsd: number | null
  usage?: Record<string, unknown>
  error?: string
}

const passwordCache = new Map<string, string>()

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "")
}

function authHeader(password: string, username = process.env.OPENCODE_SERVER_USERNAME || "opencode"): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

function explicitPassword(password?: string): string | undefined {
  if (password) return password
  const env = process.env.OPENCODE_SERVER_PASSWORD
  return env || undefined
}

/** Password for the local background service, only when `attachUrl` is that service. */
export function servicePasswordFor(attachUrl: string): string | undefined {
  const cached = passwordCache.get(normalizeBase(attachUrl))
  if (cached) return cached
  const status = spawnSync("opencode", ["service", "status"], {
    encoding: "utf8",
    timeout: 4000,
  })
  const reported = (status.stdout || "")
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^https?:\/\//.test(l))
  if (!reported || normalizeBase(reported) !== normalizeBase(attachUrl)) return undefined
  const got = spawnSync("opencode", ["service", "get", "password"], {
    encoding: "utf8",
    timeout: 4000,
  })
  if (got.status !== 0) return undefined
  const value = (got.stdout || "").trim()
  if (!value) return undefined
  passwordCache.set(normalizeBase(attachUrl), value)
  return value
}

function rememberPassword(baseUrl: string, password: string | undefined): void {
  if (password) passwordCache.set(normalizeBase(baseUrl), password)
}

export function splitProviderModel(model: string): { providerID: string; id: string } {
  const slash = model.indexOf("/")
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(`model must be provider/model (got ${JSON.stringify(model)})`)
  }
  return { providerID: model.slice(0, slash), id: model.slice(slash + 1) }
}

export function modelsFromV2Catalog(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  const out: string[] = []
  for (const item of data) {
    if (!item || typeof item !== "object") continue
    const providerID = (item as { providerID?: unknown }).providerID
    const modelID = (item as { modelID?: unknown }).modelID
    if (typeof providerID === "string" && providerID && typeof modelID === "string" && modelID) {
      out.push(`${providerID}/${modelID}`)
    }
  }
  return out
}

export function modelsFromV1Providers(body: unknown): string[] {
  const providers = (body as { providers?: unknown } | null)?.providers
  if (!Array.isArray(providers)) return []
  const out: string[] = []
  for (const provider of providers) {
    if (!provider || typeof provider !== "object") continue
    const pid = (provider as { id?: unknown }).id
    const models = (provider as { models?: unknown }).models
    if (typeof pid !== "string" || !pid || !models) continue
    if (Array.isArray(models)) {
      for (const model of models) {
        const mid = typeof model === "string" ? model : (model as { id?: string })?.id
        if (mid) out.push(`${pid}/${mid}`)
      }
    } else if (typeof models === "object") {
      for (const mid of Object.keys(models as Record<string, unknown>)) out.push(`${pid}/${mid}`)
    }
  }
  return out
}

export function assistantTextFromMessage(message: unknown): string {
  const content = (message as { content?: unknown } | null)?.content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== "object") continue
    if ((part as { type?: string }).type !== "text") continue
    const text = (part as { text?: unknown }).text
    if (typeof text === "string" && text) parts.push(text)
  }
  return parts.join("\n")
}

export function textFromAssistantMessages(messages: unknown[]): string {
  for (const message of messages) {
    const text = assistantTextFromMessage(message)
    if (text.trim()) return text
  }
  return ""
}

function unwrapData(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in (body as object)) {
    return (body as { data: unknown }).data
  }
  return body
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const message = (body as { message?: unknown }).message
    const tag = (body as { _tag?: unknown })._tag
    if (typeof message === "string" && message) {
      return typeof tag === "string" ? `${tag}: ${message}` : message
    }
  }
  if (typeof body === "string" && body.trim() && !body.trim().startsWith("<")) {
    return body.trim().slice(0, 300)
  }
  return `HTTP ${status}`
}

function isHtml(contentType: string, body: unknown): boolean {
  if (contentType.includes("text/html")) return true
  return typeof body === "string" && body.trimStart().startsWith("<")
}

interface HttpResult {
  status: number
  contentType: string
  body: unknown
  networkError?: string
}

async function request(
  baseUrl: string,
  method: string,
  path: string,
  opts: { password?: string; body?: unknown; timeoutMs?: number; query?: Record<string, string> } = {},
): Promise<HttpResult> {
  const query = opts.query
    ? `?${new URLSearchParams(opts.query).toString()}`
    : ""
  const headers: Record<string, string> = { Accept: "application/json" }
  const password = explicitPassword(opts.password) || passwordCache.get(normalizeBase(baseUrl))
  if (password) headers.Authorization = authHeader(password)
  if (opts.body !== undefined) headers["Content-Type"] = "application/json"
  const timeoutMs = opts.timeoutMs ?? 15000
  try {
    const res = await fetch(`${normalizeBase(baseUrl)}${path}${query}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const contentType = res.headers.get("content-type") || ""
    const text = await res.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    return { status: res.status, contentType, body }
  } catch (err) {
    const message = (err as Error)?.name === "TimeoutError"
      ? `timed out after ${timeoutMs}ms`
      : String((err as Error)?.message || err)
    return { status: 0, contentType: "", body: null, networkError: message }
  }
}

async function authed(
  baseUrl: string,
  method: string,
  path: string,
  opts: { password?: string; body?: unknown; timeoutMs?: number; query?: Record<string, string> } = {},
): Promise<HttpResult> {
  let password = explicitPassword(opts.password)
  let result = await request(baseUrl, method, path, { ...opts, password })
  if (result.status === 401 && !password) {
    const discovered = servicePasswordFor(baseUrl)
    if (discovered) {
      password = discovered
      result = await request(baseUrl, method, path, { ...opts, password })
    }
  }
  if (result.status !== 401 && password) rememberPassword(baseUrl, password)
  return result
}

export async function probeOpencode(
  attach: string,
  password?: string,
  timeoutMs = 8000,
  directory?: string,
): Promise<ProbeResult> {
  const t0 = Date.now()
  const base = normalizeBase(attach)
  const info = await authed(base, "GET", "/api/info", { password, timeoutMs })
  const ms = () => Date.now() - t0
  if (info.networkError) {
    return { ok: false, models: [], ms: ms(), error: `${base}/api/info: ${info.networkError}` }
  }
  if (info.status === 401) {
    return {
      ok: false,
      api: "v2",
      models: [],
      ms: ms(),
      error: `${base}/api/info: authentication required`,
    }
  }
  if (info.status === 200 && !isHtml(info.contentType, info.body) && info.body && typeof info.body === "object") {
    const version = (info.body as { version?: unknown }).version
    const query: Record<string, string> = {}
    if (directory) query["location[directory]"] = directory
    let models = await authed(base, "GET", "/api/model", {
      password,
      timeoutMs,
      query: Object.keys(query).length ? query : undefined,
    })
    if (models.status === 404 && directory) {
      models = await authed(base, "GET", "/api/model", { password, timeoutMs })
    }
    if (models.networkError || models.status !== 200 || isHtml(models.contentType, models.body)) {
      return {
        ok: false,
        api: "v2",
        models: [],
        ms: ms(),
        version: typeof version === "string" ? version : undefined,
        error: `${base}/api/model: ${models.networkError || errorMessage(models.body, models.status)}`,
      }
    }
    return {
      ok: true,
      api: "v2",
      models: modelsFromV2Catalog(models.body),
      ms: ms(),
      version: typeof version === "string" ? version : undefined,
    }
  }

  const v1 = await authed(base, "GET", "/config/providers", { password, timeoutMs })
  if (v1.networkError) {
    return { ok: false, models: [], ms: ms(), error: `${base}/config/providers: ${v1.networkError}` }
  }
  if (v1.status === 200 && !isHtml(v1.contentType, v1.body)) {
    const models = modelsFromV1Providers(v1.body)
    if (models.length || (v1.body && typeof v1.body === "object" && "providers" in (v1.body as object))) {
      return { ok: true, api: "v1", models, ms: ms() }
    }
  }
  if (isHtml(v1.contentType, v1.body) || isHtml(info.contentType, info.body)) {
    return {
      ok: false,
      models: [],
      ms: ms(),
      error: `${base}/config/providers returned the web UI. OpenCode 2 models are at /api/model.`,
    }
  }
  return {
    ok: false,
    models: [],
    ms: ms(),
    error: `${base}/api/info: ${errorMessage(info.body, info.status)}; /config/providers: ${errorMessage(v1.body, v1.status)}`,
  }
}

function sessionIdOf(body: unknown): string | null {
  const data = unwrapData(body)
  const id = (data as { id?: unknown } | null)?.id
  return typeof id === "string" && id ? id : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

const V1_STABLE_MS = 5000

interface V1Envelope {
  info: {
    id?: string
    role?: string
    cost?: unknown
    tokens?: unknown
    finish?: string
    error?: unknown
    time?: { completed?: number }
  }
  parts: unknown[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function directoryQuery(directory?: string): Record<string, string> | undefined {
  return directory ? { directory } : undefined
}

function v1Envelopes(body: unknown): V1Envelope[] {
  const data = Array.isArray(body) ? body : unwrapData(body)
  if (!Array.isArray(data)) return []
  const out: V1Envelope[] = []
  for (const item of data) {
    const rec = asRecord(item)
    const info = asRecord(rec?.info)
    if (!info) continue
    out.push({
      info: info as V1Envelope["info"],
      parts: Array.isArray(rec?.parts) ? rec.parts : [],
    })
  }
  return out
}

function textFromParts(parts: unknown[]): string {
  const bits: string[] = []
  for (const part of parts) {
    const rec = asRecord(part)
    if (!rec || rec.type !== "text") continue
    if (typeof rec.text === "string" && rec.text) bits.push(rec.text)
  }
  return bits.join("\n")
}

function v1HasActiveTool(parts: unknown[]): boolean {
  return parts.some((part) => {
    const rec = asRecord(part)
    if (!rec || rec.type !== "tool") return false
    const state = asRecord(rec.state)
    const status = state?.status
    return status === "pending" || status === "running" || status === "in_progress"
  })
}

function lastNewAssistant(envelopes: V1Envelope[], prior: Set<string>): V1Envelope | null {
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const env = envelopes[i]
    if (env.info.role !== "assistant") continue
    if (env.info.id && prior.has(env.info.id)) return null
    return env
  }
  return null
}

function v1TurnFinished(env: V1Envelope): boolean {
  if (env.info.error != null) return true
  if (env.info.time?.completed == null) return false
  return env.info.finish !== "tool-calls"
}

async function listV1Messages(
  baseUrl: string,
  sessionId: string,
  password: string | undefined,
  directory: string | undefined,
): Promise<V1Envelope[]> {
  const listed = await authed(baseUrl, "GET", `/session/${encodeURIComponent(sessionId)}/message`, {
    password,
    timeoutMs: 15000,
    query: { ...directoryQuery(directory), limit: "100000" },
  })
  if (listed.status !== 200) return []
  return v1Envelopes(listed.body)
}

/** Reply `once` to this session's pending v1 permission requests. Other sessions are left alone. */
async function replyPendingPermissionsV1(
  baseUrl: string,
  sessionId: string,
  password?: string,
  directory?: string,
): Promise<void> {
  const listed = await authed(baseUrl, "GET", "/permission", {
    password,
    timeoutMs: 8000,
    query: directoryQuery(directory),
  })
  if (listed.status !== 200) return
  const data = Array.isArray(listed.body) ? listed.body : unwrapData(listed.body)
  if (!Array.isArray(data)) return
  for (const request of data) {
    const rec = asRecord(request)
    const id = rec?.id
    const owner = rec?.sessionID ?? rec?.sessionId
    if (typeof id !== "string" || !id || owner !== sessionId) continue
    await authed(
      baseUrl,
      "POST",
      `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(id)}`,
      {
        password,
        timeoutMs: 8000,
        query: directoryQuery(directory),
        body: { response: "once" },
      },
    )
  }
}

export async function fetchLatestAssistantText(
  baseUrl: string,
  sessionId: string,
  password?: string,
  api?: OpencodeApi,
): Promise<string> {
  if (api !== "v1") {
    const listed = await authed(baseUrl, "GET", `/api/session/${encodeURIComponent(sessionId)}/message`, {
      password,
      timeoutMs: 15000,
      query: { type: "assistant", order: "desc", limit: "5" },
    })
    if (listed.status === 200) {
      const data = unwrapData(listed.body)
      return Array.isArray(data) ? textFromAssistantMessages(data) : ""
    }
    if (api === "v2") return ""
  }
  const envelopes = await listV1Messages(baseUrl, sessionId, password, undefined)
  for (let i = envelopes.length - 1; i >= 0; i--) {
    if (envelopes[i].info.role !== "assistant") continue
    const text = textFromParts(envelopes[i].parts)
    if (text.trim()) return text
  }
  return ""
}

async function replyPendingPermissions(baseUrl: string, sessionId: string, password?: string): Promise<void> {
  const listed = await authed(baseUrl, "GET", `/api/session/${encodeURIComponent(sessionId)}/permission`, {
    password,
    timeoutMs: 8000,
  })
  if (listed.status !== 200) return
  const data = unwrapData(listed.body)
  if (!Array.isArray(data)) return
  for (const request of data) {
    const id = (request as { id?: unknown } | null)?.id
    if (typeof id !== "string" || !id) continue
    await authed(
      baseUrl,
      "POST",
      `/api/session/${encodeURIComponent(sessionId)}/permission/${encodeURIComponent(id)}/reply`,
      { password, timeoutMs: 8000, body: { decision: "once" } },
    )
  }
}

function newestTime(body: unknown, field: "created" | "completed"): number | null {
  const data = unwrapData(body)
  const first = Array.isArray(data) ? data[0] : data
  const time = (first as { time?: Record<string, unknown> } | null)?.time
  return asNumber(time?.[field])
}

/**
 * Create a session, send one prompt, and wait until the session goes idle.
 * `code` is 0 when assistant text was captured, 124 on timeout, 1 otherwise.
 */
export async function runOpencodeV2(opts: {
  baseUrl: string
  password?: string
  model: string
  variant?: string
  agent?: string
  title?: string
  prompt: string
  directory: string
  timeoutMs: number
  onSession?: (sessionId: string) => void
}): Promise<V2RunResult> {
  const fail = (error: string, sessionId: string | null = null, code = 1): V2RunResult => ({
    code,
    text: "",
    sessionId,
    costUsd: null,
    error,
  })
  let ref: { providerID: string; id: string }
  try {
    ref = splitProviderModel(opts.model)
  } catch (err) {
    return fail((err as Error).message)
  }
  const model: { id: string; providerID: string; variant?: string } = {
    id: ref.id,
    providerID: ref.providerID,
  }
  if (opts.variant) model.variant = opts.variant
  const directory = opts.directory
  const createBody = {
    title: opts.title || null,
    agent: opts.agent || null,
    model,
    location: directory ? { directory } : null,
  }
  let created = await authed(opts.baseUrl, "POST", "/api/session", {
    password: opts.password,
    timeoutMs: 20000,
    body: createBody,
  })
  if (created.status === 404 && createBody.location) {
    created = await authed(opts.baseUrl, "POST", "/api/session", {
      password: opts.password,
      timeoutMs: 20000,
      body: { ...createBody, location: null },
    })
  }
  if (created.networkError || created.status >= 400 || created.status === 0) {
    return fail(
      `session create: ${created.networkError || errorMessage(created.body, created.status)}`,
    )
  }
  const sessionId = sessionIdOf(created.body)
  if (!sessionId) return fail("session create returned no id")
  opts.onSession?.(sessionId)

  const switched = await authed(opts.baseUrl, "POST", `/api/session/${encodeURIComponent(sessionId)}/model`, {
    password: opts.password,
    timeoutMs: 15000,
    body: { model },
  })
  if (switched.status >= 400) {
    return fail(`model switch: ${errorMessage(switched.body, switched.status)}`, sessionId)
  }
  if (opts.agent) {
    const agent = await authed(opts.baseUrl, "POST", `/api/session/${encodeURIComponent(sessionId)}/agent`, {
      password: opts.password,
      timeoutMs: 15000,
      body: { agent: opts.agent },
    })
    if (agent.status >= 400) {
      return fail(`agent switch: ${errorMessage(agent.body, agent.status)}`, sessionId)
    }
  }

  const deadline = Date.now() + Math.max(1000, opts.timeoutMs)
  const prompted = await authed(opts.baseUrl, "POST", `/api/session/${encodeURIComponent(sessionId)}/prompt`, {
    password: opts.password,
    timeoutMs: Math.min(20000, deadline - Date.now()),
    body: { text: opts.prompt },
  })
  if (prompted.networkError || prompted.status >= 400) {
    return fail(`prompt: ${prompted.networkError || errorMessage(prompted.body, prompted.status)}`, sessionId)
  }
  const watermark = newestTime(prompted.body, "created") ?? Date.now() - 1000

  let settled = false
  while (Date.now() < deadline) {
    await replyPendingPermissions(opts.baseUrl, sessionId, opts.password)
    const idle = await authed(opts.baseUrl, "GET", `/api/session/${encodeURIComponent(sessionId)}/message`, {
      password: opts.password,
      timeoutMs: 10000,
      query: { type: "idle", order: "desc", limit: "1" },
    })
    const idleAt = newestTime(idle.body, "created")
    const active = await authed(opts.baseUrl, "GET", "/api/session/active", {
      password: opts.password,
      timeoutMs: 8000,
    })
    const activeMap = unwrapData(active.body)
    const stillRunning =
      active.status === 200 &&
      activeMap &&
      typeof activeMap === "object" &&
      sessionId in (activeMap as Record<string, unknown>)
    if (idleAt != null && idleAt >= watermark && !stillRunning) {
      settled = true
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!settled) {
    await authed(opts.baseUrl, "POST", `/api/session/${encodeURIComponent(sessionId)}/interrupt`, {
      password: opts.password,
      timeoutMs: 8000,
    })
    await new Promise((r) => setTimeout(r, 400))
  }

  const text = await fetchLatestAssistantText(opts.baseUrl, sessionId, opts.password)
  const session = await authed(opts.baseUrl, "GET", `/api/session/${encodeURIComponent(sessionId)}`, {
    password: opts.password,
    timeoutMs: 10000,
  })
  const info = unwrapData(session.body) as { cost?: unknown; tokens?: unknown } | null
  const costUsd = asNumber(info?.cost)
  const usage =
    info?.tokens && typeof info.tokens === "object"
      ? (info.tokens as Record<string, unknown>)
      : undefined
  if (!text.trim()) {
    return {
      code: settled ? 1 : 124,
      text,
      sessionId,
      costUsd,
      usage,
      error: settled ? "provider returned no text" : `timed out after ${opts.timeoutMs}ms`,
    }
  }
  return { code: settled ? 0 : 124, text, sessionId, costUsd, usage }
}

/**
 * One OpenCode 1 session: `POST /session`, `POST /session/{id}/prompt_async`,
 * then poll `/session/{id}/message` until the new assistant message is finalized.
 */
export async function runOpencodeV1(opts: {
  baseUrl: string
  password?: string
  model: string
  variant?: string
  agent?: string
  title?: string
  prompt: string
  directory: string
  timeoutMs: number
  onSession?: (sessionId: string) => void
}): Promise<V2RunResult> {
  const fail = (error: string, sessionId: string | null = null, code = 1): V2RunResult => ({
    code,
    text: "",
    sessionId,
    costUsd: null,
    error,
  })
  let ref: { providerID: string; id: string }
  try {
    ref = splitProviderModel(opts.model)
  } catch (err) {
    return fail((err as Error).message)
  }
  const directory = opts.directory
  const created = await authed(opts.baseUrl, "POST", "/session", {
    password: opts.password,
    timeoutMs: 20000,
    query: directoryQuery(directory),
    body: opts.title ? { title: opts.title } : {},
  })
  if (created.networkError || created.status >= 400 || created.status === 0) {
    return fail(`session create: ${created.networkError || errorMessage(created.body, created.status)}`)
  }
  const sessionId = sessionIdOf(created.body)
  if (!sessionId) return fail("session create returned no id")
  opts.onSession?.(sessionId)

  const prior = new Set(
    (await listV1Messages(opts.baseUrl, sessionId, opts.password, directory))
      .filter((env) => env.info.role === "assistant" && env.info.id)
      .map((env) => env.info.id as string),
  )
  const promptBody: Record<string, unknown> = {
    parts: [{ type: "text", text: opts.prompt }],
    model: { providerID: ref.providerID, modelID: ref.id },
  }
  if (opts.agent) promptBody.agent = opts.agent
  if (opts.variant) promptBody.variant = opts.variant
  const deadline = Date.now() + Math.max(1000, opts.timeoutMs)
  const prompted = await authed(
    opts.baseUrl,
    "POST",
    `/session/${encodeURIComponent(sessionId)}/prompt_async`,
    {
      password: opts.password,
      timeoutMs: Math.min(20000, deadline - Date.now()),
      query: directoryQuery(directory),
      body: promptBody,
    },
  )
  if (prompted.networkError || prompted.status >= 400) {
    return fail(
      `prompt: ${prompted.networkError || errorMessage(prompted.body, prompted.status)}`,
      sessionId,
    )
  }

  let settled = false
  let latest: V1Envelope | null = null
  let stable: { signature: string; at: number } | null = null
  while (Date.now() < deadline) {
    await replyPendingPermissionsV1(opts.baseUrl, sessionId, opts.password, directory)
    const envelopes = await listV1Messages(opts.baseUrl, sessionId, opts.password, directory)
    const candidate = lastNewAssistant(envelopes, prior)
    latest = candidate
    if (candidate && v1TurnFinished(candidate)) {
      settled = true
      break
    }
    const text = candidate ? textFromParts(candidate.parts).trim() : ""
    if (candidate && text && !v1HasActiveTool(candidate.parts)) {
      const signature = `${candidate.info.id}\n${text}`
      if (stable?.signature === signature && Date.now() - stable.at >= V1_STABLE_MS) {
        settled = true
        break
      }
      if (stable?.signature !== signature) stable = { signature, at: Date.now() }
    } else {
      stable = null
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!settled) {
    await authed(opts.baseUrl, "POST", `/session/${encodeURIComponent(sessionId)}/abort`, {
      password: opts.password,
      timeoutMs: 8000,
      query: directoryQuery(directory),
    })
    await new Promise((r) => setTimeout(r, 400))
    latest = lastNewAssistant(
      await listV1Messages(opts.baseUrl, sessionId, opts.password, directory),
      prior,
    ) ?? latest
  }

  const text = latest ? textFromParts(latest.parts) : ""
  const costUsd = asNumber(latest?.info.cost)
  const usage =
    latest?.info.tokens && typeof latest.info.tokens === "object"
      ? (latest.info.tokens as Record<string, unknown>)
      : undefined
  if (!text.trim()) {
    return {
      code: settled ? 1 : 124,
      text,
      sessionId,
      costUsd,
      usage,
      error: settled ? "provider returned no text" : `timed out after ${opts.timeoutMs}ms`,
    }
  }
  return { code: settled ? 0 : 124, text, sessionId, costUsd, usage }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function redactServerLog(text: string): string {
  return text.replace(/server password \S+/g, "server password [redacted]")
}

/** Start `opencode serve` on a random port and tear it down when `fn` finishes. */
export async function withEphemeralServer<T>(
  fn: (ctx: { baseUrl: string; password?: string; api: OpencodeApi }) => Promise<T>,
): Promise<T> {
  const port = await freePort()
  const child: ChildProcess = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  let log = ""
  let password = ""
  const onData = (buf: Buffer) => {
    log += buf.toString()
    if (log.length > 8000) log = log.slice(-8000)
    const match = log.match(/server password (\S+)/)
    if (match?.[1]) password = match[1]
  }
  child.stdout?.on("data", onData)
  child.stderr?.on("data", onData)
  const baseUrl = `http://127.0.0.1:${port}`
  const stop = () => {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill("SIGTERM")
      setTimeout(() => {
        if (child.exitCode == null) child.kill("SIGKILL")
      }, 2000).unref()
    }
  }
  try {
    const readyAt = Date.now() + 20000
    let lastError = "server did not become ready"
    let api: OpencodeApi | undefined
    const providersReady = (result: HttpResult): boolean =>
      result.status === 200 &&
      !isHtml(result.contentType, result.body) &&
      !!asRecord(result.body) &&
      "providers" in (result.body as object)
    while (Date.now() < readyAt) {
      if (child.exitCode != null) {
        throw new Error(`opencode serve exited ${child.exitCode}: ${redactServerLog(log).slice(0, 400)}`)
      }
      const info = await request(baseUrl, "GET", "/api/info", {
        password: password || undefined,
        timeoutMs: 1000,
      })
      if (
        info.status === 200 &&
        !isHtml(info.contentType, info.body) &&
        info.body &&
        typeof info.body === "object"
      ) {
        api = "v2"
        break
      }
      // v2 prints a password and answers 401 until then. v1 serves the UI at
      // /api/info and the catalog at /config/providers, with no password.
      if (info.status !== 401 && !info.networkError) {
        const providers = await request(baseUrl, "GET", "/config/providers", { timeoutMs: 1000 })
        if (providersReady(providers)) {
          api = "v1"
          break
        }
        lastError = providers.networkError || errorMessage(providers.body, providers.status)
      } else {
        lastError = info.networkError || errorMessage(info.body, info.status)
      }
      await new Promise((r) => setTimeout(r, 150))
    }
    if (!api) {
      const why = password
        ? lastError
        : `opencode serve printed no password: ${redactServerLog(log).slice(0, 400)}`
      throw new Error(`opencode serve not ready (${why})`)
    }
    rememberPassword(baseUrl, password || undefined)
    return await fn({ baseUrl, password: password || undefined, api })
  } finally {
    stop()
  }
}

export function opencodeCliMajor(): number | null {
  const res = spawnSync("opencode", ["--version"], { encoding: "utf8", timeout: 8000 })
  const text = `${res.stdout || ""} ${res.stderr || ""}`
  const match = text.match(/(\d+)\.\d+\.\d+/)
  return match ? Number(match[1]) : null
}
