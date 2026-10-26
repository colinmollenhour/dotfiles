---
name: restack-requests
description: 'Work with stacked GitLab MRs and GitHub PRs so each lands as one squashed commit and nobody restacks by hand. Merge a request and restack everything stacked on it, or restack a request''s dependents without merging (parent already merged elsewhere, or parent amended or force-pushed). Use when the user says "Merge !2942", "Merge #118", "Merge DEV-3380", "merge the stack", "restack !2942", "restack onto the parent", "my rebase is replaying commits that already merged", or asks how to land stacked MRs/PRs. Replays only each branch''s own commits, proves content is unchanged, force-pushes with lease, and retargets.'
---

# Merge and restack stacked MRs / PRs

Stacked requests: each branch is based on the previous one's branch, and each request squashes
to one commit on the default branch. Squash-merging a parent destroys patch-id correspondence,
so a plain `git rebase <target>` on a child replays the parent's old commits on top of the
squash and conflicts. This skill replays only each branch's own commits, so no conflict is
ever resolved by hand. It needs no `.git/machete` file and no local reflogs.

"Request" means a GitLab MR (`glab`, `!123`) or a GitHub PR (`gh`, `#123`); the helper detects
which from the `origin` URL (override with `--forge gitlab|github`). Use the `glab-cli` or
`gh-cli` skill for anything this one does not spell out.

Two jobs, one workflow:

- **Merge X**: merge X, then restack every open request stacked on it (steps 1–6).
- **Restack X** (no merge): X was merged elsewhere, or X is still open but changed (amended,
  force-pushed, new commits). Skip step 2. The helper reads X's live state: merged → dependents
  move onto X's target branch and the direct children are retargeted to it; open → dependents
  move onto X's current tip and keep their targets.

The user's request authorizes merging X (for "Merge") and force-pushing the dependents,
teammates' branches included, because the restack is verified to preserve every commit's
content. It authorizes nothing else. Rewriting X itself is out of scope; for a root that is
behind its target, use `glab mr rebase` / `gh pr update-branch --rebase`.

## Cheat sheet

`S=<this skill's directory>/scripts/stack-restack`; run from the repository; keep the plan
file in the scratchpad.

```bash
python3 $S plan <request> --out <plan.json>   # number, !n, #n, URL, branch, or DEV-1234
# merge the root (step 2), GitLab:
glab mr rebase <n>                            # only when gates.needs_rebase
glab mr merge <n> --squash --remove-source-branch --sha <root.sha> --yes
# merge the root (step 2), GitHub:
gh pr update-branch <n> --rebase              # only when gates.needs_rebase
gh pr merge <n> --squash --delete-branch --auto --match-head-commit <root.sha>
python3 $S wait <n>                           # run_in_background; merged|stalled|closed|timeout
python3 $S restack --plan <plan.json>         # local only: rebases, verifies, writes results into the plan
python3 $S publish --plan <plan.json>         # push --force-with-lease + retarget, parents before children
```

All output is JSON. `restack-one --head --onto --exclude` is the primitive, for one-off use.

## Procedure

1. **Plan before anything moves.** Run `plan`. Before a merge it must run first: once the forge
   deletes the source branch it retargets children, and the original stack shape is gone.
   Report the tree: root gates, and per dependent its parent, author, own-commit count, target
   change (`target_if_merged`), and any `evil_merges`. Surface `warnings` verbatim; the main
   one is a root that targets a release branch instead of the default branch, which makes the
   per-request squashes land there and the default branch get one commit for the whole branch.

2. **Merge the root** (only for "Merge X", and only if not already merged).
   - Stop and report if `gates.blockers` is non-empty. A failed check, a draft, missing
     approvals, requested changes, or unresolved threads are the user's call, not yours.
   - Running checks: merge with auto-merge (`glab` default, `gh --auto`) and the forge merges
     when they pass. On a GitHub merge queue the request is enqueued and `wait` follows it.
   - `needs_rebase`: rebase on the forge, wait for the new head, re-read `sha` (re-run `plan`
     only if the head is unknown), then merge with that sha. The rebase starts new checks.
   - Always pass the sha guard (`--sha` / `--match-head-commit`) so only the head you checked
     gets merged.
   - Run `wait` in the background. `stalled` (checks failed, auto-merge cancelled) or `closed`
     ends the run: report it and do not restack.

3. **Restack locally.** Run `restack`. Per dependent it creates a throwaway worktree,
   cherry-picks the own commits with rerere off, and drops commits already on the base. It
   checks that every replayed commit has the same changed lines (and binary blobs) as the
   original, and that the result merges cleanly into its final target. A branch already based
   on the new base is reported `up_to_date` and left alone. Nothing is pushed.
   - `conflict`: report the commit subject, files, and `base_commits_with_same_subject`. Do
     **not** resolve it yourself; skip that branch and its descendants.
   - `evil_merges`: a merge commit in the branch carries a hand-made resolution that
     replaying would drop. Report it; rerun with `--allow-evil-merges` only if the user says so.
   - `branch moved since plan`: someone pushed. Re-run `plan` for that subtree.
   - `empty: true`: everything on the branch is already in the base. Report it.

4. **Publish.** Run `publish`. It keeps a local backup ref `refs/restack-backup/<branch>` at
   the old head, pushes with `--force-with-lease=<branch>:<old head>` to an explicit refspec,
   and retargets the request when its target was the merged branch. The forge may have
   retargeted it already. A lease rejection means the author pushed meanwhile: report it, do
   not retry with `--force`.

5. **Update each restacked request.**
   - Description: if it says it is stacked on or depends on X, say X merged as
     `<short squash sha>` (or, in open mode, that it was rebased onto X's new tip) and the
     branch now holds only its own commits. A restack changes no behavior, so do not rewrite
     the rest. If the repo requires a `Described at: <short-sha>` footer, set it to the new
     head. Use `colin-mr-description` only when the description is wrong for other reasons.
   - Note for authors other than the user, so a stale local copy does not resurrect the old
     commits: `glab mr note <n> -m` / `gh pr comment <n> -b` with "Restacked onto <target>
     after <ref> merged (<old> → <new>). If you have this branch locally: git fetch && git
     reset --hard origin/<branch>".

6. **Report.** Merged root and its squash SHA; per dependent: old → new head, commits replayed,
   empty commits dropped, retarget, and anything skipped with the reason. Mention the backup
   refs. CI owns the checks, so do not run local test suites for a content-identical restack.

## Landing a whole stack

"Merge the stack" is the loop above, bottom-up, one request at a time: after step 4 the first
child is the new root. Re-run `plan` on it, wait for its checks on the restacked head, then
merge it. Stop at the first blocker, conflict, or lease rejection and report; never merge a
dependent as a side effect of "Merge X" unless the user asked for the whole stack.

## Prohibitions

- Never hand-resolve a conflict or run a bare `git rebase <target>` on a dependent.
- Never `--force`; never push a branch whose `restack` result is not `ok`.
- Never merge a dependent as part of "Merge X"; merging it needs its own request.
- Never squash or reword a dependent's commits; the branch keeps its review history.
- Never merge the target branch into a stacked branch.
- Never delete a parent's local branch or backup ref until every dependent is restacked.
