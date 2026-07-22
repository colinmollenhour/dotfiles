---
name: many-brain-one-task
description: 'Run the same task with multiple agents for reviews, critiques, or model comparison.'
allowed-tools: Bash(bun *), Bash(cr *), Bash(pi *), Bash(grok *), Bash(claude *), Bash(codex *)
---

# Many Brain One Task

This Skill helps solicit, gather and analyze multiple "opinions" from different AI models or even agents.

# Instructions

## Step 1: Pick the participants

If the prompt names specific models/agents, use those. Otherwise consult the profile.

### Profile precedence

1. `--profile X` flag in the prompt → profile name is `X`.
2. Task falls into a known bucket (`code-review`, `critique`) → profile name matches the bucket.
3. Otherwise → `default`.

Load `<profile>.md` from this skill's directory. If missing, fall back to `default.md`. If `default.md` is also missing, use the built-in defaults below.

### Built-in defaults

Primary models:
  - Opus (via Claude CLI)
  - GPT (via OpenCode)
  - Gemini (via OpenCode)
  - Grok (via Grok CLI when `grok` is available; otherwise OpenCode `colin-mbot-grok`)
Backup models (via OpenCode unless noted): MiMo, GLM, Qwen, Kimi; Grok CLI is preferred over OpenCode for Grok.

## Step 2: Pick the harness for each participant

The host harness (you, the one running this skill right now) limits which models can run as native subagents. For everything else, shell out. The user's profile may override these rules (e.g. "Use the codex CLI for OpenAI models" forces a specific CLI even when another mechanism is available) — profile rules win.

### Routing matrix

| Host        | Model family             | Mechanism                                                                                                  |
|-------------|--------------------------|------------------------------------------------------------------------------------------------------------|
| Pi          | `pi` agent requested      | Prefer the `pi-fast-subagent` package `subagent` tool when it is available; otherwise shell out with `pi --print` using the prepared prompt file. See [Pi](#pi). |
| Pi          | any other model family    | Follow the profile's requested CLI/harness. If unspecified in the Pi package, use Pi itself as the participant. |
| Claude Code | Claude (Opus/Sonnet/Haiku) | Native `Agent` tool (preferred) — falls back to the `claude` CLI. See [Claude](#claude-opus--sonnet--haiku). |
| Claude Code | Grok                     | `grok` CLI (preferred). OpenCode `colin-mbot-grok` only if `grok` is missing/unauthenticated or the profile forces OpenCode. See [Grok](#grok). |
| Claude Code | other non-Claude         | `occtl run` (preferred); `run-opencode.ts` fallback.                                                       |
| OpenCode    | Claude (Opus/Sonnet/Haiku) | `claude` CLI — the **only** path. See [Claude](#claude-opus--sonnet--haiku). Do not use `colin-mbot-*` subagents for Claude. |
| OpenCode    | Grok                     | `grok` CLI (preferred). Fall back to `colin-mbot-grok` / `occtl run` only when Grok CLI is unavailable or the profile says OpenCode. See [Grok](#grok). |
| OpenCode    | other non-Claude         | `task` tool with a `colin-mbot-*` `subagent_type` (e.g. `colin-mbot-glm` for GLM). Auto-selects model.     |
| Grok CLI    | Grok                     | Native `spawn_subagent` (preferred) — falls back to the `grok` CLI. See [Grok](#grok). |
| Grok CLI    | non-Grok                 | Follow the profile's CLI/harness (`claude`, `occtl run` / `run-opencode.ts`, `pi`, `codex`, `gemini`). |
| Codex       | OpenAI                   | `codex` CLI native; shell out for everything else.                                                         |
| Gemini      | Gemini                   | `gemini` CLI native; shell out for everything else.                                                        |

When OpenCode is the host and dispatching to a `colin-mbot-*` subagent, **only** use agents whose names start with `colin-mbot-`. Do not pick other agents. Exception: Claude and Grok prefer their first-party CLIs over `colin-mbot-*` when those CLIs are available.

When the user requests `pi`, `Pi`, `Pi agent`, or a profile line like `Pi with current model`, treat that as a Pi-backed participant. In the Pi package, Pi-backed participants are the default unless the user or profile names different agents.

When the user requests `grok`, `Grok`, `Grok CLI`, `xAI Grok`, or a profile line like `Grok CLI with grok-4.5`, treat that as a Grok-CLI-backed participant (not OpenCode) unless the line explicitly says OpenCode / `colin-mbot-grok`.


### Pi

Use this route when the user asks for `pi` as a participant, when a profile names Pi, or when running the Pi package default profile.

Preferred path, when the lightweight `pi-fast-subagent` package is installed in the current Pi session: use its `subagent` tool and launch a focused child agent with the prepared prompt file as the task context. Prefer a role-specific project/user agent when available; otherwise use the bundled `general` agent, or `scout` for read-only exploration. For parallel batches, call `subagent` with `tasks: [...]` when available and save each returned result under `.tmp/<run-id>/results/`.

Fallback path, when `pi-fast-subagent` is not installed or no `subagent` tool is available: shell out to Pi print mode with the prompt file on stdin. Keep the prompt file inside the project `.tmp/` directory.

```bash
pi --print < .tmp/<run-id>/<participant>.md > .tmp/<run-id>/results/<participant>.out
```

You may pass model options when the profile specifies them:

```bash
pi --print --model anthropic/claude-sonnet-4:high < .tmp/<run-id>/<participant>.md > .tmp/<run-id>/results/pi-sonnet.out
```

Treat a Pi-backed run as successful when the command exits `0` and the output file contains non-whitespace assistant text. If it exits non-zero or produces no text, record stderr/output and substitute a backup participant when one is configured.

#### Resolving Pi model names

Use `pi --list-models <specific-query>` when a Pi profile names a model but not the exact model id. Keep the query as narrow as the user's wording allows so good matches are not truncated. Examples: use `pi --list-models gpt-5.5` for "GPT 5.5" (not `gpt`), `pi --list-models glm-5.1` for "GLM 5.1", and `pi --list-models sonnet` for "Sonnet". Prefer the exact provider/model id returned by Pi; if several providers match, prefer coding-plan or first-party routes over generic OpenRouter unless the profile explicitly says OpenRouter.

### OpenCode server attach (optional)

Profiles may include an attach directive instructing every OpenCode invocation to attach to a running server instead of spawning a fresh one. This is much faster and avoids reloading provider config on every call. Parse the directive **here**, before invocation, because it changes how every OpenCode call below is shaped.

**Recognized prose forms** (case-insensitive):

- Global (applies to every OpenCode invocation in this MBOT run):
  ```
  Attach OpenCode to seamus:4095
  Attach OpenCode to http://seamus:4095 with password hunter2
  OpenCode attach: seamus:4095 (password: hunter2)
  ```
- Per-agent (overrides any global directive on that line only):
  ```
  - OpenCode with GLM 5.1 via attach seamus:4095
  - OpenCode with GPT-5.4 via attach http://seamus:4095 (password: hunter2)
  ```

**URL normalization:** prefix `http://` if scheme is missing (`seamus:4095` → `http://seamus:4095`). Default OpenCode port is `4096`.

**Password:** optional. If present, pass `--password X` (works for both `occtl run` and `run-opencode.ts`). Otherwise the tools fall back to `OPENCODE_SERVER_PASSWORD` from the environment.

**Plumbing the directive:** `occtl` has no `--attach` flag — it auto-detects from `OPENCODE_SERVER_HOST` / `OPENCODE_SERVER_PORT` / `OPENCODE_SERVER_PASSWORD`. Set those once on each `occtl` call (single-statement env-prefix form — see [Sandbox-friendly Bash patterns](#sandbox-friendly-bash-patterns)). `run-opencode.ts` accepts `--attach <url>` directly.

### Resolving OpenCode model names

If the user did not specify the exact model string, resolve it with `opencode models`. For example, "GLM 5.1" might resolve to `zai-coding-plan/glm-5.1` or `openrouter/z-ai/glm-5.1` depending on which connections are available. Prefer coding plans over `openrouter/` and `opencode/` when available.

## Step 3: Prepare the prompt files

Write prompts to `.tmp/<run-id>/...` **inside the project root** (not `$TMPDIR`). OpenCode's permission system auto-rejects reads outside the project (`permission requested: external_directory; auto-rejecting`).

For ultra-review-style fan-outs that send the same MR context to multiple role-specific prompts, use the bundled helper to assemble all role files in one shot:

```bash
bun "${CLAUDE_SKILL_DIR}/assemble-prompts.ts" \
  --append .tmp/ultra-review-2514/bucket.md \
  --out-dir .tmp/ultra-review-2514 \
  .tmp/ultra-review-2514/role-bugs.md:bugs.full.md \
  .tmp/ultra-review-2514/role-runtime.md:runtime.full.md \
  .tmp/ultra-review-2514/role-craft.md:craft.full.md
```

Each positional is `<source>:<output-name>` and produces `<out-dir>/<output-name>` containing the source followed by the `--append` file. Prints a compact JSON summary (`out_dir`, `append_bytes`, per-output `{out, source, bytes}` and any `error`). `--append` is optional; without it the helper is just an atomic multi-copy. Saves chaining N `cat` calls and gives one JSON object to parse for byte counts.

If `--dry-run` is in the prompt, do **not** actually run anything. Print the execution plan with abbreviated prompts (~100 chars each) for readability and stop.

## Step 4: Launch the participants

Launch all participants in parallel. If one fails to start, skip it, note it in the final summary, and substitute a backup if the profile or prompt named one.

It may help to instruct each agent to wrap findings in markers (e.g. `<<<ISSUE>>>...<<<END>>>`) so the gather/summarize step can parse output reliably.

### Grok

Load the `grok-cli` skill for complete flag reference. Summary:

**Grok CLI host** — prefer the native `spawn_subagent` tool for Grok-family participants:

```ts
spawn_subagent({
  subagent_type: "general-purpose",
  description: "MBOT grok participant",
  prompt: "<contents or path instructions for the prepared prompt>",
  background: true,
})
```

Save the returned summary/result under `.tmp/<run-id>/results/<participant>.out`. If `spawn_subagent` is unavailable, fall back to the headless `grok` CLI form below.

**Any other host** — shell out to the `grok` CLI. Do **not** use `colin-mbot-grok` when `grok version` succeeds unless the profile explicitly requests OpenCode-routed Grok.

#### Preflight (run once when any participant is Grok-CLI-backed)

```bash
grok version            # must exit 0
```

Optional: `grok models` when the profile names a non-default model id. Cache success as `GROK_VIA=cli`. If `grok version` fails, set `GROK_VIA=opencode` and use the OpenCode path (`colin-mbot-grok` / `occtl run`) for Grok participants.

#### Headless launch

Write the full task to a prompt file, then:

```bash
grok --prompt-file .tmp/<run-id>/grok.md \
  --always-approve \
  --output-format plain \
  --reasoning-effort high \
  --disallowed-tools Agent \
  > .tmp/<run-id>/results/grok.out 2> .tmp/<run-id>/results/grok.err
```

Guidelines:

- Prefer `--prompt-file` over `-p` for any non-trivial MBOT prompt (same reliability reason as OpenCode `--file`).
- Use `--always-approve` so unattended batch runs never block on tool permission prompts.
- Pass `-m <model>` / `--model` only when the profile pins one (resolve with `grok models`; default is usually `grok-4.5`).
- Map profile effort prose: `"max" thinking` / `xhigh` → `--reasoning-effort max` (alias of `xhigh`); `"high"` → `high`.
- For pure critique/review/opinion tasks, add `--disallowed-tools Agent` or `--no-subagents` so the child does not spawn nested agents.
- Treat success as exit `0` **and** non-whitespace stdout. On failure, record stderr and substitute a backup if configured.
- Profile prose `OpenCode with Grok` / `colin-mbot-grok` still means the OpenCode path. Bare `Grok` / `Grok CLI` means this path.

### Claude (Opus / Sonnet / Haiku)

Load the `claude-cli` skill for complete flag reference. Summary:

Both Claude Code and OpenCode hosts run Claude models via the same path: shell out to the `claude` CLI (or, when the host is Claude Code, prefer the native `Agent` tool which uses the same backend).

**Claude Code host** — prefer the native `Agent` tool:

```ts
Agent({ subagent_type: "general-purpose", model: "opus", run_in_background: true, description: "...", prompt: "..." })
```

If the `Agent` tool is unavailable, fall back to the `claude` CLI form below.

**OpenCode host** — the `claude` CLI is the **only** path. Do **not** use a `colin-mbot-*` subagent for Claude models; those subagents are for non-Claude models only.

```bash
claude --agent general --model opus --print --output-format text --name "MBOT: Code review for X" --effort max --append-system-prompt .tmp/ultra-review/runtime.full.md -- "PROMPT_HERE"
```

Swap `--model opus` for `sonnet` / `haiku` as appropriate. `--append-system-prompt <file>` is how you pipe a long shared context (e.g. an MR's full diff) into the run; the trailing `-- "..."` is the short user-visible prompt.

### OpenCode

OpenCode invocations have two implementations: `occtl run` (preferred) and `run-opencode.ts` (fallback). Decide which to use **once**, at the start of the batch, with a preflight check; reuse the same one for every OpenCode-backed agent in the run.

#### Preflight (run once at the start of the batch)

```bash
occtl --version            # prints version, exits 0 on success
occtl ping                 # prints "OK <url>", exits 0 on success
```

Treat `occtl` as available only when **both** checks pass and the printed version compares ≥ `1.2.0` (`occtl run` was added in 1.2.0; `1.2.x`, `1.3.x`, `2.x` qualify; `1.1.x` does not). Cache the decision (e.g. `OPENCODE_VIA=occtl` or `OPENCODE_VIA=run-opencode-ts`).

If the profile contains an attach directive, set `OPENCODE_SERVER_HOST` / `OPENCODE_SERVER_PORT` / `OPENCODE_SERVER_PASSWORD` from it before `ping` so the check exercises the real target.

When `occtl` wins, also load its bundled skill for the full surface (sessions, send, attach, worktrees, Ralph Mode):

```bash
occtl view-skill | head -200
```

#### `occtl run` (preferred)

`occtl run` creates a session, sends the prompt, waits for `session.idle`, and writes the assistant text — all through the OpenCode HTTP API. None of the `opencode run` subprocess workarounds (`--dir .` flag dance, NDJSON parsing, `XDG_STATE_HOME` EROFS, `--dangerously-skip-permissions`) apply because there's no subprocess.

```bash
occtl run \
  --model opencode/gemini-3.1-pro \
  --variant xhigh \
  --title "ultra-review !2514 craft/Gemini-3.1-Pro" \
  --file .tmp/ultra-review-2514/craft.full.md \
  --out .tmp/ultra-review-2514/results/craft-gemini.out \
  --timeout 540000 \
  -- "Perform the code review exactly as instructed."
```

If there is no running server (or the profile asks for one fresh server per agent for isolation), add `--spawn`. `occtl` picks a free port, isolates `XDG_STATE_HOME`, runs the prompt, and SIGTERM/SIGKILLs the child on exit:

```bash
occtl run --spawn --model openai/gpt-5.4 \
  --file .tmp/ultra-review-2514/bugs.full.md \
  --out .tmp/ultra-review-2514/results/bugs-gpt.out \
  --timeout 540000 \
  -- "Perform the code review exactly as instructed."
```

#### `run-opencode.ts` (fallback)

When the preflight finds `occtl` missing, too old, or unable to reach a server, every OpenCode call goes through `run-opencode.ts`. It normalizes the flags that have tripped us in the past (file vs argv, the `--` separator, `--dir .` in attach mode, `--format json` parsing, `--dangerously-skip-permissions` for local spawns).

Invoke inline in a single Bash call (wrapper `.sh` forms trip the Claude Code sandbox even with `dangerouslyDisableSandbox: true`):

```bash
bun "${CLAUDE_SKILL_DIR}/run-opencode.ts" \
  --model opencode/gemini-3.1-pro \
  --variant xhigh \
  --title "ultra-review !2514 craft/Gemini-3.1-Pro" \
  --file .tmp/ultra-review-2514/craft.full.md \
  --attach http://seamus:4095 \
  --timeout-ms 540000 \
  --out .tmp/ultra-review-2514/results/craft-gemini.out \
  -- "Perform the code review exactly as instructed."
```

In `json` mode (the default) with `--out`, the script also writes `<out>.raw.jsonl` with raw OpenCode events and `<out>.session` with any discovered OpenCode session ids. If OpenCode exits 0 but produces no non-whitespace text, the script exits non-zero and reports that the provider may be unavailable or spend-limited.

What the script does **not** handle: choosing the model, choosing whether to attach, writing the prompt file. Those are still caller decisions.

#### Flag reference (`occtl run` ↔ `run-opencode.ts`)

| Purpose                          | `occtl run`                | `run-opencode.ts`                       | Notes |
|----------------------------------|----------------------------|-----------------------------------------|-------|
| Model                            | `--model`                  | `--model`                               | Required. Prefer coding plans over `openrouter/` and `opencode/`. |
| Reasoning variant                | `--variant`                | `--variant`                             | Provider-specific (`xhigh`, `high`, `max`, `minimal`). |
| Agent name override              | `--agent`                  | `--agent`                               | Rare. Default agent is fine. |
| Session title in OpenCode UI     | `--title`                  | `--title`                               | Use a stable prefix so batch runs are groupable. |
| Prompt file (repeatable)         | `--file`                   | `--file`                                | Files are concatenated into one text part with the trailing positional appended. |
| Attach to running server         | env vars (see attach docs) | `--attach <url>`                        | `occtl` auto-detects from `OPENCODE_SERVER_HOST`/`PORT`. |
| Server password                  | `--password`               | `--password`                            | Env fallback: `OPENCODE_SERVER_PASSWORD`. |
| Working dir override             | (n/a)                      | `--dir <path>`                          | `run-opencode.ts` auto-adds `--dir .` in attach mode. |
| Script timeout (ms)              | `--timeout`                | `--timeout-ms`                          | Keep below the Bash tool timeout so sidecars get written before kill. |
| Assistant output file            | `--out`                    | `--out`                                 | Sidecar `<out>.session` is always written. |
| Stderr capture file              | `--stderr`                 | `--stderr`                              | Use on failures for diagnosis. |
| Output format                    | (always API)               | `--format default\|json`                | `json` is default in `run-opencode.ts`; passes events through and extracts `text`. |
| Forward `--thinking`             | `--thinking`               | `--thinking`                            | Rare. |
| Raw assistant JSON               | `--raw <path>`             | (sidecar `<out>.raw.jsonl` in json mode) | — |
| Spawn ephemeral server           | `--spawn`, `--spawn-port`  | (n/a; script uses `--dangerously-skip-permissions` for local) | `occtl` tears down the child on exit. |
| Delete session after run         | `--ephemeral`              | (n/a)                                   | Default keeps the session for token-usage audit. |
| Short positional message         | `-- <msg>`                 | `-- <msg>`                              | Keep brief; real instructions go in `--file`. |

Both exit `0` on success, `1` on empty/no-text response or generic failure, `2` on invalid arguments, `124` on timeout.

### codex

Load the `codex-cli` skill for complete flag reference. Quick reference:

```bash
codex exec --ephemeral "PROMPT_HERE"
codex review --base <branch> > ./.codex-review.txt 2>&1
```

Caveats:
- `codex review` does **not** support `--ephemeral`.
- `codex review` requires `--base <branch>`.
- When running `codex review` from Claude Code, you must disable the sandbox — Codex writes session files during review runs.

### gemini

```bash
gemini --model gemini-3.1-flash-lite-preview --prompt "PROMPT_HERE"
```

### CodeRabbit (`cr`)

If the profile or prompt names CodeRabbit / Coderabbit / `cr` as a participant, invoke the authenticated CodeRabbit CLI directly — do **not** route through OpenCode or Claude. Assume `cr` is already installed and authenticated; do not attempt login or token recovery. If `cr` exits non-zero, abort that participant, record the error in the summary, and continue with backups.

```bash
cr --plain --base-commit <sha> --config <extra-file.txt> > .tmp/mbot/results/coderabbit.txt
```

Guidelines:

- Prefer `--base-commit <sha>` for review tasks. Resolve `<sha>` from the intended comparison base (merge-base with target branch, the PR/MR base commit, or a user-specified SHA). Omit `--base-commit` only if the task is not diff/review-shaped and the CLI supports the requested mode.
- Use `--config <path>` when the prompt needs extra instructions. Write a small instructions file inside the project `.tmp/` and pass that path. Omit if not needed.
- Use `--plain` instead of `--agent` and capture stdout to `.txt`. MBOT consumes CodeRabbit as another reviewer, so the plain text report is usually easier and the structured event stream is not needed.
- When running `cr` from Claude Code, run it unsandboxed. In the sandbox, CodeRabbit can hang indefinitely after printing `Connecting to review service` and never reach normal setup/review output. If you see that stall, stop waiting and rerun the same command with sandbox disabled.
- Treat a completed plain text review as success when it reaches the normal review phases, e.g. `Connecting to review service`, `Setting up`, `Summarizing`, and then emits findings or a no-findings report. Include the plain text findings/comments in the aggregate MBOT summary.
- Do **not** parse CodeRabbit output as OpenCode assistant text. It is CLI output and should be summarized separately alongside the other agents.
- On failure, include the command, exit status, and stderr path/excerpt in the final summary; do not retry authentication.

## Step 5: Gather and summarize

Collect the results and apply the user's finalizing steps if specified. Otherwise the default is to summarize the findings in aggregate, compare models, scrutinize the output, pick winners and losers, and note any interesting differences.

# Caveats

These apply across OpenCode invocations regardless of which path (`occtl run` or `run-opencode.ts`) was chosen.

- **`.tmp/` must be inside the project root, not `$TMPDIR`.** OpenCode has its own permission system (separate from the Claude Code sandbox) that auto-rejects reads outside the project. `$TMPDIR` also resolves to different paths in sandboxed vs sandbox-disabled Bash calls, so files created in one may be invisible to the other.
- **Sandbox write paths.** `bun "${CLAUDE_SKILL_DIR}/run-opencode.ts" …` from Claude Code may need `dangerouslyDisableSandbox: true` depending on the host's `sandbox.filesystem.allowWrite`. OpenCode writes to `~/.local/share/opencode/`; if that path is not in `allowWrite`, the SQLite `PRAGMA wal_checkpoint` fails. Seamus's `gitlab-settings.json` already allows `~/.local/share`; other hosts may not.
- **Model availability varies by plan.** `opencode models` lists everything the install knows about, but some return `Error: Model is disabled` at runtime (e.g. `opencode/gpt-5.4-nano` on certain plans). If a profile names a model, verify with a trivial prompt before launching a batch.
- **`--file` is more reliable than "Read /path/..." in the prompt body.** When the prompt tells the model to use the Read tool to fetch a large file, some models (observed with Gemini 3.1 Pro and GLM 5.1) silently terminate after 3-4 chunk reads without producing any ISSUE blocks. Attaching via `--file` sidesteps that.
- **Line numbers in code reviews.** When the shared prompt concatenates instructions + AGENTS.md + a large diff, some models (observed with GLM 5.1) report line numbers relative to the prompt file rather than the real source file. During validation, re-anchor any finding whose line number exceeds the actual file length before trusting the citation.

# Sandbox-friendly Bash patterns

Multi-agent runs hit the same set of Claude Code Bash-tool guards every time. Each pattern below has a single, deterministic replacement — use the right shape from the start instead of discovering the guard:

| Avoid | Why it fails | Use instead |
|---|---|---|
| `sleep 60; cmd` | Long leading `sleep` is hard-blocked | `until <check>; do sleep 2; done` invoked via the **Monitor** tool — the runtime notifies you when the loop exits. For a specific bg task, prefer `run_in_background: true` + `TaskGet`/`TaskOutput` over polling. |
| `export X=Y; cmd` (or bare `export X=Y`) | Tripped as "multiple operations" requiring approval | Single-statement env-prefix form: `X=Y cmd` (no `export`, no `;`) |
| `prev=0` (standalone assignment) | Bash-AST parser rejects with cryptic `Unhandled node type: string` | Move the statefulness into a `bun script.ts` invocation |
| `until [ "$(ls …)" -eq N ]; do …; done` | `$(…)` rejected with "Contains command_substitution"; bare `until` may also trip the AST parser | Move the loop into a `bun script.ts` invocation, or use Monitor with a check that uses no `$(…)` (e.g. `until test -f /path/sentinel; do sleep 2; done`) |
| `cmd1 \| $(cmd2)` / `` `cmd2` `` anywhere | "Contains command_substitution" / "Contains expansion" | Capture intermediate output to a file (`cmd > file`) and Read it, or chain in `bun script.ts` |
| `<<EOF … EOF` heredocs | Trips the bash sandbox via `/proc/self/fd/3` | Use the Write tool to create the file, then reference its path |
| `bash foo.sh` / `./foo.sh` | Wrapper scripts trip the sandbox even with `dangerouslyDisableSandbox: true` | Invoke the interpreter directly: `bun foo.ts`, `node foo.mjs`, `python3 foo.py` (these aren't classified as wrappers) |
| `cd /tmp/foo && …` | The session has a working-directory allowlist that may not include the target | Use absolute paths in every command instead of `cd` |
| Bash tool param `timeout_ms: …` | Returns `InputValidationError: An unexpected parameter timeout_ms was provided` | Use `timeout` (milliseconds). Default 120000; pass `timeout: 600000` for a 10-minute cap. |
