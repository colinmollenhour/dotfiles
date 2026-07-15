#!/usr/bin/env bun
/**
 * mr-context.ts — fetch all GitLab MR context in one call.
 *
 * Parallelizes the five `glab` calls an MR review usually makes (view,
 * notes, discussions, versions, diff) and writes them as separate files
 * under --out-dir. Prints a compact JSON summary so the caller can route
 * without reading the full diff into context.
 *
 * Usage (invoked inline from the Claude Code Bash tool):
 *
 *   bun "${CLAUDE_SKILL_DIR}/mr-context.ts" \
 *     --project shipstream/server \
 *     --mr 2514 \
 *     --out-dir .tmp/mr-2514-context
 *
 * Output layout under --out-dir:
 *   mr.json          MR metadata (glab mr view --output json)
 *   notes.json       array of notes (paginated)
 *   discussions.json array of discussions (paginated)
 *   versions.json    array of MR versions
 *   diff.patch       full unified diff
 *
 * stdout summary:
 *   {
 *     "project": "shipstream/server",
 *     "mr": 2514,
 *     "dir": ".tmp/mr-2514-context",
 *     "mr_state": "opened",
 *     "mr_title": "…",
 *     "source_branch": "…",
 *     "target_branch": "main",
 *     "head_sha": "…",
 *     "base_sha": "…",
 *     "files": {"mr.json": 1234, "notes.json": 567, … },
 *     "errors": {},  // per-endpoint error strings if any fetch failed
 *   }
 */

import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"

interface Values {
  project?: string
  mr?: string
  "out-dir"?: string
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    project: { type: "string" },
    mr: { type: "string" },
    "out-dir": { type: "string" },
  },
}) as { values: Values }

function die(msg: string, code = 2): never {
  console.error(`mr-context: ${msg}`)
  process.exit(code)
}

if (!values.project) die("--project is required (e.g. shipstream/server)")
if (!values.mr) die("--mr is required (MR iid, e.g. 2514)")
const mrNum = Number(values.mr)
if (!Number.isInteger(mrNum) || mrNum <= 0) die(`--mr must be a positive integer (got ${values.mr})`)
const outDir = values["out-dir"] ?? `.tmp/mr-${mrNum}-context`
mkdirSync(outDir, { recursive: true })

// URL-encode the project path for `glab api` calls (the `:fullpath`
// placeholder only works from inside a git worktree; we may be called
// from anywhere).
const projectEnc = encodeURIComponent(values.project)

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (b: Buffer) => { stdout += b.toString() })
    child.stderr.on("data", (b: Buffer) => { stderr += b.toString() })
    child.on("error", (err) => resolve({ stdout, stderr: `${err.message}\n${stderr}`, code: 127 }))
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }))
  })
}

interface Job {
  name: string
  file: string
  cmd: [string, string[]]
  wantJson?: boolean
}

const jobs: Job[] = [
  {
    name: "mr",
    file: "mr.json",
    cmd: ["glab", ["mr", "view", String(mrNum), "-R", values.project!, "--output", "json"]],
    wantJson: true,
  },
  {
    name: "notes",
    file: "notes.json",
    cmd: ["glab", ["api", `projects/${projectEnc}/merge_requests/${mrNum}/notes`, "--paginate"]],
    wantJson: true,
  },
  {
    name: "discussions",
    file: "discussions.json",
    cmd: ["glab", ["api", `projects/${projectEnc}/merge_requests/${mrNum}/discussions`, "--paginate"]],
    wantJson: true,
  },
  {
    name: "versions",
    file: "versions.json",
    cmd: ["glab", ["api", `projects/${projectEnc}/merge_requests/${mrNum}/versions`]],
    wantJson: true,
  },
  {
    name: "diff",
    file: "diff.patch",
    cmd: ["glab", ["mr", "diff", String(mrNum), "-R", values.project!]],
  },
]

interface JobResult { name: string; file: string; bytes: number; error?: string }

const results: JobResult[] = await Promise.all(
  jobs.map(async (j) => {
    const r = await run(j.cmd[0], j.cmd[1])
    const path = join(outDir, j.file)
    if (r.code !== 0) {
      // Write stderr so the caller can inspect what went wrong, and
      // surface a short error string in the summary. glab formats
      // errors with blank padding lines, so pick the first
      // meaningful line.
      writeFileSync(path + ".stderr", r.stderr)
      const firstMeaningful = r.stderr
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0 && l !== "ERROR")
      return { name: j.name, file: j.file, bytes: 0, error: firstMeaningful || `exit ${r.code}` }
    }
    // For JSON endpoints validate parseability before writing — catches
    // auth redirects / HTML error pages early.
    if (j.wantJson) {
      try { JSON.parse(r.stdout) }
      catch (err) {
        writeFileSync(path + ".stderr", `not valid JSON:\n${r.stdout.slice(0, 500)}`)
        return { name: j.name, file: j.file, bytes: 0, error: `invalid JSON response (${(err as Error).message})` }
      }
    }
    writeFileSync(path, r.stdout)
    return { name: j.name, file: j.file, bytes: r.stdout.length }
  }),
)

// Extract a few fields from mr.json for the summary so callers don't
// need to open it just to get title/state/branches/SHAs.
interface MrSummary {
  state?: string
  title?: string
  source_branch?: string
  target_branch?: string
  diff_refs?: { head_sha?: string; base_sha?: string; start_sha?: string }
}
let mrSummary: MrSummary = {}
const mrResult = results.find((r) => r.name === "mr")
if (mrResult && mrResult.bytes > 0) {
  try {
    const parsed = JSON.parse(
      // Re-read to avoid holding the buffer twice; the file we just
      // wrote is authoritative.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").readFileSync(join(outDir, "mr.json"), "utf8") as string,
    ) as MrSummary
    mrSummary = parsed
  } catch { /* already flagged in results */ }
}

const errors: Record<string, string> = {}
const files: Record<string, number> = {}
for (const r of results) {
  files[r.file] = r.bytes
  if (r.error) errors[r.name] = r.error
}

const summary = {
  project: values.project,
  mr: mrNum,
  dir: outDir,
  mr_state: mrSummary.state,
  mr_title: mrSummary.title,
  source_branch: mrSummary.source_branch,
  target_branch: mrSummary.target_branch,
  head_sha: mrSummary.diff_refs?.head_sha,
  base_sha: mrSummary.diff_refs?.base_sha,
  start_sha: mrSummary.diff_refs?.start_sha,
  files,
  errors: Object.keys(errors).length ? errors : undefined,
}

process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
process.exit(Object.keys(errors).length > 0 ? 1 : 0)
