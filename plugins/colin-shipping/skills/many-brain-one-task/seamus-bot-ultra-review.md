# Profile: `seamus-bot-ultra-review`

Ultra-review lineup for the Seamus GitLab bot, which always runs **inside the Seamus podman
container**. The bot's injected contract (`gitlab-workflow-ultra.md`) already covers the CLIs in
the image, parent lifetime and launch mode, `--title` format, agentsview, retries and wall-clock,
and the CodeRabbit / off-profile-model bans; they are not repeated here.

## Participants and allocation (overrides colin-ultra-review "Allocation")

Three participants for the Opus reasoning experiment: **GPT 6.1 Sol xhigh**, **Opus 5.5 xhigh**, and **Opus 5.5 high**. Call out these variants in the final report. Opus (high or xhigh) also runs adjudication, integration, and
summarization. Backup when a primary cannot run: **none** (retry once with the same model; if
still down, proceed with the available primary).

| Lens | Participants |
|---|---|
| `state` / `contracts` / `failure` | Opus 5.5 xhigh + Opus 5.5 high + GPT-6.1 Sol xhigh, × each bucket |
| `merits` | Opus 5.5 xhigh + Opus 5.5 high + GPT-6.1 Sol xhigh, once |
| `integration` (every round) | Opus 5.5 xhigh + Opus 5.5 high + GPT-6.1 Sol xhigh |

Thread budget: `9 × buckets` + 3 merits + 3 integration per round, plus adjudication. Record
`participants: 3` in `run-summary.json`.

The table above is the `standard` tier. Smaller diffs use colin-ultra-review "Size tier"
thresholds with these participants:

| Tier | Discovery | Merits | Integration | Typical threads |
|---|---|---|---|---|
| `small` | Opus 5.5 xhigh + Opus 5.5 high + GPT-6.1 Sol xhigh, combined-lens | Opus 5.5 xhigh | none | 4 + ≤2 adjudication |
| `medium` | `standard` grid, one bucket (9) | Opus 5.5 xhigh | Opus 5.5 xhigh + Opus 5.5 high + GPT-6.1 Sol xhigh in round 2 only if round 1 confirmed medium+ | 10–13 + adjudication |

## Validation (overrides colin-ultra-review §8)

**No separate validator pass** — validators mostly rubber-stamped (0–5% rejected) or rejected
everything, and the adversarial pass after them did the real filtering. Once per round:

1. `mbot-run candidates`, then cluster by **root cause** (bookkeeping, not a verdict), recording
   which model families raised each cluster.
2. **Adjudicate across families:** Opus-only clusters → one GPT-6.1 Sol slot; clusters raised by GPT
   (with or without Opus) → one Opus adjudicator. Split batches over ~40 clusters into two slots
   of the same family.
3. The adjudicator tries to **refute** each cluster against the source at head. Status is exactly
   `confirmed` | `rejected` (concrete refutation) | `unresolved` (names the missing instrument). A
   severity disagreement is `confirmed` at the corrected severity. Never reject for single-model
   or lack of consensus. No nested subagents.
4. If an adjudicator rejects ≥90% or confirms 100% of a batch of 8+, re-check its medium-and-above
   verdicts yourself against the source and record each override. Do not add another fleet pass.
5. **Convergence early exit:** If Round 1 confirms 0 high or critical severity issues (only low-severity or clean), stop immediately and publish findings. Do not launch Round 2 or Round 3.

Model comparison "Confirmed" / "Rejected" come from adjudication; list adjudication slots as
auxiliary in run accounting, with wall and cost.

## Routing by harness

The parent is Claude Code (`claude -p`, has the native `Agent` tool) or OpenCode (bot-serve
session, has `task` and no `Agent`). `--harness claude|opencode` picks it; Claude is the default.
Check your tool surface — never assume.

- **OpenCode parent (preferred):** every participant, Opus included, is an `mbot-run` slot with a
  `colin-mbot-*` agent; no `external` slots. The `task` tool skips `--out` harvest and timeout
  salvage, so use it only for orchestration chores (indexing, greps), never for a participant.
- **Claude parent:** Claude native `Agent` cannot run `xhigh` effort or separate variant experiments.
  Route all Opus and GPT slots as `mbot-run` OpenCode slots to test Opus high vs xhigh fairly.

## OpenCode slots (either harness)

| Participant | `model` | `agent` | `variant` |
|---|---|---|---|
| Opus 5.5 xhigh | `anthropic/claude-opus-5-5` | `colin-mbot-opus-xhigh` | `xhigh` |
| Opus 5.5 high | `anthropic/claude-opus-5-5` | `colin-mbot-opus` | `high` |
| GPT-6.1 Sol xhigh | `openai/gpt-6.1-sol` | `colin-mbot-gpt-sol` | `xhigh` |

- Always set `model`, `agent`, and `variant`; `mbot-run` auto-picks an agent only for GPT.
  Never `build` / `general`.
- GPT goes through `openai`, not OpenCode Zen.
- `claude-code/opus` is the parent harness model — never a participant.
- `"concurrency": 3` (4 max): all slots, and an OpenCode parent, share one server. Wall-clock
  20 min per slot (`--timeout-ms 1200000`). Grok slots are capped at 8 min (`--timeout-ms 480000`);
  if Grok returns empty output or times out at minute 8, fail over immediately to Opus 5.5 rather than retrying on Grok.
- `plan.json` `"attach": "http://127.0.0.1:4096"` (the bot serve already in
  `OPENCODE_SERVER_HOST`/`PORT`). Never retarget to the personal server (`:4095`,
  `100.110.251.42`, `seamus`), and never call `occtl` or `run-opencode.ts` directly.
- List models through the bot serve (bare `opencode models` ignores attach):

```bash
curl -sS "http://127.0.0.1:4096/config/providers" \
  | jq -r '.providers[] | .id as $p | .models | to_entries[] | "\($p)/\(.key)\t\(.value.name)"'
```
