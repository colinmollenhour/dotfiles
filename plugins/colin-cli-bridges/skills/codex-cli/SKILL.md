---
name: codex-cli
description: 'Shell out to codex CLI.'
allowed-tools: Bash(codex *)
---

# Codex CLI

Use the `codex` CLI to run one-shot prompts or diff-based reviews through OpenAI models.

## Prerequisites

`codex` must be installed and authenticated (`codex --version` should succeed).

## Sending a Prompt (`codex exec`)

```bash
codex exec --ephemeral "Your prompt here" </dev/null
```

**Always redirect stdin from `/dev/null` (`</dev/null`).** Launched without a TTY — any background or headless shell-out — `codex exec` treats an open, empty stdin as more prompt to read and blocks on an EOF that never comes (stalls on `Reading additional input from stdin...`) before it starts work, looking like a slow model rather than a hang. Closing stdin gives an immediate EOF so it proceeds with the prompt argument alone. To pipe the prompt in instead, use `printf '%s' "$PROMPT" | codex exec --ephemeral -` — but never combine the two, since `-` together with `</dev/null` reads an empty prompt.

Key flags:
- `--ephemeral` — run without persisting a session; use for one-shot tasks.
- `-c model="<name>"` — override the model only when the user explicitly requests one.

Capture output to a file for aggregation:

```bash
codex exec --ephemeral "Prompt text" </dev/null > .tmp/codex-output.txt 2>&1
```

## Code Review (`codex review`)

```bash
codex review --base <branch> </dev/null > .tmp/codex-review.txt 2>&1
```

- `--base <branch>` — required; the branch to diff against.
- Does **not** support `--ephemeral`.
- Requires the sandbox to be disabled in Claude Code (`dangerouslyDisableSandbox: true`) because Codex writes session files during review runs.

## Caveats

- Always close stdin (`</dev/null`) on every headless `codex` invocation — otherwise it can block on `Reading additional input from stdin...` and never start. If a run produces no output for minutes, suspect a stdin hang before a slow model.
- `codex review` writes session files to `~/.codex/`; run it unsandboxed from Claude Code.
- `codex exec` with `--ephemeral` is generally safe inside the sandbox for short prompts.
- If `codex` reports authentication errors, ask the user to re-authenticate (`codex login`).
