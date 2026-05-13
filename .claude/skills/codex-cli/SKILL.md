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
codex exec --ephemeral "Your prompt here"
```

Key flags:
- `--ephemeral` — run without persisting a session; use for one-shot tasks.
- `-c model="<name>"` — override the model only when the user explicitly requests one.

Capture output to a file for aggregation:

```bash
codex exec --ephemeral "Prompt text" > .tmp/codex-output.txt 2>&1
```

## Code Review (`codex review`)

```bash
codex review --base <branch> > .tmp/codex-review.txt 2>&1
```

- `--base <branch>` — required; the branch to diff against.
- Does **not** support `--ephemeral`.
- Requires the sandbox to be disabled in Claude Code (`dangerouslyDisableSandbox: true`) because Codex writes session files during review runs.

## Caveats

- `codex review` writes session files to `~/.codex/`; run it unsandboxed from Claude Code.
- `codex exec` with `--ephemeral` is generally safe inside the sandbox for short prompts.
- If `codex` reports authentication errors, ask the user to re-authenticate (`codex login`).
