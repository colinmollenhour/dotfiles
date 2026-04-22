---
description: Commit, push, and open/update a Github PR or GitLab MR (unless otherwise specified)
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*), Bash(gh pr comment:*), Bash(gh pr edit:*), Bash(glab mr create:*), Bash(glab mr note:*), Bash(glab mr update:*), Bash(gh pr view:*), Bash(glab mr view:*), Bash(head), Bash(git rev-parse:*), Bash(gh pr status:*)
argument-hints: Special instructions
---

# Context

After determining whether the repo is hosted on GitHub or GitLab, load `gh-cli` or `glab-cli` and use that skill for PR/MR status, creation, and comment or note behavior.

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
2. UNLESS instructed to push to main/master and IF the current remote tracking branch is main/master, then UNSET the upstream to avoid pushing the feature branch directly to main (git branch --unset-upstream).
3. Add all files that you created or modified or deleted, do not add PLANS-*.md, SPECS-*.md or other files that already existed unless otherwise specified.
4. Create a single commit with an appropriate message based on what was changed since the last commit and following the formatting conventions of the last 3 commits.
5. Push the branch to 'origin' unless a different remote is specified in the special instructions or the branch is already tracking a different remote. BE CAREFUL not to push the branch to main because it may already be tracking main!
6. Create or update the hosted review item using the loaded platform CLI skill.
   - GitHub: use `gh-cli` for PR status, `gh pr create`, and any follow-up PR comment
   - GitLab: use `glab-cli` for MR status, `glab mr create`, and any follow-up MR note
   - Unless otherwise specified, create the PR/MR if one does not already exist
   - If the branch is already tracking an open PR/MR, add a short comment or note describing the motivation and effect of the new commit.
     - Decide whether the AI agent itself authored the work being committed, based on prior conversation history:
       - If this session shows the agent making the code changes (editing files, generating new code, etc.), the AI authored the work — include the self-identifying header below.
       - If the human wrote the code and the agent is only being used to commit/push/PR on their behalf (no AI-authored edits in this session), omit the header and post the comment as plain prose.
     - When the AI authored the work, prefix the comment with this header on its own line, a blank line, then the note body:

       ```text
       > **AI Commit Note** · Commit: <sha> · By: <harness> with <model>

       <short description of the motivation and effect of the new commit>
       ```

       - `<sha>` is the short SHA of the commit just pushed (from `git rev-parse --short HEAD`).
       - `<harness>` is the agent harness currently running (e.g. `Claude Code`, `OpenCode`) — take it from your own runtime identity.
       - `<model>` is the model powering this session (e.g. `Opus 4.7`, `GPT 5.4`) — take it from your own runtime identity. If you cannot determine harness or model, use `By: AI agent` instead.
7. Fetch the new state of the working tree with `git status --short`
8. After the PR/MR is created or updated, remind the user to request a review. Include the exact copy-pasteable command for the detected platform, using the PR/MR number from the previous step:
   - GitHub: `gh pr edit <PR_NUMBER> --add-reviewer username1,username2`
   - GitLab: `glab mr update <MR_IID> --reviewer username1,username2`
   Do NOT run the command yourself — reviewer usernames are not known. Just surface it as a reminder.

You have the capability to call multiple tools in a single response so do all of the above in a single message IF AT ALL POSSIBLE.
Do NOT send any other text or messages besides these tool calls, a short list of what you did, and the review-request reminder from step 8.

# Special Instructions

$ARGUMENTS
