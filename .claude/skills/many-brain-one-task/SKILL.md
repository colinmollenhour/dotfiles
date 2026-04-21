---
name: many-brain-one-task
description: Run the same task with multiple agents simultaneously. Good for reviews, critiques, comparing models. Abbreviated as "MBOT"
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

Translate the user's preferences into a plan for launching the agents. You may have to use a mix of sug-agents and bash commands.

For OpenCode running models via OpenCode, use the "task" tool by specifying a `subagent_type` from the available sub-agents with names that start with "colin-mbot-". DO NOT use other agents that do not start with "colin-mbot-". For example, you can use "colin-mbot-glm" if the user has specified "GLM" as a desired participating agent. This automatically runs with the correct model.

**When Claude Code is the host**, the `colin-mbot-*` subagents are NOT exposed in the Agent tool's `subagent_type` enum — they're OpenCode subagents only reachable from inside OpenCode. From Claude Code, shell out to `opencode run -m ...` per the pattern below. For Claude models, use the Claude Code Agent tool directly (`Agent({subagent_type: "general-purpose", model: "opus"})`) rather than shelling out to the claude CLI — the claude-CLI form is a fallback.

Other harnesses may need to be invoked via a shell command:

- `claude --agent general --model opus --print --output-format text --name "MBOT: Code review for X" --effort max "PROMPT_HERE"` (fallback only — prefer the Agent tool when Claude Code is the host)
- `codex exec -c model="gpt-5.4" --ephemeral "PROMPT_HERE"`
- `codex review -c model="gpt-5.4" --base <branch> > ./.codex-review.txt 2>&1`
- `gemini --model gemini-3.1-flash-lite-preview --prompt "PROMPT_HERE"`
- `opencode run --model openai/gpt-5.4 --variant xhigh --title "MBOT: Code review for X" --file .tmp/the-shared-detailed-prompt.md -- "SIMPLE PROMPT_HERE"`

It may be helpful to instruct the agent to use markers to help parse the output for the "Gather and summarize" step at the end.

#### Claude Code notes

When running a CLI agent, you must write the detailed shared prompt to a file since large prompts on the command line cause problems. Use the `.tmp/` directory in the project root as a scratch space instead of TMPDIR to avoid sandbox or permission issues. Example:

```
opencode run \
  --model opencode/gemini-3.1-pro \
  --title "ultra-review #58 craft/Gemini-3.1-Pro" \
  --dangerously-skip-permissions \
  --file .tmp/ultra-review-58/full-craft.md \
  -- "Perform the code review exactly as instructed. ..." \
  > .tmp/ultra-review-58/results/craft-gemini.out 2>&1
```

##### Common opencode pitfalls

- **Argument-list limit**: do not pass the prompt as a single argv string. `getconf ARG_MAX` lies — the effective limit is closer to ~100 KB once env vars are included, and long prompts fail with exit 126 "Argument list too long". Always use `--file path -- "short message"` or pipe via stdin.
- **The `--` separator is required, not optional**: `--file` is an array flag, so `opencode run --file FILE "msg"` silently parses `"msg"` as another filename and fails with `File not found: <your message text>`. The `--` between `--file ...` and the message is load-bearing.
- **`.tmp/` must be inside the project root, not `$TMPDIR`**: opencode has its own permission system (separate from the Claude Code sandbox) that auto-rejects reads outside the project with `permission requested: external_directory; auto-rejecting`. Either keep prompt files inside a gitignored `.tmp/` in the project, or pass `--dangerously-skip-permissions`. `$TMPDIR` also resolves to different paths in sandboxed vs sandbox-disabled Bash calls, so files created in one may be invisible to the other.
- **Sandbox**: every `opencode` invocation from Claude Code needs `dangerouslyDisableSandbox: true` — it writes to `~/.local/share/opencode/` which is outside the default write allowlist. Symptom is a SQLite error on `PRAGMA wal_checkpoint` from `opencode models` or `opencode run`.
- **Don't copy `--agent general` from the claude CLI example**: that's a Claude CLI flag. opencode's general agent is the default; passing `--agent general` triggers a harmless `agent "general" not found. Falling back to default agent` warning but otherwise does nothing. Just omit the flag.
- **Prefer `--file` over "Read /path/..." in the prompt body**: when the prompt tells the model to use the Read tool to fetch a large file, some models (observed with Gemini 3.1 Pro and GLM 5.1) silently terminate after 3-4 chunk reads without producing any ISSUE blocks. Attaching via `--file` is more reliable across models.
- **Model availability varies by plan**: `opencode models` lists everything the install knows about, but some return `Error: Model is disabled` at runtime (e.g. `opencode/gpt-5.4-nano` on certain plans). If a profile names a model, verify it with a trivial prompt before launching a batch.

##### Line-number caveat for code reviews

When the shared prompt concatenates instructions + AGENTS.md + a large diff, some models (observed with GLM 5.1) report line numbers relative to the prompt file rather than the real source file. During the validation step, re-anchor any finding whose line number exceeds the actual file length before trusting the citation.

#### Running codex

- `codex review` does not support `--ephemeral`
- `codex review` requires `--base <branch>`
- When running `codex review` from Claude, you must disable sandbox because Codex writes session files during review runs

#### OpenCode model names

When running `opencode` via the CLI, use `opencode models` to find the correct model name from the available models if the user did not specify the exact model name. For example, "GLM 5.1" might resolve to `zai-coding-plan/glm-5.1` or `openrouter/z-ai/glm-5.1` depending on which connections are available. Prefer coding plans over `openrouter/` and `opencode/` when available unless otherwise specified.

#### Dry Run

If the user specified `--dry-run` then do not actually run the review and instead just advise the user what the exact execution plan looks like using an abbreviated prompt (first ~100 characters) for readability.

## Step 2: Run them

Run the subagents and/or shell commands in parallel, passing the appropriate context in the prompt.
If any models or agents fail to execute, just skip it, note it in the summary and use a backup as specified by the user or the user preferences file (if loaded).

## Step 3: Gather and summarize

Collect the results and then apply the user's finalizing steps for the task if specified. Otherwise, the default finalizing task should be to summarize the findings in aggregate and also comparing models. Scrutinize the model's output, pick winners and losers and note any interesting differences.
