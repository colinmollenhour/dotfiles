---
name: colin-merge-stack
description: 'Merge a GitLab MR and restack every open MR stacked on it (children and grandchildren), so squash-merging a parent never leaves its dependents unmergeable. Use when the user says "Merge !2942", "Merge DEV-3380", "merge <branch> and restack", or asks to restack MRs after their parent merged. Replays only each branch''s own commits, proves content is unchanged, force-pushes with lease, and retargets the MRs.'
---

# Merge an MR and restack its dependents

"Merge XYZ" means: merge XYZ on GitLab, then rebase every open MR stacked on it onto the
new base so each one merges cleanly. The user's request is the authorization to merge XYZ
and to force-push its dependents, teammates' branches included, because the restack is
verified to preserve every commit's content. It does not authorize anything else.

Squash-merging XYZ destroys patch-id correspondence, so a plain `git rebase master` on a
dependent replays XYZ's old commits on top of the squash and conflicts. The helper replays
only `rev-list <head> --not <new base> <every head XYZ's branch ever had>`, using the MR's
version history, so it also covers force-pushes, server-side rebases, and a child that merged
an older parent tip.

For repairing a whole `.git/machete` layout or planning a multi-MR landing order, use
`git-machete-stack` instead.

## Cheat sheet

`S=<this skill's directory>/scripts/stack-restack`; run from the repository; keep the plan
file in the scratchpad.

```bash
python3 $S plan <mr> --out <plan.json>        # MR iid, !iid, URL, branch, or DEV-1234
glab mr rebase <iid>                          # only when gates.needs_rebase (ff merge method)
glab mr merge <iid> --squash --remove-source-branch --sha <root.sha> --yes
python3 $S wait <iid>                         # run_in_background; returns merged|stalled|closed|timeout
python3 $S restack --plan <plan.json>         # local only: rebases, verifies, writes results into the plan
python3 $S publish --plan <plan.json>         # push --force-with-lease + retarget, parents before children
```

All output is JSON. `restack-one --head --onto --exclude` is the primitive, for one-off use.

## Procedure

1. **Plan before anything moves.** Run `plan`. It must run before the merge: once GitLab
   deletes the source branch it retargets children, and the original stack shape is gone.
   Report the tree: root gates, and per dependent its parent, author, own-commit count,
   target change, and any `evil_merges`.

2. **Merge the root, if it is not merged already.**
   - Stop and report if `gates.blockers` is non-empty. A failed or skipped pipeline, a draft,
     missing approvals, or unresolved threads are the user's call, not yours.
   - Running pipeline: merging sets auto-merge (glab default) and GitLab merges when it
     passes.
   - `needs_rebase`: `glab mr rebase <iid>`, wait for the new head, re-read `sha` (and
     re-run `plan` only if the head is unknown), then merge with that `--sha`. The rebase starts
     a new pipeline; auto-merge waits for it.
   - Always pass `--sha` so only the head you checked gets merged.
   - Run `wait` in the background. `stalled` (pipeline failed, auto-merge cancelled) or
     `closed` ends the run: report it and do not restack.

3. **Restack locally.** Run `restack`. Per dependent it creates a throwaway worktree,
   cherry-picks the own commits with rerere off, and drops commits already on the base. It then
   checks that every replayed commit has the same changed lines (and binary blobs) as the
   original, and that the result merges cleanly into its final target. Nothing is pushed.
   - `conflict`: report the commit subject, files, and `base_commits_with_same_subject`. Do
     **not** resolve it yourself; skip that branch and its descendants.
   - `evil_merges`: a merge commit in the branch carries a hand-made resolution that
     replaying would drop. Report it; rerun with `--allow-evil-merges` only if the user says so.
   - `branch moved since plan`: someone pushed. Re-run `plan` for that subtree.

4. **Publish.** Run `publish`. It keeps a local backup ref `refs/restack-backup/<branch>` at
   the old head, pushes with `--force-with-lease=<branch>:<old head>` to an explicit refspec,
   and retargets the MR when its target was the merged branch. GitLab may have retargeted it
   already. A lease rejection means the author pushed meanwhile: report it, do not retry with
   `--force`.

5. **Update each restacked MR.**
   - Description: if it says it is stacked on or depends on XYZ, say XYZ merged as
     `<short squash sha>` and the branch now holds only its own commits. A restack changes no
     behavior, so do not rewrite the rest. If the repo requires a `Described at: <short-sha>`
     footer, set it to the new head. Use `colin-mr-description` only when the description is
     wrong for other reasons.
   - Note for authors other than the user, so a stale local copy does not resurrect the old
     commits: `glab mr note <iid> -m "Restacked onto <target> after !<root> merged (<old>
     → <new>). If you have this branch locally: git fetch && git reset --hard
     origin/<branch>"`.

6. **Report.** Merged root and its squash SHA; per dependent: old → new head, commits replayed,
   empty commits dropped, retarget, and anything skipped with the reason. Mention the backup
   refs. The pipelines are CI's job, so do not run local test suites for a content-identical
   restack.

## Prohibitions

- Never hand-resolve a conflict or run a bare `git rebase <target>` on a dependent.
- Never `--force`; never push a branch whose `restack` result is not `ok`.
- Never merge a dependent as part of "Merge XYZ"; merging it needs its own request.
- Never squash or reword a dependent's commits; the branch keeps its review history.
