---
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr edit:*), Bash(gh api:*), Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*), Bash(glab mr list:*), Bash(glab mr update:*), Bash(glab api:*), Bash(git *), Bash(jq:*), Bash(curl:*), Bash(which opencode:*), Bash(ls:*), mcp__github_inline_comment__create_inline_comment
description: Multi-role ultra code review — N models × 3 focused roles (bugs / runtime / craft) per PR/MR or diff
argument-hint: "[PR/MR number, URL, or git description] [agents] [--roles=csv] [--re-review] [--no-post] [--no-summary]"
---

# Ultra Code Review

Review a GitHub pull request, GitLab merge request, or arbitrary git diff using **multiple models × three focused roles**. Each role is a consolidated reviewer persona — `bugs` (correctness + security), `runtime` (performance + deps + deploy safety), and `craft` (quality + simplification + tests). All three roles run by default; each role runs against every model. All findings are merged and deduplicated at the end.

This is the "ultra" variant of `/colin:review`. It is expected to be more expensive than regular review — budget accordingly.

For GitHub reviews, load the `gh-cli` skill after resolving the platform. For GitLab reviews, load the `glab-cli` skill. Use those skills for PR/MR resolution, API fallbacks, inline comment posting, labels, and platform-specific link details.

## Input Resolution

If no argument is provided:
1. Check `git remote get-url origin`
2. If it points to GitHub, resolve the open PR for the current branch
3. If it points to GitLab, resolve the open MR for the current branch
4. Otherwise stop and ask what should be reviewed and where results should go

If an argument is provided, resolve it as follows:

| Pattern | Mode | Resolution |
|---|---|---|
| `github.com/.../pull/123` | GitHub PR | Extract PR number |
| `gitlab.*/.../merge_requests/123` | GitLab MR | Extract MR IID |
| `https://github.com/OWNER/REPO` | GitHub PR | Resolve PR from current branch |
| Numeric only | Platform from origin | Use as PR/MR ID |
| `last N commits` | Git diff | `git diff HEAD~N..HEAD` |
| `whole repo` or `entire codebase` | Git diff | Review all tracked files |
| `branch NAME` | Git diff | `git diff main...NAME` or default branch |
| `SHA..SHA` or `SHA...SHA` | Git diff | Use directly |
| Any other text | Git diff | Interpret as git rev spec |

Resolve current-branch reviews using the appropriate platform CLI skill.

## Review Agents

Use the **Many Brain One Task (MBOT)** skill with task type `code-review`.

- If the user names models, pass them through
- Otherwise use MBOT defaults
- Use MBOT display names in summaries and posted comments

## Role Library

Three consolidated reviewer personas. Each role bundles related concerns so that three parallel role passes cover the full space of what a good code review checks. All roles review ONLY the changed code (not the full codebase) and follow the same "high-signal only" bar as regular `/colin:review`.

### `bugs` — correctness + security

What will break at runtime, including under adversarial input. Security is treated as correctness-under-attack, not a separate axis.

- Runtime bugs: off-by-one, null/undefined handling, race conditions, incorrect control flow, misuse of APIs, wrong types, broken invariants, unhandled edge cases
- Security: injection risks (SQL, command, template, prototype pollution), auth/authz gaps, missing validation on untrusted input, secrets in code, unsafe deserialization, XSS/SSRF/CSRF, permissive CORS, errors that leak internals

### `runtime` — performance + dependencies + deployment safety

What will hurt the system in production beyond pure correctness.

- Performance: N+1 queries, blocking I/O on hot paths, unbounded loops over user input, O(n²) over growable collections, missing indexes, memory leaks, unnecessary allocations in hot loops, missing caching for expensive repeat calls
- Dependencies: new deps (justification, maintenance, license), version bumps with breaking changes
- Deployment / migration safety: lockstep-deploy hazards, rollback path, data compatibility, observability gaps for new code paths

### `craft` — quality + simplification + test quality

Is this code maintainable and is it verifying the right things?

- Quality: complexity, duplication, dead code, adherence to `AGENTS.md` and surrounding conventions
- Simplification: premature abstraction, speculative generality, over-engineered configuration, changes that bundle unrelated work, refactors that expand scope beyond their stated goal
- Test quality: coverage ROI for changed behavior, tests asserting implementation instead of behavior, flakiness risks (timing, ordering, shared state), missing failure-path tests, mocks that diverge from real behavior

## Role Selection

Default behavior: run **all three roles** (`bugs`, `runtime`, `craft`). Three roles × N agents = the full ultra-review matrix.

Skip a role only if the diff genuinely has zero signal for it. This is a narrow escape hatch — prefer running all three unless confident:

- Skip `runtime` only for pure docs/comment/test-fixture diffs with no production code changes
- Skip `craft` only for purely generated or machine-authored changes (e.g. schema regen)
- `bugs` always runs — every code change can introduce a bug

When skipping a role, record the reason in the triage output.

If `--roles=<csv>` is provided, use exactly those roles from `{bugs, runtime, craft}`. Error on unknown names.

## Re-review Mode

If `--re-review` is active, review only the new changes since the last ultra-review.

- Skip the normal "already commented" stop condition
- Gather prior review comments and extract the last reviewed commit SHA from the most recent **`**AI Ultra Review**`** header (format: `· Commit: <sha>`). Do NOT parse `**AI Code Review**` headers — ultra-review keeps its own history independent from `/colin:review`.
- If no prior ultra-review header with a SHA is found, fall back to the earliest reviewed version/SHA available from the platform
- Compute the incremental diff between the last reviewed SHA and the current HEAD of the PR/MR branch
- Re-run role selection against the incremental diff (roles may differ from the first ultra-review)
- Give agents the incremental diff as primary input, and the full diff as background only
- Do not re-flag issues already covered by prior comments unless they remain unresolved and are still relevant
- If no new issues are found, use a re-review summary comment that says no new issues were found in the latest changes

## Process

### Step 1: Pre-flight Checks

For PR/MR reviews, fetch state, draft status, title, author, and the latest commit SHA on the PR/MR branch using the loaded platform CLI skill. Record the SHA — it must be included in every `**AI Ultra Review**` header posted during this run so later re-reviews can diff against it.

Stop if:
- The PR/MR is closed or merged
- The PR/MR is draft/WIP
- The change clearly does not need code review, such as trivial automation
- You have already posted an ultra-review on it (check for any `**AI Ultra Review**` header), unless `--re-review` is active

For git diff mode, skip pre-flight entirely.

### Step 2: Triage and Filter

Fetch the file list and diff, then exclude review noise before running agents.

Exclude:
- Generated files
- Vendored or dependency directories: `vendor/`, `node_modules/`, `.yarn/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.venv/`, `third_party/`
- Lock files and built artifacts: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `*.min.css`, `*.map`
- Any single-file diff larger than `5000` lines

### Step 3: Role Selection

Apply the [Role Selection](#role-selection) rules to the filtered diff. Record:
- Which roles are running (default: all three)
- Any role skipped and a one-line reason
- Whether role set came from `--roles` or default

### Step 4: Report Triage and Roles

```text
Triage: <N> files, <M> excluded (<reasons>), reviewing <N-M> files (<L> diff lines)
Roles: <csv of running roles> (default | from --roles)
Skipped: <role: reason> (omit when no role skipped)
```

### Step 5: Gather Context

Launch context gathering in parallel:
1. Find all relevant `AGENTS.md` files:
   - The repo-root `AGENTS.md`, if present
   - Any `AGENTS.md` in directories containing reviewed files or their parents
2. Summarize the diff/PR/MR
3. If `--re-review`, gather prior comments and the incremental diff
4. Gather external context from URLs in the title, description, or linked tasks/issues when the matching MCP is available

Supported external context:
- `clickup.com/t/<task_id>` via `mcp__clickup__*`
- `app.intercom.com/*/conversation/<id>` via `mcp__Intercom__get_conversation`
- `*.sentry.io/issues/<issue_id>` via `mcp__Sentry__get_issue_details`

Pass external summaries to review agents, but do not post them as comments.

### Step 6: Review the Changes (N × 3 threads)

For each running role (`bugs`, `runtime`, `craft` unless one was skipped), invoke MBOT **once** with the role-specific focus prompt. Launch all per-role MBOT invocations **in parallel** — they are independent.

Each per-role MBOT invocation runs the full agent list (e.g. 3 agents), so total threads = `agents × 3` by default (e.g. 9 threads for the standard 3-agent MBOT config).

Give each agent in each role:
- The filtered diff
- Relevant `AGENTS.md` context
- Any external context
- The role's focus prompt from the [Role Library](#role-library) as the primary directive
- Instruction: "Tag each issue with both your agent name AND the role name (e.g. `agent=Opus 4.6, role=security`)"
- In re-review mode: prior comments plus incremental diff as primary context

Review focus across all roles:
- Only the changed code (not unrelated files)
- `AGENTS.md` compliance for applicable paths only

Only flag high-signal issues:
- Objective runtime bugs or regressions
- Clear security issues
- Exact `AGENTS.md` violations you can quote directly
- Role-specific issues with concrete, demonstrable impact

Do not flag:
- Style preferences or subjective suggestions
- Hypothetical issues without strong evidence
- Anything that depends on interpretation or guesswork

If confidence is low, do not flag the issue.

### Step 7: Validate and Deduplicate

For each issue across **all (agent × role) threads**, run a validation agent and keep only issues confirmed with high confidence.

- Merge duplicate issues across agents AND across roles (same file:line and same root cause = one issue)
- Preserve every (agent, role) attribution on merged issues
- Keep full per-(agent, role) validation results for the summary unless `--no-summary` is active

### Step 8: Model & Role Comparison Summary

Skip this step if `--no-summary` is active.

Produce **two** tables.

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

Use MBOT display names. Report best and worst agent by composite score. If no agent found any issue, state that there was no differentiation in this review.

**Per-role table** (aggregated across all agents for each role):

| Metric | Definition |
|---|---|
| Found | Total issues flagged under this role across all agents |
| Validated | Issues surviving validation |
| Unique-to-role | Validated issues flagged only under this role (no other role caught them) |
| Accuracy | `validated / found`, or `—` when `found = 0` |

Report which roles produced the most validated signal. Flag any role that produced zero validated issues — useful signal for whether it was worth running on this diff.

### Step 9: Post or Display Results

#### Git Diff Mode

Always behave as if `--no-post` is active.

- Display each issue with file, line or range, agent + role attribution, and full comment body
- Do not post anywhere
- Do not apply labels

#### `--no-post` Mode

Display the prepared comments and stop for user instructions.

Supported follow-ups:
- `post`
- `drop issue 3`
- `edit issue 2 to say ...`
- `cancel`

#### No Issues Found

Post a single summary comment:

```text
> **AI Ultra Review** · Commit: <sha> · Roles: <csv> · Models: <csv>

No issues found. Checked for bugs and AGENTS.md compliance across <N> role(s): <csv>.
```

In re-review mode, say `No new issues found in the latest changes.` instead. Keep the `Commit: <sha>` segment in the header so the next re-review can diff from this point.

#### Issues Found

Post one inline comment per unique issue using the loaded platform CLI skill.

- GitHub: prefer `mcp__github_inline_comment__create_inline_comment`; otherwise follow `gh-cli` for `gh api` inline comment posting
- GitLab: follow `glab-cli` for discussions API posting, MR version SHAs, and `"type": "DiffNote"` verification

Comment rules:
- Every inline comment starts with:

```text
> **AI Ultra Review** · Commit: <sha> · Role: <role(s)> · Flagged by: <agent-name(s)>

<issue description>
```

- `<sha>` is the full PR/MR head commit SHA captured in Step 1. Use the same SHA for every comment posted in this run, including the summary comment.
- `<role(s)>` is the comma-separated list of roles under which this issue was flagged (e.g. `security, correctness` when the same issue surfaced under two roles).
- `<agent-name(s)>` lists every agent that flagged this issue (deduplicated across roles).

- Use exactly one comment per unique issue
- Include links or citations when referring to source material such as `AGENTS.md`
- For self-contained fixes of up to 5 lines, include a committable suggestion block
- If the fix is not self-contained, describe it and include a copyable prompt instead of a suggestion block

Unless `--no-summary` is active, post the model & role comparison summary as a single additional comment after all inline comments. The summary comment header uses:

```text
> **AI Ultra Review** · Commit: <sha> · Roles: <csv> · Models: <csv>
```

### Step 10: Apply Review Label

Skip this step in git diff mode.

After comments are posted, or after the user confirms posting from `--no-post` mode, apply the `:Reviewed-By-AI-Ultra` label (distinct from the `:Reviewed-By-AI` label used by `/colin:review`).

Use the loaded platform CLI skill for the exact label command.

If the user cancels in `--no-post` mode, do not apply the label.

## Notes

- Dependencies: `gh`, `glab`, `jq`, `git`
- Create a todo list before starting
- When linking to code, use the canonical URL and line-range rules from the loaded platform CLI skill
- Ultra-review and `/colin:review` maintain independent comment histories on the same PR/MR — running both is supported and produces two distinct comment streams
