#!/usr/bin/env bun
/**
 * build-merits.ts — assemble merits prompt from roles/merits.md and context.
 *
 * Merits is a holistic design evaluation rather than an issue-discovery pass,
 * so it omits the ISSUE block template. This helper joins roles/merits.md
 * with the change context into prompts/merits.full.md.
 *
 * Usage:
 *   bun build-merits.ts --run-dir .tmp/ultra-2857
 *   bun build-merits.ts --context .tmp/ultra-2857/context/bucket.md --out .tmp/ultra-2857/prompts/merits.full.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "run-dir": { type: "string" },
    context: { type: "string" },
    out: { type: "string" },
    role: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
})

if (values.help) {
  console.log(`Usage: bun build-merits.ts --run-dir <dir> [--context <context.md>] [--out <prompts/merits.full.md>]`)
  process.exit(0)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const runDir = values["run-dir"] ? resolve(values["run-dir"]) : undefined

let contextPath = values.context
if (!contextPath && runDir) {
  const candidate = join(runDir, "context", "bucket.md")
  if (existsSync(candidate)) contextPath = candidate
  else {
    const candidate2 = join(runDir, "context", "change-index.md")
    if (existsSync(candidate2)) contextPath = candidate2
  }
}

if (!contextPath || !existsSync(contextPath)) {
  console.error(`build-merits: missing context file: ${contextPath ?? "(none specified)"}`)
  process.exit(1)
}

const roleFile = values.role ? resolve(values.role) : join(scriptDir, "roles", "merits.md")
if (!existsSync(roleFile)) {
  console.error(`build-merits: missing role file: ${roleFile}`)
  process.exit(1)
}

const outPath = values.out
  ? resolve(values.out)
  : runDir
  ? join(runDir, "prompts", "merits.full.md")
  : "prompts/merits.full.md"

mkdirSync(dirname(outPath), { recursive: true })

const roleContent = readFileSync(roleFile, "utf8").trim()
const contextContent = readFileSync(contextPath, "utf8").trim()

const combined = `${roleContent}\n\n${contextContent}\n`
writeFileSync(outPath, combined)

console.log(JSON.stringify({
  ok: true,
  out: outPath,
  bytes: combined.length,
  role: roleFile,
  context: contextPath,
}))
