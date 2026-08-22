---
allowed-tools: Read, Write, Glob, Grep, Agent, Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr edit:*), Bash(gh api:*), Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*), Bash(glab mr list:*), Bash(glab mr update:*), Bash(glab api:*), Bash(git *), Bash(jq:*), Bash(curl:*), Bash(which *), Bash(mkdir *), Bash(cp *), Bash(wc *), Bash(bun *), Bash(occtl *), Bash(botctl *), Bash(claude *), Bash(grok *), Bash(codex *), Bash(agentsview *), Bash(timeout *), mcp__github_inline_comment__create_inline_comment
description: Multi-model, repository-aware bug review with focused discovery, evidence validation, and convergence rounds
argument-hint: "[PR/MR number, URL, or git description] [agents] [--roles=csv] [--re-review] [--max-rounds=N] [--no-post] [--no-summary]"
---

# Ultra Code Review

Multi-model bug review. Discovery is recall-oriented; an independent evidence pass protects publication precision. **Parent is a thin control plane** — disk under `.tmp/ultra-<id>/` is durable memory.

Default lenses: `state`, `contracts`, `failure`, `craft`, `merits` (+ whole-change `integration`). More expensive than `/colin-review`.

## Token discipline (hard)

1. **Do not invent** `launch-*.ts` / `harvest.ts` / `batch.ts` under the run dir. Use bundled drivers.
2. **Never paste** full participant `.out` bodies into chat. Harvest via `mbot-run` / `jq` / `rg '^VERDICT:'`.
3. Role prose lives in files participants read — not in parent chat. See MBOT `roles/`.
4. Load platform CLI skills only for mutations (inline comments, labels). Prefer gather scripts for reads.

## Drivers (use these)

Resolve `CLAUDE_SKILL_DIR` to the installed skill roots (`~/.claude/skills/...` or `~/.agents/skills/...`).

| Step | Command |
|---|---|
| GitLab MR gather | `bun …/glab-cli/mr-context.ts --project G/R --mr N --out-dir .tmp/ultra-N/mr-context` |
| GitHub PR gather | `bun …/gh-cli/pr-context.ts --repo O/R --pr N --out-dir .tmp/ultra-N/pr-context` |
| Init run | `bun …/many-brain-one-task/mbot-run.ts init --run-dir .tmp/ultra-N` |
| Assemble prompts | `bun …/many-brain-one-task/assemble-prompts.ts --append context/bucket.md --out-dir prompts role.md:slot.full.md …` |
| OpenCode smoke | `bun …/mbot-run.ts smoke --run-dir .tmp/ultra-N --attach http://seamus:4095 --model openai/gpt-5.6-sol` (launch also smokes) |
| Launch batch | `bun …/mbot-run.ts launch --plan .tmp/ultra-N/plan.json` (Claude Code). **OpenCode host:** add `--detach`, then barrier. Further phase plans (`plan-integration.json`) merge into `plan.json`; they do not replace it. |
| Fail-closed wait | `bun …/mbot-run.ts barrier --run-dir .tmp/ultra-N` — **never** `sleep N`, **never** `until test -s empty.out` |
| Harvest | `bun …/mbot-run.ts harvest --run-dir .tmp/ultra-N` |
| Candidate index | `bun …/mbot-run.ts candidates --run-dir .tmp/ultra-N` — writes `candidates.json` + `candidate-index.md`. Do not invent `extract-issues.ts`. |
| Usage (wall + cost) | `bun …/mbot-run.ts usage --run-dir .tmp/ultra-N` (optional `--title-prefix` / `--include-claude-children` / `--parent-session-id`) |

OpenCode hard rules: all flags **before** `--`; use `mbot-run` (not hand-rolled occtl); empty `.out` after failed meta is **terminal failure**, not a hang. OpenCode host **must** `launch --detach` — a 120s bash timeout on a blocking launch SIGTERMs the process group and kills occtl children. Claude Code: blocking launch + Bash `timeout: 1320000`. GPT slots default `variant: high` and `agent: colin-mbot-gpt`. Prompt/out paths may be `prompts/x.md` **or** `.tmp/ultra-N/prompts/x.md`; mbot-run de-duplicates — do not join `run_dir` onto an already-prefixed path yourself.

Load **many-brain-one-task** for plan schema, delivery contracts, profiles. Role templates: `many-brain-one-task/roles/{state,contracts,failure,craft,merits,integration}.md`.

## Input resolution

No args → open PR/MR for current branch via origin host.  
URL / numeric id / `last N commits` / `branch NAME` / `SHA..SHA` / other git rev as in the table:

| Pattern | Mode |
|---|---|
| `github.com/.../pull/123` | GitHub PR |
| `gitlab…/merge_requests/123` | GitLab MR |
| Numeric only | Platform from origin |
| `last N commits` / `whole repo` / `branch NAME` / revspec | Git diff (always `--no-post`) |

## Review agents (MBOT)

Task type `code-review`. Profile: user `--profile X`, else `code-review.md`; Seamus hosts prefer `seamus-bot-ultra-review`. Do **not** add experimental models or raise effort to max/xhigh unless asked. Default OpenCode effort **high**. Claude discovery/validation/integration children: effort **high**. Parent stays host default.

### Allocation

- `state` / `contracts` / `failure`: full participants × each bucket  
- `craft`: one participant (Grok slot; else Claude/Opus slot, else profile backup) per bucket — Grok carries the fewest discovery threads in the default lineup and is fast enough that the extra per-bucket thread does not extend wall-clock  
- `merits`: full participants, **once**, whole-change (no prior review comments in input)  
- `integration`: full participants, whole-change  
- Thread budget: `((3 × participants) + 1) × buckets` + merits fan-out + integration fan-out  

A `failure` thread with no scale/cost assessment is incomplete — one retry under MBOT policy.

### plan.json slots

Harness-owned rows: `harness: "opencode"|"occtl"|"grok"`. Native Agent rows: `harness: "external"` (you launch Agent; mbot-run harvest still scores `.out`). Prefer slot-keyed paths `results/<slot>.out` + `*.meta.json` with `planned_model` / `actual_model`.

Seamus OpenCode titles:

```text
ultra|{gitlabProjectPath}|!{mrIid}|{bucketOr-}|{role}|{modelShort}|retry{N}
```

## Role selection

Default all five: `state`, `contracts`, `failure`, `craft`, `merits`.  
Skip only when genuinely N/A (prose-only → skip state; no interface change → skip contracts; etc.). Record skip reasons.  
`--roles=csv` exact subset. `integration` is not selectable (always the whole-change pass).

**Role definitions for participants** — attach from disk, do not inline:

- `roles/state.md` — lifecycle / data / backfill windows  
- `roles/contracts.md` — callers, schema, deploy compatibility  
- `roles/failure.md` — adversarial + **scale/cost** (both required)  
- `roles/craft.md` — dead code, duplication, false comments, coverage  
- `roles/merits.md` — design worth; verdict vocabulary: `sound` \| `sound with reservations` \| `questionable` \| `should not land as designed`  
- `roles/integration.md` — cross-bucket E2E  

## Re-review and convergence

`--max-rounds=N` default `3`. Clean round = that round produced **no new confirmed** issues after validation.

- Round 1: role × bucket grid + merits + integration  
- Later rounds: **integration-only** unless new subsystem enters scope  
- Do **not** skip rounds 2–N because HEAD was unchanged — the SHA publication gate is a separate check at the end of a round, not a substitute for convergence. Stop when a later round adds no new confirmed issue, or the cap is hit.
- `--re-review`: delta-first (`last-reviewed-sha...head` from latest `**AI Ultra Review**` header) + one full-state integration; `--full` forces full grid  

## Process

### 1. Pre-flight

Gather via **mr-context** / **pr-context** (not five serial glab/gh calls). Require base+head SHAs present locally (`git cat-file -e <sha>^{commit}`). **Do not `git fetch`.** If a SHA is missing, stop and tell the user. Stop if closed/merged/draft/trivial/already ultra-reviewed (unless `--re-review`). Git-diff mode skips pre-flight.

### 2–3. Change index + buckets

```bash
git diff --stat <base>...<head>
git diff --name-status <base>...<head>
git log --format='%H %s' <base>..<head>
```

Primary vs context-only artifacts. Bucket by behavior (~800–1500 changed lines), not only top-level dirs. Embed bucket diff only if ≤1200 lines **and** ≤100KB; else index + tool-driven inspection.

### 4. Report triage

```text
Triage: <N primary>, <M context-only>, <L> lines
Roles / Skipped / Buckets / Rounds / Allocation / Thread budget
```

### 5. Context pack

Write under `context/`: instruction files, PR/MR description, prior ultra findings (not for merits), callers/schemas/tests. Merits context file **omits** prior review comments.

### 6. Discovery

For each bucket × role, prompts = role file + bucket index (assemble-prompts). Discovery contract:

> Scope is behavior introduced/changed by this diff. Inspect unchanged callers/callees/schemas/migrations/tests when needed. Optimize for candidate recall. Each candidate: agent, role, file+anchor, severity, confidence, invariant, path+trigger, harm, evidence, fix.

Launch harness slots with `mbot-run launch`. Launch external Agent slots in parallel with Write-to-path + ≤500-char return.

### 7. Integration

Whole-change `roles/integration.md` + candidate index paths (not embedded blobs). Fresh sessions each convergence round.

### 8. Validate + dedupe

Build the candidate index with `mbot-run candidates` (not an ad-hoc `extract-issues.ts`). Independent validator (prefer a different model than the raiser). Status exactly one of: `confirmed` | `rejected` | `unresolved`.  
Never reject for single-model or lack of consensus. Do not invent a clustering/dual-validator pipeline unless the user asks — one validator pass is the default. Slot-keyed validator outs; rewrite paths on backup.

**Pre-publication gate** (after dedupe, before summary):

1. Re-fetch head SHA; drop/fix findings if head moved  
2. Dedup peer `**AI Ultra Review**` threads by **root cause**, any resolution state  
3. Report: `Gate: <N> commits landed · <A> confirmed · <B> fixed · <C> withdrawn · <D> suppressed · <E> posted`

### 9. Summary artifacts

Skip if `--no-summary`. Before declaring complete, write both artifacts under the run dir and make them agree with `results/*.out` + `*.meta.json`:

1. `prepared-summary.md` — full summary body (every comparison/severity table + Merits / Rejected / Open questions / Gate). In `--no-post`, display this body; do not replace it with a narrative-only recap.
2. `run-summary.json` — machine-readable accounting (see fields below).

Recompute every tally from disk (`rg '^VERDICT:'` / task markers + `meta.actual_model`). Never trust hand-carried chat tallies. Attribute via `meta.actual_model` (planned→actual reassignments are scored to the actual performer).

#### Required comparison tables (verbatim section titles)

**## Model comparison** (per `actual_model` / display name; one row per participant):

| Column | Definition |
|---|---|
| Candidates | Distinct candidates emitted |
| Confirmed | Candidates confirmed by validation |
| Rejected | Candidates disproved |
| Unresolved | Candidates lacking enough evidence |
| Unique confirmed | Confirmed issues found only by this agent |
| Shared confirmed | Confirmed issues also found by another agent |
| Precision | `confirmed / (confirmed + rejected)`, or `—` when denominator is 0 |
| Wall time | Sum of slot durations for this agent (`ended_at − started_at` from meta; see wall-time rules) |
| Cost | Sum of agentsview session costs for this agent’s slots (USD); `—` when unavailable |
| Peak ctx (max / avg) | Max and mean `peak_context_tokens` across that agent’s matched sessions (from agentsview) |
| Compactions | Sum of `compaction_count` (and note mid-task if non-zero) across matched sessions |

Also include **## Role comparison** (candidates / confirmed / rejected / unresolved / unique-to-role) and **## Per-round** (new candidates / new confirmed / rejected / unresolved). Add **Posted findings by severity** when posting.

Publication headings (verbatim, no numeric prefixes; merits verdict on the `## Merits — …` line):

```text
## Merits — <verdict>
## Rejected on validation — recorded so they are not re-raised
## Open questions
```

Merits: ≤3 items, one paragraph each; on split verdicts use the least favourable and report the split. Rejected register: ≤12 rows, only re-raise-worthy claims with concrete refutation; call out invented symbols/lines. Open questions: one line per unresolved candidate that needs a missing instrument.

#### Wall time

- Prefer `meta.started_at` / `meta.ended_at` (or `completed_at`) per slot. Duration = end − start.
- If meta lacks times, use agentsview `started_at` / `ended_at` for the matched session.
- Report **per-agent wall** (sum of that agent’s slot durations — concurrent slots sum; this is agent-minutes, not calendar span) and **run wall** (calendar: earliest slot start → latest slot end).
- Also note threads that hit the profile wall-clock / exit 124 separately (timeouts ≠ wall column).

#### Cost + wall via agentsview (required when the CLI is available)

Do **not** hand-roll jq loops or trust OpenCode UI `$0.0000` session.cost. Use the bundled helper (meta + `.session` sidecars + title rediscovery + optional Claude children):

```bash
bun …/many-brain-one-task/mbot-run.ts usage --run-dir .tmp/ultra-N
# optional: --title-prefix 'ultra|shipstream/server|!2783' --since 14d --include-claude-children
# writes .tmp/ultra-N/agentsview-usage.json and prints the same JSON on stdout
```

The helper resolves session ids from `results/*.meta.json` / `*.out.session`, normalizes `ses_…` → `opencode:ses_…`, calls `agentsview session usage` + `session get`, rediscovers OpenCode sessions whose `first_message` starts with the structured title prefix, and rolls up per-slot / per-model **wall, cost, peak context, and compactions**. Fold `totals` and `by_model` into `run-summary.json` (`cost.*`, `wall.*`, `peak_context_*`, `compaction_*`). Mark unmatched slots explicitly rather than inventing zeros. If agentsview is missing, pass `--no-agentsview` (wall from meta only) or accept `cost_source: unavailable` — do not block publication solely on cost.

Context signals (from agentsview when matched) — **always separate parent vs slice** (same model family can be both the orchestrator and a participant):

- `by_role.parent` — orchestrator session(s): peak context + compaction counts answer “did the parent drown in context?”
- `by_role.slice` — participant threads only: peak min/avg/max answer “are slices too big or too small?”
- `by_model_slices` — per-model rollup with parents excluded (so Opus parent does not inflate Opus slice peaks)
- `parents[]` / `slices[]` — raw rows

Call out under run accounting:

1. **Parent:** if `compaction_count`/`mid_task_compaction_count` > 0 or peak ≥ ~200k — control plane is context-stressed; trust disk artifacts over chat memory.  
2. **Slices:** peak max ≥ ~250k → packs too large; peak avg < ~40k and max < ~60k → possibly under-fed; mid-range → size OK.

#### Run accounting (in prepared-summary + run-summary.json)

- Resolved model IDs, providers, harnesses, reasoning variants (planned → actual when reassigned)
- Threads: planned primary slots / completed / retried / timed out (exit 124) / never started / backups used
- Wall: run calendar span + per-agent agent-minutes
- Cost: total USD + per-model + session match rate (agentsview)
- Peak context: run max/avg + per-model max/avg; flag models that compacted mid-task
- Compactions: total + mid-task counts per model (from agentsview `session get`)
- Distinct `--out` paths and any clobber/recovery/remap events

`run-summary.json` must also record: `buckets`, `participants`, `bucket_slots = buckets × ((3 × participants) + 1)`, `merits_slots`, `integration_slots`, `planned_primary_slots`, with retries/timeouts/incomplete/auxiliary slots counted separately so they do not inflate the planned primary total.

**Scoring hygiene:** exit 124 with a complete `.out` = completed; re-stat before marking incomplete; retry + original both score if both rich; self-duplicates of an already-posted finding affect thread counts only, not Unique/Shared.

When posting the summary comment, include the Model comparison table (with wall + cost columns) and a short run-accounting note under it — not a prose-only recap.

### 10. Post or display

Git-diff / `--no-post`: display only.  
No confirmed: single summary comment with `**AI Ultra Review**` header.  
Issues: one inline per unique issue; severity order critical→low; cap **8 low** posted.  

Header on every inline:

```text
> **AI Ultra Review** · Commit: <sha> · Severity: <…> · Role: <…> · Flagged by: <…>
```

Severities: `critical` | `high` | `medium` | `low`. Merits has no severity / no inline.  
Suggestion blocks: follow platform skill line-range rules (GitLab multi-line needs `suggestion:-N+M`).  
GitHub inline: MCP tool preferred; else gh-cli. GitLab: glab discussions API + DiffNote check.

### 11. Label

Apply `:Reviewed-By-AI-Ultra` after post (not in git-diff / cancel).

## Notes

- Dependencies: `gh` or `glab`, `jq`, `git`, `bun`; optional `agentsview` for per-session cost/wall (preferred when present)
- Create a todo list before starting  
- Ultra and `/colin-review` are independent comment streams  
- Benchmark with pinned base/head snapshots; never claim improvement from unvalidated finding count alone  
- Structured OpenCode `--title` (`ultra|…`) is required so agentsview can re-find sessions when meta.session_id is missing  

