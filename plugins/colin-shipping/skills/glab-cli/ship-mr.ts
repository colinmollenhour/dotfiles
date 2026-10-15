#!/usr/bin/env bun
/**
 * ship-mr.ts — create-or-update a GitLab MR and optionally post a note.
 *
 * Covers the colin-commit-and-push happy path without loading the full
 * glab-cli skill encyclopedia.
 *
 * Usage:
 *
 *   bun ship-mr.ts \
 *     --project shipstream/server \
 *     --source my-feature \
 *     --target master \
 *     --title "Fix widget" \
 *     --description-file /abs/body.md \
 *     --note-file /abs/note.md
 *
 * Omit --project to infer from `git remote get-url origin` in cwd.
 * Omit --source to use current branch.
 *
 * stdout: JSON { project, mr_iid, web_url, created, note_posted, head_sha }
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"

interface Values {
  project?: string
  source?: string
  target?: string
  title?: string
  "description-file"?: string
  description?: string
  "note-file"?: string
  note?: string
  draft?: boolean
  "remove-source-branch"?: boolean
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    project: { type: "string" },
    source: { type: "string" },
    target: { type: "string" },
    title: { type: "string" },
    "description-file": { type: "string" },
    description: { type: "string" },
    "note-file": { type: "string" },
    note: { type: "string" },
    draft: { type: "boolean", default: false },
    "remove-source-branch": { type: "boolean", default: false },
  },
}) as { values: Values }

function die(msg: string, code = 2): never {
  console.error(`ship-mr: ${msg}`)
  process.exit(code)
}

function run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })
  return { code: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" }
}

function git(...args: string[]): string {
  const r = run("git", args)
  if (r.code !== 0) die(`git ${args.join(" ")} failed: ${r.stderr.trim()}`)
  return r.stdout.trim()
}

function parseProjectFromRemote(url: string): string | null {
  // git@host:group/repo.git  or https://host/group/repo.git
  const ssh = url.match(/:([^/].+?)(?:\.git)?$/)
  if (ssh && !url.startsWith("http")) return ssh[1].replace(/\.git$/, "")
  try {
    const u = new URL(url)
    return u.pathname.replace(/^\//, "").replace(/\.git$/, "")
  } catch {
    return null
  }
}

function readBody(file?: string, inline?: string): string {
  if (file) {
    if (!existsSync(file)) die(`file not found: ${file}`)
    return readFileSync(file, "utf8")
  }
  return inline || ""
}

let project = values.project
if (!project) {
  const remote = git("remote", "get-url", "origin")
  project = parseProjectFromRemote(remote) || undefined
}
if (!project) die("--project required (could not infer from origin)")

const source = values.source || git("branch", "--show-current")
if (!source) die("could not determine source branch")

const target = values.target || "master"
const title = values.title
const description = readBody(values["description-file"], values.description)
const note = readBody(values["note-file"], values.note)

// Existing open MR for this source branch?
const list = run("glab", [
  "mr",
  "list",
  "--source-branch",
  source,
  "-R",
  project,
  "--output",
  "json",
])
let existingIid: number | null = null
let webUrl = ""
if (list.code === 0 && list.stdout.trim()) {
  try {
    const arr = JSON.parse(list.stdout) as Array<{ iid: number; web_url?: string; state?: string }>
    const open = arr.find((m) => !m.state || m.state === "opened") || arr[0]
    if (open?.iid) {
      existingIid = open.iid
      webUrl = open.web_url || ""
    }
  } catch {
    /* fall through to create */
  }
}

let created = false
let mrIid = existingIid

if (mrIid == null) {
  if (!title) die("--title is required when creating a new MR")
  const args = [
    "mr",
    "create",
    "-R",
    project,
    "--source-branch",
    source,
    "--target-branch",
    target,
    "--title",
    title,
    "--yes",
  ]
  if (values.draft) args.push("--draft")
  if (values["remove-source-branch"]) args.push("--remove-source-branch")
  // Prefer short description via -d; long body set via API after
  if (description && description.length < 4000) {
    args.push("-d", description)
  } else {
    args.push("-d", description ? "(see description)" : "")
  }
  const create = run("glab", args)
  if (create.code !== 0) die(`glab mr create failed: ${create.stderr || create.stdout}`)
  // Parse IID from output URL or re-list
  const urlMatch = (create.stdout + create.stderr).match(/merge_requests\/(\d+)/)
  if (urlMatch) {
    mrIid = Number(urlMatch[1])
    webUrl = (create.stdout + create.stderr).match(/https?:\/\/\S+merge_requests\/\d+/)?.[0] || ""
  } else {
    const again = run("glab", [
      "mr",
      "list",
      "--source-branch",
      source,
      "-R",
      project,
      "--output",
      "json",
    ])
    const arr = JSON.parse(again.stdout || "[]") as Array<{ iid: number; web_url?: string }>
    mrIid = arr[0]?.iid ?? null
    webUrl = arr[0]?.web_url || ""
  }
  if (mrIid == null) die("MR created but could not resolve IID")
  created = true

  // Long description via API JSON body (avoids -d @file and shell quoting issues)
  if (description && description.length >= 4000) {
    const dir = mkdtempSync(join(tmpdir(), "ship-mr-"))
    const payload = join(dir, "body.json")
    writeFileSync(payload, JSON.stringify({ description }))
    const projectEnc = encodeURIComponent(project)
    const put = run("glab", [
      "api",
      `projects/${projectEnc}/merge_requests/${mrIid}`,
      "-X",
      "PUT",
      "-H",
      "Content-Type: application/json",
      "--input",
      payload,
    ])
    if (put.code !== 0) {
      console.error(`ship-mr: warning: failed to set long description: ${put.stderr}`)
    }
  }
} else if (description && values["description-file"]) {
  // Optional description update when note/description provided for existing MR
  const dir = mkdtempSync(join(tmpdir(), "ship-mr-"))
  const payload = join(dir, "body.json")
  writeFileSync(payload, JSON.stringify({ description }))
  const projectEnc = encodeURIComponent(project)
  run("glab", [
    "api",
    `projects/${projectEnc}/merge_requests/${mrIid}`,
    "-X",
    "PUT",
    "-H",
    "Content-Type: application/json",
    "--input",
    payload,
  ])
}

// Fetch view for web_url / sha
const view = run("glab", ["mr", "view", String(mrIid), "-R", project, "--output", "json"])
let headSha = ""
if (view.code === 0) {
  try {
    const mr = JSON.parse(view.stdout) as {
      web_url?: string
      diff_refs?: { head_sha?: string }
      sha?: string
    }
    webUrl = mr.web_url || webUrl
    headSha = mr.diff_refs?.head_sha || mr.sha || ""
  } catch {
    /* ignore */
  }
}

let notePosted = false
if (note.trim()) {
  const n = run("glab", ["mr", "note", String(mrIid), "-R", project, "-m", note])
  if (n.code !== 0) die(`glab mr note failed: ${n.stderr || n.stdout}`)
  notePosted = true
}

const summary = {
  project,
  mr_iid: mrIid,
  web_url: webUrl,
  source_branch: source,
  target_branch: target,
  created,
  note_posted: notePosted,
  head_sha: headSha,
}
process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
process.exit(0)
