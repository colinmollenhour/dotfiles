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
- Determine the merge base: `git merge-base <trunk> $ARGUMENTS`. Save this as `$MERGE_BASE`.
- Create a backup tag: `backup/$ARGUMENTS-<timestamp>` pointing at the current branch tip.
- Inform the user of the backup tag so they can restore if needed.

### 2. Stale Branch Detection

Before doing any work, check if the branch has diverged significantly from trunk:

1. Count commits on trunk since the branch diverged: `git log --oneline $MERGE_BASE..<trunk> | wc -l`
2. List files modified on trunk since the merge base: `git diff --name-only $MERGE_BASE <trunk>`
3. List files modified on the branch since the merge base: `git diff --name-only $MERGE_BASE $ARGUMENTS`
4. Compute the overlap — files modified on **both** trunk and the branch.

If there is overlap, display the overlapping files and **warn the user**:
> "This branch diverged from trunk N commits ago. The following M files were modified on both trunk and this branch, which means the squash-merge will overwrite trunk's changes to these files with the branch's versions. Consider rebasing the branch onto trunk first."

**If `vendor/` or `composer.lock` appear in the overlap, warn specifically:**
> "WARNING: vendor/ and/or composer.lock differ between this branch and trunk. The squash will replace trunk's dependency state with the branch's. This is almost certainly wrong unless the branch intentionally updated dependencies."

**STOP and ask the user to confirm before proceeding** if any overlap exists.

### 3. Gather Commit Data

- Check out a new temporary branch `temp/smart-merge-<timestamp>` from the trunk.
- Cherry-pick or rebase all commits from `$ARGUMENTS` onto this temp branch (prefer rebase).
  - If rebase has conflicts, stop and report them to the user. Do NOT auto-resolve.
- Run: `git log --format='%H %ae %an' <trunk>..$ARGUMENTS` (use the original branch to analyze).
- Build an ordered list of commits with: hash, author email, author name, and short message (`%s`).

### 4. Analyze & Optimize Author Grouping

Count the number of "author switches" (adjacent commits by different authors). If reordering a small number of commits (≤3 moves) would reduce the final commit count, propose the reorder to the user and execute it with interactive rebase if approved. The constraint: never reorder commits that modify the same files (check via `git diff --name-only` between candidate commits) to avoid conflicts.

### 5. Squash Author Groups

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

### 6. Scope Verification (Diff-of-Diffs Audit)

**This step is critical to prevent accidental reverts of trunk work.**

Compare the file scope of the original branch against the squashed result to mechanically detect any contamination:

1. Compute the **original branch file set** (what the branch *intended* to change):
   ```
   git diff --name-only $MERGE_BASE $ARGUMENTS | sort > /tmp/branch-files.txt
   ```

2. Compute the **squashed result file set** (what will actually land on trunk):
   ```
   git diff --name-only <trunk> HEAD | sort > /tmp/squash-files.txt
   ```
   (Run this on the temp branch after squashing.)

3. Compute the **excess files** — files in the squash that were NOT in the original branch diff:
   ```
   comm -13 /tmp/branch-files.txt /tmp/squash-files.txt > /tmp/excess-files.txt
   ```

4. Compute **missing files** — files in the original branch diff that are NOT in the squash:
   ```
   comm -23 /tmp/branch-files.txt /tmp/squash-files.txt > /tmp/missing-files.txt
   ```

**If there are ANY excess or missing files, STOP immediately.** Display them and explain:

- **Excess files** mean the squash is modifying files that the original branch never touched. This almost always means the branch was based on a stale trunk and the squash is inadvertently reverting trunk changes to those files.
- **Missing files** mean the squash dropped changes from the original branch, indicating a rebase/cherry-pick problem.

**Do not proceed** until the user has reviewed and approved. Suggest rebasing the branch onto trunk first as the safest fix.

Additionally, even if the file sets match exactly, compare the **diff stats** for a sanity check:
```
git diff --stat $MERGE_BASE $ARGUMENTS   # original branch scope
git diff --stat <trunk> HEAD             # squashed result scope
```
Show both summaries side by side. If the total insertions/deletions differ significantly (e.g., the squash has 2500 files changed but the branch only had 50), something is wrong — warn the user.

### 7. Final Verification & Report

- Do a `git diff` comparing the original branch tip and the squashed temp branch tip. There should be ZERO differences. STOP and ask for direction if there are any differences.
- Show the user the final `git log --oneline` of the temp branch vs trunk.
- Show a summary: number of original commits -> number of final commits, with authors.
- Ask the user what they'd like to do next.

## Important

- **Never force-push any branch or touch the trunk branch.** Only modify the feature branch and only push if told.
- If anything goes wrong, tell the user how to restore from the backup tag.
- If there are more than ~30 commits, warn the user this will take a while and confirm before proceeding.
- **Always prefer rebasing the feature branch onto trunk before squash-merging** if the branch is more than a few commits behind trunk. This avoids the stale-branch problem entirely.
