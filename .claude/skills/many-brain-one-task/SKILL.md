---
name: many-brain-one-task
description: Run the same task with multiple agents simultaneously. Good for reviews, critiques, comparing models. Abbreviated as "MBOT"
allowed-tools: Bash(bun *)
---

# Many Brain One Task

This Skill helps solicit, gather and analyze multiple "opinions" from different AI models or even agents.

# Instructions

## Step 1: Determine the models/agents to use.

These may have been listed in the prompt already, or they may be assumed from the User Preferences if not specified.

### User Preferences

Determine the preferences file to load.

Order of precedence:
- If the user prompt specifies `--profile X` then `X` is the profile name.
- If the task falls into one of these buckets, then that is the profile name:
  - code-review
  - critique
- Otherwise the profile name is `default`

Load the profile file (the profile name with `.md` suffix) from this skill's directory. If the custom profile file does not exist then load `default.md` and if that file does not exit, just use the defaults as specified below.

#### Defaults (no profile loaded)

Preferred harness: OpenCode

- Primary models:
  - Opus (via claude cli)
  - GPT (via OpenCode)
  - Gemini (via OpenCode)
- Backups (via OpenCode):
  - GLM
  - Qwen
  - MiMo
  - Kimi
  - Grok

### How to run

Not all agents can run subagents with other models. The agents and harnesses available will vary by user. For example:

- Claude Code must use another harness such as OpenCode for non-Claude models
- Codex must use another harness for non-OpenAI models
- Gemini must use another harness for non-Gemini models
- OpenCode **must** use Claude Code (`claude`) for Claude models (Opus, Sonnet, Haiku) but can likely use subagents for all other models (unless the user preferences specify otherwise)

- The user may have specified their preferred harness for a given model such as "Use `codex` CLI for OpenAI models".
  These rules will be specified in the User Preferences file if loaded, otherwise just prefer to use OpenCode as available.

Translate the user's preferences into a plan for launching the agents.

For OpenCode running models via OpenCode, use the "task" tool by specifying a `subagent_type` from the available sub-agents with names that start with "colin-mbot-". DO NOT use other agents that do not start with "colin-mbot-". For example, you can use "colin-mbot-glm" if the user has specified "GLM" as a desired participating agent. This automatically runs with the correct model.

**When Claude Code is the host**, the `colin-mbot-*` subagents are NOT exposed in the Agent tool's `subagent_type` enum — they're OpenCode subagents only reachable from inside OpenCode. From Claude Code, shell out through the bundled wrapper script described below. For Claude models, use the Claude Code Agent tool directly (`Agent({subagent_type: "general-purpose", model: "opus"})`) rather than shelling out to the claude CLI — the claude-CLI form is a fallback.

#### Invoking OpenCode (the only supported form)

Every OpenCode call from this skill goes through `run-opencode.ts`. It normalizes the flags that have tripped us in the past (file vs argv, the `--` separator, `--dir .` in attach mode, `--format json` parsing, `--dangerously-skip-permissions` for local spawns) so callers only pass what varies. Invoke it inline in a single Bash call (wrapper `.sh` forms trip the Claude Code sandbox even with `dangerouslyDisableSandbox: true`):

```bash
bun "${CLAUDE_SKILL_DIR}/run-opencode.ts" \
  --model opencode/gemini-3.1-pro \
  --variant xhigh \
  --title "ultra-review !2514 craft/Gemini-3.1-Pro" \
  --file .tmp/ultra-review-2514/craft.full.md \
  --attach http://seamus:4095 \
  --out .tmp/ultra-review-2514/results/craft-gemini.out \
  -- "Perform the code review exactly as instructed."
```

Flags:

| Flag | When to pass | Notes |
|---|---|---|
| `--model <provider/model>` | always | e.g. `opencode/gemini-3.1-pro`, `zai-coding-plan/glm-5.1`. Prefer coding plans over `openrouter/` and `opencode/` when available. |
| `--variant <name>` | when the model supports it | `xhigh`, `high`, `max`, `minimal`, etc. — provider-specific reasoning effort. |
| `--title <str>` | always | Session title in the opencode UI. Include a stable prefix so batch runs are groupable. |
| `--file <path>` | always | Path to the full prompt. Repeatable. See "`.tmp/` must be inside the project root" below. |
| `--attach <url>` | when the profile says so | Server URL, e.g. `http://seamus:4095`. Script auto-adds `--dir .`. |
| `--password <pw>` | attach with auth | Otherwise `OPENCODE_SERVER_PASSWORD` is used. |
| `--dir <path>` | rare override | Default is `.` in attach mode, unset in local mode. |
| `--out <path>` | usually | Write assistant text to this file. Parent dirs are created. Without it, text is written to stdout. |
| `--stderr <path>` | on failures | Capture the opencode stderr to a file for diagnosis. |
| `--format default\|json` | rarely | Defaults to `json`. In `json` mode the script extracts and concatenates every `text` event; `default` passes through as-is. |
| `--thinking` | rarely | Forward `--thinking` to opencode. |
| `--agent <name>` | rarely | Forwarded verbatim. Omit by default — opencode's default agent is fine. |
| `-- <message>` | always | Positional short message after `--`. Keep it brief; the real instructions go in `--file`. |

What the script does **not** handle: choosing the model, choosing whether to attach, writing the prompt file. Those are still caller decisions.

#### Building the per-role prompt files

Ultra-review-shaped flows (or any pattern that sends the same MR context to multiple role-specific prompts) tend to repeat a template: write `bucket.md` once with the shared MR context, write one `role-<name>.md` per role, then concatenate each role file with the bucket. A bundled helper does all the concatenations in a single call:

```bash
bun "${CLAUDE_SKILL_DIR}/assemble-prompts.ts" \
  --append .tmp/ultra-review-2514/bucket.md \
  --out-dir .tmp/ultra-review-2514 \
  .tmp/ultra-review-2514/role-bugs.md:bugs.full.md \
  .tmp/ultra-review-2514/role-runtime.md:runtime.full.md \
  .tmp/ultra-review-2514/role-craft.md:craft.full.md
```

Each positional is `<source>:<output-name>` and produces `<out-dir>/<output-name>` containing the source followed by the `--append` file. Prints a compact JSON summary (`out_dir`, `append_bytes`, per-output `{out, source, bytes}` and any `error`). `--append` is optional; without it the helper is just an atomic multi-copy. Saves the caller from chaining N `cat` calls and gives one JSON object to parse for byte counts.

Other harnesses may be invoked via a shell command directly:

- `claude --agent general --model opus --print --output-format text --name "MBOT: Code review for X" --effort max "PROMPT_HERE"` (fallback only — prefer the Agent tool when Claude Code is the host)
- `codex exec -c model="gpt-5.4" --ephemeral "PROMPT_HERE"`
- `codex review -c model="gpt-5.4" --base <branch> > ./.codex-review.txt 2>&1`
- `gemini --model gemini-3.1-flash-lite-preview --prompt "PROMPT_HERE"`

It may be helpful to instruct the agent to use markers to help parse the output for the "Gather and summarize" step at the end.

#### Caveats that still apply

- **`.tmp/` must be inside the project root, not `$TMPDIR`.** opencode has its own permission system (separate from the Claude Code sandbox) that auto-rejects reads outside the project with `permission requested: external_directory; auto-rejecting`. Keep prompt files inside a gitignored `.tmp/` in the project. `$TMPDIR` also resolves to different paths in sandboxed vs sandbox-disabled Bash calls, so files created in one may be invisible to the other.
- **Sandbox escape.** `bun "${CLAUDE_SKILL_DIR}/run-opencode.ts" …` from Claude Code may still need `dangerouslyDisableSandbox: true` depending on the host's `sandbox.filesystem.allowWrite`. opencode writes to `~/.local/share/opencode/`; if that path is not in `allowWrite`, the SQLite `PRAGMA wal_checkpoint` fails. The Seamus bot's `gitlab-settings.json` already allows `~/.local/share`, but other hosts may not.
- **Model availability varies by plan.** `opencode models` lists everything the install knows about, but some return `Error: Model is disabled` at runtime (e.g. `opencode/gpt-5.4-nano` on certain plans). If a profile names a model, verify it with a trivial prompt before launching a batch.
- **`--file` is more reliable than "Read /path/..." in the prompt body.** When the prompt tells the model to use the Read tool to fetch a large file, some models (observed with Gemini 3.1 Pro and GLM 5.1) silently terminate after 3-4 chunk reads without producing any ISSUE blocks. Attaching via `--file` sidesteps that.

#### Sandbox-friendly Bash patterns

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

#### Line-number caveat for code reviews

When the shared prompt concatenates instructions + AGENTS.md + a large diff, some models (observed with GLM 5.1) report line numbers relative to the prompt file rather than the real source file. During the validation step, re-anchor any finding whose line number exceeds the actual file length before trusting the citation.

#### Running codex

- `codex review` does not support `--ephemeral`
- `codex review` requires `--base <branch>`
- When running `codex review` from Claude, you must disable sandbox because Codex writes session files during review runs

#### OpenCode model names

When using `opencode`, resolve model names with `opencode models` if the user did not specify the exact name. For example, "GLM 5.1" might resolve to `zai-coding-plan/glm-5.1` or `openrouter/z-ai/glm-5.1` depending on which connections are available. Prefer coding plans over `openrouter/` and `opencode/` when available unless otherwise specified.

#### OpenCode server attach (optional)

If the user's profile contains an **attach directive**, prefer attaching to a running OpenCode server instead of spawning a fresh local opencode per agent. This is much faster and avoids reloading provider config / session DB on every invocation.

**Recognize these prose forms in profiles** (case-insensitive):

- **Global** (applies to every OpenCode invocation in this MBOT run):

  ```
  Attach OpenCode to seamus:4095
  Attach OpenCode to http://seamus:4095 with password hunter2
  OpenCode attach: seamus:4095 (password: hunter2)
  ```

- **Per-agent** (overrides any global directive on that line only):

  ```
  - OpenCode with GLM 5.1 via attach seamus:4095
  - OpenCode with GPT-5.4 via attach http://seamus:4095 (password: hunter2)
  ```

**URL normalization:** if the directive is missing a scheme, prefix `http://` (e.g. `seamus:4095` → `http://seamus:4095`). Default opencode port is `4096`.

**Password:** optional. If `with password X` / `(password: X)` / `password: X` is present, pass `--password X` to `run-opencode.ts`. Otherwise omit the flag — `opencode` falls back to `OPENCODE_SERVER_PASSWORD` from the environment.

#### Dry Run

If the user specified `--dry-run` then do not actually run the review and instead just advise the user what the exact execution plan looks like using an abbreviated prompt (first ~100 characters) for readability.

## Step 2: Run them

Run the subagents and/or shell commands in parallel, passing the appropriate context in the prompt.
If any models or agents fail to execute, just skip it, note it in the summary and use a backup as specified by the user or the user preferences file (if loaded).

## Step 3: Gather and summarize

Collect the results and then apply the user's finalizing steps for the task if specified. Otherwise, the default finalizing task should be to summarize the findings in aggregate and also comparing models. Scrutinize the model's output, pick winners and losers and note any interesting differences.
