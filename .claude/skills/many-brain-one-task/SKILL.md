---
name: many-brain-one-task
description: 'Run the same task with multiple agents for reviews, critiques, or model comparison.'
allowed-tools: Read, Write, Agent, Bash(bun *), Bash(cr *), Bash(pi *), Bash(grok *), Bash(claude *), Bash(codex *), Bash(botctl *), Bash(occtl *), Bash(opencode *), Bash(which *), Bash(mkdir *), Bash(cp *)
---

# Many Brain One Task

Solicit independent opinions from multiple models. **Parent session is a thin control plane** — disk under `.tmp/<run-id>/` is durable memory. Do **not** invent per-run launch/harvest scripts; use the bundled drivers.

Full harness matrices, retry policy, sandbox gotchas, and delivery contracts: [reference.md](reference.md).

## Default flow

1. **Resolve participants** from `--profile X`, task type (`code-review`), or [defaults.md](defaults.md) / [code-review.md](code-review.md) / [seamus-bot-ultra-review.md](seamus-bot-ultra-review.md). Write `.tmp/<run-id>/participants.json`.
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
5. **OpenCode preflight + launch + harvest** (do not hand-roll occtl loops)
   ```bash
   # Optional explicit smoke (launch also smokes automatically when slots use opencode)
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" smoke \
     --run-dir .tmp/<run-id> \
     --attach http://seamus:4095 \
     --model openai/gpt-5.6-sol

   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" launch --plan .tmp/<run-id>/plan.json
   # Fail-closed wait (does NOT hang on empty .out after meta says failed):
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" barrier --run-dir .tmp/<run-id> --timeout-ms 1200000
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" harvest --run-dir .tmp/<run-id>
   bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" status --run-dir .tmp/<run-id>
   ```
   Plan knobs: `"concurrency": 3` (default when OpenCode attach is used), `"opencode_mode": "auto"|"attach"|"local"|"skip"`.
   Meta records `actual_harness`, `attach_mode`, `actual_model`. Prefer **run-opencode.ts** (not bare occtl) unless harness is explicitly `occtl`.
6. **Summarize from disk** — read `harvest.json` / `results/*.meta.json` only. Never paste full `.out` bodies into chat. Attribute via `meta.actual_model`.

## OpenCode reliability (hard)

1. **All flags before `--`** in every OpenCode invocation. After `--` is only the harness footer text.
2. **Smoke before fan-out** — if attach hangs/fails, mbot-run falls back to local spawn; if both fail, OpenCode slots fail-closed (`opencode_mode=skip`).
3. **Never wait on `test -s empty.out`** for a failed slot — use `mbot-run barrier` or meta `terminal: true`.
4. **Cap attach concurrency** (default 3) to avoid shared-server stalls.
5. **Pin model ids** from attach `/config/providers` when available (`openai/gpt-5.6-sol` preferred when listed).

## Built-in defaults (when no profile)

- Opus (Claude native Agent / botctl / claude CLI) @ high effort  
- GPT via OpenCode @ high  
- Grok CLI @ high (OpenCode `colin-mbot-grok` only if CLI missing)  
- Backup: **Grok only** — no experimental models unless the user names them  

## Delivery contracts (do not mix)

| Owner | Mechanisms | Body |
|---|---|---|
| **Harness-owned** | `mbot-run` → occtl / run-opencode / grok | Full review = final assistant message / stdout. Harness writes `--out`. |
| **Agent-owned** | Native Claude `Agent` only | Child **Write**s full body to slot path; returns ≤500-char status |

Never tell OpenCode/Grok to Write the harness `--out` path.

## OpenCode single-slot fallback

If you must launch one OpenCode participant without a plan file:

```bash
bun "${CLAUDE_SKILL_DIR}/run-opencode.ts" \
  --model <provider/model> --variant high \
  --file .tmp/<run-id>/prompts/<slot>.md \
  --attach http://seamus:4095 \
  --timeout-ms 1200000 \
  --out .tmp/<run-id>/results/<slot>.out \
  -- "Emit the COMPLETE review as your final assistant message. Do not Write the --out path."
```

Prefer `mbot-run launch` for any batch ≥2.

## Retry (summary)

Max one retry per slot; prefer profile backup over second same-model retry. New `--out` path + rewrite any baked path in the prompt. Exit 124 with rich body = success. Details: [reference.md](reference.md#retry-policy).

## Hard rules

- `.tmp/` lives **inside the project root** (OpenCode rejects paths outside it).
- Only the **orchestrator** writes `STATE.json` (mbot-run updates it; subagents never do).
- Do **not** write ad-hoc `launch-*.ts` / `harvest.ts` / `batch.ts` under the run dir — extend `mbot-run.ts` if a gap remains.
