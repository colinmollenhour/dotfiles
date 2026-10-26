# Reference: git machete stacked-MR workflow

Verified against `git-machete 3.44.1`.

## 1. Command surface for this workflow

### Read-only / diagnostic

| Command | Use |
|---|---|
| `git machete status -l` / `-L` | tree + commits (`-L` includes hashes). Commits print **above** their branch's line |
| `git machete status --squash-merge-detection=exact` | re-check merged state with patch comparison |
| `git machete fork-point --explain <branch>` | shows *why* machete picked that boundary — the single most useful diagnostic |
| `git machete list <category>` | machine-readable branch sets (`managed`, `slidable`, `with-overridden-fork-point`, ...) |
| `git machete diff <branch>` | diff of the branch against its fork point |
| `git machete file` | path to the layout file |

### Mutating

| Command | Use |
|---|---|
| `git machete traverse -WL` | the workhorse: fetch, rebase each branch from its fork point, push with lease, create/retarget MRs |
| `git machete traverse -WL --start-from=<b> --stop-after=<b>` | restack a slice of the tree only |
| `git machete traverse -WL -y` | non-interactive; only after a dry pass you trust |
| `git machete slide-out --removed-from-remote` | drop branches whose remote was deleted (i.e. merged), reparent children |
| `git machete slide-out --no-rebase <branch>` | reparent children without rebasing — the squash-detection-failure escape hatch |
| `git machete slide-out <branch> --delete` | also delete the local branch. Hold off until downstream is restacked |
| `git machete edit` | edit `.git/machete` in `$EDITOR` |
| `git machete anno -L` | refresh MR numbers/authors/qualifiers from GitLab |
| `git machete gitlab checkout-mrs <N>...` | fetch MRs into local branches and build the layout |
| `git machete gitlab retarget-mr -b <branch>` | point the MR at its new parent |
| `git machete gitlab restack-mr` | force-push with lease + retarget the current branch's MR |
| `git machete gitlab create-mr [--draft]` | open an MR targeting the machete parent |
| `git machete gitlab update-mr-descriptions --related` | refresh the stack diagram in MR descriptions |

`-W` expands to `--fetch --whole`; `-L` is `--sync-gitlab-mrs` (`-H` for GitHub).

### Commands to avoid here

- `git machete squash` / `git machete reapply` — flatten the branch locally, destroying review history.
- `git machete traverse --merge` (`-M`) / `--no-edit-merge` — merge instead of rebase.
- `git machete advance` — fast-forwards the parent onto a child locally; the merge belongs on GitLab.

## 2. Branch qualifiers

Qualifiers live in the annotation in `.git/machete`, whitespace-separated, anywhere in the line:

```
master
  develop  rebase=no slide-out=no
    my-branch  MR !123
    someone-elses-branch  MR !124 (their-login) rebase=no push=no
    local-experiment  push=no
```

- `rebase=no` — traverse won't rebase it
- `push=no` — traverse won't push it
- `slide-out=no` — traverse won't offer to slide it out

`gitlab anno-mrs` and `gitlab checkout-mrs` **add `rebase=no push=no` automatically** whenever the
MR author isn't the current user. They are only changed by hand-editing the file or via
`git machete anno`. Re-running `anno-mrs` restores them, so a manual strip does not stick — and
stripping them silently is how you end up force-pushing a colleague's branch.

## 3. `machete.squashMergeDetection`

| Mode | Behavior | Cost |
|---|---|---|
| `none` | strict merges only (fast-forward or 2-parent) | cheapest |
| `simple` (default) | compares the child's tree against trees of commits in the parent | cheap |
| `exact` | compares patches introduced by commits | expensive on large repos |

`simple` fails exactly when the default branch moved between your last rebase and the merge: the
squash commit's tree then contains other people's changes too, so no tree matches. That is the
common case in a busy repo, so expect to need the fallback ladder in `SKILL.md`.

Override per-invocation with `--squash-merge-detection=<mode>` on `status`, `traverse`,
`discover`, `slide-out`.

## 4. Failure-mode catalog

| Symptom | Cause | Fix |
|---|---|---|
| Rebase replays commits already on the default branch; conflicts in files you never touched | bare `git rebase <parent>` after the parent was squash-merged | abort; `slide-out --no-rebase <merged>` then `traverse -WL` |
| `status` shows a red edge for a branch you just rebased | parent moved again (someone merged), or fork point is stale | `traverse -WL` (it fetches first) |
| Yellow edge: "in sync but fork point off" | branch descends from parent but machete's reflog-derived boundary differs | `fork-point --explain`; if wrong, `fork-point --override-to=<commit>` or explicit `rebase --onto` |
| Branch has zero unique commits | placeholder, **or** its work was absorbed into a sibling by an earlier bad rebase | `git reflog <branch>` before concluding it's empty |
| Consecutive duplicate commit subjects; two commits with the same tree | an earlier rebase replayed already-applied commits | find the boundary in the reflog, then `rebase --onto` from the correct old parent tip |
| Conflicts reappear that were already resolved once | the resolution lived in a merge commit inside the branch; `git rebase` drops merge commits | expect it; consider `git rerere` enabled beforehand, or resolve once and record it |
| `traverse` silently skips a branch | `rebase=no push=no` qualifier (not your MR) | hand that step to the branch author |
| One squash commit for the whole feature on the default branch | bottom of the stack targeted a release/integration branch | retarget the bottom MR at the default branch before merging anything |
| Merging MR n breaks MR n+2 but not n+1 | layout doesn't match real code dependencies — a sibling actually depends on a sibling | fix `.git/machete`, retarget the MR, then `traverse -WL` |

## 5. Merge-commit caveat (common in practice)

Real stacked branches frequently contain merge commits in their own range:

```
Merge remote-tracking branch 'origin/master' into <branch>
Merge branch '<parent>' into <child>
```

Consequences:

- `git rebase` drops merge commits, so restacking **linearizes** the branch. The resulting history
  is cleaner and reviewers still see every real commit.
- Conflict resolutions recorded *inside* those merge commits are discarded and must be redone.
  This is the single biggest source of unavoidable manual work — surface it during diagnosis with
  `git log --merges --oneline <parent>..<child>`.
- Enabling `git config rerere.enabled true` *before* the rewrite pays off when the same conflict
  recurs across restacks of a long chain.

## 6. Worked example (two-branch chain)

Observed in `shipstream/server`:

```
master
  DEV-2983-remove-partial-location-holds  MR !2654 (bob2021) rebase=no push=no
    DEV-3088_add-hold-groups-to-stock_movement_list-API  MR !2693 (anton.a) rebase=no push=no
```

Diagnosis output that mattered:

- `!2654` → `master`, `squash=true`; `!2693` → `DEV-2983-remove-partial-location-holds`, `squash=true`. Bottom targets the default branch: goal is achievable.
- `fork-point --explain DEV-3088_...` returned the tip of `DEV-2983-...` — cleanly stacked.
- Both branches contain `Merge remote-tracking branch 'origin/master'` commits, and the child also
  contains `Merge branch 'DEV-2983-...' into DEV-3088_...` → restacking will linearize both, and
  the child's parent-merge resolutions will need redoing.
- Both are `rebase=no push=no`: neither branch is mine to rewrite. Every rewrite step is the
  authors' to run.

Plan shape:

```bash
# 1. record the boundary BEFORE anything moves
git rev-parse DEV-2983-remove-partial-location-holds        # -> <OLD_PARENT_TIP>

# 2. merge !2654 on GitLab with squash enabled (fast-forward merge method)

# 3. restack the child  [rewrites + force-pushes DEV-3088_... — run by its author]
git fetch --prune
git machete slide-out --removed-from-remote                 # source branch auto-deleted on merge
git machete traverse -WL --start-from=DEV-3088_add-hold-groups-to-stock_movement_list-API

# 3b. if squash detection missed the merge
git machete slide-out --no-rebase DEV-2983-remove-partial-location-holds
git machete traverse -WL

# 3c. if machete's fork point is wrong
git rebase --onto master <OLD_PARENT_TIP> DEV-3088_add-hold-groups-to-stock_movement_list-API
git push --force-with-lease origin DEV-3088_add-hold-groups-to-stock_movement_list-API
git machete gitlab retarget-mr -b DEV-3088_add-hold-groups-to-stock_movement_list-API

# 4. merge !2693 with squash → second commit on master
```

## 7. Observed `shipstream/server` environment

Re-verify rather than trusting these; they are a snapshot, not a contract.

```
git-machete 3.44.1
machete.gitlab.domain               gitlab.bss-llc.com
machete.gitlab.mrdescriptionintrostyle  full
machete.squashmergedetection        simple

project default_branch                     master
project merge_method                       ff              (fast-forward)
project squash_option                      default_on      (Encourage)
project remove_source_branch_after_merge   true
project only_allow_merge_if_pipeline_succeeds  false
```

Implications: squash + fast-forward means each merged MR lands as exactly one commit on `master`
with no merge commit. `remove_source_branch_after_merge = true` makes
`slide-out --removed-from-remote` the primary post-merge cleanup, which sidesteps
`squashMergeDetection` entirely — prefer it over relying on detection.

The layout file for this repo is large (~95 branches, several independent chains rooted at
`master` plus at least one non-`master` root). Scope diagnosis to the chain in question rather
than auditing the whole tree.

## 8. Portable one-shot prompt template

For handing this task to a tool without this skill. Fill `<MR>` (target MR, e.g. `!2733`),
`<BRANCH>` (its source branch), `<DEFAULT>` (default branch), `<HOST>` (GitLab host).

```text
I work in a GitLab repo (<HOST>) where large features are split into stacked merge requests:
each MR's source branch is based on the previous MR's source branch, forming a chain (sometimes
a tree of independent chains) from <DEFAULT> up to the newest work. The stack is managed with
git machete; the layout lives in .git/machete, a plain indented text file I can edit. In
`git machete status`, a branch's commits print ABOVE its own line. Branches authored by others
carry `rebase=no push=no` qualifiers, which makes traverse skip them. I'm working on <MR>
(branch <BRANCH>).

What I want:
1. One commit per MR on <DEFAULT> — squashed at merge time via GitLab squash-on-merge.
2. Full per-commit history preserved on each branch for review. Do NOT flatten locally.
3. Zero manual conflict resolution. Squash-merging a parent breaks patch-id correspondence, so
   a naive `git rebase <parent>` replays the parent's commits again and explodes. Any rebase
   must replay ONLY a branch's own commits — via machete's reflog-derived fork point, or an
   explicit `git rebase --onto <new-base> <old-parent-tip>`.
4. Nobody else's branch force-pushed by me.

Diagnose before acting. Run read-only checks, report findings, and wait for my go-ahead before
any command that rewrites history or touches the remote:
- Map the stack: `git machete status -L`, reconstruct the parent/child tree, list per branch the
  MR number, author, commit count, qualifiers.
- Validate the layout against REAL dependencies, not GitLab target branches. Flag any branch
  that is a sibling of a branch whose code it depends on (commit subjects, then diffs), and any
  child parented to the wrong chain. Confirm by building/testing the branch on its claimed
  parent alone.
- Per branch: linearity (`git merge-base --is-ancestor`), fork points
  (`git machete fork-point --explain` — flag anything ≠ parent tip), empty branches (check the
  reflog before assuming placeholder), duplicate commit subjects and identical trees via
  `git log --format='%h %T %s'`, and merge commits via `git log --merges` (rebase drops them,
  discarding their conflict resolutions).
- Verify GitLab config: squash-on-merge enabled; merge method ff or semi-linear; and that the
  BOTTOM of the stack targets <DEFAULT> directly — if it sits on a release/integration branch,
  <DEFAULT> gets one commit for the whole release, which defeats the goal. Tell me if so.
- Report blockers that genuinely need manual conflict resolution, and why.

Then give me a plan: the corrected .git/machete layout if needed; a copy-pasteable command
sequence in execution order marking which branches get rewritten/force-pushed and WHO runs each
step; the bottom-up merge order per independent chain; and how each next branch gets restacked —
prefer `git machete traverse -WL`. If squash-merge detection fails (machete.squashMergeDetection
`simple` misses when <DEFAULT> moved between my last rebase and the merge), use
`git machete slide-out --no-rebase <merged-branch>` then `git machete traverse -WL` rather than
hand-resolving.

Constraints: no `git machete squash`/`reapply`; no `traverse --merge` and never merge <DEFAULT>
into stacked branches; never a bare `git rebase <parent>` when the parent was squash-merged;
don't delete local branches until every downstream branch is restacked (fork-point inference
reads local reflogs); don't strip `rebase=no push=no` without telling me; `--force-with-lease`,
never `--force`. State assumptions explicitly and ask if the dependency structure is ambiguous.
```
