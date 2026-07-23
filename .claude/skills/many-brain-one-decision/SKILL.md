---
name: many-brain-one-decision
description: 'Run a multi-agent debate to compare options and converge on a decision.'
allowed-tools: Read, Write, Glob, Grep, Task, Bash(bun *), Bash(claude *), Bash(pi *), Bash(grok *), Bash(codex *), Bash(botctl *)
---

# Many Brain One Decision

This Skill runs a moderated debate across multiple AI agents and converges on one decision. The host thread owns the context, creates the decision brief, assigns each debater a distinct personality, evaluates each round, eliminates weak options, and repeats until all active debaters choose the same outcome or the maximum round count is reached.

Do not invoke the `many-brain-one-task` Skill recursively. Reuse its agent/profile conventions and helper scripts, but run this decision workflow directly.

## Instructions

### Step 1: Build The Decision Brief

Gather the decision context from the current chat thread. The agents should not need to reconstruct the conversation themselves.

Create a compact brief containing:

- The exact decision question.
- Relevant background and constraints.
- Evaluation criteria for what "best" means.
- The decision mode: `fixed-choice`, `open-proposal`, or `hybrid`.
- Candidate outcomes with stable IDs, usually `A`, `B`, `C`, etc., when the user provided choices or explicitly requested multiple choice.
- The maximum debate rounds. Default to 4 when unspecified; honor explicit user limits such as "in 3 rounds or less", "one round only", or `--rounds 2`.
- Any explicit user preferences, exclusions, or required follow-up work.

Use `fixed-choice` when the user gives a closed set of options or explicitly asks for multiple choice. Preserve the user's options and do not invent new ones unless the user permits a write-in option.

Use `open-proposal` when the user provides facts, context, or a problem statement and asks to propose, design, solve, recommend, or decide what to do. Do not force a premature option list. Let each debater independently propose a solution in round 1, then have the host cluster those proposals into candidate outcomes for subsequent rounds.

Use `hybrid` when the user provides initial options but also allows alternatives. Include the user's options and add `WRITE_IN` as an explicit option for round 1.

Ask one short clarification only when criteria are truly unknowable or the decision is high-stakes enough that guessing would be harmful.

Keep a `NO_DECISION` or `NONE_OF_THE_ABOVE` option only when rejecting all candidates is a legitimate outcome.

### Step 2: Select Agents

Use the same model/profile style as `many-brain-one-task`, but load it for this Skill.

Profile precedence:

- If the user specifies `--profile X`, use profile `X`.
- If the user specifies agents/models directly, honor those first and use the profile only for missing details.
- Otherwise use `defaults.md` from this Skill directory.
- If a requested profile is missing here, try the sibling `../many-brain-one-task/` directory for agent selection only.
- If no profile can be loaded, use the defaults listed below.

Default agents:

- Opus, preferably with max thinking, when a Claude agent/harness is available.
- GPT via OpenCode, preferably `colin-mbot-gpt`.
- Gemini Pro via OpenCode, preferably `colin-mbot-gemini-pro`.
- Grok via Grok CLI when `grok` is installed; otherwise OpenCode `colin-mbot-grok`.
- Qwen via OpenCode, preferably `colin-mbot-qwen`.
- Backups: Kimi, GLM, MiMo; Grok CLI preferred over OpenCode for Grok.

### Harness Routing

Route debaters according to the current host harness. From a non-OpenCode host (e.g. Claude Code), prefer `occtl run` to drive OpenCode-backed debaters; the sibling MBOT `run-opencode.ts` helper is the fallback when occtl is unavailable.

If the user requests `pi`, `Pi`, `Pi agent`, or a profile line like `Pi with current model`, select a Pi-backed debater. In the Pi package, Pi-backed debaters are the default unless the user or profile names specific non-Pi agents.

If the user requests `grok`, `Grok`, `Grok CLI`, `xAI Grok`, or a profile line like `Grok CLI with grok-4.5`, select a Grok-CLI-backed debater unless the line explicitly says OpenCode / `colin-mbot-grok`.

| Current host | Selected debater | Preferred route |
|---|---|---|
| Pi | Pi-backed debater | Prefer the `pi-fast-subagent` package `subagent` tool when available; otherwise run `pi --print < prompt.md` and save stdout as that debater's result. |
| Pi | Other debater | Follow the selected profile route. If unspecified in the Pi package, use Pi-backed debaters by default. |
| OpenCode | OpenCode-backed MBOT agent | Use the `Task` tool with the matching `colin-mbot-*` `subagent_type`. |
| OpenCode | Claude-backed debater | Prefer **`botctl prompt`** (load `botctl-prompt` skill or `botctl view-skill`) so usage stays on the Claude Max plan via a real TUI session. Fall back to the `claude` CLI if `botctl` is missing. Use `colin-mbot-opus` / `colin-mbot-sonnet` only if both fail or the user explicitly requests OpenCode-routed Claude. |
| OpenCode | Grok-backed debater | Use the `grok` CLI first so usage stays on the xAI plan. Use `colin-mbot-grok` only if the CLI does not work or the user explicitly requests OpenCode-routed Grok. |
| Claude Code | Claude-backed debater | Use Claude Code's native Agent tool when available with `run_in_background: true`; fallback to **`botctl prompt`** then the `claude` CLI. |
| Claude Code | Grok-backed debater | Use the `grok` CLI when available; fallback to OpenCode only if `grok` is missing/unauthenticated or the profile forces OpenCode. |
| Claude Code | OpenCode-backed MBOT agent | Use **`occtl run`** when the preflight succeeds; otherwise fall back to the sibling MBOT `run-opencode.ts` helper. Claude Code does not expose `colin-mbot-*` subagents directly. |
| Grok CLI | Grok-backed debater | Prefer native `spawn_subagent`; fallback to the `grok` CLI. |
| Grok CLI | Other debater | Follow the selected profile route (`claude`, `occtl run` / `run-opencode.ts`, `pi`, etc.). |


#### Pi debaters

Preferred path, when the `pi-fast-subagent` package is installed in the current Pi session: use its `subagent` tool to launch each debater as a focused child Pi agent. Give each child the round prompt file, fixed personality, and instruction to return the required `BEGIN_MBOD_JSON` block. Use foreground or background/parallel runs according to the package's available tool surface, but save each final result under the round's `results/` directory.

Fallback path, when `pi-fast-subagent` is not installed or no `subagent` tool is available: invoke Pi print mode with the round prompt on stdin.

```bash
pi --print < .tmp/many-brain-one-decision/<slug>/round-1/pi-pragmatic-operator.md \
  > .tmp/many-brain-one-decision/<slug>/round-1/results/pi-pragmatic-operator.out
```

If the profile pins a model or thinking level, pass it through to `pi`:

```bash
pi --print --model anthropic/claude-sonnet-4:high < .tmp/many-brain-one-decision/<slug>/round-1/pi-pragmatic-operator.md \
  > .tmp/many-brain-one-decision/<slug>/round-1/results/pi-sonnet-pragmatic-operator.out
```

A Pi-backed debater is successful when the command exits `0`, produces non-empty output, and the final block is parseable or repairable by the normal MBOD schema-repair path.

When a Pi-backed debater profile names a model but not an exact id, resolve it with `pi --list-models <specific-query>`. Keep the query narrow: use `pi --list-models gpt-5.5` for "GPT 5.5" instead of broad `gpt`, and `pi --list-models glm-5.1` for "GLM 5.1". Prefer exact provider/model ids and coding-plan or first-party routes over generic OpenRouter unless explicitly requested.

#### Preflight: prefer `occtl run` over `run-opencode.ts`

Before launching any OpenCode-backed debater from a non-OpenCode host, decide the invocation method once and reuse it for every round (cache as `OPENCODE_VIA=occtl` or `OPENCODE_VIA=run-opencode-ts`):

```bash
occtl --version            # must print >= 1.2.0 (occtl run was added in 1.2.0)
occtl ping                 # must exit 0 and print "OK <url>"
```

Treat occtl as available only when **both** checks pass and the version is ≥ `1.2.0`. If a profile has an attach directive (host / port / password), set `OPENCODE_SERVER_HOST` / `OPENCODE_SERVER_PORT` / `OPENCODE_SERVER_PASSWORD` before the `ping` so the check exercises the real target. Read `occtl view-skill | head -200` for the full feature surface (sessions, send, attach, worktrees).

Do not use non-MBOT subagents for debaters. If the host exposes `colin-mbot-*`, prefer those over shelling out except for Claude-backed and Grok-backed debaters, where the first-party `claude` / `grok` CLIs are preferred to keep usage on Max / xAI plans.

#### Preflight: Grok CLI

When any debater is Grok-CLI-backed, check once per MBOD run:

```bash
grok version               # must exit 0
```

Cache as `GROK_VIA=cli` on success. On failure, set `GROK_VIA=opencode` and use `colin-mbot-grok` / OpenCode for Grok debaters. Load the `grok-cli` skill for full flag reference.

#### Pre-launch Guard

Before launching any debater, check the selected model family against the current host harness:

- If the selected debater is Pi-backed, use the Pi debater route regardless of the current host. Prefer `pi-fast-subagent` when available in Pi; otherwise shell out with `pi --print < prompt.md`.
- If the selected debater is Grok-backed and `GROK_VIA=cli`, use the Grok CLI route (or native `spawn_subagent` when the host is Grok CLI). Do **not** use `colin-mbot-grok` unless the CLI path failed or the profile forces OpenCode.
- If the current host is OpenCode and the selected model is Claude-family (Opus, Sonnet, Haiku), **do not** use a `colin-mbot-*` subagent. Shell out through the `claude` CLI instead.
- If the current host is OpenCode and the selected model is non-Claude and non-Grok-CLI, use the matching `colin-mbot-*` subagent.
- If the current host is Claude Code and the selected model is Claude-family, use Claude Code's native Agent tool when available with `run_in_background: true`; fallback to the `claude` CLI.
- If the current host is Claude Code and the selected model is non-Claude/OpenCode-backed (and not Grok-CLI), drive OpenCode with `occtl run` when available; fallback to the sibling MBOT `run-opencode.ts` helper.
- If the current host is Grok CLI and the selected model is Grok-family, prefer native `spawn_subagent`; fallback to the `grok` CLI.

This guard overrides any generic `colin-mbot-*` mapping. In particular, never invoke Opus/Sonnet/Haiku as `colin-mbot-opus`, `colin-mbot-sonnet`, or similar from an OpenCode host unless the user explicitly requests OpenCode-routed Claude. Prefer `grok` over `colin-mbot-grok` whenever the Grok CLI preflight succeeds.

Common mappings:

| Requested model | Subagent type / CLI |
|---|---|
| GPT | `colin-mbot-gpt` |
| GPT Codex | `colin-mbot-gpt-codex` |
| Gemini Pro | `colin-mbot-gemini-pro` |
| Gemini Pro Zen | `colin-mbot-gemini-pro-zen` |
| GLM | `colin-mbot-glm` |
| Grok | **`grok` CLI** first; `colin-mbot-grok` only as OpenCode fallback |
| Kimi | `colin-mbot-kimi` |
| MiMo | `colin-mbot-mimo` |
| MiniMax | `colin-mbot-minimax` |
| Qwen | `colin-mbot-qwen` |

#### Grok debaters (`grok` CLI)

When `GROK_VIA=cli` (or the host is Grok CLI and you are shelling out), write the round prompt and launch:

```bash
grok --prompt-file .tmp/many-brain-one-decision/<slug>/round-1/grok-tech-bro.md \
  --always-approve \
  --output-format plain \
  --reasoning-effort high \
  --disallowed-tools Agent \
  > .tmp/many-brain-one-decision/<slug>/round-1/results/grok-tech-bro.out \
  2> .tmp/many-brain-one-decision/<slug>/round-1/results/grok-tech-bro.err
```

- Prefer `--prompt-file` so the full decision brief, personality, and `BEGIN_MBOD_JSON` schema are in the file.
- Use `--disallowed-tools Agent` (or `--no-subagents`) for debate rounds so the debater cannot spawn nested agents.
- Map `"max"` / `xhigh` effort to `--reasoning-effort max`; default debate effort to `high` when unspecified.
- Parse stdout for the `BEGIN_MBOD_JSON` … `END_MBOD_JSON` block as usual. On empty output or non-zero exit, apply the normal schema-repair / backup rules.
- If the host is Grok CLI, prefer native `spawn_subagent` with the same prompt content and still require the JSON block in the final report.

When the host is Claude Code and the selected debater is OpenCode-backed, prefer `occtl run` (with attach details supplied via env vars — `occtl` has no `--attach` flag):

```bash
OPENCODE_SERVER_HOST=seamus OPENCODE_SERVER_PORT=4095 OPENCODE_SERVER_PASSWORD=$OPENCODE_SERVER_PASSWORD \
  occtl run \
  --model openai/gpt-5.5 \
  --variant high \
  --title "MBOD round 1 gpt tech-bro" \
  --file .tmp/many-brain-one-decision/<slug>/round-1/gpt-tech-bro.md \
  --timeout 540000 \
  --out .tmp/many-brain-one-decision/<slug>/round-1/results/gpt-tech-bro.out \
  -- "Participate in the decision debate exactly as instructed."
```

If the preflight failed and `OPENCODE_VIA=run-opencode-ts`, fall back to the sibling MBOT helper script:

```bash
bun "${CLAUDE_SKILL_DIR}/../many-brain-one-task/run-opencode.ts" \
  --model openai/gpt-5.5 \
  --variant high \
  --title "MBOD round 1 gpt tech-bro" \
  --file .tmp/many-brain-one-decision/<slug>/round-1/gpt-tech-bro.md \
  --attach http://seamus:4095 \
  --timeout-ms 540000 \
  --out .tmp/many-brain-one-decision/<slug>/round-1/results/gpt-tech-bro.out \
  -- "Participate in the decision debate exactly as instructed."
```

When the host is OpenCode and the selected debater is Claude-backed, prefer **`botctl prompt`**. Load the `botctl-prompt` skill if already installed; otherwise run `botctl view-skill botctl-prompt` and follow it — do **not** install the skill. Fall back to the `claude` CLI only when `botctl` is unavailable.

```bash
# Preferred: botctl prompt (unique session-id per parallel debater)
botctl prompt \
  --source .tmp/many-brain-one-decision/<slug>/round-1/prompts/opus-pragmatic-operator.md \
  --cwd "$PWD" \
  --session "botctl-mbod" \
  --window "mbod-r1-opus-pragmatic" \
  --verbose \
  -- \
  --model opus \
  --effort max \
  --session-id "$(uuidgen | tr '[:upper:]' '[:lower:]')" \
  --name "MBOD round 1 opus pragmatic-operator" \
  > .tmp/many-brain-one-decision/<slug>/round-1/results/opus-pragmatic-operator.out \
  2> .tmp/many-brain-one-decision/<slug>/round-1/results/opus-pragmatic-operator.err

# Fallback when botctl is missing (load claude-cli skill for flags)
claude --agent general \
  --model opus \
  --print \
  --output-format text \
  --name "MBOD round 1 opus pragmatic-operator" \
  --effort max \
  "Participate in the decision debate exactly as instructed."
```

Keep all `.tmp/` prompt and result files inside the project root, following the MBOT caveats.

### Step 3: Assign Personalities

Each active debater gets exactly one personality, and that pairing stays fixed across rounds. If the user names personalities, use those first. If there are more named personalities than selected agents, add backup agents so each named personality is represented when possible. If there are fewer personalities than agents, generate additional distinct personalities.

Default personality pool:

- `keep-it-simple-stupid`: prefers the simplest viable option; distrusts complexity and cleverness.
- `tech-bro`: favors new, high-leverage tools and strong developer experience; may overvalue hype.
- `ambitious-first-principles`: thinks from fundamentals and long-term scale; accepts risk if upside is large.
- `bean-counter`: optimizes for cost, ROI, time-to-value, and operational efficiency.
- `paranoid-security`: threat-models everything; prioritizes safety, compliance, reversibility, and correctness.
- `pragmatic-operator`: favors what can ship and be maintained by the current team.
- `user-advocate`: centers the end user, support burden, accessibility, and trust.
- `contrarian`: argues against the apparent consensus to surface hidden failure modes.

If a personality references a real person, treat it as a high-level decision-making archetype, not an impersonation. Personalities should create useful pressure and varied reasoning, not low-quality roleplay.

### Step 4: Round 1 Prompts

Launch all debaters in parallel. Round 1 is independent: do not include other agents' opinions yet.

For `fixed-choice` mode, use this prompt shape for each debater:

```markdown
## Many Brain One Decision: Round 1 of [MAX_ROUNDS]

### Decision Question
[question]

### Decision Brief
[background, constraints, criteria]

### Options
- A: [option]
- B: [option]
- C: [option]

### Your Personality
You are `[personality-name]`.

[3-5 sentences describing values, style, and blind spots]

### Instructions
Argue from your assigned personality, but keep the reasoning useful and grounded in the decision brief.

You must:

1. Pick exactly one option ID.
2. Give a concise argument for your choice.
3. Score every option from 1-10.
4. Name any options you believe should be eliminated.
5. End with the required machine-readable block.

Required final block:

BEGIN_MBOD_JSON
{
  "choice_id": "A",
  "confidence": 0.78,
  "reasoning_summary": "One sentence summary in your assigned voice.",
  "scores": {
    "A": 9,
    "B": 6,
    "C": 3
  },
  "can_accept": ["B"],
  "should_eliminate": ["C"],
  "changed": false
}
END_MBOD_JSON
```

Do not allow hedging in the structured block. The prose may discuss nuance, but `choice_id` must be one surviving option ID.

For `open-proposal` mode, use this prompt shape for each debater instead:

```markdown
## Many Brain One Decision: Round 1 of [MAX_ROUNDS]

### Problem To Solve
[question or problem statement]

### Facts And Constraints
[background, constraints, criteria]

### Your Personality
You are `[personality-name]`.

[3-5 sentences describing values, style, and blind spots]

### Instructions
Propose your own solution organically. Do not wait for the host to provide options. Your proposal should be concrete enough that another agent could argue for or against it in later rounds.

You must:

1. Propose exactly one primary solution.
2. Give the solution a short name.
3. Explain why it fits the facts and constraints.
4. Identify the biggest risk or weakness in your own proposal.
5. State what evidence would change your mind.
6. End with the required machine-readable block.

Required final block:

BEGIN_MBOD_JSON
{
  "proposal_name": "Short solution name",
  "proposal_summary": "Concrete one-sentence solution description.",
  "confidence": 0.74,
  "reasoning_summary": "One sentence summary in your assigned voice.",
  "key_tradeoffs": ["tradeoff one", "tradeoff two"],
  "biggest_risk": "The main way this could fail.",
  "would_change_mind_if": "Specific evidence or constraint that would change your recommendation.",
  "changed": false
}
END_MBOD_JSON
```

For `hybrid` mode, use the fixed-choice prompt but include `WRITE_IN` as an option. If a debater chooses `WRITE_IN`, require the same `proposal_name` and `proposal_summary` fields used by open-proposal mode.

### Step 5: Moderate Each Round

After each round, the host thread parses the outputs and creates a moderator memo.

Extract:

- Each debater's model, personality, choice or proposal, confidence, scores when present, acceptable alternatives, and elimination suggestions.
- Vote count by option.
- Average score by option.
- The strongest argument for each still-active option.
- Any agent failures or unparsable outputs.

For `open-proposal` round 1, cluster the organic proposals into 2-5 candidate outcomes before checking consensus. Merge proposals that are materially the same even if they differ in wording. Preserve important variants when they imply meaningfully different implementation choices, risk profiles, sequencing, or tradeoffs. Assign stable option IDs to the clustered outcomes.

When clustering proposals, create a candidate slate with:

- Option ID.
- Name.
- Synthesized solution summary.
- Source debaters who proposed or substantially supported it.
- Main supporting argument.
- Main risk or unresolved question.

If all debaters independently propose materially the same solution in open-proposal round 1, treat that as consensus after the host names and summarizes the shared outcome. If proposals differ, continue with the clustered candidate slate in fixed-choice style for round 2 and later.

If a response lacks valid JSON, recover the choice from prose if obvious. If it is not obvious, ask that debater once for a schema-only repair. If it still fails, mark the debater inactive for that round and continue. Replace a failed debater with a backup only in round 1; after round 1, preserve continuity unless fewer than two debaters remain.

Consensus is reached only when all active debaters choose the same option ID. Do not declare consensus merely because one option has a majority or the best average score.

Eliminate weak options only when no consensus exists and the current round is less than the configured maximum round count. Apply these rules conservatively:

- Never eliminate the current vote leader.
- Never eliminate every option; keep at least one active option.
- Prefer keeping at least two options until a final convergence round unless there is unanimous support.
- Eliminate options with zero votes and an average score of 5 or lower.
- Eliminate options that are at least 2.5 average-score points behind the leader and are not listed as acceptable by any active debater.
- Eliminate options that a majority recommends eliminating and no debater chose.
- If the vote and score picture is essentially tied, eliminate nothing and ask the next round to break the tie.

### Step 6: Later Round Prompts

For each subsequent round, send the same debater/personality pairing a refined prompt containing the moderator memo and only the surviving options.

Use this prompt shape:

```markdown
## Many Brain One Decision: Round N of [MAX_ROUNDS]

### Decision Question
[question]

### Decision Brief
[background, constraints, criteria]

### Surviving Options
- A: [option]
- B: [option]

### Your Personality
You are `[personality-name]`.

[same personality paragraph as prior rounds]

### Previous Round Moderator Memo
[vote table, score table, strongest arguments, eliminated options, unresolved disagreement]

### Your Previous Position
[this debater's prior choice and reasoning summary]

### Instructions
Reconsider your position in light of the debate. You may stand firm or change your vote, but you must pick exactly one surviving option.

You must:

1. Address the strongest opposing argument.
2. Say whether your choice changed and why.
3. Score every surviving option from 1-10.
4. Name any options that should be eliminated.
5. End with the required machine-readable block.

BEGIN_MBOD_JSON
{
  "choice_id": "A",
  "previous_choice_id": "B",
  "confidence": 0.84,
  "reasoning_summary": "One sentence summary in your assigned voice.",
  "scores": {
    "A": 9,
    "B": 7
  },
  "can_accept": ["B"],
  "should_eliminate": [],
  "changed": true
}
END_MBOD_JSON
```

Run rounds until one of these happens:

- All active debaters choose the same option.
- The configured maximum round count has completed.

If only one option remains before consensus, run one final convergence round asking every active debater to choose it or explicitly argue for `NO_DECISION` if that option exists. If `NO_DECISION` does not exist, the single surviving option wins by elimination, but report that this was not unanimous consensus unless every debater chose it.

### Step 7: Finalize

The host thread makes the final call.

If consensus was reached, report the consensus option and the round. If no consensus after the configured maximum rounds, choose the winner by this order:

1. Highest final-round vote count.
2. Highest final-round average score.
3. Highest minimum score among debaters, as a least-regret tiebreaker.
4. Host judgment against the user's stated criteria.

Final response format:

```markdown
## Decision
**Outcome:** [option]
**Status:** Consensus in round N / Recommendation after [MAX_ROUNDS] rounds / Winner by elimination
**Confidence:** High / Medium / Low

## Final Tally
| Debater | Personality | Final Choice | Changed? | Confidence |
|---|---|---|---|---|

## Round Progression
| Round | Vote Split | Eliminated |
|---|---|---|

## Why This Won
[short synthesis of the decisive arguments]

## Dissent And Risks
[remaining objections, minority positions, or caveats]
```

If the user requested a follow-up artifact, such as an implementation plan, proposal, or recommendation memo, produce it after the decision summary.

### Dry Run

If the user specified `--dry-run`, do not launch agents. Show the planned question, options, evaluation criteria, debaters, personalities, number of rounds, and execution method.
