---
description: Fix failing CI pipeline (GitHub Actions or GitLab CI) for the current branch
---

Fix the failing CI pipeline for the current branch.

Determine the hosting platform first, then load `gh-cli` for GitHub Actions or `glab-cli` for GitLab CI. Use those skills for the exact hosted-CLI commands. The branch-scoped status commands in the context block below are the preferred starting point and are mirrored in those skills.

## Context

- **Remotes:** !`git remote -v`
- **GitHub pipeline status:** !`gh run list --branch $(git branch --show-current) --limit 3 --json databaseId,displayTitle,conclusion,status 2>/dev/null || echo "Not a GitHub repo or not authenticated"`
- **GitLab pipeline status:** !`glab ci list --per-page 3 --output json 2>/dev/null || echo "Not a GitLab repo or not authenticated"`

## Step 1: Assess Context

1. **Identify platform** — determine GitHub or GitLab from the remote URLs and load the matching CLI skill (`gh-cli` or `glab-cli`)
2. **Start with the branch-scoped CI status commands** — there may already be inlined context above if the harness supports it, otherwise run the tools to get the context
3. **If all pipelines passed** → report success and exit early
4. **If pipelines are still running** → report status and provide the matching watch/live command from the loaded skill, then exit early
5. **If a pipeline has failed** → continue to Step 2

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

## Step 5: Commit and push the fix

1. Use git add, commit and push
2. Ask the user to review the commit while it is running on CI
3. Provide the matching watch/live command from the loaded platform CLI skill for the new pipeline run
4. Offer to monitor the CI pipeline and continue fixing issues if it still fails

## Notes

- If multiple jobs failed, fix them one at a time
- Prefer fixing the first real failure over chasing downstream failures caused by it
- If the failure is flaky/intermittent, note this to the user
- If the failure requires secrets or environment variables not available locally, inform the user
