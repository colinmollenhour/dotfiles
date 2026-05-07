---
description: Autonomous large-task delivery loop - critique, decide, implement, review, fix, ship, and monitor CI until green
argument-hint: "<task, plan path, spec path, or objective> [--agents list...] [--max-coders 1|2|3] [--base branch] [--dry-run]"
allowed-tools: Read, Write, Edit, MultiEdit, Glob, Grep, Task, Bash(git *), Bash(gh *), Bash(glab *), Bash(jq:*), Bash(bun *), Bash(claude *), Bash(occtl *), Bash(codex *), Bash(ls:*), Bash(find:*), Bash(wc:*), Bash(rg:*), Bash(cat:*)
---

# Uber Code

Run a large coding task from initial plan to green CI with no human-in-the-loop gates.

This command deliberately keeps the main agent hands-off. The main agent gathers only enough context to validate and route the task, writes durable artifacts to disk, delegates almost all reasoning and implementation to agents, and uses MBOT / MBOD for adversarial critique, review, and bundled decisions.

Do **not** use Paseo or any Paseo-dependent tool. The command may borrow the pattern of durable plan files, phase handoffs, and monitor loops, but it must run through the current harness, MBOT, MBOD, platform CLIs, and regular agent/task facilities.

User request:

```text
$ARGUMENTS
```

## Operating Principles

- **No human gates after launch.** Do not ask the user to choose between options during the run. Resolve implementation decisions with MBOD when needed.
- **Artifacts are the source of truth.** Write every large plan, critique, review, decision, and monitor result to `.tmp/uber-code-<slug>/`. Keep chat updates short.
- **The main agent orchestrates.** It should not implement substantial code directly. It creates briefs, launches agents, validates artifacts, runs final commands, commits, pushes, and opens/monitors the PR/MR.
- **Delegate with complete briefs.** Every spawned agent starts from a self-contained prompt with paths to the exact artifacts it must read.
- **Never revert unrelated user changes.** If the worktree is dirty before starting, record it and instruct every coding/fix agent to preserve unrelated changes.
- **Always deliver through PR/MR.** Create or reuse a feature branch, push to origin, open/update a hosted review item, and monitor CI until green or a documented hard blocker remains.
- **Bound parallel coding.** Use one to three coding agents. Use multiple agents only when write scopes are genuinely disjoint.

## Input Resolution

Resolve the first argument that looks like the task source:

| Input | Resolution |
| --- | --- |
| Existing file path | Read it as the source plan/spec/objective |
| `SPECS-*.md` / `PLANS-*.md` implied by current directory | Use the single matching file when exactly one exists |
| Task-like ID or URL | Fetch enough title/body/context with the available CLI or MCP, if configured |
| Plain text | Treat it as the user-provided objective/plan |

Flags:

| Flag | Behavior |
| --- | --- |
| `--agents <list>` | Pass through to MBOT / MBOD participant selection where applicable |
| `--max-coders 1\|2\|3` | Upper bound for implementation agents; default `3` |
| `--base <branch>` | Base branch for diff, branch creation, and PR/MR; default is detected default branch |
| `--dry-run` | Create the execution outline only. Do not launch agents, edit code, commit, push, or open PR/MR |

If no usable task source can be resolved, stop and ask for a plan, spec, or objective. Otherwise proceed without further user input.

## Run Directory

Create one run directory inside the project root:

```text
.tmp/uber-code-<slug>/
  briefs/
  plans/
  critiques/
  decisions/
  agents/
  reviews/
  fixes/
  ci/
  final/
```

The slug should be short, lowercase, and derived from the task. If there is a collision, append a numeric suffix.

Write these initial files:

- `briefs/request.md` - original user request and resolved source content
- `briefs/repo-basics.md` - branch, remotes, status, default/base branch, recent commits, likely platform
- `briefs/context.md` - only basic local context needed to validate the plan: relevant `AGENTS.md` / `CLAUDE.md`, obvious manifests, likely test/build commands, and any directly referenced files
- `plans/original.md` - normalized copy of the user-provided plan/objective
- `final/ledger.md` - append-only phase log with timestamps, artifact paths, agent names, command outcomes, and blockers

For `--dry-run`, write `final/dry-run.md` with the planned phases, expected artifact files, and intended agent fan-out, then stop.

## Phase 1: Basic Context

Gather only enough context to validate the user's plan and launch critique.

Do:

- Record `git status --short`, current branch, remotes, upstream, default branch, and latest commit.
- Detect GitHub vs GitLab from `git remote get-url origin`.
- Read root and path-relevant `AGENTS.md` / `CLAUDE.md` files.
- Read directly relevant manifests such as `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile`, `justfile`, CI config, or task-referenced files.
- Identify likely local gates, but do not run expensive full gates yet.

Do not:

- Explore the whole repo.
- Start implementation.
- Ask the user about decisions that can be resolved later by MBOD.

## Phase 2: Critique the Plan

Use the `many-brain-one-task` skill with the critique task shape.

Run MBOT against `plans/original.md` plus `briefs/context.md`. Instruct agents to critique the plan for:

- Contradictions and inconsistent terminology
- Major gaps in behavior, error handling, state transitions, or dependencies
- Poor naming or ambiguous concepts
- Inferior design choices, over-engineering, under-engineering, or hidden coupling

Agents must not propose unrelated features or scope expansion.

Save the full validated critique to:

```text
critiques/mbot-critique.md
```

The chat summary should only include the model list, issue count, and file path.

## Phase 3: Second Draft Plan

Launch one planning agent. Give it:

- `plans/original.md`
- `critiques/mbot-critique.md`
- `briefs/context.md`

The planner must compare the critique to the original plan, address every validated critique, and write:

```text
plans/second-draft.md
```

The final section of `plans/second-draft.md` must be:

```markdown
## Readiness

Status: READY_TO_START | NEEDS_DECISIONS

### Unresolved Decisions

- [D1] <decision question, options if known, why it matters>
```

If the status is `READY_TO_START`, continue to Phase 5. If it is `NEEDS_DECISIONS`, continue to Phase 4.

## Phase 4: Bundled Decisions

Use the `many-brain-one-decision` skill once for all unresolved decisions. Do **not** run one MBOD session per decision.

Decision brief:

- Source plan: `plans/second-draft.md`
- All unresolved decision IDs bundled together
- Criteria: ship correct code, minimize avoidable risk, preserve repo conventions, keep scope limited to the user request, and avoid architectural churn unless necessary
- Mode: `hybrid` when options exist, otherwise `open-proposal`
- Maximum rounds: `3`

Save the full decision output to:

```text
decisions/mbod-final.md
```

Then launch the planner agent again, giving it `plans/second-draft.md` and `decisions/mbod-final.md`. It must write:

```text
plans/final.md
```

`plans/final.md` is the implementation source of truth.

## Phase 5: Implementation Split

Read `plans/final.md` and decide how many coding agents to launch.

Default to one coding agent. Use two or three only when all of these are true:

- The final plan has separable subsystems or phases.
- Each agent can own a disjoint write scope.
- Acceptance criteria can be stated independently.
- Parallel edits are unlikely to conflict.

Write:

```text
agents/work-packages.md
```

Each work package must include:

- Agent name
- Owned files/directories or behavioral scope
- Files/directories the agent must not modify
- Required context artifacts to read
- Acceptance criteria
- Local verification commands to run
- Expected final report path under `agents/`

If the split is not clean, write one package for a single coding agent.

## Phase 6: Coding Agents

Launch one to three coding agents in parallel according to `agents/work-packages.md`.

Each coding agent prompt must include:

```markdown
## Task
Implement only your assigned work package from `.tmp/uber-code-<slug>/agents/work-packages.md`.

## Required Reading
- `.tmp/uber-code-<slug>/plans/final.md`
- `.tmp/uber-code-<slug>/briefs/context.md`
- Your section of `.tmp/uber-code-<slug>/agents/work-packages.md`

## Constraints
- You are not alone in the codebase. Other agents may be editing disjoint scopes.
- Do not revert or overwrite unrelated user changes.
- Do not modify files outside your owned scope unless required to compile; if you must, document why.
- Do not commit, push, open a PR/MR, or ask the user questions.
- Follow repo conventions and applicable `AGENTS.md` / `CLAUDE.md`.

## Verification
Run the commands assigned to your work package. If a command cannot run, document the exact reason.

## Final Report
Write your final report to `.tmp/uber-code-<slug>/agents/<agent-name>-final.md` with:
- Summary of changes
- Files changed
- Verification commands and outcomes
- Known limitations or blockers
```

When agents finish, inspect their final reports, `git status --short`, and the relevant diff. If an agent failed or missed acceptance criteria, send a targeted follow-up to that same agent when possible. Do not launch a replacement unless the original agent is unavailable.

## Phase 7: Integration Verification

After coding agents finish:

- Inspect `git diff --stat`.
- Check for overlapping edits that violate work-package ownership.
- Read key changed files enough to ensure the implementation matches `plans/final.md`.
- Run the package-level verification commands that are cheap and likely to catch integration failures.

Write:

```text
final/integration-check.md
```

If integration is clearly broken, send targeted fix instructions to the responsible coding agent before review.

## Phase 8: Ultra Review

Use the `many-brain-one-task` skill with the ultra-review pattern from `/colin:ultra-review`.

Review the implementation diff against the base branch. Use the three roles:

- `bugs` - correctness and security
- `runtime` - performance, dependencies, deployment safety
- `craft` - quality, simplification, tests

Save full outputs and validation results:

```text
reviews/ultra-review.md
reviews/validated-findings.md
```

The review must be high-signal only. Keep findings that are objective, actionable, and relevant to changed code. Merge duplicate findings and preserve model/role attribution.

## Phase 9: Fix Review Findings

For each validated finding:

- If the fix is straightforward, assign it to the responsible coding agent or one fix agent.
- If findings conflict, imply non-trivial architecture choice, or have multiple plausible fixes, run one bundled MBOD session for all such fix decisions.

Save any fix decision output to:

```text
decisions/review-fix-mbod.md
```

Launch fix agent(s) with:

- `plans/final.md`
- `reviews/validated-findings.md`
- `decisions/review-fix-mbod.md`, if present
- Exact acceptance criteria: every validated finding resolved or explicitly shown false with evidence

Each fix agent writes:

```text
fixes/<agent-name>-final.md
```

Do not commit yet.

## Phase 10: Fixed Review

Run a final review pass focused only on the prior validated findings and the fixes made for them.

Save:

```text
reviews/fixed-review.md
```

If prior findings remain unresolved, repeat Phase 9 once. If they still remain after the second fix pass, write:

```text
final/review-blocker.md
```

Stop only if the blocker is real and cannot be resolved autonomously without major scope or product decisions.

## Phase 11: Final Local Gates

Run final gates from the repo's actual tooling. Prefer commands documented in `README`, `AGENTS.md`, package scripts, `Makefile`, `justfile`, or CI config.

Typical gates:

- Format check
- Lint
- Typecheck
- Unit tests
- Integration tests that are safe locally
- Build

Do not run formatters or generators that rewrite tracked files unless that is the repo's normal required gate. If a formatter must rewrite files, run it and include the resulting changes in the final diff.

Write:

```text
final/local-gates.md
```

If gates fail, launch a fix agent with the failure output and repeat gates until they pass or a hard blocker is documented.

## Phase 12: Commit, Push, and PR/MR

Always deliver through a hosted review item.

1. Detect GitHub or GitLab from origin and load `gh-cli` or `glab-cli`.
2. If on `main` or `master`, create a feature branch named `uber-code/<short-slug>` from the base branch.
3. If the current branch tracks `main` or `master`, unset upstream before pushing the feature branch.
4. Review `git status --short` and `git diff --stat`.
5. Stage only files created or modified for this task. Do not stage unrelated user changes.
6. Commit with a concise repo-style message.
7. Push to origin.
8. Create or update the PR/MR.

The PR/MR body must include:

- Summary of the user-facing or developer-facing change
- Test plan with exact commands and pass/fail results
- Links or paths to key artifacts:
  - `plans/final.md`
  - `reviews/validated-findings.md`
  - `reviews/fixed-review.md`
  - `final/local-gates.md`
- AI attribution header:

```text
> **AI Uber Code** - By: <harness/model if known>
```

Save delivery details:

```text
final/delivery.md
```

## Phase 13: CI Monitor Loop

Launch one monitor/fix agent after the PR/MR exists.

The monitor agent receives:

- PR/MR URL and number/IID
- Branch name
- Platform
- Commit SHA
- `final/delivery.md`
- `final/local-gates.md`
- Repo-specific CI commands from `gh-cli` or `glab-cli`

The monitor loop:

1. Check current CI status for the PR/MR branch.
2. If running, wait using the platform watch command or periodic status checks.
3. If passed, write `ci/final-status.md` and stop.
4. If failed, fetch failing job logs.
5. Identify the first real root cause.
6. Reproduce locally when possible.
7. Fix minor bugs, test locally, commit, and push.
8. Repeat until green.

The monitor must not make broad redesigns or product decisions. If CI failure implies a major architecture, dependency, migration, or product decision, it writes:

```text
ci/blocker.md
```

and stops.

The main agent must not declare completion until `ci/final-status.md` confirms green CI or `ci/blocker.md` documents a real blocker.

## Final Response

Keep the final chat response concise. Include:

- PR/MR URL
- Final CI status
- Commit SHA(s)
- Local gates summary
- Artifact directory path
- Any remaining blocker, if one exists

Do not paste long critiques, review logs, MBOD transcripts, or CI logs into chat. Point to the artifact files.

## Failure Handling

- **Agent failed to start:** record in `final/ledger.md`, use a backup only when the phase still needs parallel diversity.
- **Agent output missing required file:** send one schema/format repair follow-up. If still missing, summarize from chat output and record the deviation.
- **Unparsable MBOD/MBOT result:** preserve raw output, extract the obvious decision/findings if possible, otherwise rerun once.
- **Dirty pre-existing worktree:** never stage or revert unrelated files. If unrelated changes overlap required files and make safe edits impossible, write `final/blocker.md`.
- **Permission or auth failure:** write exact command, stderr excerpt, and required credential/action to `final/blocker.md`.
- **CI cannot be observed:** write platform command attempted and auth/permission error to `ci/blocker.md`.

## Command Completion Criteria

The command is complete only when one of these is true:

- PR/MR exists, latest pushed commit includes the work, final local gates passed, and CI is green.
- A hard blocker file exists explaining why autonomous completion is impossible, with exact evidence and next action.
