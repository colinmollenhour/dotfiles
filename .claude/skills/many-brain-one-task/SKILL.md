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
- OpenCode must use Claude Code for Claude models but can likely use subagents for all other models

- The user may have specified their preferred harness for a given model such as "Use `codex` CLI for OpenAI models".
  These rules will be specified in the User Preferences file if loaded, otherwise just prefer to use OpenCode as available.

Translate the user's preferences into a plan for launching the agents. You may have to use a mix of sug-agents and bash commands.

For OpenCode running models via OpenCode, use the "task" tool by specifying a `subagent_type` from the available sub-agents with names that start with "colin-mbot-". DO NOT use other agents that do not start with "colin-mbot-". For example, you can use "colin-mbot-glm" if the user has specified "GLM" as a desired participating agent. This automatically runs with the correct model.

Other harnesses may need to be invoked via a shell command:

- `claude --agent general --model opus --print --output-format text --name "MBOT: Code review for X" --effort max "PROMPT_HERE"`
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
