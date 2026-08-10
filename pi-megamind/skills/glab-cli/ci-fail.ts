#!/usr/bin/env bun
/**
 * ci-fail.ts — gather latest pipeline + failed job traces for a branch/MR.
 *
 *   bun ci-fail.ts --project shipstream/server --branch my-feature --out-dir .tmp/ci-fail
 *   bun ci-fail.ts --project shipstream/server --mr 2514 --out-dir .tmp/ci-fail
 *
 * Writes under --out-dir:
 *   pipelines.json, failed-jobs.json, traces/<job-id>.log, summary.json
 * stdout: summary JSON (no full logs).
 */

import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"

interface Values {
  project?: string
  branch?: string
  mr?: string
  "out-dir"?: string
  limit?: string
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    project: { type: "string" },
    branch: { type: "string" },
    mr: { type: "string" },
    "out-dir": { type: "string" },
    limit: { type: "string", default: "3" },
  },
}) as { values: Values }

function die(msg: string, code = 2): never {
  console.error(`ci-fail: ${msg}`)
  process.exit(code)
}

function run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 })
  return { code: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" }
}

if (!values.project) die("--project is required")
const outDir = values["out-dir"] ?? `.tmp/ci-fail`
mkdirSync(outDir, { recursive: true })
mkdirSync(join(outDir, "traces"), { recursive: true })

let branch = values.branch
if (values.mr && !branch) {
  const view = run("glab", ["mr", "view", values.mr, "-R", values.project, "--output", "json"])
  if (view.code !== 0) die(`glab mr view failed: ${view.stderr}`)
  const mr = JSON.parse(view.stdout) as { source_branch?: string }
  branch = mr.source_branch
}
if (!branch) {
  const r = run("git", ["branch", "--show-current"])
  branch = r.stdout.trim() || undefined
}
if (!branch) die("--branch or --mr required (could not infer branch)")

const limit = Number(values.limit || "3")
const list = run("glab", [
  "ci",
  "list",
  "-R",
  values.project,
  "--per-page",
  String(limit),
  "--output",
  "json",
])
// glab ci list may not filter by branch consistently; also try API
const projectEnc = encodeURIComponent(values.project)
const apiList = run("glab", [
  "api",
  `projects/${projectEnc}/pipelines?ref=${encodeURIComponent(branch)}&per_page=${limit}`,
])

let pipelines: Array<Record<string, unknown>> = []
if (apiList.code === 0 && apiList.stdout.trim()) {
  try {
    pipelines = JSON.parse(apiList.stdout)
  } catch {
    pipelines = []
  }
}
if (!pipelines.length && list.code === 0 && list.stdout.trim()) {
  try {
    const all = JSON.parse(list.stdout) as Array<Record<string, unknown>>
    pipelines = all.filter((p) => p.ref === branch || p.sha)
  } catch {
    pipelines = []
  }
}

writeFileSync(join(outDir, "pipelines.json"), JSON.stringify(pipelines, null, 2) + "\n")

const latest = pipelines[0]
if (!latest) {
  const summary = {
    project: values.project,
    branch,
    dir: outDir,
    pipelines: 0,
    failed_jobs: [],
    message: "no pipelines found for branch",
  }
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
  process.exit(0)
}

const pipelineId = latest.id
const jobsApi = run("glab", [
  "api",
  `projects/${projectEnc}/pipelines/${pipelineId}/jobs?per_page=100`,
])
let jobs: Array<Record<string, unknown>> = []
if (jobsApi.code === 0) {
  try {
    jobs = JSON.parse(jobsApi.stdout)
  } catch {
    jobs = []
  }
}
const failed = jobs.filter((j) => j.status === "failed" || j.status === "canceled")
writeFileSync(join(outDir, "failed-jobs.json"), JSON.stringify(failed, null, 2) + "\n")

const traces: Array<{ job_id: number; name: string; bytes: number; path: string }> = []
for (const j of failed) {
  const id = Number(j.id)
  const name = String(j.name || id)
  // Prefer glab ci trace when available
  let log = ""
  const trace = run("glab", ["ci", "trace", String(id), "-R", values.project!])
  if (trace.code === 0 && trace.stdout.trim()) {
    log = trace.stdout
  } else {
    const api = run("glab", ["api", `projects/${projectEnc}/jobs/${id}/trace`])
    log = api.stdout
  }
  const path = join(outDir, "traces", `${id}.log`)
  writeFileSync(path, log)
  traces.push({ job_id: id, name, bytes: log.length, path })
}

const summary = {
  project: values.project,
  branch,
  dir: outDir,
  pipeline_id: pipelineId,
  pipeline_status: latest.status,
  pipeline_web_url: latest.web_url,
  failed_job_count: failed.length,
  failed_jobs: failed.map((j) => ({
    id: j.id,
    name: j.name,
    stage: j.stage,
    status: j.status,
  })),
  traces,
}
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
process.exit(failed.length > 0 ? 1 : 0)
