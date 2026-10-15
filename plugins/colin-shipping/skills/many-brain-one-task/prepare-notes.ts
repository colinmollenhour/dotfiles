#!/usr/bin/env bun
/**
 * prepare-notes.ts — format GitLab DiffNote and summary JSON payloads safely.
 *
 * Avoids bash quoting, backtick expansion, and ad-hoc script generation in the
 * orchestrator session when preparing payloads for `glab api`.
 *
 * Usage:
 *   # Prepare summary note payload:
 *   bun prepare-notes.ts --summary .tmp/ultra-N/prepared-summary.md --out .tmp/ultra-N/payload-summary.json
 *
 *   # Prepare a single inline DiffNote payload:
 *   bun prepare-notes.ts --body-file .tmp/ultra-N/finding-1.md --path src/app.ts --line 42 --base <sha> --head <sha> --out .tmp/ultra-N/note-1.json
 *
 *   # Batch prepare from findings JSON (object or array of { id, path, new_line, old_line, body }):
 *   bun prepare-notes.ts --batch .tmp/ultra-N/findings.json --base <sha> --head <sha> --out-dir .tmp/ultra-N/notes
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "run-dir": { type: "string" },
    summary: { type: "string" },
    "body-file": { type: "string" },
    body: { type: "string" },
    path: { type: "string" },
    line: { type: "string" },
    "old-line": { type: "string" },
    base: { type: "string" },
    head: { type: "string" },
    start: { type: "string" },
    batch: { type: "string" },
    out: { type: "string" },
    "out-dir": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
})

if (values.help) {
  console.log(`Usage:
  bun prepare-notes.ts --summary <prepared-summary.md> [--out <payload.json>]
  bun prepare-notes.ts --batch <findings.json> --base <sha> --head <sha> [--out-dir <dir>]
  bun prepare-notes.ts --body-file <file.md> --path <file> --line <N> --base <sha> --head <sha> [--out <note.json>]`)
  process.exit(0)
}

// 1. Summary mode
if (values.summary) {
  const summaryPath = resolve(values.summary)
  if (!existsSync(summaryPath)) {
    console.error(`prepare-notes: summary file not found: ${summaryPath}`)
    process.exit(1)
  }
  const body = readFileSync(summaryPath, "utf8")
  const outPath = values.out
    ? resolve(values.out)
    : values["run-dir"]
    ? join(resolve(values["run-dir"]), "payload-summary.json")
    : "payload-summary.json"

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ body }, null, 2))
  console.log(JSON.stringify({ ok: true, mode: "summary", out: outPath, bytes: body.length }))
  process.exit(0)
}

// 2. Batch mode
if (values.batch) {
  const batchPath = resolve(values.batch)
  if (!existsSync(batchPath)) {
    console.error(`prepare-notes: batch file not found: ${batchPath}`)
    process.exit(1)
  }
  const baseSha = values.base
  const headSha = values.head
  const startSha = values.start || baseSha
  if (!baseSha || !headSha) {
    console.error("prepare-notes: --base and --head are required in batch mode")
    process.exit(1)
  }

  const outDir = values["out-dir"]
    ? resolve(values["out-dir"])
    : values["run-dir"]
    ? join(resolve(values["run-dir"]), "notes")
    : "notes"

  mkdirSync(outDir, { recursive: true })

  const raw = JSON.parse(readFileSync(batchPath, "utf8"))
  const items = Array.isArray(raw)
    ? raw.map((item, idx) => ({ key: item.id ?? item.key ?? `note-${idx + 1}`, ...item }))
    : Object.entries(raw).map(([key, item]: [string, any]) => ({ key, ...item }))

  const written: string[] = []
  for (const item of items) {
    const filePath = item.path || item.file_path || item.old_path || item.new_path
    if (!filePath || !item.body) continue

    const position: Record<string, unknown> = {
      position_type: "text",
      base_sha: baseSha,
      start_sha: startSha,
      head_sha: headSha,
      old_path: item.old_path || filePath,
      new_path: item.new_path || filePath,
    }
    if (typeof item.new_line === "number" || typeof item.line === "number") {
      position.new_line = item.new_line ?? item.line
    }
    if (typeof item.old_line === "number") {
      position.old_line = item.old_line
    }

    const payload = { body: item.body, position }
    const fileOut = join(outDir, `${item.key}.json`)
    writeFileSync(fileOut, JSON.stringify(payload, null, 2))
    written.push(fileOut)
  }

  console.log(JSON.stringify({ ok: true, mode: "batch", count: written.length, out_dir: outDir }))
  process.exit(0)
}

// 3. Single DiffNote mode
if (values["body-file"] || values.body) {
  let body = values.body ?? ""
  if (values["body-file"]) {
    const bf = resolve(values["body-file"])
    if (!existsSync(bf)) {
      console.error(`prepare-notes: body file not found: ${bf}`)
      process.exit(1)
    }
    body = readFileSync(bf, "utf8")
  }

  const baseSha = values.base
  const headSha = values.head
  const startSha = values.start || baseSha
  const filePath = values.path
  if (!baseSha || !headSha || !filePath) {
    console.error("prepare-notes: --path, --base, and --head are required for DiffNotes")
    process.exit(1)
  }

  const position: Record<string, unknown> = {
    position_type: "text",
    base_sha: baseSha,
    start_sha: startSha,
    head_sha: headSha,
    old_path: filePath,
    new_path: filePath,
  }
  if (values.line) position.new_line = Number(values.line)
  if (values["old-line"]) position.old_line = Number(values["old-line"])

  const outPath = values.out ?? "note.json"
  mkdirSync(dirname(resolve(outPath)), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ body, position }, null, 2))
  console.log(JSON.stringify({ ok: true, mode: "single", out: outPath }))
  process.exit(0)
}

console.error("prepare-notes: expected --summary, --batch, or --body-file/--body")
process.exit(1)
