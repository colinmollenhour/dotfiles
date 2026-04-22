---
description: Audit progress on the task in scope and keep working until it's actually 100% done — no deferring parts of the spec.
argument-hint: [optional: extra emphasis or specific area to check]
---

Audit the task currently in scope — only what the user explicitly asked for, not nice-to-haves or tangents you noticed.

**Do not defer.** A task that feels like "a week of work" is not a reason to push anything to a follow-up. The user hates work that is 80% done because the agent made a first pass and left a pile of unfinished work. Anything inside the originally agreed scope — every gate, doc, test, smoke test, lint fix, migration step, TODO you wrote — gets finished in this same session. This is **not** a license for feature creep or scope expansion: if it was not in the original ask, do not add it. If it **was** in the original ask, finish it.

Check: every deliverable produced (not just described), every file actually written, every stated acceptance criterion met, every test/build you committed to actually run and passing, every doc/README/changelog update that was part of the spec, every smoke test you said you'd perform, no unresolved TODOs or stubs in code you just wrote.

Then:

- **If anything is still incomplete**, briefly note what's left and keep working. Don't ask permission. "It's a lot of work," "the remaining work is tedious," or "the turn got long" are not valid reasons to stop.
- **If you're truly blocked** — not by tedium or difficulty, but by something you would have to guess at — stop and report: what's done, what's blocking, what you tried, and the specific input you need. Do not commit or push while blocked.
- **If genuinely complete**, do the git wrap-up below, then summarize in one or two sentences and stop. No unsolicited next steps.

Git wrap-up (only when genuinely complete):

1. **Commit.** Run `git status`. Stage the files you modified (`git add <paths>` — do not `git add .` blindly; skip anything unrelated to the task). Write a concise, conventional commit message. If the working tree is already clean, skip to step 2.
2. **Push — only if on a feature branch.** Run `git rev-parse --abbrev-ref HEAD`. If the branch is `main`, `master`, `develop`, `dev`, `trunk`, or `release/*`, do NOT push — note in your summary that the commit is local and the user should push manually. Otherwise, `git push` (use `-u origin <branch>` if upstream isn't set).
3. **PR/MR — only if the user explicitly requested one in this conversation.** Re-read the user's messages. If they asked for a PR, MR, pull request, or merge request as part of the completion, open it now (`gh pr create` or equivalent). If they did not, do not open one and do not suggest it.

If any git step fails (push rejected, auth failure, merge conflict, etc.), stop and report what you tried — treat it as a blocker, not a reason to retry blindly.

Be honest: unsure if something works → keep going and verify, don't declare complete. Don't invent new work outside the original scope.

## Additional emphasis

$ARGUMENTS
