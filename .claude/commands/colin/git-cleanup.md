---
description: Clean up local git branches that have been merged remotely (including squash merges)
allowed-tools: Bash(git *), mcp_question
---

# Context

Current branch: !`git branch --show-current`
Default remote branch: !`git remote show origin | grep 'HEAD branch' | awk '{print $NF}'`
Total local branches: !`git branch --list | wc -l`

# Your task

Help the user clean up stale local git branches. Follow these steps:

## Step 1: Fetch and prune

Run `git fetch origin --prune --quiet` to sync remote state and remove stale remote tracking refs.

## Step 2: Categorize all local branches

For every local branch (excluding the current branch and master/main), determine its category:

1. **Gone** — has a remote tracking branch that no longer exists (shown as `gone` in `git branch -vv`). These are almost certainly merged via squash MR and safe to delete.
2. **Tracked, no local changes** — has a live remote tracking branch and 0 commits ahead of it. Safe to delete since the remote copy is identical.
3. **Tracked, with local changes** — has a live remote tracking branch but has unpushed commits ahead of it. Present these to the user for review.
4. **Untracked** — no remote tracking branch set. Present these to the user for review.
5. **Worktree** — checked out in another worktree. Cannot be deleted; skip these.

## Step 3: Present summary

Show the user a summary table of counts per category, then:

- For categories 1 and 2: tell the user these will be deleted automatically.
- For categories 3 and 4: present a list with branch names (and ahead count for category 3) and ask the user which ones to DELETE using the mcp_question tool (multiple selection). Default assumption is to keep them unless the user says otherwise.
- For category 5: mention these are skipped (checked out in other worktrees).

## Step 4: Execute deletion

After getting user confirmation:
1. Delete all "gone" branches with `git branch -D`
2. Delete all "tracked, no local changes" branches with `git branch -D`
3. Delete any user-selected branches from categories 3 and 4
4. Show final `git branch -vv` output and a summary of how many branches were removed

## Important notes

- NEVER delete master, main, or the current branch
- Use `git branch -D` (force) since squash-merged branches won't show as merged
- Present information clearly and concisely
- Batch deletions into single commands where possible

# Special Instructions

$ARGUMENTS
