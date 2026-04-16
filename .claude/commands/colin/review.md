---
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr edit:*), Bash(gh api:*), Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*), Bash(glab mr list:*), Bash(glab mr update:*), Bash(glab api:*), Bash(git *), Bash(jq:*), Bash(curl:*), Bash(which opencode:*), Bash(ls:*), mcp__github_inline_comment__create_inline_comment
description: Code review for GitHub PRs, GitLab MRs, or any git diff
argument-hint: "[PR/MR number, URL, or git description] [agents] [--re-review] [--no-post] [--no-summary]"
---

# Code Review

Review a GitHub pull request, GitLab merge request, or arbitrary git diff. Post inline comments for PR/MR reviews unless `--no-post` is active.

For GitHub reviews, load the `gh-cli` skill after resolving the platform. For GitLab reviews, load the `glab-cli` skill. Use those skills for PR/MR resolution, API fallbacks, inline comment posting, labels, and platform-specific link details.

## Input Resolution

If no argument is provided:
1. Check `git remote get-url origin`
2. If it points to GitHub, resolve the open PR for the current branch
3. If it points to GitLab, resolve the open MR for the current branch
4. Otherwise stop and ask what should be reviewed and where results should go

If an argument is provided, resolve it as follows:

| Pattern | Mode | Resolution |
|---|---|---|
| `github.com/.../pull/123` | GitHub PR | Extract PR number |
| `gitlab.*/.../merge_requests/123` | GitLab MR | Extract MR IID |
| `https://github.com/OWNER/REPO` | GitHub PR | Resolve PR from current branch |
| Numeric only | Platform from origin | Use as PR/MR ID |
| `last N commits` | Git diff | `git diff HEAD~N..HEAD` |
| `whole repo` or `entire codebase` | Git diff | Review all tracked files |
| `branch NAME` | Git diff | `git diff main...NAME` or default branch |
| `SHA..SHA` or `SHA...SHA` | Git diff | Use directly |
| Any other text | Git diff | Interpret as git rev spec |

Resolve current-branch reviews using the appropriate platform CLI skill.

## Review Agents

Use the **Many Brain One Task (MBOT)** skill with task type `code-review`.

- If the user names models, pass them through
- Otherwise use MBOT defaults
- Use MBOT display names in summaries and posted comments

## Re-review Mode

If `--re-review` is active, review only the new changes since the last review.

- Skip the normal "already commented" stop condition
- Gather prior review comments and determine the incremental diff since the last reviewed SHA/version
- Give agents the incremental diff as primary input, and the full diff as background only
- Do not re-flag issues already covered by prior comments unless they remain unresolved and are still relevant
- If no new issues are found, use a re-review summary comment that says no new issues were found in the latest changes

## Process

### Step 1: Pre-flight Checks

For PR/MR reviews, fetch state, draft status, title, and author using the loaded platform CLI skill.

Stop if:
- The PR/MR is closed or merged
- The PR/MR is draft/WIP
- The change clearly does not need code review, such as trivial automation
- You have already commented on it, unless `--re-review` is active

For git diff mode, skip pre-flight entirely.

### Step 2: Triage and Filter

Fetch the file list and diff, then exclude review noise before running agents.

Exclude:
- Generated files
- Vendored or dependency directories: `vendor/`, `node_modules/`, `.yarn/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.venv/`, `third_party/`
- Lock files and built artifacts: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `*.min.css`, `*.map`
- Any single-file diff larger than `5000` lines

Report triage results in this format:

```text
Triage: <N> files, <M> excluded (<reasons>), reviewing <N-M> files (<L> diff lines)
```

### Step 3: Gather Context

Launch context gathering in parallel:
1. Find all relevant `AGENTS.md` files:
   - The repo-root `AGENTS.md`, if present
   - Any `AGENTS.md` in directories containing reviewed files or their parents
2. Summarize the diff/PR/MR
3. If `--re-review`, gather prior comments and the incremental diff
4. Gather external context from URLs in the title, description, or linked tasks/issues when the matching MCP is available

Supported external context:
- `clickup.com/t/<task_id>` via `mcp__clickup__*`
- `app.intercom.com/*/conversation/<id>` via `mcp__Intercom__get_conversation`
- `*.sentry.io/issues/<issue_id>` via `mcp__Sentry__get_issue_details`

Pass external summaries to review agents, but do not post them as comments.

### Step 4: Review the Changes

Use MBOT to launch review agents in parallel. Give each agent:
- The filtered diff
- Relevant `AGENTS.md` context
- Any external context
- In re-review mode: prior comments plus incremental diff as primary context

Each agent should return issues tagged with the agent name that found them.

Review focus:
- `AGENTS.md` compliance for applicable paths only
- Runtime bugs in the changed code
- Security issues or incorrect logic in the changed code

Only flag high-signal issues:
- Objective runtime bugs or regressions
- Clear security issues
- Exact `AGENTS.md` violations you can quote directly

Do not flag:
- Style preferences or subjective suggestions
- Hypothetical issues without strong evidence
- Anything that depends on interpretation or guesswork

If confidence is low, do not flag the issue.

### Step 5: Validate and Deduplicate

For each issue, run a validation agent and keep only issues confirmed with high confidence.

- Merge duplicate issues across agents
- Preserve all agent attributions on merged issues
- Keep full per-agent validation results unless `--no-summary` is active

### Step 6: Model Comparison Summary

Skip this step if `--no-summary` is active.

For each agent, compute:
- **Found**: total issues flagged
- **Validated**: issues surviving validation
- **False Positives**: found minus validated
- **Unique Finds**: validated issues found only by that agent
- **Shared Finds**: validated issues also found by other agents
- **Accuracy**: `validated / found`, or `—` when `found = 0`
- **Composite Score**: `(2 x unique) + shared - (2 x false positives)`

Use display names. Report best and worst model by composite score. If no model found any issue, state that there was no differentiation in this review.

### Step 7: Post or Display Results

#### Git Diff Mode

Always behave as if `--no-post` is active.

- Display each issue with file, line or range, agent attribution, and full comment body
- Do not post anywhere
- Do not apply labels

#### `--no-post` Mode

Display the prepared comments and stop for user instructions.

Supported follow-ups:
- `post`
- `drop issue 3`
- `edit issue 2 to say ...`
- `cancel`

#### No Issues Found

Post a single summary comment:

```text
> **AI Code Review** · Models: <comma-separated list>

No issues found. Checked for bugs and AGENTS.md compliance.
```

In re-review mode, say `No new issues found in the latest changes.` instead.

#### Issues Found

Post one inline comment per unique issue using the loaded platform CLI skill.

- GitHub: prefer `mcp__github_inline_comment__create_inline_comment`; otherwise follow `gh-cli` for `gh api` inline comment posting
- GitLab: follow `glab-cli` for discussions API posting, MR version SHAs, and `"type": "DiffNote"` verification

Comment rules:
- Every comment starts with:

```text
> **AI Code Review** · Flagged by: <agent-name(s)>

<issue description>
```

- Use exactly one comment per unique issue
- Include links or citations when referring to source material such as `AGENTS.md`
- For self-contained fixes of up to 5 lines, include a committable suggestion block
- If the fix is not self-contained, describe it and include a copyable prompt instead of a suggestion block

Unless `--no-summary` is active, post the model comparison summary after all inline comments.

### Step 8: Apply Review Label

Skip this step in git diff mode.

After comments are posted, or after the user confirms posting from `--no-post` mode, apply the `:Reviewed-By-AI` label.

Use the loaded platform CLI skill for the exact label command.

If the user cancels in `--no-post` mode, do not apply the label.

## Notes

- Dependencies: `gh`, `glab`, `jq`, `git`
- Create a todo list before starting
- When linking to code, use the canonical URL and line-range rules from the loaded platform CLI skill
