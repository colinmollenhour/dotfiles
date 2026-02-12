---
description: Smart squash-merge a branch onto master, preserving per-author commits with AI-generated messages
argument-hint: [branch-name]
allowed-tools: Bash(git), Bash(echo), Bash(cat), Bash(wc)
---

# Smart Squash-Merge

Merge branch `$ARGUMENTS` onto `master` (or `main`—detect which exists) using an author-aware squash strategy. The goal: one clean commit per author (ideally no more than 1–3 each), each with a concise AI-generated summary.

## Procedure

### 1. Setup & Safety

- Confirm the working tree is clean (`git status --porcelain`). Abort if dirty.
- Detect the trunk branch: use `main` if it exists, otherwise `master`.
- Create a backup tag: `backup/$ARGUMENTS-<timestamp>` pointing at the current branch tip.
- Inform the user of the backup tag so they can restore if needed.

### 2. Gather Commit Data

- Check out a new temporary branch `temp/smart-merge-<timestamp>` from the trunk.
- Cherry-pick or rebase all commits from `$ARGUMENTS` onto this temp branch (prefer rebase).
  - If rebase has conflicts, stop and report them to the user. Do NOT auto-resolve.
- Run: `git log --format='%H %ae %an' trunk..$ARGUMENTS` (use the original branch to analyze).
- Build an ordered list of commits with: hash, author email, author name, and short message (`%s`).

### 3. Analyze & Optimize Author Grouping

Count the number of "author switches" (adjacent commits by different authors). If reordering a small number of commits (≤3 moves) would reduce the final commit count, propose the reorder to the user and execute it with interactive rebase if approved. The constraint: never reorder commits that modify the same files (check via `git diff --name-only` between candidate commits) to avoid conflicts.

### 4. Squash Author Groups

For each contiguous run of commits by the same author:

1. Collect all commit messages in that run.
2. Generate a **single, concise commit message** that summarizes the meaningful work. Rules:
   - Drop noise like "update X file", "fix typo", "wip", "address review comments".
   - Use imperative mood (e.g., "Add payment processing endpoint").
   - If the group is a single commit with a good message, keep it as-is.
   - If multiple meaningful changes, use a short summary line + bullet list body.
   - Keep the summary line under 72 characters.
3. Squash the run into one commit using `git reset --soft` + `git commit`, setting:
   - `--author="Original Author Name <email>"` to preserve authorship.
   - The generated commit message.

### 5. Verify & Report

- Do a `git diff` comparing the original and squashed branch heads. There should be ZERO differences! STOP and ask for direction if there are any differences.
- Show the user the final `git log --oneline` of the temp branch vs trunk.
- Show a summary: number of original commits → number of final commits, with authors.
- Ask the user what they'd like to do next.

## Important

- **Never force-push any branch or touch the trunk branch.** Only modify the feature branch and only push if told.
- If anything goes wrong, tell the user how to restore from the backup tag.
- If there are more than ~30 commits, warn the user this will take a while and confirm before proceeding.
