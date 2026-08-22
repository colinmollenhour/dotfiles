#!/usr/bin/env bun
/**
 * Path + OpenCode default helpers for mbot-run.
 * Extracted so launch cannot double-prefix run_dir onto already-prefixed
 * prompt/out paths (observed: .tmp/ultra-N/.tmp/ultra-N/prompts/…).
 */

import { existsSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

export function inferProjectDir(runDir: string, explicit?: string): string {
  if (explicit && explicit.trim()) return resolve(explicit)
  const parent = dirname(runDir)
  if (basename(parent) === ".tmp") return dirname(parent)
  return runDir
}

/** Strip a duplicated run-dir prefix from a relative plan path. */
export function stripDuplicateRunPrefix(p: string, runDir: string): string {
  const posix = p.replace(/\\/g, "/").replace(/^\.\//, "")
  if (!posix) return posix
  const base = basename(runDir.replace(/\\/g, "/"))
  const runPosix = runDir.replace(/\\/g, "/").replace(/\/$/, "")
  const prefixes = [runPosix, `.tmp/${base}`, `tmp/${base}`, base]
  for (const prefix of prefixes) {
    const pre = prefix.replace(/\\/g, "/").replace(/\/$/, "")
    if (!pre) continue
    if (posix === pre) return ""
    if (posix.startsWith(pre + "/")) return posix.slice(pre.length + 1)
  }
  return posix
}

/**
 * Resolve a plan prompt/out path.
 * Accepts absolute, run-dir relative (`prompts/x.md`), or repo-relative
 * (`.tmp/ultra-N/prompts/x.md`) without joining run_dir twice.
 * Prefers a path that already exists; otherwise the canonical run-dir join.
 */
export function resolvePlanPath(
  p: string,
  opts: { runDir: string; projectDir: string; cwd?: string },
): string {
  if (!p) return opts.runDir
  if (isAbsolute(p)) return p
  const cwd = opts.cwd ?? process.cwd()
  const stripped = stripDuplicateRunPrefix(p, opts.runDir)
  const candidates = [
    join(opts.runDir, stripped),
    join(opts.runDir, p),
    join(opts.projectDir, stripped),
    join(opts.projectDir, p),
    join(cwd, stripped),
    join(cwd, p),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return resolve(c)
  }
  return resolve(join(opts.runDir, stripped || p))
}

/** GPT/OpenAI OpenCode slots use the profile agent; others leave unset. */
export function defaultOpencodeAgent(model: string): string | undefined {
  const m = (model || "").toLowerCase()
  if (m.includes("gpt") || m.includes("openai")) return "colin-mbot-gpt"
  return undefined
}

export function defaultOpencodeVariant(variant?: string): string | undefined {
  if (variant === "" || variant === "none") return undefined
  if (variant) return variant
  return "high"
}
