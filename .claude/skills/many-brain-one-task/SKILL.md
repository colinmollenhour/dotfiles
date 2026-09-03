---
name: many-brain-one-task
user-invocable: false
description: 'Run the same task with multiple agents for reviews, critiques, or model comparison.'
allowed-tools: Read, Write, Agent, Bash(bun *), Bash(cr *), Bash(pi *), Bash(grok *), Bash(claude *), Bash(codex *), Bash(botctl *), Bash(occtl *), Bash(opencode *), Bash(which *), Bash(mkdir *), Bash(cp *)
---

# Many Brain One Task

Solicit independent opinions from multiple models. **Parent session is a thin control plane** — disk under `.tmp/<run-id>/` is durable memory. Do **not** invent per-run launch/harvest scripts; use the bundled drivers.

Full harness matrices, retry policy, sandbox gotchas, and delivery contracts: [reference.md](reference.md).

## Default flow

1. **Resolve participants** from `--profile X`, task type (`code-review`), or [defaults.md](defaults.md) / [code-review.md](code-review.md). Write `.tmp/<run-id>/participants.json`.
2. **Init run dir**
   ```bash
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" init --run-dir .tmp/<run-id>
   ```
3. **Write prompts** under `prompts/`. For role fan-out use:
   ```bash
   bun "${CLAUDE_SKILL_DIR}/assemble-prompts.ts" \
     --append .tmp/<run-id>/context/bucket-index.md \
     --out-dir .tmp/<run-id>/prompts \
     .tmp/<run-id>/context/role-state.md:b1-state.full.md \
     …
   ```
   Role templates for ultra: [roles/](roles/).
4. **Write `plan.json`** with one entry per harness-owned slot (`opencode` / `occtl` / `grok`). Native Claude `Agent` slots use `harness: "external"` — launch those via the Agent tool yourself; still list them so harvest scores their `.out`.
5. **OpenCode preflight + launch + harvest.** Do **not** invoke `occtl` or `run-opencode.ts` from this skill — `mbot-run` owns both (occtl by default; run-opencode.ts only as an internal fallback).
   ```bash
   # Optional explicit smoke (launch also smokes automatically when slots use opencode)
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" smoke \
     --run-dir .tmp/<run-id> \
     --attach http://127.0.0.1:4096 \
     --model openai/gpt-5.6-sol

   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" launch --plan .tmp/<run-id>/plan.json
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" barrier --run-dir .tmp/<run-id> --timeout-ms 1200000
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" harvest --run-dir .tmp/<run-id>
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" candidates --run-dir .tmp/<run-id>
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" usage --run-dir .tmp/<run-id>
   ```
   **OpenCode host:** `launch --detach` then `barrier` — a blocking launch dies with its occtl children when the 120s bash timeout fires. **Claude Code host:** blocking `launch` is fine; pass Bash `timeout: 1320000` (22 min).
   Plan knobs: `"concurrency": 3` (default when OpenCode attach is used), `"opencode_mode": "auto"|"attach"|"local"|"skip"`, `"attach": "http://127.0.0.1:4096"` (keeps attach mode). `mbot-run` selects the server via `OPENCODE_SERVER_HOST` / `OPENCODE_SERVER_PORT` / `OPENCODE_SERVER_PASSWORD` (already-set env wins over the attach URL) and does **not** pass `occtl --attach`. GPT OpenCode slots default `--variant high` and `--agent colin-mbot-gpt`. Prompt/out may be `prompts/x.md` or `.tmp/<id>/prompts/x.md` — do not double-prefix. Further launches **merge** into `plan.json` (they do not clobber prior slots).
   Meta records `actual_harness`, `attach_mode`, `actual_model`, `started_at`, `ended_at`, `wall_ms`, `session_id`, `session_file`, and (Grok) `cost_usd`. Harvest salvages timed-out sessions via `occtl last` and **must not** overwrite per-slot `ended_at`.
6. **Summarize from disk** — read `harvest.json` / `results/*.meta.json` / `agentsview-usage.json` only. Never paste full `.out` bodies into chat. Attribute via `meta.actual_model`. `mbot-run usage` talks to agentsview over `AGENTSVIEW_URL` (HTTP) when the CLI is not on PATH.

## OpenCode reliability (hard)

1. **All flags before `--`** in every OpenCode invocation. After `--` is only the harness footer text.
2. **Smoke before fan-out** — if attach hangs/fails, mbot-run falls back to local spawn; if both fail, OpenCode slots fail-closed (`opencode_mode=skip`).
3. **Never wait on `test -s empty.out`** and never `sleep N; rg VERDICT`. Use `mbot-run barrier`.
4. **Cap attach concurrency** (default 3) to avoid shared-server stalls.
5. **Pin model ids** from attach `/config/providers` when available (`openai/gpt-5.6-sol` preferred when listed).
6. **OpenCode host `launch --detach`** (new process group). Wrapping a blocking launch in the default 120s bash tool kills the batch. Claude Code keeps blocking launch.

## Built-in defaults (when no profile)

- Opus (Claude native Agent / botctl / claude CLI) @ high effort  
- GPT via OpenCode @ high  
- Grok CLI @ high (OpenCode `colin-mbot-grok` only if CLI missing)  
- Backup: **Grok only** — no experimental models unless the user names them  

## Delivery contracts (do not mix)

| Owner | Mechanisms | Body |
|---|---|---|
| **Harness-owned** | `mbot-run` (OpenCode + Grok) | Full review = final assistant message / stdout. Harness writes `--out`. |
| **Agent-owned** | Native Claude `Agent` only | Child **Write**s full body to slot path; returns ≤500-char status |

Never tell OpenCode/Grok to Write the harness `--out` path.

## OpenCode single-slot fallback

One OpenCode participant still goes through `mbot-run` (a one-slot `plan.json`). Do not shell out to `occtl` or `run-opencode.ts` — those skip harvest/timeout salvage.

## Retry (summary)

Max one retry per slot; prefer profile backup over second same-model retry. New `--out` path + rewrite any baked path in the prompt. Exit 124 with rich body = success. Details: [reference.md](reference.md#retry-policy).

## Hard rules

- `.tmp/` lives **inside the project root** (OpenCode rejects paths outside it).
- Only the **orchestrator** writes `STATE.json` (mbot-run updates it; subagents never do).
- Do **not** write ad-hoc `launch-*.ts` / `harvest.ts` / `batch.ts` / `extract-issues.ts` under the run dir or `/tmp` — use `mbot-run` (`candidates` after harvest).
- Do **not** call `occtl` / `opencode` / `run-opencode.ts` from the parent session for MBOT slots. Timeout recovery lives in `mbot-run harvest`.
