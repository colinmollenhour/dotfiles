---
description: Address open comments on a Pull Request or Merge Request related to the current branch
---

A user or bot has posted code review comments on the Pull Request or Merge Request related to the current branch or described in the optional User Comments below.

---
User Comments: $ARGUMENTS
---

1. Inspect the git remotes with `git remote -v` and if this is a Github project load the `gh-cli` skill and if it's a Gitlab project load the `glab-cli` skill.
2. Inspect the unresolved comments on the Pull Request or Merge Request. Evaluate each comment's validity and either push a fix, post a rebuttal comment, or post a question if clarification or a decision is needed from the original author. If there is already an unanswered question, then skip that conversation thread. If you push a fix for a conversation, mark it resolved. Every posted rebuttal or question must start with a self-identifying header on its own line, followed by a blank line, followed by the reply body:

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
