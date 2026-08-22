#!/usr/bin/env bun
/**
 * mbot-candidates.ts — parse <<<ISSUE>>> blocks from results/*.out into
 * candidates.json + candidate-index.md. Replaces ad-hoc extract-issues.ts.
 *
 *   bun mbot-candidates.ts --run-dir .tmp/ultra-N
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"

interface MetaLite {
  slot?: string
  actual_model?: string
  planned_model?: string
  phase?: string
  status?: string
}

interface Candidate {
  id: string
  slot: string
  model: string
  phase: string
  role: string
  file: string
  anchor: string
  severity: string
  confidence: string
  invariant: string
  trigger: string
  harm: string
  evidence: string
  fix: string
  source: string
}

function die(msg: string, code = 2): never {
  console.error(`mbot-candidates: ${msg}`)
  process.exit(code)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function field(block: string, key: string): string {
  const re = new RegExp(`^${key}\\s*:\\s*(.*)$`, "im")
  const m = block.match(re)
  if (!m) return ""
  const first = m[1].trim()
  // Continuation lines until next key: value
  const after = block.slice((m.index ?? 0) + m[0].length)
  const extra: string[] = []
  for (const line of after.split("\n")) {
    if (/^[a-z_][a-z0-9_]*\s*:/i.test(line)) break
    extra.push(line)
  }
  return [first, ...extra].join("\n").trim()
}

export function parseIssueBlocks(text: string): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = []
  const re = /<<<\s*ISSUE\s*>>>([\s\S]*?)(?:<<<\s*END\s*>>>|(?=<<<\s*ISSUE\s*>>>))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const body = m[1].trim()
    if (!body) continue
    blocks.push({
      role: field(body, "role"),
      file: field(body, "file"),
      anchor: field(body, "anchor"),
      severity: field(body, "severity"),
      confidence: field(body, "confidence"),
      invariant: field(body, "invariant"),
      trigger: field(body, "trigger"),
      harm: field(body, "harm"),
      evidence: field(body, "evidence"),
      fix: field(body, "fix"),
    })
  }
  return blocks
}

function loadMeta(outPath: string): MetaLite {
  const metaPath = outPath.replace(/\.out$/, "") + ".meta.json"
  if (!existsSync(metaPath)) return {}
  try {
    return readJson<MetaLite>(metaPath)
  } catch {
    return {}
  }
}

function padId(n: number): string {
  return `R${String(n).padStart(3, "0")}`
}

export function collectCandidates(runDir: string): {
  candidates: Candidate[]
  slots_scanned: number
  slots_with_issues: number
} {
  const resultsDir = join(runDir, "results")
  if (!existsSync(resultsDir)) die(`results dir missing: ${resultsDir}`)
  const outs = readdirSync(resultsDir)
    .filter((f) => f.endsWith(".out") && !f.startsWith("_smoke"))
    .sort()
  const candidates: Candidate[] = []
  let slotsWith = 0
  let n = 0
  for (const f of outs) {
    const outPath = join(resultsDir, f)
    let text = ""
    try {
      text = readFileSync(outPath, "utf8")
    } catch {
      continue
    }
    const meta = loadMeta(outPath)
    const slot = meta.slot || f.replace(/\.out$/, "")
    const model = meta.actual_model || meta.planned_model || "unknown"
    const phase = meta.phase || ""
    const blocks = parseIssueBlocks(text)
    if (blocks.length) slotsWith++
    for (const b of blocks) {
      n++
      candidates.push({
        id: padId(n),
        slot,
        model,
        phase,
        role: b.role || "",
        file: b.file || "",
        anchor: b.anchor || "",
        severity: b.severity || "",
        confidence: b.confidence || "",
        invariant: b.invariant || "",
        trigger: b.trigger || "",
        harm: b.harm || "",
        evidence: b.evidence || "",
        fix: b.fix || "",
        source: outPath,
      })
    }
  }
  return { candidates, slots_scanned: outs.length, slots_with_issues: slotsWith }
}

function writeIndex(path: string, candidates: Candidate[]): void {
  const lines = [
    `# Candidate index — ${candidates.length} raw candidates`,
    "",
    "| id | sev | conf | model/slot | file | invariant |",
    "|---|---|---|---|---|---|",
  ]
  for (const c of candidates) {
    const inv = (c.invariant || "").replace(/\|/g, "\\|").replace(/\n/g, " ")
    const file = (c.file || "").replace(/\|/g, "\\|")
    lines.push(
      `| ${c.id} | ${c.severity || "?"} | ${c.confidence || "?"} | ${c.model}/${c.slot} | ${file} | ${inv.slice(0, 140)} |`,
    )
  }
  lines.push("")
  writeFileSync(path, lines.join("\n"))
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "run-dir": { type: "string" },
      out: { type: "string" },
      index: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  }) as {
    values: {
      "run-dir"?: string
      out?: string
      index?: string
      help?: boolean
    }
  }
  if (values.help || !values["run-dir"]) {
    process.stdout.write(
      `Usage: bun mbot-candidates.ts --run-dir <dir> [--out candidates.json] [--index candidate-index.md]\n`,
    )
    process.exit(values.help ? 0 : 2)
  }
  const runDir = resolve(values["run-dir"])
  const { candidates, slots_scanned, slots_with_issues } = collectCandidates(runDir)
  const outPath = values.out ? resolve(values.out) : join(runDir, "candidates.json")
  const indexPath = values.index
    ? resolve(values.index)
    : join(runDir, "candidate-index.md")
  const payload = {
    ok: true,
    run_dir: runDir,
    candidates,
    totals: {
      candidates: candidates.length,
      slots_scanned,
      slots_with_issues,
    },
  }
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n")
  writeIndex(indexPath, candidates)
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        run_dir: runDir,
        out: outPath,
        index: indexPath,
        totals: payload.totals,
      },
      null,
      2,
    ) + "\n",
  )
}

if (import.meta.main) main()
