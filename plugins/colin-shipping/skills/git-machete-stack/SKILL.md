---
name: git-machete-stack
description: 'Land a chain of stacked GitLab/GitHub merge requests as one squashed commit per MR using git machete, with no manual conflict resolution. Use for stacked MRs/PRs, .git/machete layouts, restacking a child after its parent was squash-merged, fork points, squash-merge detection, "my rebase is replaying commits that already merged", or planning the merge order of a stack. To merge one MR and restack whatever sat on it, use colin-merge-stack.'
---

# Landing a stacked-MR chain as one commit per MR

Use this skill when a feature is split across **stacked merge requests** — each MR's source
branch based on the previous MR's source branch — and the goal is: one squashed commit per
MR on the default branch, full commit history preserved on each branch for review, and zero
hand-resolved conflicts.

For the everyday case, merging one MR and restacking its dependents, use `colin-merge-stack`.
It needs no machete layout and no local reflogs. This skill is for diagnosing and planning a
whole layout.

## The invariant that makes this work

Squash-merging a parent **destroys patch-id correspondence** between the parent's commits and
the single commit that landed. A bare `git rebase <parent>` on the child then replays the
parent's commits a second time on top of the squash and explodes in conflicts.

> **Every rebase must replay only a branch's own commits.**

Two ways to honor it, in order of preference:

1. `git machete traverse` / `git machete slide-out` — machete derives the fork point from
   local reflogs, so it knows where the branch's own history starts.
2. Explicit `git rebase --onto <new-base> <old-parent-tip> <branch>` — you name the boundary.

Everything else in this skill exists to protect that invariant.

## Phase 0 — Establish environment facts (read-only)

Never assume; detect. Run these and report the values:

```bash
git machete --version
cat .git/machete                                    # the layout is a plain indented text file
git config --get-regexp '^machete'                  # squashMergeDetection, gitlab.domain, ...
git branch --show-current
glab api projects/:id --paginate=false | \
  jq '{path_with_namespace, default_branch, merge_method, squash_option,
       remove_source_branch_after_merge, only_allow_merge_if_pipeline_succeeds}'
```

What each project setting means for this workflow:

| Setting | Wanted | Why |
|---|---|---|
| `squash_option` | `default_on` (Encourage) or `always` (Require) | the per-MR squash is what produces one commit per MR |
| `merge_method` | `ff` or `rebase_merge` (semi-linear) | `merge` adds a merge commit per MR and breaks the one-commit goal |
| `remove_source_branch_after_merge` | `true` | enables the reliable post-merge cleanup path (`slide-out --removed-from-remote`) |
| bottom of stack targets the default branch | yes | see the release-branch trap below |

**Release-branch trap.** If the bottom of the chain targets a long-lived
release/integration branch rather than the default branch, the per-MR squashes land only on
that branch, and the default branch gets **one commit for the entire release**. That defeats
the goal — say so explicitly before planning anything else.

## Phase 1 — Diagnose the stack (read-only, no history rewrites)

`git machete status` prints a branch's commits **above** its own line, not below it. Read
carefully or you will attribute commits to the wrong branch.

```bash
git machete status -L                               # -L = list commits with hashes
```

Reconstruct the real parent/child tree from the indentation and report per branch: MR number,
author, unique-commit count, and qualifiers. Branches annotated `rebase=no push=no` belong to
other people — `traverse` skips them, and so do you.

Then run each check below. Report findings; do not fix anything yet.

### Layout vs. real dependencies

Machete infers the tree from GitLab target branches, so a wrong target yields a wrong layout.
Flag:

- any branch that is a **sibling** of a branch whose code it appears to depend on — check
  commit subjects first, then the actual diffs
- any child parented to the wrong chain entirely

Confirm a suspected mis-parenting by building/testing the branch rebased onto its claimed
parent alone.

### Per-branch checks

```bash
# linearity of every edge
git merge-base --is-ancestor <parent> <child> && echo in-sync || echo DIVERGED

# fork point — flag anything not equal to the parent tip
git machete fork-point --explain <branch>

# unique commits (zero = empty branch)
git log --oneline <parent>..<child>

# duplicate-work fingerprint: repeated subjects, identical trees
git log --format='%h %T %s' <parent>..<child>

# merge commits hiding in the branch's own history
git log --merges --oneline <parent>..<child>
```

Interpretation:

- **Fork point ≠ parent tip** → the branch is not cleanly stacked; a rebase from the wrong
  boundary will replay foreign commits.
- **Zero unique commits** → may be a placeholder, or the work was absorbed into a sibling by
  an earlier bad rebase. Check `git reflog <branch>` before calling it empty.
- **Duplicated consecutive subjects or identical trees** → the fingerprint of a rebase that
  already replayed applied commits. Real conflicts likely live here.
- **Merge commits inside a branch's own range** (`Merge remote-tracking branch 'origin/master'
  into <branch>`, or a parent merged into a child) → this is common and matters: `git rebase`
  **drops merge commits by default**, so restacking linearizes them. Usually fine and even
  desirable, but it is where conflict resolution actually resurfaces, because the conflict
  resolutions recorded in those merge commits are discarded. Call these out per branch as
  the most likely source of manual work.

### Blockers

Report up front anything that genuinely requires manual conflict resolution, and why. Do not
bury it in the plan.

## Phase 2 — Report, then stop

Present findings and **wait for explicit go-ahead** before any command that rewrites history
or touches the remote. State assumptions; if the dependency structure is ambiguous, ask
rather than guess.

## Phase 3 — The plan

Deliver:

1. **Corrected `.git/machete` layout**, if it needs changing — as the literal file content.
   Preserve `rebase=no push=no` qualifiers; never strip them silently (`checkout-mrs` and
   `anno-mrs` re-add them anyway).
2. **Copy-pasteable commands in execution order.** For each step mark: which branches get
   rewritten, which get force-pushed, and **who must run it** — you, or the branch's author
   for `rebase=no push=no` branches.
3. **Merge order: bottom-up, per independent chain.** Note which chains are genuinely
   independent once parentage is settled; those can proceed in parallel.
4. **Restack step after each merge** (see below).

## Phase 4 — Execute: the per-merge loop

After each MR merges (squash-on-merge, source branch deleted), restack the next one:

```bash
git machete slide-out --removed-from-remote          # drops merged branches, reparents children
git machete traverse -WL                             # fetch + whole tree, sync GitLab MRs
```

`traverse -WL` (`-W` = `--fetch --whole`, `-L` = `--sync-gitlab-mrs`) fetches, rebases each
branch onto its parent from the correct fork point, force-pushes with lease, and
creates/retargets MRs in one pass. It skips `rebase=no push=no` branches.

### Squash-merge detection fallback

Machete detects a squash-merged parent heuristically via `machete.squashMergeDetection`:

- `none` — strict merges only
- `simple` (default) — compares trees; **misses when the default branch moved between your
  last rebase and the merge**
- `exact` — compares patches; catches more, but is expensive on large repos

Escalation ladder when detection fails:

```bash
git machete status --squash-merge-detection=exact           # retry with stronger detection
git machete slide-out --no-rebase <merged-branch>           # reparent only, no rebase
git machete traverse -WL                                    # then restack from clean state
```

Never hand-resolve conflicts as the response to a detection miss.

### Last resort: explicit rebase

When machete's fork point is wrong and cannot be corrected, name the boundary yourself:

```bash
git rebase --onto <new-base> <old-parent-tip> <branch>
git push --force-with-lease origin <branch>
git machete gitlab retarget-mr -b <branch>
```

`<old-parent-tip>` is the pre-merge tip of the old parent — capture it *before* anything
moves (`git rev-parse <parent>`), or recover it from `git reflog <parent>`. A branch you never
checked out has no reflog, so machete cannot find its fork point. Use this explicit form, and
take the old tips from the parent MR's version history
(`glab api projects/:id/merge_requests/<iid>/versions`), which survives branch deletion.

## Prohibitions

- **Do not flatten a branch locally.** No `git machete squash`, no `git machete reapply` —
  the per-commit history must survive for review. The squash happens at merge time, on
  GitLab.
- **Do not merge the default branch into stacked branches**, and do not use
  `traverse --merge`. Rebase only; merges tangle a stack fast.
- **Do not run a bare `git rebase <parent>`** on a branch whose parent was squash-merged.
- **Do not force-push anyone else's branch** unless the user asked for that restack.
  `rebase=no push=no` means hand that step to its author.
- **Do not delete local branches** until every downstream branch has been restacked —
  machete's fork-point inference reads local reflogs, and that is precisely what keeps the
  post-squash rebase clean.
- **`--force-with-lease`, never `--force`.**

## Reference

`reference.md` has the full machete command surface for this workflow, a failure-mode
catalog with symptoms and fixes, a worked example, and a portable one-shot prompt template
for handing this task to another tool.
