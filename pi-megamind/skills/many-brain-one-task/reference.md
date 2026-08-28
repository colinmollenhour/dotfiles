# Many Brain One Task — full reference

> **Agents:** start with the thin [SKILL.md](SKILL.md) and `mbot-run.ts`. This file is the deep reference (harness matrices, retry policy, sandbox patterns). Load sections on demand; do not paste the whole file into the parent session.

This skill helps solicit, gather and analyze multiple opinions from different AI models or agents.

# Instructions

## Step 1: Pick and record the participants

If the prompt names specific models/agents, use those. Otherwise resolve exactly one profile.

### Profile precedence

1. `--profile X` in the prompt loads `X.md`.
2. A known task type (`code-review`, `critique`) loads the same-named profile.
3. Otherwise load `defaults.md`.

Profile names are exact. Do not silently substitute similarly named files such as `defaults.md`. If the selected profile is missing, try `default.md`; if that is also missing, use the built-in defaults below.

Before launching, write `.tmp/<run-id>/participants.json` containing:

- Requested and resolved profile names plus the resolved profile path
- Display name, exact model ID, provider, harness, reasoning/thinking effort, and backup for every participant
- Whether the participant was selected explicitly, from a profile, or as a backup
- Repository path and task type

Print the same resolved participant list in the pre-flight output. Never infer a successful model from a friendly display name after the run.

### Built-in defaults

Primary models (only when no profile is selected):
  - Opus (via Claude CLI / native Agent)
  - GPT (via OpenCode)
  - Grok (via Grok CLI when `grok` is available; otherwise OpenCode `colin-mbot-grok`)
Backup models: **Grok first**. Do **not** add Gemini, Kimi, GLM, MiMo, or Qwen as default primaries or backups unless the user or profile explicitly names them.

## Step 2: Pick the harness for each participant

The host harness (you, the one running this skill right now) limits which models can run as native subagents. For everything else, shell out. The user's profile may override these rules (e.g. "Use the codex CLI for OpenAI models" forces a specific CLI even when another mechanism is available) — profile rules win.

### Routing matrix

| Host        | Model family             | Mechanism                                                                                                  |
|-------------|--------------------------|------------------------------------------------------------------------------------------------------------|
| Pi          | `pi` agent requested      | Prefer the `pi-fast-subagent` package `subagent` tool when it is available; otherwise shell out with `pi --print` using the prepared prompt file. See [Pi](#pi). |
| Pi          | any other model family    | Follow the profile's requested CLI/harness. If unspecified in the Pi package, use Pi itself as the participant. |
| Claude Code | Claude (Opus/Sonnet/Haiku) | Native `Agent` tool (preferred) — falls back to **`botctl prompt`** (via `botctl-prompt` skill) or the `claude` CLI. See [Claude](#claude-opus--sonnet--haiku). |
| Claude Code | Grok                     | `grok` CLI (preferred). OpenCode `colin-mbot-grok` only if `grok` is missing/unauthenticated or the profile forces OpenCode. See [Grok](#grok). |
| Claude Code | other non-Claude         | Sibling `mbot-run.ts` (OpenCode slots). Do not hand-roll `occtl` / `run-opencode.ts`.                       |
| OpenCode    | Claude (Opus/Sonnet/Haiku) | **`botctl prompt`** (preferred when `botctl` is on PATH) or `claude` CLI — never `colin-mbot-*` for Claude. See [Claude](#claude-opus--sonnet--haiku). |
| OpenCode    | Grok                     | `grok` CLI (preferred). Fall back to `colin-mbot-grok` / `mbot-run` only when Grok CLI is unavailable or the profile says OpenCode. See [Grok](#grok). |
| OpenCode    | other non-Claude         | `mbot-run` OpenCode slots (GPT defaults `--variant high` and `--agent colin-mbot-gpt`). Do **not** use the OpenCode `task` tool for MBOT — it skips `--out` harvest and timeout salvage. |
| Grok CLI    | Grok                     | Native `spawn_subagent` (preferred) — falls back to the `grok` CLI. See [Grok](#grok). |
| Grok CLI    | non-Grok                 | Follow the profile's CLI/harness (`claude`, `mbot-run` for OpenCode, `pi`, `codex`, `gemini`). |
| Codex       | OpenAI                   | `codex` CLI native; shell out for everything else.                                                         |
| Gemini      | Gemini                   | `gemini` CLI native; shell out for everything else.                                                        |

When OpenCode is the host, GPT/OpenAI MBOT slots go through `mbot-run` (which passes `--agent colin-mbot-gpt`). Do not hand-pick `build`. Claude and Grok still prefer their first-party CLIs (`botctl` / `claude`, `grok`) over `colin-mbot-*`.

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

**Password:** optional. Put it on the plan (`"password"`) or in `OPENCODE_SERVER_PASSWORD`. `mbot-run` passes `--password` / `--attach host:port` to the launcher.

**Plumbing the directive:** put `attach` on `plan.json` (`"attach": "http://seamus:4095"` or `"seamus:4095"`). `mbot-run` passes `occtl run --attach host:port` (or `run-opencode.ts --attach <url>` if occtl is unavailable). Do not set `OPENCODE_SERVER_*` yourself and do not invoke either launcher from the parent session.

### Resolving OpenCode model names

If the user did not specify the exact model string, resolve it with `opencode models`. For example, "GLM 5.1" might resolve to `zai-coding-plan/glm-5.1` or `openrouter/z-ai/glm-5.1` depending on which connections are available. Prefer coding plans over `openrouter/` and `opencode/` when available.

## Step 3: Prepare reproducible prompt and result files

Write every prompt, participant record, output, and error log under `.tmp/<run-id>/` **inside the project root**. OpenCode rejects reads outside the project.

Recommended layout:

```text
.tmp/<run-id>/
  participants.json
  context/
  prompts/
  results/
    <slot>.out                 # prefer slot-keyed (no model token)
    <slot>.err
    <slot>.meta.json           # planned_model + actual_model + paths
    # legacy OK: <slot>-<model>.out when tooling already uses it
  run-summary.json
```

For role fan-outs, use the bundled helper to assemble prompt files. For example:

```bash
bun "${CLAUDE_SKILL_DIR}/assemble-prompts.ts" \
  --append .tmp/ultra-review-2514/context/bucket-index.md \
  --out-dir .tmp/ultra-review-2514/prompts \
  .tmp/ultra-review-2514/context/role-state.md:state.full.md \
  .tmp/ultra-review-2514/context/role-contracts.md:contracts.full.md \
  .tmp/ultra-review-2514/context/role-failure.md:failure.full.md \
  .tmp/ultra-review-2514/context/role-craft.md:craft.full.md
```

Each positional is `<source>:<output-name>`. Record the helper's byte counts in `run-summary.json`. Prefer a compact repository index plus tool-driven inspection over attaching an oversized concatenated diff.

If `--dry-run` is present, do not launch participants. Still resolve the exact profile, models, harnesses, efforts, backups, and prompt paths; print the execution plan and stop.

## Step 4: Launch and persist every participant

Launch independent participants in parallel. If one fails, record the failure and substitute a configured backup (see [Retry policy](#retry-policy) — do not unbounded-retry the same model).

Every participant, including native Claude/Pi/Grok subagents, MUST have its complete review body on disk at a stable **slot path** under `results/`. Do not leave results only in transient task notifications, tool output, or a harness session. The parent chat must not keep full review bodies — after persisting, retain only a ≤500-character status (path, exit, candidate/verdict counts).

### Output delivery contracts (do not mix)

There are two incompatible ways to get a body onto disk. Pick **one** per participant based on who owns the result file:

| Owner | Mechanisms | Body delivery | Final message / parent return |
|---|---|---|---|
| **Harness-owned** | `mbot-run` (`--out`), Grok CLI stdout redirect, `botctl prompt` stdout, `pi --print` stdout | Complete review in the **final assistant message** (or stdout). Harness is the sole writer of `.out`. | Full body (not a status stub) |
| **Agent-owned** | Native Claude `Agent` tool only | Child **Write**s the full review to the slot path | ≤500-char status: path + counts |

**Never** tell a harness-owned participant to Write the same path the harness will overwrite. Observed failure (GPT-5.6-Sol): model Write'd a full review to `--out`, then returned a short status as the final message; the launcher clobbered the file with that status. Fix: harness-owned prompts must say the complete review is the final assistant message and forbid writing the `--out` path.

#### Harness-owned delivery footer (append to every OpenCode / Grok / botctl / pi print prompt)

```markdown
## Output delivery (required)

This run uses a **harness-owned** result file. Put the full review (all
VERDICT / ISSUE / task markers) in your **final assistant message**.
Do not Write or Edit the results path — the launcher captures your final
message into that file when the session ends and will overwrite any
earlier Write to the same path.
```

OpenCode trailing positional (always include; keep the long instructions in `--file`):

```text
Emit the COMPLETE result as your final assistant message. Do not use the Write tool on the --out path; the harness captures your final message into that file.
```

#### Agent-owned delivery (native Claude `Agent` only)

```text
Write your FULL review to <absolute-slot-path>.out.
Return to the parent only a ≤500-char status: path + candidate/verdict counts.
```

### Slot identity, paths, and attribution

Treat **slot id**, **out path**, and **performer model** as three separate fields. Do not encode the performer solely in the filename and then score from that basename.

- **Preferred path shape (slot-keyed):** `results/<slot>.out` where `<slot>` is stable work identity without a model token — e.g. `b1-state`, `validate-6`, `integration`. Model names live in meta, not in the path.
- **Legacy path shape (model-suffixed):** `results/<slot>-<model>.out` (e.g. `validate-6-opus.out`) is still accepted when existing tooling uses it. If you keep this shape, **every reassignment must change the path to the actual model and rewrite any baked path in the prompt** (see [Retry policy](#retry-policy)).
- **Meta is source of truth for who worked:** write `results/<slot>.meta.json` (or `<out-basename>.meta.json`) **before or immediately after** each launch with at least:

```json
{
  "slot": "validate-6",
  "phase": "validation",
  "planned_model": "opus",
  "actual_model": "grok",
  "display_name": "Grok-4.5",
  "provider_model_id": "…",
  "harness": "grok-cli",
  "backup_used": true,
  "prompt": ".tmp/<run-id>/prompts/validate-6.md",
  "out": ".tmp/<run-id>/results/validate-6.out",
  "session_id": "…",
  "session_file": "/absolute/path/to/transcript",
  "started_at": "2026-08-22T05:10:01.000Z",
  "ended_at": "2026-08-22T05:18:22.000Z",
  "wall_ms": 501000,
  "cost_usd": 0.42,
  "cost_source": "grok_json",
  "exit": 0,
  "supersedes": null
}
```

Also record: reasoning effort, start/end time, and whether a backup was used. Scoring, Unique/Shared tables, and "who validated cluster X" **must** use `actual_model` from meta (or an updated plan entry) — never parse the performer from the `.out` basename alone. A file still named `-opus.out` may contain Grok/GPT work if a prompt was not rewritten on reassignment.

Treat a participant as successful only when the process/session completed and the persisted output contains non-whitespace assistant text (task markers such as `VERDICT:` / `<<<ISSUE>>>` when the task requires them). Structured issue markers such as `<<<ISSUE>>>...<<<END>>>` are recommended for deterministic aggregation.

When the parent maintains a run `STATE.json` (ultra-review and similar long multi-slot jobs), **only the orchestrator writes that file** — never a subagent.

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

Optional: `grok models` when the profile names a non-default model id. Cache success as `GROK_VIA=cli`. If `grok version` fails, set `GROK_VIA=opencode` and use the OpenCode path (`colin-mbot-grok` / `mbot-run`) for Grok participants.

#### Headless launch

Write the full task to a prompt file, then:

```bash
grok --prompt-file .tmp/<run-id>/grok.md \
  --always-approve \
  --output-format json \
  --session-id <uuid> \
  --reasoning-effort high \
  --disallowed-tools Agent \
  > .tmp/<run-id>/results/grok.out 2> .tmp/<run-id>/results/grok.err

`mbot-run` uses this form: `--output-format json` so `sessionId` / `total_cost_usd` land in `*.meta.json` and `*.out.session`; the harness writes `parsed.text` (not the JSON envelope) to `--out`. Do not invoke this from the parent session for MBOT slots.
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

Prefer the **`botctl-prompt`** skill for advanced agentic Claude shell-outs (observable tmux TUI, YOLO-safe blockers, multi-file packets, isolated `--session-id`). Load it before inventing flags:

```bash
# If installed as a Claude Code / agent skill, open the skill file.
# Otherwise print the copy bundled in the botctl binary (do not install):
command -v botctl >/dev/null && botctl view-skill botctl-prompt
```

If `botctl` is missing, fall back to the `claude-cli` skill / `claude --print` path below.

**Claude Code host** — prefer the native `Agent` tool for in-process Claude participants:

```ts
// Discovery / validation / integration / summarization: effort high (not max).
Agent({
  subagent_type: "general-purpose",
  model: "opus",
  // When the host exposes effort/thinking controls on Agent, set high.
  run_in_background: true,
  description: "...",
  // Agent-owned path only — do not use this Write+status pattern for OpenCode.
  prompt: "Write your FULL review to <absolute-slot-path>.out. Return to the parent only a ≤500-char status: path + counts. ...",
})
```

For discovery, validation, integration, and summarization Claude children, use reasoning effort **`high`** (CLI: `--effort high`; do not use `max`/`xhigh` unless the profile explicitly requires it). Keep the parent orchestrator at the host default.

If the `Agent` tool is unavailable, fall back to **`botctl prompt`** (preferred) or the `claude` CLI.

**OpenCode host** — do **not** use a `colin-mbot-*` subagent for Claude models. Prefer **`botctl prompt`** when `command -v botctl` succeeds; otherwise use the `claude` CLI. Do not skip `botctl` when it is installed.

#### `botctl prompt` (preferred shell-out)

```bash
# Short prompt
botctl prompt \
  --text "PROMPT_HERE" \
  --cwd "$PWD" \
  --session "botctl-mbot" \
  --window "mbot-opus-state" \
  --verbose \
  -- \
  --model opus \
  --effort high \
  --session-id "$(uuidgen | tr '[:upper:]' '[:lower:]')" \
  --name "MBOT: Code review for X"

# Multi-file / large packet (repeatable --source)
botctl prompt \
  --source .tmp/ultra-review/prompts/state.full.md \
  --cwd "$PWD" \
  --session "botctl-mbot" \
  --window "mbot-sonnet-state" \
  --verbose \
  -- \
  --model sonnet \
  --session-id "$(uuidgen | tr '[:upper:]' '[:lower:]')" \
  --name "MBOT: Code review for X"
```

Rules:

- Always pass a unique Claude `--session-id` (UUID) when running participants in parallel on the same cwd.
- Prefer unique `--window` names under a shared owning session (default `botctl`).
- stdout is the final assistant message only; persist it to the participant's required `.out` file and capture stderr separately with `--verbose`.
- On non-zero exit, the prompt window is left alive — inspect with `botctl capture --pane` / `botctl last-message --pane`.
- Swap `--model opus` for `sonnet` / `haiku` as appropriate.

#### `claude --print` fallback

```bash
claude --agent general-purpose --model opus --print --output-format text --name "MBOT: Code review for X" --effort high --append-system-prompt .tmp/ultra-review/prompts/state.full.md -- "PROMPT_HERE"
```

Use this only when `botctl` is unavailable or the profile explicitly requires headless `claude --print`.

### OpenCode

The parent session never invokes `occtl`, `opencode`, or `run-opencode.ts` for MBOT/MBOD slots. Write a `plan.json` with `harness: "opencode"` (or `"occtl"` — same path) and run:

```bash
# Claude Code host (blocking launch — give Bash timeout: 1320000):
bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" launch --plan .tmp/<run-id>/plan.json
bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" harvest --run-dir .tmp/<run-id>

# OpenCode host — MUST detach (120s bash timeout otherwise kills occtl children):
bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" launch --plan .tmp/<run-id>/plan.json --detach
bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" barrier --run-dir .tmp/<run-id> --timeout-ms 1200000
bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" harvest --run-dir .tmp/<run-id>
bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" candidates --run-dir .tmp/<run-id>
```

Launching a later phase plan (`plan-integration.json`, `plan-validate.json`) **merges** those slots into `plan.json`. It does not replace prior slots. Prompt/out may be `prompts/x.md` (relative to `run_dir`) or repo-relative `.tmp/<id>/prompts/x.md`; `mbot-run` strips a duplicated run-dir prefix. Always set `project_dir` to the repo root (inferred when `run_dir` is `<repo>/.tmp/<id>`).

`mbot-run` picks the transport once during smoke:

1. **`occtl run --attach host:port`** when `occtl --version` is ≥ `1.2.0` (HTTP API, session sidecar, timeout salvage). Local mode uses `occtl run --spawn`.
2. **`run-opencode.ts`** only if occtl is missing or too old.

Do not cache `OPENCODE_VIA` in the parent, do not `occtl ping` as a preflight, and do not load `occtl view-skill` for MBOT slots. Timeout recovery (`occtl last` after 124 / thin `.out`) is inside `launch` and `harvest`.

Default OpenCode wall-clock: **20 minutes** (`timeout_ms: 1200000` on the plan). `mbot-run` kills the child 2 minutes after that. If you ever wrap a **blocking** `mbot-run launch` in the host Bash tool, give Bash **22 minutes** (`timeout: 1320000`) so sidecars flush. On OpenCode, do not wrap a blocking launch at all — use `--detach` (new process group) then `barrier`. `setsid`/`nohup` from the parent is obsolete.

`occtl run --timeout` is **milliseconds**. Other occtl commands (`send`, `stream`, `wait-for-idle`) take **seconds**. That mismatch is why the parent must not call occtl itself.

Exit **124** with a rich body (VERDICT / ISSUE / `BEGIN_MBOD_JSON` / ≥2KB) is **success**. Harvest records `recovered: true` when it salvaged the body from the session after a timeout.

### Retry policy

Per slot `(role × model × bucket|integration|validate-N)`:

1. **At most one launch + one retry** of the same model. Prefer a configured **backup model** over a second retry of the same model. Backups must come from the profile (or built-in Grok); never invent experimental substitutes.
2. Retry only when `.out` is missing or empty **and** contains no complete `VERDICT:` (or equivalent task marker) line.
3. Give **every** re-launch a **distinct `--out` path** (e.g. `.retry.out` or a new slot-keyed attempt). Never overwrite a completed result.
4. Exit **124** (timeout), **130** (external SIGINT), or **143** (external SIGTERM) with a complete `VERDICT:` body is **success** — do not re-launch; fold the result in. Exit 130/143 with an incomplete body is a retry candidate under rule 1.
5. Absence of `.out`/`.err`/`.session` sidecars means the thread **never started** — fix the launch, do not wait forever on a Monitor.
6. Before scoring a model incomplete, re-stat and re-read `results/*.out` (late writers and 124-with-body are common).
7. Honor the profile wall-clock (default **20 minutes** per OpenCode thread). After budget + one retry, mark the slot failed/incomplete and continue — do not invent multi-hour curl/Monitor harvest fleets.

#### Backup / reassignment procedure (mandatory)

When substituting a backup or reassigning a slot to a different model:

1. Choose the backup from the profile (or built-in Grok). Do not invent substitutes.
2. Allocate a **new out path** for the actual performer. Prefer slot-keyed `results/<slot>.out` (model only in meta). If you use model-suffixed names, the new path must include the **actual** model (`validate-6-grok.out`), not the planned one (`validate-6-opus.out`).
3. **Rewrite or regenerate the prompt** so any baked output path and delivery contract match this launch. Never re-run a backup against a prompt that still says `Write … to …-opus.out` when Grok/GPT is launching. Observed failure: validation prompts baked `validate-N-opus.out`; reassigned Grok/GPT wrote into those `-opus.out` files and scoring would have credited Opus without a post-hoc remap.
4. Update plan / `STATE.json` / `*.meta.json` **before launch**: `planned_model`, `actual_model`, `out`, `prompt`, `backup_used`, and optional `supersedes` (path of an incomplete primary partial).
5. On harvest: attribute via `meta.actual_model`. If a rich body exists under a path whose basename model ≠ actual performer, record a remap in run accounting and score the actual model — do not invent a permanent hand-maintained `REASSIGNED` table as the only fix.
6. Incomplete primary partials may stay on disk for forensics; mark them superseded in meta so they do not steal credit.

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

## Step 5: Gather, verify, and summarize

Read results only from the persisted files under `.tmp/<run-id>/results/`; this proves every claimed participant completed and makes later validation reproducible. Compare the result set against `participants.json` and each slot's `*.meta.json`. Missing, empty, or failed primary outputs must be reported with their backup status and **actual** performer.

**Attribution:** per-model tables, Unique/Shared columns, and validation credit use `meta.actual_model` (or the updated plan entry), never the model token in a filename alone. Report every reassignment as `planned → actual` with paths. Flag any basename model ≠ `actual_model` mismatch in run accounting.

**Thin `.out` recovery (OpenCode):** do not hand-roll `occtl last`. `mbot-run harvest` already salvages from `<out>.session` (abort leftover sessions, then `occtl last`). If `meta.recovered` is true and the body is rich, count the slot complete.

Write `run-summary.json` with participant outcomes, planned vs actual models, prompt/output paths, candidate counts, reassignments, clobber/recovery events, and any task-specific validation results. Then apply the user's finalizing steps. Unless directed otherwise, aggregate findings, scrutinize evidence, compare models, and report both unique signal and false positives. Preserve raw outputs; never replace them with only the aggregate summary.

# Caveats

These apply to every OpenCode slot `mbot-run` launches.

- **`.tmp/` must be inside the project root, not `$TMPDIR`.** OpenCode has its own permission system (separate from the Claude Code sandbox) that auto-rejects reads outside the project. `$TMPDIR` also resolves to different paths in sandboxed vs sandbox-disabled Bash calls, so files created in one may be invisible to the other.
- **Sandbox write paths.** `bun "${CLAUDE_SKILL_DIR}/mbot-run.ts" …` from Claude Code may need `dangerouslyDisableSandbox: true` depending on the host's `sandbox.filesystem.allowWrite`. OpenCode writes to `~/.local/share/opencode/`; if that path is not in `allowWrite`, the SQLite `PRAGMA wal_checkpoint` fails. Seamus's `gitlab-settings.json` already allows `~/.local/share`; other hosts may not.
- **Model availability varies by plan.** `opencode models` lists everything the install knows about, but some return `Error: Model is disabled` at runtime (e.g. `opencode/gpt-5.4-nano` on certain plans). If a profile names a model, verify with a trivial prompt before launching a batch.
- **`--file` is more reliable than "Read /path/..." in the prompt body.** When the prompt tells the model to use the Read tool to fetch a large file, some models (observed with Gemini 3.1 Pro and GLM 5.1) silently terminate after 3-4 chunk reads without producing any ISSUE blocks. Attaching via `--file` sidesteps that.
- **Line numbers in code reviews.** When the shared prompt concatenates instructions + AGENTS.md + a large diff, some models (observed with GLM 5.1) report line numbers relative to the prompt file rather than the real source file. During validation, re-anchor any finding whose line number exceeds the actual file length before trusting the citation.
- **Harness-owned `--out` clobber.** `mbot-run` writes the final assistant message to `--out`. If the model Write's the full review to that path and returns a short status, the status can win unless the rich-file defense keeps the existing body. Use the harness-owned delivery footer; do not apply the native-Agent "Write + ≤500-char return" pattern to OpenCode.
- **Baked path + backup mis-attribution.** Prompts that embed `…-<model>.out` freeze the planned performer. On reassignment, rewrite the prompt and out path (or use slot-keyed paths + meta). Scoring from basenames will credit the wrong model.


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
| Bash tool param `timeout_ms: …` | Returns `InputValidationError: An unexpected parameter timeout_ms was provided` | Use `timeout` (milliseconds). Default 120000; for MBOT OpenCode threads pass `timeout: 1320000` (22 min) so it outlives the 20-minute script timeout. |
