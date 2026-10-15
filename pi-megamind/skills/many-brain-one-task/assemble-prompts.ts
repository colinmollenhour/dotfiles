#!/usr/bin/env bun
/**
 * assemble-prompts.ts — concatenate N role templates with a shared
 * context suffix (e.g. MR-specific bucket).
 *
 * The ultra-review flow writes a shared change-index file (MR metadata,
 * exact diff references, and repository context) and role-specific
 * instruction files (state/contracts/failure). Each role prompt is
 * `role-X.md + bucket-index.md`. This helper does all N concatenations
 * in one call and prints a JSON summary, replacing an error-prone chain
 * of `cat` calls.
 *
 * Usage:
 *
 *   bun "${CLAUDE_SKILL_DIR}/assemble-prompts.ts" \
 *     --append .tmp/ultra-review-2514/context/bucket-index.md \
 *     --append "${CLAUDE_SKILL_DIR}/roles/issue-form.md" \
 *     --out-dir .tmp/ultra-review-2514/prompts \
 *     .tmp/ultra-review-2514/context/role-state.md:state.full.md \
 *     .tmp/ultra-review-2514/context/role-contracts.md:contracts.full.md \
 *     .tmp/ultra-review-2514/context/role-failure.md:failure.full.md
 *
 * Each positional is `<source>:<output-name>`. For every positional the
 * helper writes `<out-dir>/<output-name>` = contents of <source>
 * followed by every --append file in order (repeated --append is
 * cumulative, not last-wins). If --append is omitted each output is
 * just a copy of its source (still useful for getting one atomic
 * summary instead of N Write calls). Discovery outputs (not *merits*)
 * also get roles/issue-form.md when that file exists next to this
 * script, unless it was already passed via --append.
 *
 * stdout summary:
 *   {
 *     "out_dir": ".tmp/ultra-review-2514/prompts",
 *     "append_bytes": 12345,
 *     "outputs": [
 *       {"out": "state.full.md", "source": "role-state.md", "bytes": 15678},
 *       …
 *     ]
 *   }
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

interface Values {
  append?: string[]
  "out-dir"?: string
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    append: { type: "string", multiple: true },
    "out-dir": { type: "string" },
  },
}) as { values: Values; positionals: string[] }

function die(msg: string, code = 2): never {
  console.error(`assemble-prompts: ${msg}`)
  process.exit(code)
}

if (positionals.length === 0) die("expected at least one <source>:<output-name> positional")
const outDir = values["out-dir"] ?? "."
mkdirSync(outDir, { recursive: true })

function readAppend(path: string): { text: string; bytes: number } {
  try {
    return { text: readFileSync(path, "utf8"), bytes: statSync(path).size }
  } catch (err) {
    die(`failed to read --append ${path}: ${(err as Error).message}`)
  }
}

function joinChunks(chunks: string[]): string {
  let out = ""
  for (const chunk of chunks) {
    if (!chunk) continue
    if (out && !out.endsWith("\n")) out += "\n"
    out += chunk
  }
  return out
}

const appendFiles = values.append ?? []
const appendChunks: string[] = []
let appendBytes = 0
for (const f of appendFiles) {
  const { text, bytes } = readAppend(f)
  appendChunks.push(text)
  appendBytes += bytes
}
const suffix = joinChunks(appendChunks)
const issueFormPath = join(dirname(fileURLToPath(import.meta.url)), "roles", "issue-form.md")
const issueFormAlready = appendFiles.some((f) => f.replace(/\\/g, "/").endsWith("/roles/issue-form.md") || f.endsWith("issue-form.md"))
const issueForm = !issueFormAlready && existsSync(issueFormPath) ? readFileSync(issueFormPath, "utf8") : ""

interface Output { out: string; source: string; bytes: number; error?: string }

const outputs: Output[] = positionals.map((spec) => {
  const idx = spec.lastIndexOf(":")
  if (idx <= 0 || idx === spec.length - 1) {
    return { out: spec, source: spec, bytes: 0, error: `invalid spec: expected "<source>:<output-name>" (got ${JSON.stringify(spec)})` }
  }
  const source = spec.slice(0, idx)
  const outName = spec.slice(idx + 1)
  let content: string
  try {
    content = readFileSync(source, "utf8")
  } catch (err) {
    return { out: outName, source, bytes: 0, error: `failed to read source: ${(err as Error).message}` }
  }
  // Role + every --append, then the ISSUE form for discovery slots.
  const merits = /merits/i.test(outName) || /merits/i.test(source)
  const body = joinChunks([content, suffix, merits ? "" : issueForm])
  const outPath = join(outDir, outName)
  try {
    writeFileSync(outPath, body)
  } catch (err) {
    return { out: outName, source, bytes: 0, error: `failed to write ${outPath}: ${(err as Error).message}` }
  }
  return { out: outName, source, bytes: body.length }
})

const failures = outputs.filter((o) => o.error)
const summary = {
  out_dir: outDir,
  append: appendFiles,
  append_bytes: appendBytes,
  issue_form: Boolean(issueForm),
  outputs,
}
process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
process.exit(failures.length > 0 ? 1 : 0)
