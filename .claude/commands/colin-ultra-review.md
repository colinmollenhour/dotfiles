---
allowed-tools: Read, Write, Glob, Grep, Agent, Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr edit:*), Bash(gh api:*), Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*), Bash(glab mr list:*), Bash(glab mr update:*), Bash(glab api:*), Bash(git *), Bash(jq:*), Bash(curl:*), Bash(which *), Bash(mkdir *), Bash(cp *), Bash(wc *), Bash(bun *), Bash(occtl *), Bash(botctl *), Bash(claude *), Bash(grok *), Bash(codex *), mcp__github_inline_comment__create_inline_comment
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
| Launch batch | `bun …/many-brain-one-task/mbot-run.ts launch --plan .tmp/ultra-N/plan.json` (`concurrency` default 3 on attach) |
| Fail-closed wait | `bun …/mbot-run.ts barrier --run-dir .tmp/ultra-N` — **never** `until test -s empty.out` |
| Harvest | `bun …/many-brain-one-task/mbot-run.ts harvest --run-dir .tmp/ultra-N` |

OpenCode hard rules: all flags **before** `--`; use `mbot-run` (not hand-rolled occtl); empty `.out` after failed meta is **terminal failure**, not a hang.

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
- `craft`: one participant (Claude/Opus slot; else profile backup) per bucket  
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

`--max-rounds=N` default `3`. Clean round = no **new confirmed** issue after validation.

- Round 1: role × bucket grid + merits + integration  
- Later rounds: **integration-only** unless new subsystem enters scope  
- `--re-review`: delta-first (`last-reviewed-sha...head` from latest `**AI Ultra Review**` header) + one full-state integration; `--full` forces full grid  

## Process

### 1. Pre-flight

Gather via **mr-context** / **pr-context** (not five serial glab/gh calls). Require base+head SHAs present locally (`git cat-file -e <sha>^{commit}`); do not auto-fetch. Stop if closed/merged/draft/trivial/already ultra-reviewed (unless `--re-review`). Git-diff mode skips pre-flight.

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

Independent validator (prefer different model). Status exactly one of: `confirmed` | `rejected` | `unresolved`.  
Never reject for single-model or lack of consensus. Slot-keyed validator outs; rewrite paths on backup.

**Pre-publication gate** (after dedupe, before summary):

1. Re-fetch head SHA; drop/fix findings if head moved  
2. Dedup peer `**AI Ultra Review**` threads by **root cause**, any resolution state  
3. Report: `Gate: <N> commits landed · <A> confirmed · <B> fixed · <C> withdrawn · <D> suppressed · <E> posted`

### 9. Summary artifacts

Write `prepared-summary.md` + `run-summary.json` under the run dir before declaring complete. Recompute tables from `results/*.out` + `meta.actual_model`. Include per-agent / per-role / per-round tables, merits heading, rejected register (≤12), open questions, run accounting. Skip if `--no-summary`.

Publication headings (verbatim):

```text
## Merits — <verdict>
## Rejected on validation — recorded so they are not re-raised
## Open questions
```

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

- Dependencies: `gh` or `glab`, `jq`, `git`, `bun`  
- Create a todo list before starting  
- Ultra and `/colin-review` are independent comment streams  
- Benchmark with pinned base/head snapshots; never claim improvement from unvalidated finding count alone  
