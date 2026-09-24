# Profile: `seamus-bot-ultra-review`

Ultra-review lineup for the Seamus GitLab bot, which always runs **inside the Seamus podman
container**. The bot's injected contract (`gitlab-workflow-ultra.md`) already covers the CLIs in
the image, parent lifetime and launch mode, `--title` format, agentsview, retries and wall-clock,
and the CodeRabbit / off-profile-model bans; they are not repeated here.

## Participants and allocation (overrides colin-ultra-review "Allocation")

All at **high** effort (never `max` / `xhigh`). Opus also runs adjudication, integration, and
summarization. Backup when a primary cannot run: **Grok only**.

| Lens | Participants |
|---|---|
| `state` / `contracts` / `failure` | Opus 5.5 + GPT-6 Sol, × each bucket |
| `craft` | Grok, one slot per bucket (Opus if Grok cannot run) |
| `merits` | Opus 5.5 + GPT-6 Sol, once |
| `integration` (every round) | Opus 5.5 + GPT-6 Sol |

Grok keeps only `craft`: it was the slowest lane, timed out most, and its unique confirmed
findings were all low and came from that lens. Thread budget: `7 × buckets` + 2 merits +
2 integration per round, plus adjudication. Record `participants: 2` (+ Grok craft) in
`run-summary.json`.

## Validation (overrides colin-ultra-review §8)

**No separate validator pass** — validators mostly rubber-stamped (0–5% rejected) or rejected
everything, and the adversarial pass after them did the real filtering. Once per round:

1. `mbot-run candidates`, then cluster by **root cause** (bookkeeping, not a verdict), recording
   which model families raised each cluster.
2. **Adjudicate across families:** Opus-only clusters → one GPT-6 Sol slot; clusters raised by GPT
   and/or Grok (with or without Opus) → one Opus adjudicator. Split batches over ~40 clusters
   into two slots of the same family.
3. The adjudicator tries to **refute** each cluster against the source at head. Status is exactly
   `confirmed` | `rejected` (concrete refutation) | `unresolved` (names the missing instrument). A
   severity disagreement is `confirmed` at the corrected severity. Never reject for single-model
   or lack of consensus. No nested subagents.
4. If an adjudicator rejects ≥90% or confirms 100% of a batch of 8+, re-check its medium-and-above
   verdicts yourself against the source and record each override. Do not add another fleet pass.

Model comparison "Confirmed" / "Rejected" come from adjudication; list adjudication slots as
auxiliary in run accounting, with wall and cost.

## Routing by harness

The parent is Claude Code (`claude -p`, has the native `Agent` tool) or OpenCode (bot-serve
session, has `task` and no `Agent`). `--harness claude|opencode` picks it; Claude is the default.
Check your tool surface — never assume.

- **Claude parent:** Opus slots use native `Agent`, listed in `plan.json` with
  `harness: "external"` so harvest still scores the `.out`. GPT and Grok are `mbot-run` OpenCode
  slots.
- **OpenCode parent:** every participant, Opus included, is an `mbot-run` slot with a
  `colin-mbot-*` agent; no `external` slots. The `task` tool skips `--out` harvest and timeout
  salvage, so use it only for orchestration chores (indexing, greps), never for a participant.

## OpenCode slots (either harness)

| Participant | `model` | `agent` | `variant` |
|---|---|---|---|
| Opus 5.5 | `anthropic/claude-opus-5-5` | `colin-mbot-opus` | `high` |
| GPT-6 Sol | `openai/gpt-6-sol` | `colin-mbot-gpt-sol` | `high` |
| Grok | `xai/grok-4.7` | `colin-mbot-grok` | `high` |

- Always set `model`, `agent`, and `variant`; `mbot-run` auto-picks an agent only for GPT.
  `colin-mbot-grok` pins no model, so a Grok slot without `model` silently runs GPT. Never
  `build` / `general`.
- Provider is `xai`, not `x-ai`; `xai/grok-4.6` is the fallback if 4.7 is not listed. GPT goes
  through `openai`, not OpenCode Zen.
- `claude-code/opus` is the parent harness model — never a participant.
- `"concurrency": 3` (4 max): all slots, and an OpenCode parent, share one server. Wall-clock
  20 min per slot (`--timeout-ms 1200000`).
- `plan.json` `"attach": "http://127.0.0.1:4096"` (the bot serve already in
  `OPENCODE_SERVER_HOST`/`PORT`). Never retarget to the personal server (`:4095`,
  `100.110.251.42`, `seamus`), and never call `occtl` or `run-opencode.ts` directly.
- List models through the bot serve (bare `opencode models` ignores attach):

```bash
curl -sS "http://127.0.0.1:4096/config/providers" \
  | jq -r '.providers[] | .id as $p | .models | to_entries[] | "\($p)/\(.key)\t\(.value.name)"'
```
