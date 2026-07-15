---
name: claude-cli
description: 'Shell out to claude CLI.'
allowed-tools: Bash(claude *)
---

# Claude CLI

Use the `claude` CLI to send prompts to Claude models from shell-based workflows — typically when the current host is OpenCode, or when a sub-agent must run outside the native `Agent` tool.

## Basic Invocation

```bash
claude --model opus --print --output-format text -- "Your prompt here"
```

Key flags:
- `--model` — model family: `opus`, `sonnet`, or `haiku`.
- `--print` — non-interactive; prints response and exits.
- `--output-format text` — plain text response; also accepts `json`, `stream-json`.
- `--` — separates flags from the prompt (required when the prompt starts with `-`).

## Adding Context via File

```bash
claude --model opus --print --output-format text \
  --append-system-prompt .tmp/context.md \
  -- "Short user-facing prompt here"
```

- `--append-system-prompt <file>` — appends file content to the system prompt. Use for large shared context (diffs, specs, MR content) without bloating the prompt argument.
- Real instructions go in the file; the trailing `-- "..."` stays brief and human-readable.

## Effort and Session Options

```bash
claude --model opus --print --output-format text \
  --effort max \
  --name "MBOT: code-review opus" \
  -- "Perform the review as instructed."
```

- `--effort max` — increases thinking budget for complex reasoning tasks.
- `--name "..."` — names the session in the Claude UI; useful for auditing batch runs.

## Agent Selection

```bash
claude --agent general --model opus --print --output-format text -- "Prompt"
```

- `--agent general` — uses the general-purpose agent profile with tool access. Omit for a plain completion with no tools.

## Capture Output

```bash
claude --model opus --print --output-format text -- "Prompt" > .tmp/claude-output.txt 2>&1
```

Redirect to a file for consumption by aggregation steps. Capturing both stdout and stderr (`2>&1`) avoids lost error messages.

## Model Reference

| Flag value | Model |
|---|---|
| `opus` | Claude Opus 4.7 — strongest reasoning |
| `sonnet` | Claude Sonnet 4.6 — balanced speed and quality |
| `haiku` | Claude Haiku 4.5 — fastest, cheapest |

## Host-Specific Routing

- **OpenCode host**: `claude` CLI is the **only** path for Claude-family models. Do not use `colin-mbot-opus` or similar subagents — those are for non-Claude models only.
- **Claude Code host**: prefer the native `Agent` tool; use this CLI as a fallback when the Agent tool is unavailable.
- **Codex host**: shell out to `claude` for any Claude-family model.

## Caveats

- `--print` mode does not support interactive tool approval; the agent runs with permissions granted at session level.
- Long prompts should be written to a file and passed via `--append-system-prompt`, not inlined in the argument.
