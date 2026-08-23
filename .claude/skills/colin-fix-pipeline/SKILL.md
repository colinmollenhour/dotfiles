---
name: colin-fix-pipeline
disable-model-invocation: true
description: Fix failing CI pipeline (GitHub Actions or GitLab CI) for the current branch
---

Fix the failing CI pipeline for the current branch.

Determine the hosting platform first, then load `gh-cli` for GitHub Actions or `glab-cli` for GitLab CI. Use those skills for the exact hosted-CLI commands. The branch-scoped status commands below are the preferred starting point and are mirrored in those skills.

## Context

Gather the current state first. Run these in a single tool-turn batch:

```bash
git remote -v
git branch --show-current
gh run list --limit 10 --json databaseId,displayTitle,conclusion,status,headBranch 2>/dev/null || echo "Not a GitHub repo or not authenticated"
glab ci list --per-page 10 --output json 2>/dev/null || echo "Not a GitLab repo or not authenticated"
```

## Step 1: Assess Context

1. **Identify platform** — determine GitHub or GitLab from the remote URLs and load the matching CLI skill (`gh-cli` or `glab-cli`)
2. **Filter the listed runs to the current branch** — the run list covers all branches; match `headBranch` (GitHub) or `ref` (GitLab) against the current branch. If nothing in the listed runs matches, re-query with the platform CLI scoped to that branch.
3. **If all pipelines passed** → report success and exit early
4. **If pipelines are still running** → report status and provide the matching watch/live command from the loaded skill, then exit early
5. **If a pipeline has failed** → continue to Step 2

## Step 2: Get Failure Logs

Prefer a single gather script so logs land on disk without chat spam:

- **GitLab:** `bun "${HOME}/.agents/skills/glab-cli/ci-fail.ts" --project <G/R> --branch <branch> --out-dir .tmp/ci-fail` then Read only the relevant `traces/*.log` tails
- **GitHub:** `gh run view <run-id> --log-failed` (or `gh run list --branch …` then view)

Fall back to the platform CLI skill only when the script is insufficient.

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
