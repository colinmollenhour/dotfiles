---
description: Fix failing GitLab CI/CD pipeline job from the current MR
allowed-tools: Bash(glab mr view:*), Bash(glab ci status:*), Bash(glab ci list:*), Bash(glab ci trace:*)
---

Fix the failing GitLab CI/CD pipeline job for the current merge request.

## Step 1: Get MR Context

Get the current MR information to understand what branch and changes are involved:

```bash
glab mr view
```

## Step 2: Check Pipeline Status

First, check the overall status of the pipeline:

```bash
glab ci status --branch <branch-name>
```

**If the pipeline has passed (status shows "passed" or "success"):**
- Report to the user that the pipeline has passed
- Exit early - there's nothing to fix

**If the pipeline is still running (status shows "running" or "pending"):**
- Report to the user that the pipeline is still running
- Provide this command to watch the pipeline in real-time:
  ```bash
  glab ci status --branch <branch-name> --live
  ```
- Exit early - wait for the pipeline to complete before attempting fixes

**If the pipeline has failed, continue to Step 3.**

## Step 3: Find the Failed Job

Check the detailed status to identify which specific jobs failed:

```bash
glab ci status --branch <branch-name>
```

Then get the list of failed pipelines for the branch:

```bash
glab ci list --status failed --ref <branch-name> --output json --per-page 1
```

## Step 4: Get the Failure Logs

Once you have identified the failed job, fetch the job logs. You can either:

**Option A:** Use interactive trace to select the failed job:
```bash
glab ci trace --branch <branch-name>
```

**Option B:** If you know the job name or ID, trace it directly:
```bash
glab ci trace <job-id-or-name> --branch <branch-name>
```

**Option C:** Use the pipeline viewer for an interactive view:
```bash
glab ci view <branch-name>
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

2. Wait a moment for the pipeline to start, then get the pipeline ID:
   ```bash
   glab ci list --branch <branch-name> --per-page 1 --output json --jq '.[0].id'
   ```

3. Provide the user with a single-line watch command:
   ```bash
   glab ci status --branch <branch-name> --live
   ```

## Notes

- If multiple jobs failed, fix them one at a time
- If the failure is flaky/intermittent, note this to the user
- If the failure requires environment variables or secrets not available locally, inform the user
