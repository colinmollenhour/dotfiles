---
name: agy-cli
user-invocable: false
description: 'Shell out to the agy (Antigravity) CLI for headless Gemini runs: tasks, reviews, structured output.'
allowed-tools: Bash(agy *)
---

# Antigravity CLI (agy)

Use the `agy` CLI to send prompts to Gemini models (and the other models agy hosts) from shell-based workflows. Typical callers are MBOT/MBOD participants, megamind planning or fix agents, and one-off second opinions. For image generation and editing, use the `nano-banana` skill instead.

If you are agy yourself, do not use this skill: use native subagents (`define_subagent` / `invoke_subagent`) instead of starting a second agy process.

Behaviour below was verified against agy 1.5.17 with the `gemini-4-argon` family. Check `agy --help` when the installed version differs.

## Prerequisites

```bash
agy --version           # e.g. 1.5.17
agy models              # live model ids, e.g. gemini-4-argon-medium
```

agy keeps config, logs, conversations and auth under `~/.gemini/antigravity-cli/`, and it must be able to write there. In a sandbox where home is read-only, every call fails with `read-only file system` and `You are not logged into Antigravity`, even when the user is logged in. Run agy outside the harness sandbox; ask the user for approval if the harness requires it. If auth fails there too, ask the user to run `agy` interactively and log in.

## Headless Invocation

`--print` (`-p`) runs one prompt non-interactively. It does not read the prompt from stdin, and `-` is treated as the literal prompt text. Open stdin does not hang it.

```bash
agy --model gemini-4-argon --effort high \
  --output-format json \
  --print "Reply with exactly: AGY_OK" \
  > .tmp/<run-id>/results/agy.json 2> .tmp/<run-id>/results/agy.err
```

### Long prompts (files)

argv is capped at 128 KiB per argument (`Argument list too long`). For a prompt file, send it as one stream-json turn on stdin. `--print ""` is still required because the flag needs a value, and stream-json input requires stream-json output:

```bash
jq -Rsc '{event:"user",message:{content:[{type:"text",text:.}]}}' .tmp/<run-id>/agy.md \
  | agy --model gemini-4-argon --effort high \
      --input-format stream-json --output-format stream-json --print "" \
      > .tmp/<run-id>/results/agy.jsonl 2> .tmp/<run-id>/results/agy.err
jq -r 'select(.event=="result").result.response' .tmp/<run-id>/results/agy.jsonl
```

This was tested with a 240 KB prompt. Every NDJSON line is a separate turn in the same conversation, so several lines make a scripted multi-turn session. Only `"type":"text"` content blocks are accepted, and the `message` field must be an object, not a string.

## Key Flags

| Flag | Purpose |
| --- | --- |
| `-p, --print <PROMPT>` | Single non-interactive run. |
| `--model <ID>` | An id from `agy models` (`gemini-4-argon-medium`) or a base name plus `--effort` (`gemini-4-argon`). The display name (`"Gemini 4 Argon (High)"`) also works. |
| `--effort <LEVEL>` | `low`, `medium`, `high`, `xhigh`, `max`. Use it only with a base model name: `gemini-4-argon-medium --effort high` fails with `conflicts with --effort`. Argon supports `low`, `medium` and `high`; `xhigh` fails with `has no "xhigh" effort`. |
| `--output-format <FMT>` | `text` (default), `json` (one result object) or `stream-json` (NDJSON events). |
| `--input-format stream-json` | Read the turns from stdin (see above). |
| `--json-schema <JSON\|PATH>` | Enforce structured output. Needs `json` or `stream-json` output. The parsed value is in `.structured_output`. |
| `--mode <MODE>` | `plan` (read-only, see Permissions), `accept-edits` or `auto`. |
| `--dangerously-skip-permissions` | Auto-approve every tool. |
| `--settings <JSON\|PATH>` | Settings for this run only, e.g. `'{"toolPermission":"request-review"}'`. |
| `--print-timeout <DUR>` | Wall-clock cap, e.g. `10m`. On expiry it exits 3 with `finished_reason: "print_timeout"`. |
| `--conversation <ID>` | Resume a conversation, using the `conversation_id` from json output. `-c` / `--continue` resumes the most recent one, which is unsafe when runs happen in parallel. |
| `--add-dir <DIR>` | Add a workspace directory (repeatable). |
| `--disable-slash-commands` | Keep a prompt that starts with `/` from expanding as a slash command or skill. |

The working directory is the shell cwd. There is no `--cwd` flag, so `cd` first.

## Models

Resolve the ids with `agy models`; the list changes. At the time of writing it included the `gemini-4-{neon,carbon,argon,hydrogen}-<effort>` and `gemini-3.8-flash-<effort>` models, plus Claude and GPT-OSS models routed through Antigravity. Do not invent ids. An unknown id exits 1 and prints the available names on stderr.

Prefer `--model <base> --effort <level>` in scripts, so the effort is a separate parameter.

## Permissions

The tool policy comes from the user's `~/.gemini/antigravity-cli/settings.json` (`toolPermission`). Print mode does not override it, so the same command behaves differently on different machines:

- `always-proceed`: tools run without asking, including shell commands, network access and writes **outside** the cwd.
- `request-review`: print mode cannot prompt, so it **auto-denies** the tool. It still exits 0 with `status: "SUCCESS"` and an empty `response`, and prints only a `no output produced` note on stderr.

Choose the policy explicitly instead of inheriting it:

| Task | Flags |
| --- | --- |
| Review, critique, research (read-only) | `--mode plan`. Reads files and runs read-only commands such as `git diff`, refuses edits and side-effecting commands, and writes only an `implementation_plan.md` artifact under `~/.gemini/antigravity-cli/brain/`. Reviews worked under both `always-proceed` and `request-review`. |
| Unattended edits (MBOT fix slots, megamind workers) | `--dangerously-skip-permissions`. It overrides even `request-review`. |

`--sandbox` is **not** a safety boundary. In testing it still allowed writes outside the cwd, `touch` outside the workspace and outbound `curl`. Use `--mode plan`, or a separate worktree or copy, to contain a run.

## Output and Success Checks

`json` output is one object:

```json
{"conversation_id":"…","status":"SUCCESS","response":"…","duration_seconds":6.7,
 "num_turns":1,"usage":{"input_tokens":12980,"output_tokens":7,"thinking_tokens":0,…}}
```

With `--json-schema`, it also has `structured_output`. `stream-json` emits `init` (model, cwd, tool list, `permission_mode`), `step_update` (text deltas) and a final `result` event with the same shape.

Treat a run as successful only when **all** of these hold:

1. The exit code is `0`. Observed failures: `1` for a bad model or effort, a bad flag value, or bad stream input; `2` for a usage error; `3` for `--print-timeout`.
2. `.status == "SUCCESS"`.
3. `.response` (or `.structured_output`) is non-empty. An empty success usually means a tool was auto-denied (see Permissions).

On failure the json output still has `status: "ERROR"` and an `error` string, and stderr repeats it, sometimes as an `AGY_ERROR: {…}` line with `retryable`. Record both, then substitute a backup participant when one is configured.

When agy runs with a writable home, stderr is empty on success. Glog lines (`I1125 …`, `W1125 …`) mean it is running in the read-only-home sandbox.

Response quirks:

- File references come back as Markdown links with `file:///abs/path#Lnn`. Strip them, or ask for plain `path:line` text, if the output goes into a tool that expects plain text.
- `response` can include the agent's progress narration ("I will inspect…") before the answer. For strict machine-readable output, use `--json-schema`.

## Efficiency Tips (batch / multi-agent)

1. Write the task to `.tmp/<run-id>/<participant>.md` inside the project and send it with the stream-json stdin form. Do not ask the model to read a large shared file mid-run.
2. Launch independent participants as parallel processes. Each run is its own conversation; two concurrent argon runs in one repo worked.
3. Expect a baseline of about 13k input tokens per turn (system prompt plus tool definitions). A trivial reply takes about 5 s; a small code review at `high` takes about 1 minute.
4. Set `--print-timeout` for each participant so one hung run cannot stall the batch.
5. Use `--conversation <id>` for follow-up turns, such as repair after a schema miss, instead of re-sending the whole context.

## Caveats

- The tool surface is large: shell, file editing, browser automation, web search, MCP, subagents (`invoke_subagent`, `define_subagent`), scheduling and image generation. No flag restricts single tools. To block specific commands, pass deny rules, e.g. `--settings '{"permissions":{"deny":["command(git push)"]}}'`. The tool then fails with `Matches user-configured deny rule`, even under `always-proceed`.
- Conversations persist under `~/.gemini/antigravity-cli/conversations/` and appear in the user's agy history.
- Auth and model availability belong to the machine running `agy`.
