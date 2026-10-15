#!/usr/bin/env bun
/**
 * pr-context.ts — fetch all GitHub PR context in one call (gh twin of mr-context.ts).
 *
 *   bun pr-context.ts --repo owner/repo --pr 123 --out-dir .tmp/pr-123-context
 *
 * Writes: pr.json, comments.json, reviews.json, review-comments.json, files.json, diff.patch
 * stdout: compact JSON summary (no full diff).
 */

import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"

interface Values {
  repo?: string
  pr?: string
  "out-dir"?: string
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    repo: { type: "string" },
    pr: { type: "string" },
    "out-dir": { type: "string" },
  },
}) as { values: Values }

function die(msg: string, code = 2): never {
  console.error(`pr-context: ${msg}`)
  process.exit(code)
}

if (!values.repo) die("--repo is required (owner/repo)")
if (!values.pr) die("--pr is required")
const prNum = Number(values.pr)
if (!Number.isInteger(prNum) || prNum <= 0) die(`--pr must be a positive integer (got ${values.pr})`)
const outDir = values["out-dir"] ?? `.tmp/pr-${prNum}-context`
mkdirSync(outDir, { recursive: true })

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString()
    })
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString()
    })
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

const repo = values.repo!
const jobs: Job[] = [
  {
    name: "pr",
    file: "pr.json",
    cmd: [
      "gh",
      [
        "pr",
        "view",
        String(prNum),
        "--repo",
        repo,
        "--json",
        "number,title,state,isDraft,author,baseRefName,headRefName,headRefOid,baseRefOid,body,url,labels,files,commits,statusCheckRollup,reviewDecision",
      ],
    ],
    wantJson: true,
  },
  {
    name: "comments",
    file: "comments.json",
    cmd: ["gh", ["api", `repos/${repo}/issues/${prNum}/comments`, "--paginate"]],
    wantJson: true,
  },
  {
    name: "reviews",
    file: "reviews.json",
    cmd: ["gh", ["api", `repos/${repo}/pulls/${prNum}/reviews`, "--paginate"]],
    wantJson: true,
  },
  {
    name: "review-comments",
    file: "review-comments.json",
    cmd: ["gh", ["api", `repos/${repo}/pulls/${prNum}/comments`, "--paginate"]],
    wantJson: true,
  },
  {
    name: "files",
    file: "files.json",
    cmd: ["gh", ["api", `repos/${repo}/pulls/${prNum}/files`, "--paginate"]],
    wantJson: true,
  },
  {
    name: "diff",
    file: "diff.patch",
    cmd: ["gh", ["pr", "diff", String(prNum), "--repo", repo]],
  },
]

interface JobResult {
  name: string
  file: string
  bytes: number
  error?: string
}

const results: JobResult[] = await Promise.all(
  jobs.map(async (j) => {
    const r = await run(j.cmd[0], j.cmd[1])
    const path = join(outDir, j.file)
    if (r.code !== 0) {
      writeFileSync(path + ".stderr", r.stderr)
      const firstMeaningful = r.stderr
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0)
      return { name: j.name, file: j.file, bytes: 0, error: firstMeaningful || `exit ${r.code}` }
    }
    if (j.wantJson) {
      try {
        JSON.parse(r.stdout)
      } catch (err) {
        writeFileSync(path + ".stderr", `not valid JSON:\n${r.stdout.slice(0, 500)}`)
        return {
          name: j.name,
          file: j.file,
          bytes: 0,
          error: `invalid JSON (${(err as Error).message})`,
        }
      }
    }
    writeFileSync(path, r.stdout)
    return { name: j.name, file: j.file, bytes: r.stdout.length }
  }),
)

interface PrSummary {
  state?: string
  title?: string
  isDraft?: boolean
  headRefName?: string
  baseRefName?: string
  headRefOid?: string
  baseRefOid?: string
  url?: string
}
let prSummary: PrSummary = {}
const prResult = results.find((r) => r.name === "pr")
if (prResult && prResult.bytes > 0) {
  try {
    prSummary = JSON.parse(readFileSync(join(outDir, "pr.json"), "utf8")) as PrSummary
  } catch {
    /* already flagged */
  }
}

const errors: Record<string, string> = {}
const files: Record<string, number> = {}
for (const r of results) {
  files[r.file] = r.bytes
  if (r.error) errors[r.name] = r.error
}

const summary = {
  repo,
  pr: prNum,
  dir: outDir,
  pr_state: prSummary.state,
  pr_title: prSummary.title,
  is_draft: prSummary.isDraft,
  source_branch: prSummary.headRefName,
  target_branch: prSummary.baseRefName,
  head_sha: prSummary.headRefOid,
  base_sha: prSummary.baseRefOid,
  url: prSummary.url,
  files,
  errors: Object.keys(errors).length ? errors : undefined,
}

process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
process.exit(Object.keys(errors).length > 0 ? 1 : 0)
