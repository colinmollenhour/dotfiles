---
name: full-send
slash: true
disable-model-invocation: true
description: Complete a change through proof, independent review, PR/MR creation, CI and review monitoring, and merge when the user explicitly asks for full send. Use full-stop for a handoff before merge.
argument-hint: "[objective, branch, or PR/MR URL]"
---

# Full Send

Own the requested change from its current state through a verified merge. The
user may be away; continue through checks and actionable feedback rather than
offering to monitor later. Merely mentioning this skill, quoting it, or asking
to edit it does not invoke it.

## Authorization and scope

An explicit full-send request authorizes completing the task, necessary local
testing (including browser automation, running the app, and screenshots),
committing, pushing, opening or updating its PR/MR, replying to relevant review
feedback, and merging after the gate below passes. It also authorizes rebasing
and a leased force-push of this task's branch. Follow repository test methods
and harness permissions. Do not infer authority to deploy to production, delete
data, close an obsolete request, bypass protections, or rewrite another branch.

When called by `full-stop`, use all the same work and testing permissions, but
its prohibition on merging and automatic merge takes precedence everywhere,
including in helpers and delegated work. Read that mode before any mutation.

## Establish the task

1. Resolve the objective, repository instructions, hosting platform, actual
   target branch, task branch, and any existing PR/MR. Load `gh-cli` for GitHub
   or `glab-cli` for GitLab. Use their context scripts for existing requests.
2. Record the request URL, remote head SHA, base SHA, checks, review state,
   mergeability, and existing automatic merge/queue state. Fetch the relevant
   remotes and branches; never assume the target is `main` or that a fork's
   head lives on `origin`.
3. Inspect the working tree. Preserve unrelated edits and existing authorship;
   use an isolated worktree when needed. Create a task branch before changing
   a default/protected branch. Include existing uncommitted work only when it
   belongs to this task. Do not stash or discard unrelated work.
4. For an old request, load `modernize` to assess whether its intent survives
   current target-branch changes. A `REWORK` can proceed when the original task
   authorizes that work. A `CLOSE` recommendation needs a user decision; leave
   the request open. Do not mechanically revive obsolete behavior.

Keep proof, findings, and decisions in a project-local scratch directory such
as `.tmp/full-send/<slug>/`, outside the committed diff. Record which head and
base each review and check covers.

## Finish and prove the change

Implement the smallest coherent change that satisfies the goal. Gather proof
observed in this session:

- For a bug, reproduce the original failure and verify the same case passes.
- Run the repository's relevant checks and required local gates. Add a focused
  regression test when it protects behavior the existing suite misses; do not
  add tests that merely restate a low-impact edit.
- For UI/runtime changes, run the app and inspect the affected interaction.
  Capture useful screenshots through the project's tooling. Mocked tests alone
  do not prove that the actual user experience works.
- Separate pre-existing failures, infrastructure failures, and unavailable
  checks from evidence that actually passed. Missing proof is a blocker when
  it leaves material behavior unverified.

Meaningful conflict resolutions and later behavior fixes need fresh proof.
Follow the target repository's commands, fixtures, and environment rules.

## Independent review

Use `many-brain-one-task` with its `code-review` profile instead of importing
Theo's model-specific `sol-loop` or `council`. Honor user-selected participants
and the helper's host routing. Reviewers are read-only: no edits, pushes,
hosted comments, merge actions, watches, or nested reviewers.

Give reviewers the goal, exclusions, base/head SHAs, complete scoped diff
(including relevant untracked files), surrounding-code access, and actual
verification results. Keep scoped files stable while they review. Ask for
correctness, broken callers, and unnecessary scope; skip cosmetic preferences.

Validate findings yourself and keep a ledger: stable ID, severity, evidence,
fix or reason for declining, and verification. Default to at most three review
rounds: a full first pass, then changed behavior and open findings. Stop early
when only nits remain. Never expand the change merely to appease a reviewer.

Use `many-brain-one-decision` for a substantive unresolved design or disposition
decision, with a concrete brief, alternatives, evidence, and decision criteria.
It replaces a second council workflow; it is not a substitute for code review
or passing checks. Respect its round limit. A split outcome is not consensus:
decide only within the user's goal and granted authority, record the tradeoff,
and ask when the ambiguity changes the intended result. Reviewer failure or
exhausting the review budget is not approval. Unresolved material correctness
findings block readiness; report a blocker instead of restarting indefinitely.

## Publish and monitor

Fetch the actual target again and integrate new commits before filing. Use the
`modernize` rebase safeguards, including an explicit expected-head lease for
rewrites. Inspect the resulting diff and repeat affected proof/review after
meaningful changes. If another writer advances the branch, fetch and reassess.

Commit only task files and push to the request's own head repository/branch.
Find an existing PR/MR before creating one. Use `colin-mr-description` for the
title/body, evidence, screenshots, attribution, and educational brief; do not
introduce a competing `file-pr` format. Its quick/simple exception still
applies when the user requested one. Open a non-draft request so CI and review
bots run; preserve human-authored description content on updates.

Read [references/monitoring.md](references/monitoring.md) and own the CI/review
loop until ready, merged, or blocked. Use `colin-fix-comments` and
`colin-fix-pipeline` when available for their specialized gathering/fix steps;
their offer-to-monitor or handoff steps do not end this workflow. The reference
also covers these steps when those optional helpers are not installed.

## Gate and merge

Check all of these against a fresh live snapshot, not an earlier green commit:

- Proof and independent review cover the final behavior diff.
- Required checks available before queue/train entry pass for the current
  head; configured review bots have
  finished on it. Findings are fixed or declined with evidence and, for hosted
  findings, a written response. No outstanding human change request remains.
- Required approvals and resolved-discussion rules are satisfied. An AI
  review or MBOD vote cannot replace a required human approval.
- The request is open, non-draft, and mergeable. The head matches the SHA you
  verified. The freshly fetched target is integrated locally or through a
  verified platform merge result; a changed base requires reassessment and
  affected checks, not reliance on an old green result.

Under **full-stop**, perform its handoff now. Otherwise, merge through the
hosting platform using the repository's allowed method and protection rules.
Use an expected-head guard (`gh pr merge --match-head-commit <sha>` on GitHub;
the merge API's `sha` precondition on GitLab). A rejection means refresh and
reassess, never bypass. Do not use `--admin`, skip required approvals, or use
`colin-squash-merge` to bypass the hosted gate; that skill prepares local
history and does not establish PR/MR readiness.

If the repository requires auto-merge, a merge queue, or a merge train, follow
that mechanism. For full-send, checks that only run after queue/train entry
are not prerequisites to entry: satisfy the admission requirements, enqueue
the verified head, then let the platform enforce those checks on its synthetic
merge commit. Never merge around them. For full-stop, those missing checks
instead prevent readiness because queue/train entry is prohibited.

Keep monitoring until the platform reports **merged**.
Enqueueing or enabling auto-merge alone is not completion. Confirm the merged
state and merge/squash commit from the platform, then stop any active monitor.

## Blockers and report

Ask only for a decision or authority you cannot supply: an ambiguous goal,
unverifiable material behavior, unavailable required approval/access, obsolete
work, or an action outside scope. Use the harness's available question tool
with the URL, blocker, and recommended option. If no tool is available, state
the question in the final reply. Await a required answer; silence is not
permission. Leave the request unmerged when the gate cannot pass.

Do not finish merely because CI or a review bot is pending. Use the monitoring
reference's waits; if an external blocker prevents completion, report the
observed blocker and the exact work needed to resume.

Report the PR/MR link, final head, verified state, merge commit when merged,
proof, review outcome, and consequential decisions or remaining risks. Do not
claim a merge or readiness from a submitted command alone.

Adapted from [Theo Browne's tstack](https://github.com/t3dotgg/tstack), revision
`7de017b3fc9d50c03cf3ecb98fb71e0ca65a78bd`; modified for Colin's shared workflows,
GitLab, and invocation policy. Upstream license: [LICENSE](LICENSE).
