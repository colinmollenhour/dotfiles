# Colin's dot files

Nothing too fancy, just my dotfiles.

## Features

These dot files apply to or make use of the following tools:

- Bash (non-clobbering `.bashrc.colin`)
- tmux (clobbering `.tmux.conf` and `.config/tmux-powerline/config.sh`)
- Git (non-clobbering `.gitconfig.colin` , `.gitignore.global` and `.gitattributes.global`)
- Vim (clobbering `.vimrc`)
- Delta (clobbering `.config/delta/themes.gitconfig`)
- [Starship](https://starship.rs/) (clobbering `.config/starship.toml`)

##### Shell helpers

- Run `colin-help` to see a list of shortcuts and tools
- Easy package installer (`install-recommended`, `install-packages` and `update-packages`) backed by brew, npm, apt and raw curl+bash.
- Fuzzy finder for files, git branches, docker containers, kill, ssh hosts, export and unset

## Installation

Clone this repo and run the `install.sh` script.

```bash
# Interactive mode (choose what to install)
./install.sh

# Install only AI agent configurations
./install.sh --agents

# Install everything
./install.sh --all

# See all options
./install.sh --help
```

**Common Options:**

- `--all` - Install everything
- `--agents` - Install only `.claude` files (also to `.opencode`, `.agents` and `.gemini/antigravity`)
- `--dotfiles` - Install dotfiles (bashrc, gitconfig, vimrc, tmux, etc.)
- `--interactive` - Interactive mode (default)

The `.bashrc` and `.gitconfig` files will **not** be replaced but rather updated to **include** the `.colin` variants.

## Help

Run the `colin-help` command for a list of aliases, commands, tips and tricks or see [here](https://github.com/colinmollenhour/dotfiles/blob/main/.bashrc.colin#L2) for the same info online.

## VSCode

Auto-install these in a VS Code devcontainer with `settings.json`:

```json
{
  "dotfiles.repository": "colinmollenhour/dotfiles",
  "dotfiles.targetPath": "~/.dotfiles",
  "dotfiles.installCommand": "~/.dotfiles/install.sh --all"
}
```

# AI Tools Reference

A quick reference to the shared slash commands, skills, and agents available in the `.claude/` config. Invoke slash commands directly (e.g. `/colin:review` for Claude Code or `/colin/review` for OpenCode). Skills are loaded automatically when relevant or can be referenced by name.

## Concepts

- **Slash commands** (`/name`) — you type them to kick off a workflow.
- **Skills** — reusable procedures Claude loads on demand (often invoked internally by commands).
- **MBOT agents** — dedicated sub-agents backed by specific models. Used by the review/critique commands to get multi-model opinions. **Which models run, and through which harness, is driven by MBOT profile files — see [Customizing MBOT](#customizing-mbot-your-models-your-harness).**

---

## Slash Commands

### `colin:*` — day-to-day dev workflow

#### Shipping

| Command | Use it when… |
|---|---|
| `/colin:commit-and-push` | You're done with changes. Commits, pushes, opens/updates a GitHub PR or GitLab MR. |
| `/colin:fix-comments` | Address open review comments on the current branch's PR/MR. Posts fixes, rebuttals, and a summary. |
| `/colin:fix-pipeline` | Diagnose and fix a failing GitHub Actions or GitLab CI pipeline on the current branch. |
| `/colin:fix-conflicts` | Resolve git merge conflicts intelligently, preserving intent from both sides. |
| `/colin:squash-merge [branch]` | Squash-merge a branch onto trunk with one clean commit **per author**, each AI-summarized. |
| `/colin:git-cleanup` | Delete local branches that have been merged remotely (including squash-merges). |

#### Reviewing

Both review commands resolve the target the same way. If you pass no argument they'll review the open PR/MR for your current branch; otherwise they accept PR/MR URLs or numbers, `last N commits`, `whole repo`, `branch NAME`, or a git rev spec like `SHA..SHA`.

**`/colin:review [target] [agents] [flags]`** — standard multi-model review. Triages, buckets large diffs (≤5k lines = single pass; otherwise ~3k-line buckets grouped by top-level directory), runs MBOT agents on each bucket, validates and deduplicates issues, posts inline comments, and applies the `:Reviewed-By-AI` label.

| Flag | Effect |
|---|---|
| `[agents]` (positional) | Model list for this run; overrides the MBOT profile (e.g. `opus gpt gemini`). |
| `--re-review` | Only review commits since the last `**AI Code Review**` comment on the PR/MR. |
| `--no-post` | Print comments to the terminal and wait for your `post` / `drop issue 3` / `edit issue 2 to …` / `cancel` instructions instead of auto-posting. |
| `--no-summary` | Skip the per-model comparison summary comment. |

In git-diff mode (when the target is a rev spec rather than a PR/MR) it always behaves as `--no-post` — nothing is posted, just displayed.

**`/colin:ultra-review [target] [agents] [flags]`** — the heavyweight variant. Runs **3 roles × N models** per bucket in parallel: `bugs` (correctness + security), `runtime` (performance + deps + deploy safety), and `craft` (quality + simplification + test quality). Expensive — reserve for important merges. Uses a separate `:Reviewed-By-AI-Ultra` label and a separate `**AI Ultra Review**` comment history, so it can run alongside `/colin:review` on the same PR.

| Flag | Effect |
|---|---|
| `[agents]` (positional) | Model list for this run; overrides the MBOT profile. |
| `--roles=bugs,runtime,craft` | Restrict to specific roles. Default is all three. |
| `--re-review` | Only review commits since the last `**AI Ultra Review**` comment. |
| `--no-post` | Same as `/colin:review`. |
| `--no-summary` | Skip both the per-model and per-role comparison tables. |

**`/colin:critique [target] [flags]`** — adversarial multi-model critique of a spec or plan document (not code). Flags contradictions, gaps, poor naming, and inferior design choices — **never** scope expansion or "nice-to-haves". Target is a file path, `current plan` (uses your in-session plan), or a ClickUp TaskID. If omitted it searches for `SPECS-*.md` then `PLAN*.md`.

| Flag | Effect |
|---|---|
| `--agents opus gpt …` | Override the MBOT `critique` profile for this run. |
| `--summary` | Include per-model comparison table (found / validated / unique / accuracy / composite score). |

#### Planning & porting

| Command | Use it when… |
|---|---|
| `/colin:finalize-spec` | Augment the current plan with the "senior-SWE" planning sections needed before implementation. |
| `/colin:feature-export <feature>` | Generate a portable implementation guide for moving a feature to a sibling repo. |
| `/colin:handoff [path]` | Dump current session context into a portable markdown handoff doc. No tool calls, just context. |
| `/colin:progress` | Audit the task in scope and keep working until it's actually 100% done. Forbids deferring parts of the spec. |

### `agent-sops:*` — heavier structured workflows

| Command | Use it when… |
|---|---|
| `/agent-sops:help` | Short overview of the SOPs and when to use each. |
| `/agent-sops:pdd` | Prompt-Driven Development: turn a rough idea into a full design doc with an implementation plan. |
| `/agent-sops:code-task-generator` | Convert rough descriptions or PDD plans into structured code-task files (Amazon format). |
| `/agent-sops:code-assist` | Interactive TDD coach — explore → plan → code → commit loop. |
| `/agent-sops:codebase-summary` | Generate AGENTS.md / README.md / CONTRIBUTING.md for a repo. |
| `/agent-sops:eval` | Plan, generate, and run evaluations for AI agents via the Strands Evals SDK. |

### Other

| Command | Use it when… |
|---|---|
| `/coolify` | Generate a `docker-compose.coolify.yml` for the current project using Coolify conventions and `SERVICE_*` secrets. |

---

## Skills

Claude loads these automatically when a task matches, or you can reference them by name.

### Platform CLIs

- **`gh-cli`** — GitHub operations via `gh` (PRs, issues, runs, inline comments, raw API).
- **`glab-cli`** — GitLab operations via `glab` (MRs, pipelines, discussions, raw API).
- **`clickup-tasks`** — Create/update ClickUp tasks, custom fields, sprint work. Supports both CLI and MCP backends.

### Code generation & review

- **`many-brain-one-task`** (MBOT) — Run the same prompt across many models and compare/merge results. Powers `/colin:review`, `/colin:critique`, `/colin:ultra-review`. **Configurable — see below.**
- **`generate-e2e-test`** — Drives Playwright MCP to perform a workflow, then generates the E2E test code.
- **`security-hardening`** — App-level security review: abuse prevention, rate limiting, business logic, input validation. Beyond generic checklists.
- **`skill-writer`** — Author new `.claude` skills with correct frontmatter and structure.

### Frameworks & stacks

- **`drizzle-orm`** — TypeScript-first ORM patterns (Postgres/MySQL/SQLite): schemas, queries, migrations, relations.
- **`nuxt-ui`** — Nuxt UI components. Fetches current docs from `ui.nuxt.com/llms.txt` so APIs are accurate.
- **`nuxt-content`** — Author markdown/MDC content files for Nuxt Content sites.
- **`voltagent`** — Build VoltAgent AI agents: tools, memory, hooks, sub-agents.

### Media

- **`nano-banana`** — Required for any image generation or editing. Uses the Gemini CLI under the hood.

---

## Customizing MBOT (your models, your harness)

**You should set up your own MBOT profiles.** The defaults shipped in this repo are one person's preferences — your API keys, entitlements, and trust in specific models will differ. Every review/critique run consults these profile files to decide which models to launch and through which harness.

### How profile resolution works

When MBOT starts, it picks a profile in this order:

1. An explicit `--profile X` in the prompt → loads `X.md`.
2. The task type — `code-review` or `critique` — looks for `code-review.md` or `critique.md`.
3. Everything else falls back to `default.md`.
4. If the chosen file doesn't exist, it tries `default.md`. If that's missing too, it uses hardcoded defaults (Opus via claude CLI + GPT/Gemini/GLM/Qwen/MiMo/Kimi/Grok via OpenCode).

All profile files live in `~/.claude/skills/many-brain-one-task/` (right beside the `SKILL.md` file). Profiles are just a list of your preferred agents - a plain markdown bullet list — model + harness, one per line.

### Example: `default.md`

```markdown
Use the following:
- claude CLI with "opus" and "max" thinking
- OpenCode with GPT-5.4 with "xhigh" variant via OpenCode Zen
- OpenCode with GLM 5.1
- OpenCode with Qwen 3.6 Plus
```

### Example: `code-review.md`

```markdown
Use the following:
- claude CLI with "opus" and "max" thinking
- OpenCode with GPT-5.4 with "xhigh" variant via OpenCode Zen
- OpenCode with GLM 5.1 via Z.ai Coding Plan
- OpenCode with Gemini 3.1 Pro via OpenCode Zen
```

### Writing your own profile

Copy one of the examples above and edit to taste. Things you can specify:

- **Which models** (e.g. Opus 4.6, GPT 5.4 Codex, Gemini 3.1 Pro, Grok 4.20, Kimi K2.6, MiniMax M2.5…).
- **Which harness** drives each model (`claude` CLI, `codex`, `gemini`, `opencode`). Constraints:
  - Claude Code can only run Claude models natively — non-Claude models must go through another harness (typically OpenCode).
  - OpenCode **must** invoke `claude` for Claude models, but can run everything else as an OpenCode subagent.
  - Codex can only drive OpenAI models natively; same story for Gemini CLI.
- **Which provider/route** (e.g. `via OpenCode Zen`, `via Z.ai Coding Plan`, `via OpenRouter`). Prefer coding-plan routes over generic `openrouter/` or `opencode/` when you have entitlements, since they're cheaper and/or uncapped.
- **Model-specific knobs** (e.g. `"max" thinking`, `"xhigh" variant`).
- **Backups** — list fallbacks so a failed primary can be swapped automatically.

Profiles are just prose — MBOT reads them naturally and translates them into the right CLI/subagent invocations. No JSON schema, no YAML, no tooling required.

### Overriding per-run

- `[agents]` on `/colin:review` / `/colin:ultra-review` (positional, e.g. `gpt gemini kimi`) → overrides the profile for that run only.
- `--agents opus gpt gemini` on `/colin:critique` → same idea.
- `--profile X` in a prompt → forces profile `X.md`.
- `--dry-run` in a prompt → MBOT reports its execution plan instead of launching anything. Useful for verifying a new profile.

### MBOT subagent registry

The `.claude/agents/colin-mbot-*.md` files register each model as a callable subagent (read-only — `write: false`). They're how OpenCode-hosted MBOT runs actually dispatch to a specific model. You normally don't invoke them directly, but you reference them by their short name in profiles and in `[agents]` overrides.

| Agent | Model |
|---|---|
| `colin-mbot-opus` | Anthropic Claude Opus 4.6 |
| `colin-mbot-sonnet` | Anthropic Claude Sonnet 4.6 |
| `colin-mbot-gpt` | OpenAI GPT 5.4 |
| `colin-mbot-gpt-zen` | GPT 5.4 via OpenCode Zen |
| `colin-mbot-gpt-codex` | OpenAI GPT 5.3 Codex |
| `colin-mbot-gpt-codex-zen` | GPT 5.3 Codex via OpenCode Zen |
| `colin-mbot-gemini-pro` | Gemini 3.1 Pro (OpenRouter) |
| `colin-mbot-gemini-pro-zen` | Gemini 3.1 Pro via OpenCode Zen |
| `colin-mbot-grok` | xAI Grok 4.20 |
| `colin-mbot-kimi` | Moonshot Kimi K2.6 |
| `colin-mbot-qwen` | Alibaba Qwen 3.6 Plus |
| `colin-mbot-glm` | Zhipu GLM 5.1 |
| `colin-mbot-mimo` | Xiaomi MiMo V2 Pro |
| `colin-mbot-minimax` | MiniMax M2.5 |
| `colin-mbot-big-pickle` | Big Pickle (OpenCode) |

Add your own by dropping a new `colin-mbot-<name>.md` in `.claude/agents/` with `mode: subagent`, the desired `model:`, and `tools: { write: false }`.

---

## Typical flows

- **Shipping a change:** make edits → `/colin:review` → `/colin:commit-and-push` → (on feedback) `/colin:fix-comments` → (on red CI) `/colin:fix-pipeline`.
- **Planning a feature:** `/agent-sops:pdd` → `/colin:finalize-spec` → `/colin:critique --summary` → `/agent-sops:code-task-generator`.
- **Important merge:** `/colin:ultra-review --no-post` → review the output → `post` if it looks right. Use `--re-review` on subsequent pushes.
- **Picking up someone else's context:** ask them to run `/colin:handoff` and commit the resulting markdown.
