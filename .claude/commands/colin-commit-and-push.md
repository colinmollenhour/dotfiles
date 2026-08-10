---
description: Commit, push, and open/update a Github PR or GitLab MR (unless otherwise specified)
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*), Bash(gh pr comment:*), Bash(gh pr edit:*), Bash(glab mr create:*), Bash(glab mr note:*), Bash(glab mr update:*), Bash(gh pr view:*), Bash(glab mr view:*), Bash(head), Bash(git rev-parse:*), Bash(gh pr status:*), Bash(bun *), Bash(which *)
argument-hints: Special instructions
---

# Context

Current git status:
-------------------------
!`git status`
-------------------------

Current git diff (staged and unstaged changes):
-------------------------
!`git diff HEAD --stat`
-------------------------

Current branch: !`git branch --show-current`
Current git upstream: !`git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo None`
Git remotes:
!`git remote -v`

Last 3 commits:
-------------------------
!`git log -n 3`
-------------------------

Github PR status or GitLab MR status:
-------------------------
!`gh pr status 2>/dev/null || glab mr view 2>/dev/null | head -n 10 || true`
-------------------------

# Your task

Based on the above info and the context of this session:

1. Create a new branch if on main/master using `{task-id}_{Screaming-Kebab-Case-short-description}` when related to a task, else `{feature|bug|other}/{Screaming-Kebab-Case-short-description}`.
2. UNLESS instructed to push to main/master and IF the current remote tracking branch is main/master, then UNSET the upstream (`git branch --unset-upstream`) to avoid pushing the feature branch to main.
3. Stage files you created/modified/deleted. Do not add `PLANS-*.md`, `SPECS-*.md`, or pre-existing untracked plans unless specified.
4. Create a single commit with a message matching recent style (`git log -n 3`).
5. Push to `origin` unless a different remote is specified or already tracked. **Never push a feature branch to main.**
6. Open or update the hosted review item with the **ship script** (do **not** Skill-load full `glab-cli` / `gh-cli` for the happy path):

   **GitLab** (detect via `git remote`):
   ```bash
   # Write MR body and optional AI commit note to files first
   bun "${HOME}/.agents/skills/glab-cli/ship-mr.ts" \
     --title "<title>" \
     --description-file /abs/body.md \
     --note-file /abs/note.md   # omit if no note
   # If skill lives under ~/.claude/skills, use that path instead.
   ```
   Falls back: `bun "${HOME}/.claude/skills/glab-cli/ship-mr.ts" …` when agents path missing.

   **GitHub**:
   ```bash
   gh pr create --title "<title>" --body-file /abs/body.md
   # or if PR exists:
   gh pr comment --body-file /abs/note.md
   ```
   For full PR context later, use `gh-cli/pr-context.ts` — not needed for ship.

   - Unless told otherwise, create the PR/MR if none exists.
   - If one already exists, post a short note describing the new commit.
   - When **this session's agent authored the code changes**, prefix the note with:

     ```text
     > **AI Commit Note** · Commit: <sha> · By: <harness> with <model>

     <short description>
     ```

     Omit the header when the human wrote the code and the agent only ships it.
   - Load full `glab-cli` / `gh-cli` **only** if the ship script/API fails or you need inline discussions, uploads, or pagination edge cases.

7. `git status --short` after push.
8. Remind the user to request review (do **not** run these):
   - GitHub: `gh pr edit <PR_NUMBER> --add-reviewer username1,username2`
   - GitLab: `glab mr update <MR_IID> --reviewer username1,username2`

Do as much as possible in one tool-turn batch. Reply with a short list of what you did plus the review-request reminder.

# Special Instructions

$ARGUMENTS
