---
description: Fix failing CI pipeline (GitHub Actions or GitLab CI) for the current branch
allowed-tools: Bash(*), Bash(git *)
---

Fix the failing CI pipeline for the current branch.

Determine the hosting platform first, then load `gh-cli` for GitHub Actions or `glab-cli` for GitLab CI. Use those skills for the exact hosted-CLI commands. The branch-scoped status commands in the context block below are the preferred starting point and are mirrored in those skills.

## Context

- **Current branch:** `!`git branch --show-current``
- **Remotes:** `!`git remote -v``
- **GitHub pipeline status:** `!`gh run list --branch $(git branch --show-current) --limit 3 --json databaseId,displayTitle,conclusion,status 2>/dev/null || echo "Not a GitHub repo or not authenticated"``
- **GitLab pipeline status:** `!`glab ci list --per-page 3 --output json 2>/dev/null || echo "Not a GitLab repo or not authenticated"``

## Step 1: Assess Context

From the inlined data above:

1. **Identify platform** — determine GitHub or GitLab from the remote URLs
2. **Load the matching CLI skill** — `gh-cli` or `glab-cli`
3. **Note the current branch**
4. **Start with the branch-scoped CI status commands** — the inlined context above already uses the preferred commands from the loaded skill
5. **If all pipelines passed** → report success and exit early
6. **If pipelines are still running** → report status and provide the matching watch/live command from the loaded skill, then exit early
7. **If a pipeline has failed** → continue to Step 2

## Step 2: Get Failure Logs

Use the loaded platform CLI skill for the exact failure-log command. Prefer the failing job's log/trace over broad pipeline output.

- GitHub: the preferred command is `gh run view <run-id> --log-failed`
- GitLab: the preferred command is `glab ci trace <job-id> --branch <branch>`

## Step 3: Analyze and Fix

1. Read the error logs carefully — identify the root cause
2. Identify the exact command that failed in CI
3. Run that same command locally to reproduce the failure
4. Fix the underlying issue — don't just patch symptoms

## Step 4: Verify the Fix

Re-run the exact command that failed in CI locally. Do not move on until it passes.

## Step 5: Commit the Fix

```bash
git add <files>
git commit -m "fix: <description of what was broken and how it was fixed>"
```

## Step 6: Review and Push

Ask the user to review the commit before pushing. If approved:

1. Push the changes
2. Provide the matching watch/live command from the loaded platform CLI skill for the new pipeline run

## Notes

- If multiple jobs failed, fix them one at a time
- Prefer fixing the first real failure over chasing downstream failures caused by it
- If the failure is flaky/intermittent, note this to the user
- If the failure requires secrets or environment variables not available locally, inform the user
