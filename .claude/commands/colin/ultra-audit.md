---
allowed-tools: Bash(ls:*), Bash(cat:*), Bash(find:*), Bash(wc:*), Bash(git *), Bash(rg:*), Bash(grep:*), Bash(jq:*), Read
description: Multi-role ultra production-readiness audit — N models × 3 focused roles (hardening / operability / stewardship) on the current repo state
argument-hint: "[scope: path | 'whole repo' (default)] [agents] [--roles=csv] [--save <path>] [--no-summary]"
---

# Ultra Production-Readiness Audit

Audit the **current state** of the project for production readiness using **multiple models × three focused roles**. Each role is a consolidated reviewer persona — `hardening` (security + resiliency), `operability` (observability + deployment + config + performance + dependencies), and `stewardship` (docs + tests + code quality). All three roles run by default; each role runs against every model. All findings are merged, deduplicated, and presented grouped by **severity**.

This is the audit counterpart to `/colin:ultra-review`. Where ultra-review scrutinizes a *diff*, ultra-audit scrutinizes the *repo as it stands*. It is expected to be expensive — budget accordingly.

Unlike `/colin:critique` and `/colin:ultra-review`, agents in this command **are encouraged to explore the codebase** — read configs, CI files, docs, manifests, dependency files, and source — because the target is the running system, not a localized change.

## Input Resolution

If no argument that looks like a scope is provided, default scope = **whole repo** (all tracked files).

If a scope argument is provided, resolve it as follows:

| Pattern | Mode | Resolution |
|---|---|---|
| `whole repo` or `entire codebase` | Whole repo | All tracked files (`git ls-files`) |
| Existing directory path | Subdir | Limit to files under that path |
| Comma-separated list of paths | Path set | Limit to listed files / dirs |
| Glob (e.g. `services/*/`) | Glob | Expand and limit |

Non-scope arguments (model names, flags) pass through to MBOT or option parsing as in ultra-review.

## Audit Agents

Use the **Many Brain One Task (MBOT)** skill with task type `audit`.

- If the user names models, pass them through
- Otherwise use MBOT defaults
- Use MBOT display names in the summary and report

## Role Library

Three consolidated reviewer personas. Each role bundles related production-readiness concerns so that three parallel role passes cover the full space of what a good pre-prod audit checks. All roles audit the **current state of the in-scope files** (and may explore adjacent files, configs, CI, and docs as needed) and follow the same "high-signal only" bar as ultra-review.

### `hardening` — security + resiliency

What will fail or be exploited in production, including under adversarial input or partial failure.

- Security: secrets in repo or git history, weak/missing auth or authz, missing validation on untrusted input, injection risks (SQL, command, template, prototype pollution), unsafe deserialization, XSS/SSRF/CSRF, permissive CORS, errors that leak internals, dependency CVEs, insecure defaults
- Resiliency: missing or incorrect error handling on failure-prone calls, missing retries / timeouts / circuit breakers on network/IO, unbounded resource use (memory, goroutines, connections, file handles), no graceful shutdown, no idempotency on retried operations, data integrity under partial failure, missing transactions where needed

### `operability` — observability + deployment + config + performance + dependencies

What you need in place to actually run, observe, and evolve this in production.

- Observability: missing structured logging on critical paths, no metrics on request rate / error rate / latency, no tracing across service boundaries, errors swallowed without reporting, missing health/readiness endpoints
- Deployment: unsafe migration patterns, no rollback story, environment-coupled config in code, missing or wrong Dockerfile / Procfile / manifest, init/seed steps that aren't reproducible
- Configuration: missing env var validation at startup, sensible defaults missing or wrong, secrets handled as plain config, configuration drift between environments
- Performance: obvious N+1s, blocking I/O on hot paths, unbounded loops over user-controlled input, O(n²) over growable collections, missing indexes or pagination, missing caching for expensive repeat calls, capacity assumptions that don't hold
- Dependencies: outdated or abandoned packages, license issues, lockfile health, supply chain risk (typosquats, install scripts), unused dependencies bloating attack surface

### `stewardship` — docs + tests + code quality

Can a team operate, maintain, and evolve this safely?

- Documentation: README accuracy vs current behavior, install / build / run / deploy docs missing or wrong, missing operational runbooks (deploy, rollback, on-call, incident), stale architecture docs, undocumented public APIs, missing `AGENTS.md` / `CLAUDE.md` for non-trivial subsystems
- Tests: critical paths without test coverage, missing integration / e2e on user-visible flows, tests asserting implementation instead of behavior, flaky patterns (timing, ordering, shared state), missing failure-path tests, mocks that diverge from real behavior, CI that doesn't actually fail on broken tests
- Code quality: dead code, complexity hotspots, large TODO/FIXME debt, duplicated logic across modules, premature abstractions, adherence to repo `AGENTS.md` and surrounding conventions

## Role Selection

Default behavior: run **all three roles** (`hardening`, `operability`, `stewardship`).

Skip a role only if the in-scope file set genuinely has zero signal for it. This is a narrow escape hatch — prefer running all three unless confident:

- Skip `hardening` only for pure docs-only scopes with no executable code or config
- Skip `operability` only for pure docs/test-only scopes
- Skip `stewardship` only when scope is a single generated artifact

When skipping a role, record the reason in the triage output.

If `--roles=<csv>` is provided, use exactly those roles from `{hardening, operability, stewardship}`. Error on unknown names.

## Process

### Step 1: Resolve Scope and List Files

Resolve the scope per [Input Resolution](#input-resolution). Use `git ls-files` (optionally with a path filter) to enumerate tracked files in scope.

Stop and ask the user if:
- The repo is not a git repo
- The resolved scope is empty
- The resolved scope contains more than ~5000 tracked files (likely a misconfigured scope — confirm before proceeding)

### Step 2: Triage and Filter

**Exclusions.** Remove the following from the in-scope set before bucketing:
- Generated files (e.g. `*.pb.go`, `*_pb2.py`, `*.gen.ts`, OpenAPI-generated clients)
- Vendored or dependency directories: `vendor/`, `node_modules/`, `.yarn/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.venv/`, `third_party/`
- Lock files and built artifacts: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `*.min.css`, `*.map`
- Test fixture data dumps and other large non-code blobs: `*.dump`, `*.ndjson`, `*.parquet`, `*.tar`, `*.tar.gz`, `*.zip`, `*.bin`; any `*.sql` that is clearly a data dump rather than a migration
- Any single file larger than 5000 lines (fallback for anything missed)

**Always include**, even after the above filters:
- `README*`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG*`
- Top-level config: `Dockerfile*`, `docker-compose*.y*ml`, `Procfile`, `Makefile`, `justfile`, `.env.example`, `.envrc.example`
- CI/CD config: `.github/workflows/`, `.gitlab-ci.y*ml`, `.circleci/`, `Jenkinsfile`
- Dependency manifests: `package.json`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `Cargo.toml`, `composer.json`, `Gemfile`
- Infra-as-code: `terraform/**/*.tf`, `*.tf`, `pulumi/**`, `helm/**`, `k8s/**/*.y*ml`

These are first-class audit targets even when they would otherwise be excluded by glob.

### Step 3: Bucketing (Module-Based)

Buckets are **module-based**, not size-based, because the input is the whole repo state rather than a diff.

1. Group all in-scope files by **top-level directory** (first path segment, e.g. `apps/web/`, `packages/core/`, `services/api/`, `infra/`).
2. Files at the repo root form an additional `<root>` bucket containing READMEs, top-level configs, CI files, manifests.
3. If a single top-level group exceeds **2000 files** or **150,000 lines**, subdivide it by second-level directory.
4. If, after subdivision, the total bucket count exceeds **8**, merge the smallest adjacent buckets (alphabetical adjacency within the same parent dir) until ≤ 8 buckets remain. Cap exists to bound cost.
5. Each bucket gets a short label derived from its top-level dir (or `<root>`).

Do **not** read full file contents during bucketing — only file lists and `wc -l` counts.

### Step 4: Report Triage, Roles, and Buckets

```text
Scope: <whole repo | path | path-set>
Triage: <N> files in scope, <M> excluded (<reasons>), auditing <N-M> files (<L> total lines)
Roles: <csv of running roles> (default | from --roles)
Skipped: <role: reason> (omit when no role skipped)
Buckets: <K>
  1. <label> — <file count> files, <line count> lines
  ...
```

### Step 5: Gather Context

Launch context gathering in parallel:
1. Find all `AGENTS.md` and `CLAUDE.md` files in scope and at the repo root
2. Read the repo-root `README*`, `SECURITY.md`, `CONTRIBUTING.md` if present
3. Read top-level dependency manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.)
4. List CI workflow files
5. Capture `git log -1 --format=%H` (current HEAD SHA) and `git rev-parse --abbrev-ref HEAD` (branch) for the report header

This shared context is passed to every role × bucket invocation so agents have a consistent baseline.

### Step 6: Audit (N × R threads per bucket)

Run one **audit pass** per bucket. Bucket passes execute **sequentially** to bound total cost; within a pass, per-role MBOT invocations run in parallel.

For each bucket, for each running role, invoke MBOT **once** with the role-specific focus prompt. Launch all per-role MBOT invocations for that bucket **in parallel** — they are independent.

Each per-role MBOT invocation runs the full agent list (e.g. 3 agents), so threads per bucket = `agents × roles` by default (e.g. 9 threads per bucket for 3 agents × 3 roles).

Give each agent in each role:
- The current bucket's file list with line counts as the primary audit target
- The shared context from Step 5 (root README, AGENTS.md, dep manifests, CI list)
- A one-line summary of the other buckets' labels and line counts so agents know what they are *not* directly responsible for in this pass — but they may still **read** files in other buckets if needed for context (unlike ultra-review, where cross-bucket reads are forbidden)
- The role's focus prompt from the [Role Library](#role-library) as the primary directive
- Instruction: "Tag each issue with both your agent name AND the role name (e.g. `agent=Opus 4.6, role=hardening`). Assign a severity: Blocker / High / Medium / Low (see Severity Rubric)."
- The Severity Rubric (below)

#### Severity Rubric

- **Blocker** — Will cause data loss, security breach, total outage, or legal/compliance violation in a normal production scenario. Must be fixed before production traffic.
- **High** — Will cause user-visible degradation, recoverable incident, or significant operational pain under realistic load or partial failure. Should be fixed before production traffic.
- **Medium** — Will cause maintenance burden, slow incident response, or moderate operational risk. Should be planned for soon after launch.
- **Low** — Polish, minor cleanup, or low-impact hygiene. Nice to fix.

Audit focus across all roles:
- The current state of in-scope files
- `AGENTS.md` / `CLAUDE.md` compliance for applicable paths
- Cross-file context where relevant (configs referencing code, CI workflows referencing scripts, etc.)

Only flag high-signal issues:
- Concrete, reproducible production-readiness gaps with named files / configs / dependencies
- Exact `AGENTS.md` violations you can quote directly
- Role-specific issues with concrete, demonstrable impact in production

Do not flag:
- Style preferences or subjective suggestions
- Hypothetical issues without strong evidence ("if a user did X they could Y" without showing X is reachable)
- Feature requests or scope expansion
- Anything that depends on interpretation or guesswork

If confidence is low, do not flag the issue.

### Step 7: Validate and Deduplicate

For each issue across **all (agent × role × bucket) threads**, run a validation agent and keep only issues confirmed with high confidence.

- Merge duplicate issues across agents, roles, AND buckets (same file:line and same root cause = one issue, OR same systemic gap surfacing in multiple files = one issue with a list of locations)
- Preserve every (agent, role) attribution on merged issues
- The merged issue's severity is the **highest** severity assigned by any flagging agent (escalation, not averaging)
- Keep full per-(agent, role) validation results for the summary unless `--no-summary` is active

### Step 8: Model & Role Comparison Summary

Skip this step if `--no-summary` is active.

Produce **two** tables. Both aggregate across all buckets.

**Per-agent table** (aggregated across all roles for each agent):

| Metric | Definition |
|---|---|
| Found | Total issues flagged by this agent across all its roles |
| Validated | Issues surviving validation |
| False Positives | Found minus Validated |
| Unique Finds | Validated issues found only by this agent (across all roles and across all other agents) |
| Shared Finds | Validated issues also found by at least one other agent |
| Accuracy | `validated / found`, or `—` when `found = 0` |
| Composite Score | `(2 × unique) + shared - (2 × false positives)` |

Use MBOT display names. Report best and worst agent by composite score. If no agent found any issue, state that there was no differentiation in this audit.

**Per-role table** (aggregated across all agents for each role):

| Metric | Definition |
|---|---|
| Found | Total issues flagged under this role across all agents |
| Validated | Issues surviving validation |
| Unique-to-role | Validated issues flagged only under this role (no other role caught them) |
| Accuracy | `validated / found`, or `—` when `found = 0` |

Report which roles produced the most validated signal. Flag any role that produced zero validated issues.

### Step 9: Present the Report

Display the report inline. If `--save <path>` is provided, also write it to that path (create parent dirs as needed). Default behavior is **display only**; nothing is posted to GitHub/GitLab and no labels are applied.

Report format:

```markdown
# Ultra Production-Readiness Audit

- **Scope:** <scope description>
- **Branch / SHA:** <branch> @ <short-sha>
- **Roles:** <csv>
- **Models:** <csv of MBOT display names>
- **Buckets:** <K> (<labels>)
- **Issues:** <total validated> (Blocker: <n>, High: <n>, Medium: <n>, Low: <n>)

---

## Blocker (<count>)

### B1. <title>
- **File(s):** `<path:line>` (and `<path:line>` if multi-location)
- **Role(s):** <csv>
- **Flagged by:** <agent display name(s)>

<description — what is wrong and why it matters in production>

**Recommended fix:** <concrete, actionable next step>

---

### B2. ...

---

## High (<count>)

### H1. ...

---

## Medium (<count>)

### M1. ...

---

## Low (<count>)

### L1. ...

---

<if not --no-summary>
## Model & Role Summary

<per-agent table>

<per-role table>

**Best agent:** <name> — <composite>
**Worst agent:** <name> — <composite>
**Highest-signal role:** <role>
</if>
```

If zero issues are found, present:

```markdown
# Ultra Production-Readiness Audit

- **Scope:** <scope description>
- **Branch / SHA:** <branch> @ <short-sha>
- **Roles:** <csv>
- **Models:** <csv>

No production-readiness issues found across <K> bucket(s) and <R> role(s). The audited scope appears production-ready against the criteria in the [Role Library](#role-library).

<if not --no-summary>
<model & role summary tables>
</if>
```

### Step 10: Offer Next Steps

After presenting the report, ask the user how they want to proceed:

- **"fix blockers"** → Address every Blocker-severity issue
- **"fix issue B1"** (or `H3`, etc.) → Address a specific issue
- **"dismiss issue B1"** → Mark as won't-fix / accepted risk
- **"export"** → Save the report to a path (if `--save` was not used)
- **"done"** → End the audit

## Notes

- This command does **not** modify the codebase unless the user explicitly asks
- The audit is adversarial by design — it looks for production-readiness gaps, not praise
- Issues found by multiple independent models or under multiple roles deserve extra attention
- Severity is the primary lens — a single Blocker matters more than ten Lows
- Dependencies: `git`, `jq`, `rg` (preferred) or `grep`
- Create a todo list before starting

# Command Arguments

----
$ARGUMENTS
----
