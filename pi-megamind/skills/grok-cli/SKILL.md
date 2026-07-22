---
name: grok-cli
description: 'Shell out to grok CLI (Grok Build TUI) for headless xAI Grok runs.'
allowed-tools: Bash(grok *)
---

# Grok CLI

Use the `grok` CLI (Grok Build TUI) to send prompts to xAI Grok models from shell-based workflows — typically when the current host is not Grok CLI, or when a batch participant must run outside the native `spawn_subagent` tool.

## Prerequisites

`grok` must be installed and authenticated:

```bash
grok version            # e.g. "grok 0.2.x …"
grok models             # lists available models; default is usually grok-4.5
```

If auth fails, ask the user to run `grok login`.

## Headless Invocation (preferred for MBOT / MBOD)

Headless mode is triggered by `-p` / `--single`, `--prompt-file`, or `--prompt-json`. Prefer **`--prompt-file`** for anything longer than a short one-liner so the shell argv stays small and the full instructions stay in the project tree.

```bash
grok --prompt-file .tmp/<run-id>/grok.md \
  --always-approve \
  --output-format plain \
  --reasoning-effort high \
  > .tmp/<run-id>/results/grok.out 2> .tmp/<run-id>/results/grok.err
```

Key flags:

| Flag | Purpose |
| --- | --- |
| `--prompt-file <path>` | Single-turn prompt from a file (headless). Prefer this over inlining. |
| `-p, --single <PROMPT>` | Single-turn prompt from argv (short prompts only). |
| `-m, --model <MODEL>` | Model id (default from config; often `grok-4.5`). Resolve with `grok models`. |
| `--reasoning-effort` / `--effort` | Thinking budget: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`/`max`. |
| `--always-approve` | Auto-approve all tool executions (unattended batch). Alias path: `--permission-mode bypassPermissions`. |
| `--permission-mode <MODE>` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`. |
| `--output-format plain` | Human-readable assistant text (default). Also `json`, `streaming-json`. |
| `--max-turns <N>` | Cap agentic tool loops (headless only). |
| `--disallowed-tools <LIST>` | Remove tools (comma-separated). Use `Agent` to block nested subagents. |
| `--tools <LIST>` | Allowlist tools (headless only). |
| `--cwd <PATH>` | Working directory for the session. |
| `--verbatim` | Send the prompt exactly as given (no CLI-side rewriting). |
| `--no-subagents` | Disable subagent spawning entirely. |

## Capture Output

Always redirect stdout to a result file under the project `.tmp/` tree. Capture stderr separately so failures stay diagnosable:

```bash
grok --prompt-file .tmp/mbot/grok.md \
  --always-approve \
  --output-format plain \
  > .tmp/mbot/results/grok.out 2> .tmp/mbot/results/grok.err
```

Treat success as: exit code `0` **and** non-whitespace text in the stdout file. Empty success-looking exits usually mean auth, model, or spend issues — record stderr and substitute a backup participant when configured.

## Short Prompt Form

```bash
grok -p "Reply with exactly: GROK_OK" --output-format plain --always-approve
```

## Model Reference

Resolve live ids with `grok models`. Common values:

| Flag value | Notes |
| --- | --- |
| `grok-4.5` | Default strong coding / reasoning model |
| `grok-composer-2.5-fast` | Faster / lighter when listed |

Do not invent model strings; prefer the exact id printed by `grok models`.

## Host-Specific Routing

- **Grok CLI host**: prefer the native `spawn_subagent` tool for Grok-family participants (same process family, tool surface, session model). Fall back to this CLI when the subagent tool is unavailable or the profile explicitly requests shell-out.
- **Any other host** (Claude Code, OpenCode, Pi, Codex, Gemini): shell out with this CLI for Grok-family models. Do **not** prefer OpenCode `colin-mbot-grok` when `grok` is installed and authenticated — the first-party CLI keeps usage on the xAI plan and avoids OpenRouter/OpenCode routing quirks.
- **OpenCode host fallback**: only use `colin-mbot-grok` (or `occtl run` with an xAI/OpenRouter Grok model) when `grok version` fails or the user/profile explicitly requests OpenCode-routed Grok.

## Efficiency Tips (batch / multi-agent)

1. Write the full task into `.tmp/<run-id>/<participant>.md` once; pass it with `--prompt-file` (do not tell the model to `Read` a huge shared file mid-run).
2. Use `--always-approve` (or `bypassPermissions`) so headless runs never block on tool approval.
3. For pure debate / critique / opinion tasks that should not spawn nested work, add `--disallowed-tools Agent` or `--no-subagents`.
4. Cap runaway loops with `--max-turns` when the task is expected to be short (e.g. schema-only repairs).
5. Prefer `--output-format plain` for aggregation. Use `json` only when you need `sessionId` / usage fields.
6. Launch independent Grok participants in parallel Bash calls; each invocation is its own process/session.
7. Keep `.tmp/` **inside the project root** so any file tools the agent uses resolve correctly.

## Caveats

- Headless mode still has full tool access unless you restrict it — assume the agent may edit files if not constrained.
- `--always-approve` / `bypassPermissions` is intentional for unattended MBOT/MBOD; do not use it for interactive user-facing sessions without care.
- Nested subagents (`Agent` / `spawn_subagent` inside the child) can multiply cost. Disable them for simple review/debate prompts.
- Auth and model availability are local to the machine running `grok`; remote OpenCode attach does not help Grok CLI.
- Profile prose that says `OpenCode with Grok` / `colin-mbot-grok` still means the OpenCode path. Profile prose that says `Grok`, `Grok CLI`, or `xAI Grok` means this CLI.
