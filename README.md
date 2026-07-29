# Colin's dotfiles

Personal dotfiles plus a batteries-included Claude Code config for shipping software with AI agents — slash commands for review, planning, and merging; skills for platform CLIs and common frameworks; and a multi-model review and audit toolkit (MBOT) that runs the same diff past Opus, GPT, Gemini, and friends in parallel.

## Highlights

- **Code review workflows.** `/colin-review` runs a focused single-agent review, while `/colin-ultra-review` fans out across MBOT models and roles, dedupes findings, and posts inline comments on GitHub PRs or GitLab MRs.
- **Spec critique and group decisions.** `/colin-critique` and the MBOD debate skill stress-test plans before you write code.
- **Production-readiness audit.** `/colin-ultra-audit` runs three roles (hardening, operability, stewardship) against the current repo state, grouped by severity.
- **Boring shell quality of life.** Sensible Bash, Git, tmux, Vim, Delta, and [Starship](https://starship.rs/) configs with non-clobbering installs for `.bashrc` and `.gitconfig`.
- **Yours to configure.** Models, harnesses, and providers come from plain-prose Markdown profiles you own.

## Contents

- [Quickstart](#quickstart)
- [What gets installed](#what-gets-installed)
- [Shell helpers](#shell-helpers)
- [VS Code dev containers](#vs-code-dev-containers)
- [AI tools reference](#ai-tools-reference)
  - [Agents](#agents)
  - [Slash commands](#slash-commands)
  - [Skills](#skills)
  - [Using MBOD](#using-mbod-many-brain-one-decision)
  - [Customizing MBOT](#customizing-mbot-your-models-your-harness)
  - [Typical flows](#typical-flows)
- [License](#license)

## Quickstart

Clone the repo and run `install.sh`. The script never overwrites `.bashrc` or `.gitconfig` — it appends an `include` directive so the `.colin` variants load alongside whatever you already have.

```bash
git clone https://github.com/colinmollenhour/dotfiles.git ~/.dotfiles
cd ~/.dotfiles

# Interactive — choose what to install
./install.sh

# Install everything
./install.sh --all

# Install only the AI agent configs
./install.sh --agents

# Install only the dotfiles
./install.sh --dotfiles

# Show every flag
./install.sh --help
```

**First-time install on an existing system** — if destination files already exist, an interactive run lets you keep, overwrite, back up, or diff each conflict. You can also keep or overwrite all remaining conflicts. Non-interactive runs skip conflicting files; pass `--force` to overwrite them all:

```bash
./install.sh --all --force
```

Subsequent runs are safe without `--force`: the script tracks which files it installed and their hashes, so it only updates files it owns that haven't been manually changed. Copied files retain the repository source's modification time, making a destination with a newer mtime an easy visual indicator that it was subsequently saved by a user; hashes remain the authoritative conflict check.

After installation, run `colin-help` for the cheat sheet of aliases, shortcuts, and tools. The same content lives at the [top of `.bashrc.colin`](https://github.com/colinmollenhour/dotfiles/blob/main/.bashrc.colin#L2).

## What gets installed

### Dotfiles

| File | Behavior |
|---|---|
| `.bashrc.colin` | Sourced from `.bashrc` (non-clobbering append) |
| `.gitconfig.colin`, `.gitignore.global`, `.gitattributes.global` | Included from `.gitconfig` (non-clobbering append) |
| `.tmux.conf`, `.vimrc`, `.config/starship.toml`, etc. | Installed and tracked — updated on future runs unless you've edited them locally |

The installer tracks every file it owns in `~/.local/share/colin-dotfiles/manifest`. On each run it:

- **Prompts** on conflicts in a TTY, with options to keep, overwrite, back up, or view a unified diff.
- **Skips** conflicting files in non-interactive runs and warns you (use `--force` to overwrite anyway).
- **Deletes** installed files whose source was removed from the repo, but only if you haven't modified them locally.

### Claude Code config

Slash commands, skills, agents, a status line, and worktree helpers install into `~/.claude/`. The `--agents` flag also mirrors them into `~/.opencode/` and the shared `~/.agents/skills/` directory used by agy, so the same commands work across harnesses.

## Shell helpers

- `colin-help` — list every alias, command, and tip.
- `note [text]` — display a styled terminal sticky note, prompting for its contents when text is omitted.
- `install-recommended`, `install-packages`, `update-packages` — package installers backed by `brew`, `npm`, `apt`, and raw `curl | bash`.
- Fuzzy finders for files, Git branches, Docker containers, processes to stop, SSH hosts, exported variables, and unset variables.

## VS Code dev containers

Drop this into your `settings.json` to auto-install on every dev container:

```json
{
  "dotfiles.repository": "colinmollenhour/dotfiles",
  "dotfiles.targetPath": "~/.dotfiles",
  "dotfiles.installCommand": "~/.dotfiles/install.sh --all"
}
```

---

# AI tools reference

A reference to the shared slash commands, skills, and agents in `.claude/`. Invoke slash commands directly (`/colin-review` for Claude Code, `/colin/review` for OpenCode). Skills load automatically when relevant or you can name them in a prompt.

## Concepts

- **Slash commands** (`/name`) kick off workflows. You type them.
- **Skills** are reusable procedures Claude loads on demand, often invoked internally by commands.
- **MBOT agents** are dedicated subagents backed by specific models. The review, critique, audit, and MBOD commands use them to gather multi-model opinions. Which models run, and through which harness, is driven by MBOT-style profile files — see [Customizing MBOT](#customizing-mbot-your-models-your-harness).

## Agents

### `megamind`

`megamind` is the autonomous large-task delivery agent. Give it an objective, spec, issue, task URL, or plan file, and it drives the work from intake to delivery with only one optional human checkpoint: review after a non-unanimous MBOD decision.

At a high level, it:

- Resolves the task source, records repo context, and creates a durable `.tmp/megamind-<slug>/` run directory for plans, critiques, decisions, agent reports, reviews, CI logs, and final delivery notes.
- Uses MBOT to critique the starting plan, then produces a refined implementation plan. If the plan has unresolved choices, it bundles them into one MBOD decision round, asks for human review only when the MBOD result is not unanimous, and folds the result into `plans/final.md`.
- Splits implementation into one to three disjoint work packages, creates the feature branch before implementation, launches coding agents, inspects their reports and diffs, runs integration checks, and commits each work package once its checks pass.
- Runs repository-aware ultra-review discovery across state/lifecycle, contracts/integration, and failure/security; validates every candidate against source evidence; performs whole-change convergence rounds; assigns fix work; and rechecks both the fix delta and final branch state. Megamind's Roborev integration is disabled by default. With `--roborev`, Megamind checks whether the repo is already enrolled, uses the existing daemon integration to review milestone commits, and drains failing reviews before the ultra review and after fix rounds.
- Runs final local gates, optionally drains remaining Roborev reviews when `--roborev` is active, pushes the branch's milestone commits, and opens or updates a GitHub PR or GitLab MR with artifact links and test results.
- Launches an educational synthesis sub-agent after the PR/MR exists, validates its claims against Megamind artifacts and diffs, then appends a dense journey/design/architecture/lessons brief to the PR/MR.
- Monitors CI after the PR/MR exists, fixes minor CI failures autonomously, optionally drains Roborev reviews of CI-fix commits when `--roborev` is active, and stops only when CI is green or a blocker file documents the exact evidence and next action.
- With `--evidence`, packages the completed run artifacts into a ZIP and attaches it to the PR/MR. Evidence packaging is skipped by default.

Use `megamind` for long-running work where the desired output is not just code, but a completed branch, review item, local gate results, and CI status. Use `--dry-run` to have it write the execution outline without launching agents or changing code, pass `--roborev` to opt into Roborev detection and review drains for an already enrolled repo, include `skip human review` to have it make the best call autonomously after a split MBOD result, or pass `--evidence` to attach the final artifact archive.

```mermaid
flowchart TD
    Request["User request: objective, spec, issue, or plan"] --> Intake["Resolve source and create .tmp/megamind run directory"]
    Intake --> Context["Capture repo context, dirty state, base branch, and local gates"]
    Context --> Critique["MBOT critique: contradictions, gaps, naming, and design risks"]
    Critique --> Plan["Planner writes second draft and readiness status"]
    Plan --> Decision{"Unresolved decisions?"}
    Decision -->|"Yes"| MBOD["MBOD debate chooses direction"]
    MBOD --> ReviewGate{"MBOD unanimous?"}
    ReviewGate -->|"No, unless skipped"| Human["Ask one human review question"]
    ReviewGate -->|"Yes"| FinalPlan["Write final implementation plan"]
    Human --> FinalPlan
    Decision -->|"No"| FinalPlan
    FinalPlan --> Split["Split into one to three disjoint work packages"]
    Split --> Branch["Create feature branch"]
    Branch --> Agents["Delegated coding agents implement assigned scopes"]
    Agents --> Integrate["Commit work packages and run integration checks"]
    Integrate --> RoboChoice{"--roborev active?"}
    RoboChoice -->|"Yes"| RoboDrain["Drain Roborev commit reviews"]
    RoboChoice -->|"No"| UltraReview["Ultra review: state, contracts, failure, integration"]
    RoboDrain --> UltraReview
    UltraReview --> Fixes{"Validated findings?"}
    Fixes -->|"Yes"| Fix["Fix agents; commit fix round and optionally drain Roborev"]
    Fix --> UltraReview
    Fixes -->|"No"| Gates["Run final local gates"]
    Gates --> Delivery["Optional Roborev drain, push milestone commits, open or update PR/MR"]
    Delivery --> Education["Generate and validate educational brief"]
    Education --> CI["Monitor CI, fix minor failures, optionally drain Roborev"]
    CI --> Evidence{"Evidence requested?"}
    Evidence -->|"Yes"| Archive["Package and attach evidence ZIP"]
    Evidence -->|"No"| Done{"Green CI or documented blocker"}
    Archive --> Done
```

### OMP and Pi package

This repo also includes `pi-megamind/`, an installable package for OMP and Pi. OMP runs `/megamind` in the current user-visible `Main` session and delegates only bounded work through native child agents:

```bash
omp install ./pi-megamind
omp
# Then type: /megamind <objective, plan file, issue URL, or task ID>
```

Try it for one OMP session without installing:

```bash
omp --extension ./pi-megamind
```

Pi remains supported:

```bash
pi install ./pi-megamind
```

The OMP route defaults MBOT/MBOD delegation to native `task` batches. The Pi route defaults to Pi-backed participants and prefers the lightweight `pi-fast-subagent` extension when available.

## Slash commands

### `colin-*` — day-to-day dev workflow (name-spaced to avoid conflicts)

#### Shipping

| Command | Use it when… |
|---|---|
| `/colin-commit-and-push` | You're done with changes. Commits, pushes, opens or updates a GitHub PR or GitLab MR. |
| `/colin-fix-comments` | Address open review comments on the current branch's PR or MR. Posts fixes, rebuttals, and a summary. |
| `/colin-fix-pipeline` | Diagnose and fix a failing GitHub Actions or GitLab CI pipeline on the current branch. |
| `/colin-fix-conflicts` | Resolve Git merge conflicts intelligently, preserving intent from both sides. |
| `/colin-squash-merge [branch]` | Squash-merge a branch onto trunk with one clean commit **per author**, each AI-summarized. |
| `/colin-git-cleanup` | Delete local branches that have been merged remotely (including squash-merges). |

#### Reviewing

Both review commands resolve the target the same way. Pass no argument to review the open PR or MR for your current branch. Otherwise the target accepts: a PR or MR URL or number, `last N commits`, `whole repo`, `branch NAME`, or a Git rev spec like `SHA..SHA`.

**`/colin-review [target] [flags]`** — standard single-agent review. Triages, buckets large diffs (≤ 5,000 lines runs as a single pass; otherwise ~3,000-line buckets grouped by top-level directory), reviews each bucket directly, validates and deduplicates issues, posts inline comments, and applies the `:Reviewed-By-AI` label. It does not use MBOT or `colin-mbot-*` agents; use `/colin-ultra-review` for multi-model fan-out.

| Flag | Effect |
|---|---|
| `--re-review` | Only review commits since the last `**AI Code Review**` comment on the PR or MR. |
| `--no-post` | Print comments to the terminal and wait for `post`, `drop issue 3`, `edit issue 2 to …`, or `cancel` instead of auto-posting. |
| `--no-summary` | Skip the review summary comment. |

In Git-diff mode (when the target is a rev spec rather than a PR or MR) the command always behaves as `--no-post` — nothing is posted, just displayed.

**`/colin-ultra-review [target] [agents] [flags]`** — the heavyweight, repository-aware variant. It runs **3 bug-hunting lenses × N models** per behavioral bucket: `state` (behavior and lifecycle invariants), `contracts` (callers, consumers, schema, and deployment compatibility), and `failure` (errors, concurrency, adversarial input, and security). A whole-change integration pass follows the buckets. Discovery favors candidate recall; an independent source-evidence pass decides what is safe to post. Fresh full-state integration rounds continue until a round finds no new confirmed issue or the configured cap is reached.

| Flag | Effect |
|---|---|
| `[agents]` (positional) | Model list for this run. Overrides the shipped MBOT `code-review.md` profile. |
| `--roles=state,contracts,failure` | Restrict discovery to specific lenses. Default is all three. |
| `--re-review` | Review both the fix delta since the last ultra review and the current full branch state. |
| `--max-rounds=N` | Cap fresh convergence rounds; default is 3. |
| `--no-post` | Display confirmed comments, unresolved candidates, and convergence status before posting. |
| `--no-summary` | Skip model, role, and round comparison tables. |

##### How ultra-review fans out across MBOT

Primary files are bucketed by behavior and data flow, targeting roughly 800–1,500 changed lines. Generated files, lockfiles, snapshots, fixtures, and vendored code remain available as context instead of disappearing. Small diffs may be embedded; larger reviews send a compact change index and require reviewers to inspect the exact base/head diff plus unchanged callers and consumers using read-only repository tools.

Buckets may run sequentially to bound load. Within a bucket, the three lenses invoke MBOT in parallel, and each MBOT call fans out to N models. Candidate findings then feed a full-participant integration pass and independent validation. Unique findings are retained unless source evidence disproves them.

```mermaid
flowchart TD
    User([User: /colin-ultra-review])
    Resolve[Resolve exact base/head, intent, and history]
    Index[Build change index<br/>primary targets + context-only artifacts]
    Buckets[Bucket by behavior and data flow]

    subgraph Discovery["Per-bucket discovery"]
        direction LR
        State["MBOT: state"]
        Contracts["MBOT: contracts"]
        Failure["MBOT: failure"]
    end

    Integrate["Whole-change MBOT integration pass"]
    Validate["Independent evidence validation<br/>confirmed · rejected · unresolved"]
    NewIssues{"New confirmed issues?"}
    Cap{"Round cap reached?"}
    Fresh["Fresh full-state integration round"]
    Summary["Model, role, and round summary"]
    Post["Post confirmed findings only"]
    Label["Apply :Reviewed-By-AI-Ultra"]

    User --> Resolve --> Index --> Buckets --> Discovery --> Integrate --> Validate --> NewIssues
    NewIssues -->|"No: clean round"| Summary
    NewIssues -->|"Yes"| Cap
    Cap -->|"No"| Fresh --> Validate
    Cap -->|"Yes"| Summary
    Summary --> Post --> Label

    classDef parallel fill:#dbeafe,stroke:#1e40af,color:#000
    classDef validation fill:#dcfce7,stroke:#166534,color:#000
    class State,Contracts,Failure parallel
    class Integrate,Validate,Fresh validation
```


**`/colin-critique [target] [flags]`** — adversarial multi-model critique of a spec or plan document, not code. Flags contradictions, gaps, poor naming, and inferior design choices. **Never** suggests scope expansion or "nice-to-haves". The target is a file path, `current plan` (the in-session plan), or a ClickUp TaskID. With no target, it searches for `SPECS-*.md` then `PLAN*.md`.

| Flag | Effect |
|---|---|
| `--agents opus gpt …` | Override the MBOT `critique` profile for this run. |
| `--summary` | Include a per-model comparison table (found, validated, unique, accuracy, composite score). |

**`/colin-ultra-audit [scope] [agents] [flags]`** — production-readiness audit of the **current repo state**, not a diff. Runs **3 roles × N models** per module bucket: `hardening` (security and resiliency), `operability` (observability, deployment, config, performance, dependencies), and `stewardship` (docs, tests, code quality). Findings merge and group by severity (`Blocker`, `High`, `Medium`, `Low`). Display only — no PR comments, no labels. Expensive — reserve for pre-launch or quarterly checkups.

| Flag | Effect |
|---|---|
| `[scope]` (positional) | `whole repo` (default), a path, comma-separated paths, or a glob. |
| `[agents]` (positional) | Model list for this run. Overrides the MBOT profile. |
| `--roles=hardening,operability,stewardship` | Restrict to specific roles. Default is all three. |
| `--save <PATH>` | Also write the rendered report to `<PATH>`. |
| `--no-summary` | Skip both the per-model and per-role comparison tables. |

#### Planning and porting

| Command | Use it when… |
|---|---|
| `/colin-finalize-spec` | Augment the current plan with the senior-SWE planning sections needed before implementation. |
| `/colin-feature-export <FEATURE>` | Generate a portable implementation guide for moving a feature to a sibling repo. |
| `/colin-handoff [PATH]` | Dump the current session context into a portable Markdown handoff doc. No tool calls, just context. |
| `/colin-progress` | Audit the in-scope task and keep working until it's actually 100% done. Forbids deferring parts of the spec. |

## Skills

Claude loads these automatically when a task matches, or you can reference them by name.

### Platform CLIs

- **`gh-cli`** — GitHub operations through `gh` (PRs, issues, runs, inline comments, raw API).
- **`glab-cli`** — GitLab operations through `glab` (MRs, pipelines, discussions, raw API).
- **`clickup-tasks`** — Create and update ClickUp tasks, custom fields, sprint work. Supports both CLI and MCP backends.
- **`github-security-advisories`** — End-to-end GitHub Security Advisory (GHSA) handling: validate a report, prepare advisory fields, push fixes to the GHSA private fork.

### Code generation and review

- **`many-brain-one-task`** (MBOT) — Run the same prompt across many models and compare or merge results. Powers `/colin-critique`, `/colin-ultra-review`, and `/colin-ultra-audit`. Configurable — see [Customizing MBOT](#customizing-mbot-your-models-your-harness).
- **`many-brain-one-decision`** (MBOD) — Coordinate a multi-round debate across MBOT agents with distinct personalities until they converge on a decision or hit the configured round limit. Use it for prompts like "decide which option is best", "debate this tradeoff", or "propose a solution to this problem".
- **`educational-brief`** — Creates grounded journey/design/architecture/lessons briefs for delivered PRs, MRs, branches, features, or agent runs.
- **`generate-e2e-test`** — Drives Playwright MCP through a workflow, then generates the E2E test code.
- **`security-hardening`** — App-level security review covering abuse prevention, rate limiting, business logic, and input validation. Beyond generic checklists.
- **`cli-design`** — Design and review CLIs against `clig.dev` guidelines: flags, help text, errors, and scriptability.
- **`docs-writer`** — Write or restructure technical docs against Diataxis, Google, Microsoft, and Write the Docs style guides.
- **`skill-writer`** — Author new `.claude` skills with correct frontmatter and structure.

### Frameworks and stacks

- **`coolify`** — Generate a `docker-compose.coolify.yml` for the current project using Coolify conventions and `SERVICE_*` secrets.
- **`drizzle-orm`** — TypeScript-first ORM patterns for Postgres, MySQL, and SQLite: schemas, queries, migrations, relations.
- **`nuxt-ui`** — Nuxt UI components. Fetches current docs from `ui.nuxt.com/llms.txt` so APIs are accurate.
- **`nuxt-content`** — Author Markdown and MDC content files for Nuxt Content sites.
- **`voltagent`** — Build VoltAgent AI agents: tools, memory, hooks, sub-agents.

### Media

- **`nano-banana`** — Required for any image generation or editing. Wraps the Gemini CLI.

## Using MBOD (Many Brain One Decision)

`many-brain-one-decision` reuses the same MBOT agent pool, but the host thread acts as a moderator instead of sending every model the exact same task. It gathers the current chat context into a decision brief, assigns each selected model a distinct debating personality, runs debate rounds in parallel, summarizes the results, eliminates weak options when appropriate, and returns a final decision with dissent and risks.

Example prompts:

```text
Use many-brain-one-decision to decide which pizza toppings are best in 3 rounds or less.
Use MBOD to debate whether we should use Postgres triggers, app-layer events, or a queue.
Use many-brain-one-decision to propose a solution to this scaling problem: [facts...]
```

### Decision modes

- **Fixed choice** — when the user gives explicit options or asks for multiple choice. MBOD preserves the supplied options and has each debater choose, score, and argue.
- **Open proposal** — when the user provides facts and asks to propose, design, or solve. Round 1 lets each debater organically propose a solution; the moderator clusters those proposals into candidate outcomes for later rounds.
- **Hybrid** — when the user gives initial options but allows alternatives. MBOD includes the supplied options plus `WRITE_IN`.

### Round behavior

- Default max rounds: 4.
- The user can override naturally: "in 3 rounds or less", "one round only", or `--rounds 2`.
- Consensus means all active debaters choose the same outcome.
- Without consensus by the final round, MBOD recommends a winner by vote count, average score, least-regret score, then host judgment against the stated criteria.

### Routing and profiles

Harness routing follows MBOT's rules with one cost-sensitive exception: Claude-backed debaters use native Claude agents or the `claude` CLI first so usage stays on the Claude Max plan. Use `colin-mbot-opus` or `colin-mbot-sonnet` only when the CLI does not work or the user explicitly requests OpenCode-routed Claude. Claude-hosted runs still use the sibling MBOT `run-opencode.ts` helper for OpenCode-backed debaters.

Profiles live in `~/.claude/skills/many-brain-one-decision/` and use the same plain-prose style as MBOT profiles. If an MBOD profile is missing, the skill falls back to the sibling MBOT profile for agent selection. Profile lines may also pin personalities:

```markdown
Use the following:
- OpenCode with GPT-5.6 Sol with "high" variant as "tech-bro"
- OpenCode with Grok 4.5 as "truth-seeker"
- Claude Opus with "max" thinking as "pragmatic-operator"
For OpenCode use `--attach seamus:4095`
```

## Customizing MBOT (your models, your harness)

**Set up your own MBOT profiles.** The defaults shipped in this repo are one person's preferences — your API keys, entitlements, and trust in specific models will differ. Every review, critique, and audit run consults these profile files to decide which models to launch and through which harness.

### How profile resolution works

When MBOT starts, it resolves exactly one profile:

1. An explicit `--profile X` loads `X.md`.
2. A known task type (`code-review` or `critique`) loads the same-named file.
3. Anything else loads `default.md`.
4. If the chosen file is missing, MBOT tries `default.md`; if that is also missing, it uses hardcoded defaults.

Profile names are exact: `defaults.md` is not an alias for `default.md`. The repo ships `default.md` and `code-review.md` beside `SKILL.md`; `install.sh --agents` copies them to each supported agent home.

Before launch, MBOT records the resolved profile path plus every participant's display name, exact model/provider ID, harness, reasoning effort, and backup in `.tmp/<run-id>/participants.json`. Every raw result and metadata record is persisted under `.tmp/<run-id>/results/`, including native subagent output.

### Shipped `default.md`

```markdown
Use the following:

- Claude CLI with the latest available Opus model at maximum reasoning effort
- OpenCode with OpenAI/GPT-5.6 Sol at high reasoning effort
- Grok CLI with Grok 4.5 at high reasoning effort
```

### Shipped `code-review.md`

The review profile uses the same model families, requires fresh independent sessions with read-only repository tools, and persists every final result. Kimi is the configured backup when a primary cannot run.

### Writing your own profile

Copy one of the examples above and edit to taste. You can specify:

- **Which models** (e.g. Opus 5, GPT 5.6 Sol, Grok 4.5, Kimi K3, MiniMax M3).
- **Which harness** drives each model (`claude` CLI, `grok` CLI, `codex`, `gemini`, `opencode`). Constraints:
  - Claude Code can only run Claude models natively. Non-Claude models go through another harness (prefer `grok` CLI for Grok; otherwise typically OpenCode).
  - OpenCode **must** call `claude` for Claude models, and should prefer the first-party `grok` CLI for Grok when installed; other non-Claude models run as OpenCode subagents.
  - Grok CLI can run Grok models natively (or via headless `grok --prompt-file`); shell out for everything else.
  - Codex drives only OpenAI models natively. Same story for the Gemini CLI.
- **Which provider or route** (e.g. `via OpenCode Zen`, `via Z.ai Coding Plan`, `via OpenRouter`). Prefer coding-plan routes over generic `openrouter/` or `opencode/` when you have entitlements — they are cheaper or uncapped.
- **Model-specific knobs** (e.g. `"max" thinking`, `"xhigh" variant`).
- **Backups** — list fallbacks so a failed primary swaps automatically.
- **OpenCode server attach** — point MBOT at a running `opencode serve` instance instead of spawning a fresh local OpenCode per agent. Add a global line like `Attach OpenCode to seamus:4096 with password hunter2` (applies to every OpenCode agent in the run) or `via attach seamus:4096` on a single agent line (overrides for that agent only). MBOT translates this into `opencode run --attach http://… --password … --dir . …`.

  **Path-prefix requirement:** the remote server must see the project at the *same absolute path* as the host. The container's home directory has to match the host's home directory prefix (host `/home/colin/proj/foo` → remote also resolves `/home/colin/proj/foo`). When the remote runs in a container, bind-mount or symlink so `$HOME` matches. Without this, `--file .tmp/...` and `--dir .` resolve to the wrong place on the remote and the run fails. Falls back to local OpenCode when the remote is not reachable.

Profiles are prose. MBOT reads them naturally and translates them into the right CLI or subagent invocations. No JSON schema, no YAML, no tooling required.

### Overriding per run

- `[agents]` on `/colin-ultra-review` (positional, e.g. `gpt gemini kimi`) overrides the profile for that run only.
- `--agents opus gpt gemini` on `/colin-critique` does the same.
- `--profile X` in a prompt forces profile `X.md`.
- `--dry-run` in a prompt makes MBOT report its execution plan instead of launching anything. Useful for verifying a new profile.

### MBOT subagent registry

The `.claude/agents/colin-mbot-*.md` files register each model as a callable subagent (read-only — `write: false`). They are how OpenCode-hosted MBOT runs dispatch to a specific model. You normally do not invoke them directly, but you reference them by short name in profiles and `[agents]` overrides.

Sorted roughly by capability:

| Agent | Model |
|---|---|
| `colin-mbot-opus` | Anthropic Claude Opus 5 |
| `colin-mbot-gpt` | OpenAI GPT 5.6 Sol |
| `colin-mbot-gpt-zen` | GPT 5.6 Sol through OpenCode Zen |
| `colin-mbot-gpt-terra` | OpenAI GPT 5.6 Terra |
| `colin-mbot-gpt-terra-zen` | GPT 5.6 Terra through OpenCode Zen |
| `colin-mbot-grok` | xAI Grok 4.5 (OpenCode fallback; prefer `grok` CLI when available) |
| `colin-mbot-sonnet` | Anthropic Claude Sonnet 5 |
| `colin-mbot-glm` | Zhipu GLM 5.2 |
| `colin-mbot-gemini-pro` | Gemini 3.1 Pro (OpenRouter) |
| `colin-mbot-gemini-pro-zen` | Gemini 3.1 Pro through OpenCode Zen |
| `colin-mbot-qwen` | Alibaba Qwen 3.7 Max |
| `colin-mbot-kimi` | Moonshot Kimi K2.7 Code |
| `colin-mbot-mimo` | Xiaomi MiMo V2 Pro |
| `colin-mbot-deepseek` | DeepSeek v4 Pro |
| `colin-mbot-minimax` | MiniMax M3 |

Add your own by dropping a new `colin-mbot-<NAME>.md` into `.claude/agents/` with `mode: subagent`, the desired `model:`, and `tools: { write: false }`.

## Typical flows

- **Shipping a change.** Make edits → `/colin-review` → `/colin-commit-and-push` → on feedback `/colin-fix-comments` → on red CI `/colin-fix-pipeline`.
- **Planning a feature.** `/agent-sops-pdd` → `/colin-finalize-spec` → `/colin-critique --summary` → `/agent-sops-code-task-generator`.
- **Important merge.** `/colin-ultra-review --no-post` → review the output → `post` if it looks right. Use `--re-review` on subsequent pushes.
- **Picking up someone else's context.** Ask them to run `/colin-handoff` and commit the resulting Markdown.

## License

MIT — see [LICENSE](LICENSE).
