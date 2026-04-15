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

Determine the type of task:

- code-review
- critique
- comparison

Load `defaults.md` and a file named after one of the types above determined by the task context at hand, e.g. `code-review.md` - these files should be located in this skill's directory.
If no files are read, just use the defaults as specified below.

#### Defaults

Preferred harness: OpenCode

- Primary models:
  - Opus (via claude cli)
  - GPT (via codex cli if available, otherwise OpenCode)
  - Gemini (via gemini cli if available, otherwise OpenCode)
- Backups (via OpenCode):
  - GLM
  - Qwen
  - MiMo

### How to run

Not all agents can run subagents with other models. The agents and harnesses available will vary by user. For example:

- Claude Code must use another harness such as OpenCode for non-Claude models
- Codex must use another harness for non-OpenAI models
- Gemini must use another harness for non-Gemini models
- OpenCode must use Claude Code for Claude models but can likely use subagents for all other models

- The user may have specified their preferred harness for a given model such as "Use `codex` CLI for OpenAI models".
  These rules will be specified in the User Preferences file if loaded, otherwise just prefer to use OpenCode as available.

For OpenCode running models via OpenCode, use the "task" tool by specifying a `subagent_type` from the available sub-agents with names that start with "colin-mbot-". DO NOT use other agents that do not start with "colin-mbot-". For example, you can use "colin-mbot-glm" if the user has specified "GLM" as a desired participating agent.

Other harnesses may need to be invoked via a shell command:

- `claude --agent general --model opus --print --output-format text --name "MBOT: Code review for X" --effort max "PROMPT_HERE"`
- `codex [exec|review] --model gpt-5.4 --ephemeral "PROMPT_HERE"`
- `gemini --model gemini-3.1-flash-lite-preview --prompt "PROMPT_HERE"`
- `opencode run --agent general --model opencode/gpt-5.4 --variant xhigh --title "MBOT: Code review for X" "PROMPT_HERE"`

When running opencode via the CLI, use `opencode models` to find the correct model name from the available models if the user did not specify the exact model name. For example, "GLM 5.1" might resolve to 'zai-coding-plan/glm-5.1' or 'openrouter/z-ai/glm-5.1' depending on which connections are available. Prefer coding plans over openrouter/ and opencode/ when available.

## Step 2: Run them

Run the subagents and/or shell commands in parallel, passing the appropriate context in the prompt.
If any models or agents fail to execute, consider using backups as specified by the user or the user preferences file (if loaded).

## Step 3: Gather and summarize

Collect the results and then apply the user's finalizing steps for the task if specified. Otherwise, the default finalizing task should be to summarize the findings in aggregate and also comparing models. Scrutinize the model's output, pick winners and losers and note any interesting differences.

