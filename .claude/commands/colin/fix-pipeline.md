---
description: Fix failing CI pipeline (GitHub Actions or GitLab CI) for the current branch
allowed-tools: Bash(gh run list:*), Bash(gh run view:*), Bash(gh run watch:*), Bash(gh pr checks:*), Bash(glab ci status:*), Bash(glab ci list:*), Bash(glab ci trace:*), Bash(glab ci view:*)
---

Fix the failing CI pipeline for the current branch.

## Context

- **Current branch:** `!`git branch --show-current``
- **Remotes:** `!`git remote -v``
- **GitHub pipeline status:** `!`gh run list --branch $(git branch --show-current) --limit 3 --json databaseId,displayTitle,conclusion,status 2>/dev/null || echo "Not a GitHub repo or not authenticated"``
- **GitLab pipeline status:** `!`glab ci list --per-page 3 --output json 2>/dev/null || echo "Not a GitLab repo or not authenticated"``

## Step 1: Assess Context

From the inlined data above:

1. **Identify platform** — determine GitHub or GitLab from the remote URLs
2. **Note the current branch**
3. **If all pipelines passed** → report success and exit early
4. **If pipelines are still running** → report status and provide a watch command, exit early:
   - GitHub: `gh run watch <run-id>`
   - GitLab: `glab ci status --branch <branch> --live`
5. **If a pipeline has failed** → continue to Step 2

## Step 2: Get Failure Logs

- **GitHub:** `gh run view <run-id> --log-failed`
- **GitLab:** `glab ci trace <job-id> --branch <branch>`

## Step 3: Analyze and Fix

1. Read the error logs carefully — identify the root cause
2. Identify the exact command that failed in CI
3. Run that same command locally to reproduce
4. Fix the underlying issue — don't just patch symptoms

## Step 4: Verify the Fix

Re-run the same command that failed in CI locally to confirm the fix works.

## Step 5: Commit the Fix

```bash
git add <files>
git commit -m "fix: <description of what was broken and how it was fixed>"
```

## Step 6: Review and Push

Ask the user to review the commit before pushing. If approved:

1. Push the changes
2. Provide a watch command for the new pipeline run:
   - GitHub: `gh run watch <run-id>`
   - GitLab: `glab ci status --branch <branch> --live`

## Notes

- If multiple jobs failed, fix them one at a time
- If the failure is flaky/intermittent, note this to the user
- If the failure requires secrets or environment variables not available locally, inform the user
