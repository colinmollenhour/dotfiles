---
name: modernize
slash: true
disable-model-invocation: true
description: Reassess an old PR/MR against current product and code, then rebase and update it if still useful. Use when explicitly asked to modernize or bring a stale PR/MR up to date, not for a general dependency upgrade.
argument-hint: "[PR/MR URL, number, or branch]"
---

# Modernize

Modernize the idea as well as the branch. A conflict-free rebase does not prove
that the proposed behavior still belongs in the product.

## Scope and current state

Modernizing authorizes rebasing and updating this request's branch. It does
not authorize merging, closing, changing the target branch, or expanding the
goal. If a caller also authorizes rework or full-send, use that authority only
within its stated goal and gate. A full-stop caller's no-merge rule persists.

Load `gh-cli` or `glab-cli` for the actual platform and use its context helper.
Record URL, state, actual target repository/branch, head repository/branch,
remote head SHA, author, checks, and review state. Stop for an already merged
or closed request unless the user specifically asked to investigate it.
Inspect the working tree; preserve unrelated user work and authorship. Use a
disposable worktree if the active worktree is dirty or otherwise occupied.

Fetch the latest target and request head from their actual remotes, including
forks and relevant related branches. Record the remote head SHA as the lease
expectation and the merge base before rewriting. Never substitute a stale
local default branch for the request's actual target.

## Recover intent and surrounding changes

Read the title, description, linked issues, commits, and complete diff. State
the smallest coherent goal before judging the implementation. Use the merits
lens from `colin-review-merits` when available: is the task valuable, and are
its implementation decisions still appropriate? Gather code evidence wherever
needed, then separately read review threads for unresolved behavior constraints
and existing author decisions.

Inspect target-branch commits since divergence and search merged/open PRs or
MRs when code paths, titles, or behavior suggest a competing implementation.
Look beyond overlapping lines:

- Is the original user problem already solved or intentionally abandoned?
- Have APIs, types, dependencies, schemas, or ownership boundaries changed?
- Did code move or disappear, or did a newer invariant replace the old one?
- Would this branch restore obsolete behavior or create duplicate mechanisms?
- Does the remaining benefit justify the maintenance cost?

## Choose a disposition before pushing

- **MODERNIZE:** the goal is useful and the implementation still fits. Rebase,
  resolve intent-preserving conflicts, verify, and update the branch.
- **REWORK:** the goal is useful but needs a different implementation. Explain
  the smallest credible rewrite. Unless that rework is already authorized,
  stop before rewriting or pushing and request the needed decision.
- **CLOSE:** concrete evidence shows the request is superseded, obsolete,
  directionally wrong, or no longer worthwhile. Recommend closure and stop
  before rebasing or pushing. Do not close without explicit authorization.

Age alone is not evidence, and sunk effort is not a reason to land a change.
For a substantive disputed disposition or design choice, use
`many-brain-one-decision` with the intent, current evidence, candidate outcomes,
and criteria. Respect its bounded rounds; disclose a split outcome rather than
claiming consensus. A debate cannot authorize closure, scope expansion, or a
merge. Do not run a debate for an obvious mechanical update.

## Rebase without losing intent

For `MODERNIZE` (or an independently authorized rework):

1. Preserve a local backup ref to the recorded head and create an isolated
   task branch/worktree when needed. Work from the fetched head.
2. Rebase onto the freshly fetched target. If `.git/machete` manages this
   branch stack, load `git-machete` when available before using that CLI;
   preserve declared ancestry and do not silently retarget a stacked request.
3. Resolve conflicts according to current intent and newer target invariants,
   including moved/deleted code and dependency state. A product or architecture
   disagreement means reassess the disposition instead of guessing. Verify
   index stages during a rebase; do not blindly apply a merge-only helper's
   `MERGE_HEAD` or ours/theirs assumptions.
4. Compare old and new series with `git range-diff
   <old-base>..<old-head> <new-base>..<new-head>` and inspect the final target
   diff. Account for dropped/cherry-picked commits. Check that intentional
   behavior survived and already-landed behavior was not reintroduced.
5. Run the focused checks required for the affected behavior and meaningful
   conflict resolutions. Distinguish pre-existing/environment failures from
   regressions; do not describe unverified behavior as proven.
6. Fetch the target again before pushing; reassess if it advanced. Push only
   this request's branch to its head remote with the exact observed-head lease:

   ```bash
   git push --force-with-lease=refs/heads/<head-branch>:<observed-head-sha> <head-remote> HEAD:refs/heads/<head-branch>
   ```

   A failed lease means another writer changed it. Fetch, compare, and reassess;
   never merely replace the expected SHA and retry the overwrite. If nothing
   changed, no rewrite or push is needed.

Do not merge. Under a full-stop caller, verify automatic merge and queue/train
enrollment are off before any push. A standalone modernize must also inspect
existing automatic merge/queue state before pushing: if updating the branch
would trigger a merge, obtain authority to cancel it or leave the update local.

## Description and report

Refresh a stale description through `colin-mr-description` when behavior or
scope changed, preserving human text. In standalone modernize, do not post
comments or commit notes unless requested; this overrides that helper's
default post-push note. A full-send/full-stop caller may separately authorize
review replies and commit notes. Use those existing attribution conventions
for any authorized comments rather than importing another commenting skill.

Lead the report with `MODERNIZE`, `REWORK`, or `CLOSE` and the reason. Include
the request link, relevant target changes, conceptual conflicts, rebase/push
result and final head, checks and outcomes, and remaining work. Separate facts
from judgment and name anything that could not be verified. Standalone
modernize does not claim the full-send readiness gate has passed; return to
the caller's proof/review/monitoring workflow when there is one.

Adapted from [Theo Browne's tstack](https://github.com/t3dotgg/tstack), revision
`7de017b3fc9d50c03cf3ecb98fb71e0ca65a78bd`; modified for Colin's shared workflows,
GitLab, and invocation policy. Upstream license: [LICENSE](LICENSE).
