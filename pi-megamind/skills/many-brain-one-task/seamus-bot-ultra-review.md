# Profile: `seamus-bot-ultra-review`

Ultra-review lineup for the Seamus GitLab bot. This profile always runs **inside the Seamus
podman container**, so the harness options and the available CLIs are not the same as on the
operator's host. Read Step 0 before writing `plan.json`.

## Participants

- **Claude Opus 5.5** at **high** thinking effort (not `max` / `xhigh`) — also the model for
  discovery, validation, integration, and summarization slots
- **GPT-6 Sol** at high reasoning effort (via OpenAI, not OpenCode Zen)
- **Grok** at high reasoning effort

Backup when a primary cannot run: **Grok only** — never invent a substitute lineup.

Do **not** include CodeRabbit / `cr` as a participant, even if the CLI is installed and
authenticated. Do **not** include Gemini, Kimi, GLM, Qwen, DeepSeek, MiMo, or MiniMax unless the
requester explicitly names them.

Default OpenCode wall-clock: 20 minutes (`--timeout` / `--timeout-ms 1200000`); max one retry
per slot.

## Step 0: which harness am I?

The bot parent is **either** Claude Code (`claude -p`) **or** OpenCode (a session on the
in-container bot serve, model `claude-code/opus`). The requester chooses with
`--harness claude` / `--harness opencode` (`--claude` / `--opencode` are aliases); Claude is the
default. Both are enabled, so never assume.

Tell them apart by your own tool surface: the Claude parent has the native `Agent` tool; the
OpenCode parent has the OpenCode `task` tool and no `Agent`.

### Parent = Claude Code

| Participant | Route |
|---|---|
| Opus 5.5 | native `Agent` tool — list the slot in `plan.json` with `harness: "external"` so harvest still scores its `.out` |
| GPT-6 Sol | `mbot-run` OpenCode slot |
| Grok | `mbot-run` OpenCode slot — the `grok` CLI is **not** in this image |

Blocking `mbot-run launch` is fine here; pass Bash `timeout: 1320000` (22 min).

`claude -p` lifetime: a text-only "I'll report back when they finish" turn exits the parent at 0
while OpenCode slots are still running. Hold a foreground `mbot-run barrier` until harvest and
the GitLab post are done. Never `sleep N` in the background as a wait.

### Parent = OpenCode

**Every participant is an OpenCode slot launched by `mbot-run` with a `colin-mbot-*` agent —
including the Claude ones.** Do not shell out to `claude`, `botctl`, or `grok`, and do not use
the OpenCode `task` tool for participant slots (it skips `--out` harvest and timeout salvage).
There are no `harness: "external"` slots in this mode; Opus reviewers become
`colin-mbot-opus` slots exactly like GPT and Grok.

The parent's own `task` subagents are still fine for orchestration work the parent owns (bucket
indexing, cheap greps, file marshalling) — just never for a review participant.

`launch --detach`, then `barrier`: a blocking launch dies with its occtl children when the 120s
bash-tool timeout fires. Do not end the turn while slots are running — the bot's idle watcher
treats an idle session as a finished run and will publish nothing.

## Slot pinning (all OpenCode slots, either harness)

`mbot-run` auto-selects an agent only for GPT models. Claude and Grok slots must set `"agent"`
explicitly on the slot.

| Participant | slot `model` | slot `agent` | `variant` |
|---|---|---|---|
| Opus 5.5 | `anthropic/claude-opus-5-5` | `colin-mbot-opus` | `high` |
| GPT-6 Sol | `openai/gpt-6-sol` | `colin-mbot-gpt-sol` | `high` |
| Grok | `xai/grok-4.7` | `colin-mbot-grok` | `high` |

- The provider id on this server is `xai`, **not** `x-ai`. `colin-mbot-grok` deliberately pins no
  model in its frontmatter, so a slot with no `model` silently falls through to GPT — always set
  it. `xai/grok-4.6` is the accepted fallback if `4.7` is not listed.
- Use `anthropic/*` for Claude participant slots. `claude-code/opus` is the **parent** harness
  model (the `@openchamber/opencode-claude` plugin); do not fan a review out onto it.
- Never `--agent build` / `general`, and never omit `--variant`.
- Keep `"concurrency": 3` (4 max). Every slot — plus, under the OpenCode harness, the parent
  session itself — shares one server.

## OpenCode server

`OPENCODE_SERVER_HOST` / `OPENCODE_SERVER_PORT` are already set by Seamus to the **in-container
bot serve** (`127.0.0.1:4096`), and already-set env wins over the plan. Put the same URL on
`plan.json` as `"attach": "http://127.0.0.1:4096"` so `mbot-run` stays in attach mode and never
`--spawn`s.

Do **not** retarget to the operator's personal server — port `4095`, host `100.110.251.42`, or
hostname `seamus`. Seamus rewrites those back to the bot serve anyway, and bot reviews must not
land on the personal server. Do not pass `occtl --attach`, and do not invoke `occtl` or
`run-opencode.ts` yourself.

List models through attach, never bare `opencode models` (it ignores attach):

```bash
curl -sS "http://127.0.0.1:4096/config/providers" \
  | jq -r '.providers[] | .id as $p | .models | to_entries[] | "\($p)/\(.key)\t\(.value.name)"'
```

## What is in the container image

Present: `bun`, `claude`, `codex`, `cup`, `glab`, `jq`, `occtl`, `opencode`.

Absent: `grok`, `botctl`, `cr`, `pi`, `gemini`, and the `agentsview` CLI.

Never plan a route through a CLI that is not there. `AGENTSVIEW_URL` is injected into the
environment — run `mbot-run usage` **without** `--no-agentsview`; it speaks HTTP to that URL when
the CLI is missing.

## Required `--title` format (cost reporting)

Every OpenCode participant title (set on the `mbot-run` plan slot) must include:

```text
ultra|{gitlabProjectPath}|!{mrIid}|{bucketOr-}|{role}|{modelShort}|retry{N}
```

Example: `ultra|shipstream/server|!2740|-|state|gpt-6-sol|retry0`

Use `-` for bucket when not bucketed. Bump `retryN` and use a distinct `--out` for every
re-launch.
