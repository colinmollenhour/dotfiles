---
name: full-stop
slash: true
disable-model-invocation: true
description: Complete a change through proof, independent review, PR/MR creation, CI and review monitoring, then leave it open for the user to merge when explicitly asked for full stop. Not a generic instruction to cancel ongoing work.
argument-hint: "[objective, branch, or PR/MR URL]"
---

# Full Stop

Follow [full-send](../full-send/SKILL.md) through its readiness gate, then leave
the PR/MR open and unmerged for the user. An explicit request to use this
workflow authorizes its implementation, testing, review, commit, push, and
feedback loop without a separate full-send request. The rules below override
all merge instructions in that workflow and its helpers.

## Prevent automatic merging

Never merge, enable automatic merge, enter a merge queue/train, push to the
target/default branch, bypass protections, or delegate those actions.

Before changing an existing request, inspect its automatic merge and
queue/train status. Disable existing automatic merge and remove it from the
queue/train through the hosting platform; verify that it will remain open.
This cancellation is part of the full-stop request. Report any such change.
Check again before every push and before handoff. If you lack the access or
information to prevent automatic merging, stop before pushing and report the
blocker. If someone else merged it, report the observed state rather than
claiming an unmerged handoff.

You may rebase, resolve conflicts, and push to this task's branch using
full-send's recorded-head lease safeguards. A helper's permission to merge
never applies in this mode. Pass `full-stop; no merge or automatic merge`
explicitly to every implementation helper or delegated task.

## Stop at the gate

Complete proof and independent review for the final diff, fix real CI and
review findings, and monitor using
[full-send's monitoring reference](../full-send/references/monitoring.md).
Fetch the actual target and inspect live head, checks, reviews, approvals,
threads, mergeability, draft state, and automatic merge/queue state.

Choose a truthful verdict:

- **Ready to merge:** full-send's gate passes; the request is open, non-draft,
  and unmerged with automatic merging and queue/train enrollment off.
- **Waiting for required approval:** only required human approval remains.
  Identify that requirement from the platform, not a guessed explanation for
  an unknown mergeability state.
- **Blocked:** identify failed/missing proof, unresolved findings, access,
  checks, or other constraints; state what is needed to resume. A required
  check that only runs inside a merge queue/train is a blocker in this mode,
  not permission to enqueue or a reason to claim the gate passed.

Do not hand off while routine checks or configured bots are merely running.
Use full-send's blocker/question rules when further progress needs the user.
Stop active monitors before handing off. Report the URL, final head SHA,
verdict, proof, review outcome, material risks, and any cancelled automatic
merge/queue state. Explicitly state whether it remains open and unmerged.

Adapted from [Theo Browne's tstack](https://github.com/t3dotgg/tstack), revision
`7de017b3fc9d50c03cf3ecb98fb71e0ca65a78bd`; modified for Colin's shared workflows,
GitLab, and invocation policy. Upstream license: [LICENSE](LICENSE).
