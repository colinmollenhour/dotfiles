---
name: cclsp-fix-diagnostics
description: Scan a codebase with the CCLSP MCP and fix reported diagnostics. Language- and project-agnostic. Use for "fix all the LSP errors", "check the workspace for errors", "fix diagnostics in <path>", or auditing a branch/PR/commit range for new errors. Default scope is the whole codebase, chunked. User can narrow to files, folders, commits, ranges, branches, PRs, or MRs.
---

# CCLSP Fix Diagnostics

Scan code with the CCLSP MCP, classify each reported diagnostic as
fix-in-place or defer, apply low-risk fixes, and track progress in a per-run
checklist file. Resumable across sessions: the checklist (not this skill) is
the durable state.

This skill is **language-agnostic** — it relies on whatever LSP servers CCLSP
has configured for the project's file types. The only hard requirement is the
CCLSP MCP being available.

Use this skill for requests like:

- "fix all the LSP errors"
- "check the codebase for errors and fix what's safe"
- "scan the files in this branch / this MR / since master and fix issues"
- "fix diagnostics in `src/foo/`"
- "audit `<file>` for errors"

## Required Tools

Use the CCLSP MCP — load schemas with `ToolSearch` if they aren't active:

- `mcp__cclsp__get_workspace_diagnostics` — primary, scans a chunk of files
- `mcp__cclsp__get_diagnostics` — single-file follow-up after a fix
- `mcp__cclsp__find_definition`, `find_references`, `get_hover` — understand
  symbols before editing
- `mcp__cclsp__rename_symbol_strict` — when a fix requires a rename
- `mcp__cclsp__restart_server` — **call this after every edit** to a file
  whose LSP server caches diagnostics; many servers return stale results
  until restarted. Pass the affected file extension(s).

Prefer CCLSP over `grep`/`Read` for symbol navigation.

## Inputs To Support

The user may identify scope using any mix of:

- **Default (no scope):** the whole working tree, chunked. Include every
  file extension that has an LSP server configured in CCLSP. **Exclude**
  third-party/generated trees by default (`vendor/**`, `node_modules/**`,
  `target/**`, `dist/**`, `build/**`, `.venv/**`, `venv/**`, `__pycache__/**`,
  `.next/**`, `.nuxt/**`, `.output/**`, `coverage/**`, generated/`gen/**`,
  language-specific lock dirs). Include them only if the user explicitly
  asks.
- **Files / paths:** absolute or repo-relative paths. Single scan if it fits
  the time budget; otherwise chunk.
- **Folders / globs:** e.g. `src/**` or `**/*.ts`.
- **Commits / ranges / branches:** derive the file set from git, e.g.
  `HEAD~5..HEAD`, `origin/main...HEAD`, `<branch>`. Use:
  ```bash
  git diff --name-only <range>
  ```
  filter to file types with an LSP, then scan those paths.
- **PRs / MRs:** if the user references a GitHub PR or GitLab MR, use
  `gh`/`glab` to resolve the source branch, then
  `git diff --name-only <target>...<source>`.

If unclear, ask the user to confirm scope before kicking off a multi-hour
whole-repo sweep. Do NOT ask when the request is unambiguously narrow
("fix diagnostics in `foo.ts`").

## Workflow

### 1. Detect the project's languages

Before chunking, figure out which LSP servers CCLSP will actually use:

1. Probe with `mcp__cclsp__get_workspace_diagnostics` on a single known file
   to confirm the server is responsive.
2. Inspect the working tree for primary languages — `git ls-files | awk -F.
   '{print $NF}' | sort | uniq -c | sort -rn | head` gives a quick extension
   histogram. Cross-reference with what CCLSP has configured (try a scan on
   one file per extension if unsure).
3. Note any extensions present in the tree but **not** served by an LSP —
   skip those when chunking.

### 2. Resolve scope into a chunk list

Whole-workspace `cclsp` calls time out on large codebases (the wall budget is
~120 000 ms, and cold-cache scans are slow). Split work into chunks sized so
each scan returns in under ~120 s. Empirical rule: **up to ~1000 files per
chunk** is usually safe once the LSP has warmed up; start lower (~300–500)
for the first chunks while indexing.

When the user provides a narrow scope, the "chunk list" may be a single
chunk. When the user provides no scope, generate chunks by walking the tree:

- One chunk per top-level source directory (e.g. `src/`, `lib/`, `app/`,
  `pkg/`, `cmd/`, `internal/`). For monorepos, one chunk per package /
  workspace.
- If a chunk's first scan returns `PARTIAL` (file cap or time budget),
  split it by sub-directory and process each child chunk individually.
- Tests can be a separate chunk per top-level test dir (`tests/`, `test/`,
  `__tests__/`, `spec/`).
- Templates / view files (`.phtml`, `.vue`, `.tsx`, `.svelte`, `.html`)
  scan after primary source chunks are clean — they often depend on
  symbols defined elsewhere.

**Always skip third-party/generated trees** unless the user explicitly
opts in (see the default-exclude list above).

### 3. Create the checklist artifact

Write a per-run checklist file. Default name:
`.tmp/cclsp-fix-diagnostics-<scope>-<YYYY-MM-DD>.md`, where `<scope>` is a
slug describing the run (`fullsweep`, `branch-feature-x`, `PR-1234`,
`src-foo`, etc.). Use `.tmp/` because most projects gitignore it; place
the file elsewhere only if the user asks. If `.tmp/` is not gitignored in
this repo, prefer the project's existing scratch dir or ask.

The checklist file is **state, not instructions** — the skill carries the
instructions, the checklist carries the per-run findings and progress
markers. Structure:

```markdown
# CCLSP Fix Diagnostics — <scope> — <date>

Scope: <how the user described it, plus resolved file count>
Started: <UTC timestamp>
Languages: <extensions covered by an LSP>

## Chunks

Legend: `[ ]` not started · `[~]` in progress · `[/]` split into sub-chunks · `[x]` done · `[D]` chunk deferred

- [ ] **<chunk-name>** — `<glob or path list>`
  - Findings:

## Run log

<append a one-line entry per session: timestamp, chunks touched, errors fixed, errors deferred>
```

For each finding within a chunk, append a per-error checkbox under the
chunk's `Findings:` heading:

```markdown
  - [ ] <abs-path>:<line> — [<code>] <message>
```

Use `[x]` after fixing, `[D]` after deferring (with `→ reason`).

### 4. Per-chunk loop

For each unchecked chunk in the checklist:

1. **Mark in progress.** Flip `[ ]` to `[~]` and add `started: <UTC ts>`.

2. **Load any project skills** that match the chunk's path (read the
   project's `AGENTS.md` / `CLAUDE.md` / skills index if present).

3. **Run diagnostics:**
   ```
   mcp__cclsp__get_workspace_diagnostics
     root: <project root>
     patterns: ["<chunk-glob>"]      # or `paths` for explicit lists
     min_severity: error             # widen to "warning" only after errors are clean
     format: by_file
     time_budget_ms: 120000
     max_diagnostics: 500
   ```
   If the call returns `PARTIAL` (file cap or time budget), split the chunk:
   add sub-chunks below the parent in the checklist, mark the parent `[/]`,
   and process the sub-chunks individually.

4. **Append findings** to the chunk's `Findings:` section, one `[ ]` line
   per error. Group repeated errors in the same file on one line if it
   keeps the list scannable.

5. **For each `[ ]` finding, fix or defer:**
   - Read the surrounding code (`Read` or `get_hover`) before editing.
   - Apply the fix-vs-defer policy below.
   - If fixing: apply the `Edit`, then **restart the LSP** for that
     extension (`mcp__cclsp__restart_server` with the relevant
     `extensions`), then re-scan the edited file via
     `mcp__cclsp__get_diagnostics` to confirm the error cleared.
   - Flip the finding to `[x]` (fixed) or `[D] → reason` (deferred).

6. **Close the chunk.** Flip `[~]` to `[x]` with `done: <UTC ts>` once
   every finding is `[x]` or `[D]`. If the chunk is clean, write
   `Findings: clean (<N> files)` and close it the same way.

7. **Commit per logical group.** After 1–3 chunks of fixes, create a focused
   commit (e.g. `chore: fix LSP-reported diagnostics in <area>`). Do NOT
   push unless the user asks.

### 5. Wrap up

After every chunk is `[x]` or `[D]`, append a final summary entry to the
checklist's `Run log` (timestamp, total fixed, total deferred, any
behavioral questions flagged). Show the user the list of modified files
and the deferred findings so they can decide on follow-ups.

## Fix vs defer policy

**Fix in place** when the change is mechanical and self-contained:

- Undefined variable that should be initialized at the point of first use.
- Typo'd identifier with a clear nearby definition (correct casing, member
  vs. local, `self` vs. `this`, etc.).
- Wrong arg count or missing required arg where the call site makes the
  intent obvious.
- Missing return when the declared return type or every other branch
  returns.
- Unused imports / unused variables that are truly dead (not a
  pass-by-reference output, not a side-effecting import).
- Obvious type mismatches with an unambiguous fix (e.g. `null` where
  `undefined` is expected and the surrounding code already uses
  `undefined`).

**Defer (`[D]`)** when:

- The fix would change a public API: exported function signature,
  interface, trait, protocol, or anything observable across modules.
- The error is in a test fixture and "fixing" it would alter the scenario.
- The error looks like an LSP false positive that warrants suppression
  or annotation rather than a code change — see the next section.
- The fix requires architectural judgment (e.g. "this should be async",
  "this needs a new field").

When unsure, **defer with a reason** rather than guess. The user can
sweep the `[D]` items afterwards.

## Handling LSP false positives

LSP servers are strict in places where a language or framework is
permissive. Common patterns across languages:

- **Dynamic dispatch / magic methods** — `__call`, `__getattr__`,
  `method_missing`, proxy objects, ORMs that synthesize methods. The
  LSP can't see these; don't "fix" them by adding stubs.
- **Generated code** — protobuf, GraphQL, ORM models. If the generator
  is up to date and the error is in the consumer, the issue is usually
  a stale generated file, not the consumer.
- **Reflection / runtime injection** — DI containers, decorators,
  metaprogramming. Add type annotations or `@type`/`@property` style
  hints rather than rewriting the runtime behavior.
- **Pass-by-reference / out-parameters** — when the LSP can't follow
  dynamic dispatch, explicitly initialize the output to a typed default
  before the call.
- **Framework-specific patterns** — load the relevant project skill (if
  any) before deciding a diagnostic is a false positive. The project's
  own docs usually call out the patterns the LSP can't model.

When a finding is a confirmed false positive: prefer an in-code
annotation that suppresses it locally (e.g. `@phpstan-ignore`,
`// eslint-disable-next-line`, `# type: ignore`, `// @ts-expect-error`)
over a `.cclsp` global suppression — annotations stay close to the
code they describe and don't hide future regressions elsewhere.

## Resumability

The checklist file is the single source of truth for in-flight state:

- Always update the checklist before moving on to the next chunk.
- Never delete findings — flip the checkbox.
- If you discover a new chunk is needed mid-run, add it under a
  `## Discovered chunks` heading at the bottom and process it like any
  other.
- On resumption: read the checklist, skim for any `[~]` chunks first,
  then resume from the next `[ ]`.

## Pre-flight (every resumption)

1. `git status` — confirm the working tree is in the expected state. If
   unrelated changes are staged, stop and ask the user.
2. Probe CCLSP with one already-clean file to confirm the server is
   responsive before kicking off a 120 s scan.
3. Skim the checklist's `Findings` sections — if any chunk is `[~]`,
   resume that one first.

## Performance notes

- LSP servers are slow until warm. First scans on cold cache can hit the
  time budget even for small chunks. Subsequent scans on the same areas
  finish much faster — large chunks (~1000 files) often complete in
  under 10 s once the LSP has indexed.
- Scans are idempotent. Running them in parallel is safe and
  recommended: fire 3–5 chunks at once with one tool-call message.
- `restart_server` clears the in-memory cache but does NOT lose the
  on-disk index for servers that persist one, so restarts are cheap.
  Restart after **every** edit before re-verifying — otherwise the LSP
  may return stale diagnostics.
- Large globs (e.g. `**/*.ts`) hit the file cap and need splitting.
- Some LSP servers (TypeScript, Rust-analyzer, gopls) benefit from
  letting the project's own build system warm up first (`tsc --noEmit`,
  `cargo check`, `go build ./...`) before the first scan — this
  pre-populates caches and dependency resolution.
