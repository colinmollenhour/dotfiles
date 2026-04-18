---
description: Address open comments on a Pull Request or Merge Request related to the current branch
---

A user or bot has posted code review comments on the Pull Request or Merge Request related to the current branch or described in the optional User Comments below.

---
User Comments: $ARGUMENTS
---

1. Inspect the git remotes with `git remote -v` and if this is a Github project load the `gh-cli` skill and if it's a Gitlab project load the `glab-cli` skill.
2. Inspect the unresolved comments on the Pull Request or Merge Request. Evaluate each comment's validity and either push a fix, post a rebuttal comment, or post a question if clarification or a decision is needed from the original author. If there is already an unanswered question, then skip that conversation thread. If you push a fix for a conversation, mark it resolved.
3. Finally, post a new comment with a summary of the fixes, rebuttals, skipped threads and follow-up questions and the current state of the PR/MR.
