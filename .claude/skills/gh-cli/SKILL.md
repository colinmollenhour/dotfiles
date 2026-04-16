---
name: gh-cli
description: Use the GitHub CLI for GitHub repository operations including pull requests, issues, comments, workflow runs, labels, and raw API calls. Use when the user gives a GitHub URL or asks to view, create, update, comment on, or inspect GitHub state from the terminal with `gh`.
---

# GitHub CLI

Use this skill for GitHub-hosted work. Prefer `gh` over browser workflows or generic web fetching when the task is about repository state.

## Workflow

### Step 1: Resolve repo and target

- If the user provides a GitHub URL, extract `owner/repo` and the PR, issue, run, or commit identifier from it
- Otherwise infer the repo from `git remote get-url origin`
- For branch-scoped work, use `git branch --show-current`
- If the repo or target is still ambiguous, ask one short question before mutating anything

### Step 2: Prefer high-level `gh` commands

Use high-level commands first when they cover the task cleanly:

- `gh pr view`, `gh pr list`, `gh pr diff`, `gh pr checks`, `gh pr create`, `gh pr comment`, `gh pr edit`, `gh pr status`
- `gh issue view`, `gh issue list`
- `gh search`
- `gh run list`, `gh run view`, `gh run watch`

Prefer machine-readable output:

- Use `--json ... --jq ...` when supported
- Otherwise pipe to `jq` and keep only the fields needed for the current task

### Step 3: Use `gh api` for gaps

Use `gh api` when a high-level command does not expose the needed operation or fields.

- Prefer REST endpoints for comments, reviews, timeline data, commits, labels, and other missing mutations
- Use `-f` for string fields and `-F` for integer or typed fields
- For multiline comment or PR bodies, use a HEREDOC rather than inline escaping
- Re-fetch the resource after mutation when confirmation matters

### Step 4: Avoid interactive flows

Always pass explicit flags instead of relying on prompts.

- Good: `--title`, `--body`, `--body-file`, `--json`, `--jq`, `--repo`
- Avoid interactive editors or prompts when a non-interactive flag exists

### Step 5: Keep output tight

- Return the minimum fields needed for the task
- Prefer one precise command over multiple exploratory commands
- For large responses, summarize and point to the key fields or URLs

## Common Tasks

- Resolve the open PR for the current branch
- Fetch PR state, author, files, checks, and head SHA
- Create or update a PR
- Post a PR summary comment or inline review comment
- Add labels to a PR
- Inspect workflow runs and fetch failed logs
- View or search issues

## CI Triage

For GitHub Actions triage, prefer branch-scoped run inspection first.

- Start with `gh run list --branch "$(git branch --show-current)" --limit 3 --json databaseId,displayTitle,conclusion,status`
- If all recent runs passed, stop early
- If a run is still in progress, use `gh run watch <RUN_ID>`
- If a run failed, use `gh run view <RUN_ID> --log-failed`
- Use `gh pr checks <PR>` as a secondary view when PR-centric status is more useful than branch-centric runs

Detailed command patterns live in [reference.md](reference.md).

## Review Comment Rules

When posting GitHub inline review comments:

- Prefer the dedicated MCP inline comment tool if it is available
- Otherwise use `gh api` against the PR review comments endpoint
- Fetch the PR head SHA first
- Use `RIGHT` for added or unchanged lines and `LEFT` for removed lines
- Post exactly one comment per unique issue

## Failure Handling

- If `gh` reports authentication or repo access errors, surface that clearly instead of guessing
- If the command returns no matching PR, issue, or run, say so explicitly
- If a mutation succeeds but the response is ambiguous, verify by re-fetching the updated object

## Notes

- Prefer canonical GitHub URLs and full SHAs when constructing code links
- Use `gh api repos/{owner}/{repo}/...` for repo-scoped API calls
- Use this skill as the shared source for GitHub CLI behavior in command files and other skills
