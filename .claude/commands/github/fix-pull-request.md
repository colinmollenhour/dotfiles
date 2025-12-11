---
description: Fix failing GitHub Actions workflow job from the current PR
allowed-tools: Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh run list:*), Bash(gh run view:*), Bash(gh run watch:*)
---

Fix the failing GitHub Actions workflow job for the current pull request.

## Step 1: Get PR Context

Get the current PR information to understand what branch and changes are involved:

```bash
gh pr view
```

## Step 2: Check Pipeline Status

First, check the overall status of the PR checks:

```bash
gh pr checks --json name,state,bucket
```

**If all checks have passed (all `bucket` fields are "pass"):**
- Report to the user that all checks have passed
- Exit early - there's nothing to fix

**If any checks are still running (any `state` fields are "IN_PROGRESS" or "QUEUED"):**
- Report to the user that checks are still running
- Provide this command to watch the checks in real-time:
  ```bash
  gh pr checks --watch
  ```
- Exit early - wait for checks to complete before attempting fixes

**If any checks have failed, continue to Step 3.**

## Step 3: Find the Failed Job

List the checks for this PR and identify failed ones:

```bash
gh pr checks --json name,state,workflow,link --jq '.[] | select(.state == "FAILURE")'
```

Then get the run ID for the failed workflow. Use the branch name from the PR:

```bash
gh run list --branch <branch-name> --status failure --limit 1 --json databaseId,displayTitle,conclusion --jq '.[0]'
```

## Step 4: Get the Failure Logs

Once you have the run ID, fetch the failed job logs:

```bash
gh run view <run-id> --log-failed
```

## Step 5: Analyze and Fix

1. **Read the error logs carefully** - identify the root cause of the failure
2. **Check if it's a test failure** - if so, refer to TESTING.md for guidance
3. **Check if it's a build/lint failure** - run the relevant command locally to reproduce
4. **Fix the underlying issue** - don't just patch symptoms

## Step 6: Verify the Fix

Run the failing command locally to verify your fix works:
- For test failures: `pnpm test:unit` or `pnpm test:e2e:ai <specific-test>`
- For lint failures: `pnpm format`
- For type errors: `pnpm typecheck`
- For build failures: `pnpm build`

## Step 7: Commit the Fix

Once verified, create a commit with a clear message describing what was fixed:

```bash
git add <files>
git commit -m "Fix: <description of what was broken and how it was fixed>"
```

## Step 8: Review and Push

**Ask the user to review the commit.** Show them what was changed and ask for approval to push.

**If the user approves:**

1. Push the changes:
   ```bash
   git push
   ```

2. Wait a moment for the workflow to start, then get the run ID:
   ```bash
   gh run list --branch <branch-name> --limit 1 --json databaseId --jq '.[0].databaseId'
   ```

3. Provide the user with a single-line watch command:
   ```bash
   gh run watch <run-id>
   ```

## Notes

- If multiple jobs failed, fix them one at a time
- If the failure is flaky/intermittent, note this to the user
- If the failure requires environment variables or secrets not available locally, inform the user
