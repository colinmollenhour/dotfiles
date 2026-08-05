---
description: Clean up local git branches and stale worktrees (squash-aware; prefers worktrunk when available)
allowed-tools: Bash(git *), Bash(wt *), Bash(glab *), mcp_question
---

# Context

Current branch: !`git branch --show-current`
Default remote branch: !`git remote show origin | grep 'HEAD branch' | awk '{print $NF}'`
Total local branches: !`git branch --list | wc -l`
Worktrees: !`git worktree list | wc -l`
Worktrunk available: !`command -v wt >/dev/null && echo yes || echo no`

# Your task

Help the user clean up stale **local branches** and, when useful, **stale worktrees**. Prefer **worktrunk (`wt`)** over raw git when it is installed — it understands squash merges and can remove worktree + branch together.

## Colin's typical preferences (defaults)

These are the usual defaults from real cleanup sessions. Override only when `$ARGUMENTS` or the user says otherwise.

### Always protect
- Never delete `master`, `main`, or the **current** branch.
- Never delete a branch that is **checked out in another worktree** via `git branch -D` alone — use `wt remove` (or remove the worktree first).
- **Keep `release/*` worktrees/branches** unless the user explicitly asks to remove a specific release line.

### Auto-delete (no need to re-confirm each name once the plan is accepted)
1. **Gone** — upstream shows `[gone]` (remote branch deleted). Safe; usually squash-merged MRs.
2. **Tracked, 0 ahead of upstream** — live remote still exists and local has no unpushed commits. Safe to drop the local ref; can always `git switch <branch>` / re-fetch later. *This is the main "thin the local branch list" cleanup.*
3. **Content-integrated into the default branch** (cheap + deep checks below) — including untracked / no-upstream branches.
4. **Worktrees whose only MR is already merged** — remove with `wt remove -y` (add `-f` if dirty, `-D` if git still thinks unmerged).
5. **Detached stale review worktrees** the user names (e.g. old ultra-review sandboxes).

### Ask before deleting
1. **Tracked, ahead of upstream** — has local-only commits. List with ahead count; default **keep**.
2. **Untracked / no upstream that still fail deep checks** — default **keep** (WIP, `backup/*` restack snapshots, open bugfix stacks).
3. **Worktrees tied to open MRs** — keep; optionally show `glab mr list --source-branch <branch>`.
4. Anything the checks are unsure about.

### Default branch name
Many ShipStream repos use **`master`** as `origin` HEAD (not `main`). Detect via remote HEAD; do not assume `main`. Some worktrees (e.g. knowledge-base) track a different remote (`kb-remote`); do not judge those against `origin/master`.

---

## Integration detection

Do **not** treat "tracked and 0 ahead of *feature* remote" as "merged to master" — that only means the local ref matches `origin/feature`. Still safe to delete locally because the remote copy remains.

### Prefer worktrunk first
When `wt` is available:
- `wt step prune --dry-run` (add `--min-age=0s` to include young worktrees) previews integrated worktrees **and** branch-only refs.
- `wt step prune -y --foreground` bulk-removes safe candidates.
- `wt list` / `wt list --branches` shows `_` (same commit) and `⊂` (content integrated).
- `wt remove [-f] [-D] -y --foreground <branch-or-path>` for targeted worktree+branch removal.

Worktrunk's six checks (cheapest first): same commit → ancestor → empty 3-dot → trees match → merge-adds-nothing → patch-id match.

### Cheap git checks (always run; fast)
Against `origin/<default>` (call it `D`):

1. Same commit: `git rev-parse branch` == `git rev-parse D`
2. Ancestor: `git merge-base --is-ancestor branch D`
3. Empty three-dot: `git diff --numstat D...branch` is empty
4. Trees match: `branch^{tree}` == `D^{tree}`
5. Merge adds nothing: `git merge-tree --write-tree D branch` equals `D^{tree}` (non-zero exit ⇒ conflicts)

If any of 1–5 succeed → **integrated → delete**.

### Deep checks (required for leftovers that fail cheap checks)

Cheap checks **false-negative** on a common case: the feature was squash/cherry-picked onto `D` under a **new commit SHA**, then `D` kept evolving the same files. The local tip still shows a non-empty 3-dot diff and is not an ancestor — but the **patch is already in history**.

Example from a real session: local `auto-worktree-init` @ `5f87f822a9` vs master `0f18649633` — same subject, **identical `git patch-id --stable`**, five minutes apart. 3-dot still dirty because `shell/env.sh` moved on after the merge. Correct verdict: **delete**.

Run deep checks on every remaining non-worktree candidate before declaring "keep":

#### A. `git cherry` (per-commit patch-id equivalence)
```bash
git cherry -v origin/<default> <branch>
```
- Lines starting with `-` → that commit's patch is already on `D`
- Lines starting with `+` → not found on `D`

**Delete if** every listed commit is `-` (or the only `+` commits produce empty patches / are empty merges).

Note: squash-of-many → one commit on `D` often leaves **all** local commits as `+`. Then use B/C.

#### B. Tip-commit patch-id match (single-commit / squash-source branches)
```bash
# local tip patch-id
git show <branch> --format= -- | git patch-id --stable
# candidates on default: same subject and/or same files
git log D --pretty=%H --grep='<subject without Refs…>' -i -40
git log D -200 --pretty=%H -- <files from the tip>
# for each candidate: git show <sha> --format= -- | git patch-id --stable
```
**Delete if** tip patch-id equals any commit on `D`.

Use binary-safe pipes (`subprocess` binary mode or shell pipes). Do not decode huge diffs as UTF-8 (binary blobs will crash a text-mode runner).

#### C. Combined three-dot range patch-id (whole branch as one squash)
```bash
git diff D...<branch> | git patch-id --stable
```
Compare that id to single commits on `D` (subject/file candidates, same as B).  
**Delete if** the combined range matches a squash commit on `D`.

#### D. Subject / MR corroboration (hints only — not sufficient alone)
- `git log D --oneline --grep='…'` for the tip subject
- `glab mr list --source-branch <branch> --all -F json` → `state=merged`

Use as evidence in the summary; only delete when A/B/C (or cheap checks / `wt`) confirm.

### What deep checks do **not** prove
- **`backup/*` restack snapshots** often contain large unique histories that later landed via different squash series — cherry may show dozens of `+` even when the product work is on master. Prefer user confirmation or comparing the *feature* tip that was actually merged, not the whole backup.
- **Stacked MR chains** (e.g. `_SC-*`) may look "ahead" with unique commits after intermediate squash merges; user may force-delete by name after confirming the stack shipped.
- Non-empty 3-dot **alone** is not proof of unmerged work (see auto-worktree-init).

### Verdict matrix (untracked / leftovers)

| Result | Action |
|--------|--------|
| Cheap integrated | Auto-delete |
| `git cherry` all `-` | Auto-delete |
| Tip or range patch-id matches `D` | Auto-delete |
| Unique `+` commits with no patch-id hit | Keep (or ask) |
| User names a stack as squash-merged | Force-delete those names |

---

## Step 1: Fetch and prune

```bash
git fetch origin --prune --quiet
```

## Step 2: Inventory

Collect:
- Local branches (`git branch -vv` / `git for-each-ref`)
- Worktrees (`git worktree list --porcelain`)
- Optional: `wt list --format json` and `wt step prune --dry-run --format json --min-age=0s`
- Optional for worktrees: open/merged MRs via `glab mr list --source-branch <branch> --all -F json`

### Branch categories

| # | Category | Typical action |
|---|----------|----------------|
| 1 | **Gone** (upstream deleted) | Auto-delete |
| 2 | **Tracked, 0 ahead** of live upstream | Auto-delete (re-checkout anytime) |
| 3 | **Tracked, ahead** of upstream | Ask (default keep) |
| 4 | **Untracked** — cheap or deep integrated | Auto-delete |
| 5 | **Untracked** — still unique after deep checks | Ask (default keep) |
| 6 | **Worktree** | Skip `git branch -D`; manage with `wt remove` / prune |
| 7 | **release/*** | Keep unless user asks |

## Step 3: Present summary

Show counts per category, planned auto-deletes, and keep-lists with **why** (e.g. `cherry +1 unique`, `patch-id match 0f18649633`). Tables beat walls of text.

For worktrees: branch, path, last commit date, ahead/behind default, 3-dot files/lines, merge clean?, open/merged MR?, integrated?

## Step 4: Confirm and execute

1. If the plan matches typical prefs, one confirmation is enough for the whole auto-delete set.
2. Use `git branch -D` for branch-only deletes (squash merges will not show as `--merged`).
3. Use `wt remove` / `wt step prune` when a worktree is involved.
4. Batch deletes where possible.
5. Finish with `git branch -vv`, worktree list, and counts removed.

## Worktrunk cheat sheet

```bash
wt list                              # worktree status
wt step prune --dry-run              # preview integrated WT + branches (default min-age 1d)
wt step prune --dry-run --min-age=0s # include young worktrees
wt step prune -y --foreground        # apply
wt remove -y feature                 # remove one WT; delete branch if integrated
wt remove -y -f -D feature           # dirty WT + force-delete unmerged branch
wt remove -y -f /path/to/detached    # path for detached HEAD worktrees
```

## Deep-check cheat sheet

```bash
# per-commit equivalence to default branch
git cherry -v origin/master BRANCH

# tip patch-id
git show BRANCH --format= -- | git patch-id --stable

# whole-branch (3-dot) patch-id — compares to a single squash on master
git diff origin/master...BRANCH | git patch-id --stable

# find same subject on master
git log origin/master --oneline --grep='first line of subject' -i
```

## Important notes

- `git branch -d` often fails on squash-merged branches — use `-D`.
- "Tracked, 0 ahead" cleanup is intentionally aggressive on the **local ref list**; remotes are untouched.
- Gone remotes cannot be re-checked out by the same name; typical pref is **delete gone**.
- After large prunes, background `wt remove` may leave trash under `.git/wt/trash/` (auto-swept ~24h); prefer `--foreground` when you want a definitive finish.
- Always run **deep checks** on untracked leftovers before saying they still have unique work — cheap 3-dot alone lies after squash + follow-up commits on the same files.

# Special Instructions

$ARGUMENTS
