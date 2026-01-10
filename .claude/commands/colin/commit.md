---
description: Commit, push, and open/update a Github PR or GitLab MR (unless otherwise specified)
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*), Bash(glab mr create:*), Bash(gh pr view), Bash(glab mr view), Bash(head), Bash(git rev-parse:*), Bash(gh pr status:*)
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
Current git upstream: !`git rev-parse --abbrev-ref --symbolic-full-name @{u} | echo 'None'`
Git remotes:
!`git remote -v`

Last 3 commits:
-------------------------
!`git log -n 3`
-------------------------

Github PR status or GitLab MR status:
-------------------------
!`gh pr status || glab mr view | head -n 10 || true`
-------------------------

# Your task

Based on the above info and the context of this session:

1. Create a new branch if on main/master using the convention {task-id}_{Screaming-Kebab-Case-short-description} if this session is related to a task, otherwise {feature|bug|other}/{Screaming-Kebab-Case-short-description}.
2. Add all files that you created or modified or deleted, do not add PLANS-*.md, SPECS-*.md or other files that already existed unless otherwise specified.
3. Create a single commit with an appropriate message based on what was changed since the last commit and following the formatting conventions of the last 3 commits.
4. Push the branch to 'origin' unless a different remote is specified in the special instructions or the branch is already tracking a different remote.
5. Create a pull request using `gh pr create` if the remote url indicates a github origin or `glab mr create` if the remote url indicates a gitlab origin - unless otherwise specified not to create a PR/MR in the special instructions. If the branch is already tracking an open PR/MR as indicated above, then add a comment/note to it describing the motivation/effect of the new commit.
6. Fetch the new state of the working tree with `git status --short`

You have the capability to call multiple tools in a single response so do all of the above in a single message IF AT ALL POSSIBLE.
Do NOT send any other text or messages besides these tool calls and a short list of what you did.

GitLab example command:
```
glab mr create --title "..." --description "..." --remove-source-branch --squash-before-merge --yes
```
GitHub example command:
```
gh pr create --title "..." --body "..."
```

# Special Instructions

$ARGUMENTS

