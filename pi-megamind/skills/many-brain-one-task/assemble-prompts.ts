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
 *     --out-dir .tmp/ultra-review-2514/prompts \
 *     .tmp/ultra-review-2514/context/role-state.md:state.full.md \
 *     .tmp/ultra-review-2514/context/role-contracts.md:contracts.full.md \
 *     .tmp/ultra-review-2514/context/role-failure.md:failure.full.md
 *
 * Each positional is `<source>:<output-name>`. For every positional the
 * helper writes `<out-dir>/<output-name>` = contents of <source>
 * followed by the contents of --append. If --append is omitted each
 * output is just a copy of its source (still useful for getting one
 * atomic summary instead of N Write calls).
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

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"

interface Values {
  append?: string
  "out-dir"?: string
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    append: { type: "string" },
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

let suffix = ""
let appendBytes = 0
if (values.append) {
  try {
    suffix = readFileSync(values.append, "utf8")
    appendBytes = statSync(values.append).size
  } catch (err) {
    die(`failed to read --append ${values.append}: ${(err as Error).message}`)
  }
}

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
  // Ensure a newline separator between the role template and the
  // appended bucket so they don't run together when the template
  // doesn't end with `\n`.
  const body = suffix
    ? (content.endsWith("\n") ? content : content + "\n") + suffix
    : content
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
  append: values.append,
  append_bytes: appendBytes,
  outputs,
}
process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
process.exit(failures.length > 0 ? 1 : 0)
