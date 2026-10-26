# CI and review monitoring

The parent running `full-send` or `full-stop` owns one monitor per PR/MR.
Reviewers and other child tasks never start monitors or perform merge actions.
Use the matching `gh-cli` or `glab-cli` skill for context scripts, API details,
pagination, logs, discussions, and state-changing commands.

## Observe and wait

Handle existing failures and feedback before waiting. Record the current head,
target, required checks, applicable review bots, approvals, unresolved threads,
and automatic merge/queue status. Establish which bots actually run from the
repository configuration and recent requests; do not assume Theo's particular
review services exist here.

- Prefer a native hosted-request watcher when the harness provides one and
  reliably wakes this same task. Remove it when handing off or asking a
  blocking question. Do not end a turn expecting a wake the harness does not
  support.
- Otherwise use the platform CLI's check/pipeline watch in a background command
  and inspect it with short tool waits. On GitHub, `gh pr checks <N> --watch
  --interval 30` watches checks; it does **not** watch review threads or
  establish the complete gate. On GitLab use the installed `glab` version's
  pipeline watch/live command, scoped to the MR's current pipeline.
- Between waits, refresh review state, head, target, and mergeability with the
  platform context helper or a compact API snapshot. If no native/CLI watcher
  covers the needed state, use one 30–60 second scheduled wait between
  snapshots. Do not create another polling script, stack watchers, or block
  the conversation for minutes in a foreground command.
- Keep user updates concise and periodic while working; do not post repeated
  waiting comments to the PR/MR. On rate limiting, honor the server's reset or
  retry time and pause requests; on permission/authentication failure, report
  the blocker instead of retrying indefinitely.

No checks reported, an empty pipeline list, an old successful pipeline, or a
watcher's success exit is not proof of readiness. Confirm the expected checks
exist and correspond to the live head (or its platform-created merge-result
commit). For repositories with no required checks or bots, record that fact;
do not wait forever for a service that is not configured. A delayed expected
check or bot is pending, not implicitly waived.

## Act on evidence

Read inline threads, review summaries, and actionable top-level comments,
including non-resolvable change-request summaries. Paginate. Carry forward
older unresolved findings and human change requests until fixed or superseded;
do not discard them just because they predate the last push. Check whether old
findings still apply, and require new review coverage for changed behavior.

For each finding, verify it against source and observed behavior. Fix real bugs
within scope; decline speculative additions or nits with a concrete reason.
Fetch failed CI logs and reproduce the actual failing command where possible.
Distinguish a product defect from an infrastructure failure. A bounded rerun
may resolve a demonstrated flake; never skip or weaken a required check to
manufacture green.

After fixes, rerun affected checks and independent review as needed, commit,
push, and refresh `colin-mr-description` when its documented behavior/evidence
changed. Its attribution and commit-note conventions apply. If
`colin-fix-comments` is installed, use its gathering and reply conventions;
otherwise use this compatible header for review responses:

```text
> **AI Review Response** · Commit: <short-head-sha> · By: <harness> with <model>

<fix or reason, with evidence>
```

Use verified runtime identity, or `By: AI agent` when unknown. Write multiline
bodies to files. Resolve a thread only after the fix or successful reasoned
reply; do not dismiss a human change request or invent their approval. Keep
comments useful to the review rather than duplicating progress narration.

Refresh after every push, meaningful target-branch change, and monitor wake.
If the request became obsolete, use `modernize` and stop before closing it.
Keep the same review budget/ledger across fixes rather than resetting the
budget every time CI produces feedback. If the same failure persists after
two attempted fixes without new evidence, reassess the cause and report a
blocker when no safe next action remains.

## Finish

Immediately before merge or handoff, fetch the target and re-read live head,
state, checks, reviews, approvals, threads, mergeability, and queue/automatic
merge status. If the head differs from your verified SHA, reassess it. If the
base changed, integrate it and recheck the affected behavior. Platform-required
merge-result/queue checks must also pass before a full-send merge completes.

For full-stop, confirm automatic merge and queue/train enrollment remain off
before every push and at handoff. For full-send, stay until merged if queued.
Stop background monitors on completion, handoff, or a blocking question, and
record the final observed state so another session can resume.
