---
name: colin-fix-comments
description: Address open comments on a Pull Request or Merge Request related to the current branch
---

A user or bot has posted code review comments on the Pull Request or Merge Request related to the current branch or described in the optional User Comments below.

---
User Comments: $ARGUMENTS
---

1. Inspect the git remotes with `git remote -v` and if this is a Github project load the `gh-cli` skill and if it's a Gitlab project load the `glab-cli` skill.
2. Identify every open reviewer comment on the Pull Request or Merge Request and evaluate each one. **Do not filter only on resolvable / unresolved threads** — review-summary notes that block the MR/PR are frequently non-resolvable, and dropping them is the most common failure mode of this workflow. The scope must cover:

   - **GitLab**: every unresolved inline discussion (paginate `glab api 'projects/:fullpath/merge_requests/<iid>/discussions?per_page=100'` until `X-Next-Page` is empty), **plus** every non-system note posted by the same author within ~10 seconds before a `system: true` note whose body is `"requested changes"` / `"approved"` / `"approval removed"`. Those system notes are review-submission markers, and the cluster of non-system notes that precedes one is that review's body — including any non-resolvable summary note. Also cross-check `glab api 'projects/:fullpath/merge_requests/<iid>/reviewers'` for any reviewer in `state == "requested_changes"`.
   - **GitHub**: every open inline review comment (`gh api repos/:owner/:repo/pulls/<n>/comments`), **plus** the body of every review with `state == "CHANGES_REQUESTED"` that has not been superseded by a later `APPROVED` review (`gh api repos/:owner/:repo/pulls/<n>/reviews`), **plus** any actionable issue comment on the PR (`gh api repos/:owner/:repo/issues/<n>/comments`).

   For each in-scope comment, either push a fix, post a rebuttal comment, or post a question if clarification or a decision is needed from the original author. If there is already an unanswered question on the thread, skip it. If you push a fix that resolves a resolvable thread, mark it resolved. Every posted rebuttal or question must start with a self-identifying header on its own line, followed by a blank line, followed by the reply body:

   ```text
   > **AI Review Response** · Commit: <sha> · By: <harness> with <model>

   <rebuttal or clarifying question>
   ```

   - `<sha>` is the short SHA of the current PR/MR branch head (`git rev-parse --short HEAD`).
   - `<harness>` is the agent harness currently running (e.g. `Claude Code`, `OpenCode`) — take it from your own runtime identity.
   - `<model>` is the model powering this session (e.g. `Opus 4.7`, `GPT 5.4`) — take it from your own runtime identity. If you cannot determine harness or model, use `By: AI agent` instead.

3. Finally, post a new comment with a summary of the fixes, rebuttals, skipped threads and follow-up questions and the current state of the PR/MR. Use the same self-identifying header (with `· Summary` appended), followed by a blank line, followed by the summary body:

   ```text
   > **AI Review Response** · Commit: <sha> · By: <harness> with <model> · Summary

   <summary of fixes, rebuttals, skipped threads, follow-up questions, PR/MR state>
   ```
