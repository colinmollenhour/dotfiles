---
description: Clean up local git branches and stale worktrees (squash-aware; prefers worktrunk when available)
allowed-tools: Bash(git *), Bash(wt *), Bash(glab *), Bash(paseo *), Bash(git-cleanup-scan *), Bash(*git-cleanup-scan*), mcp_question
---

# Context

Current branch: !`git branch --show-current`
Default remote branch: !`git remote show origin | grep 'HEAD branch' | awk '{print $NF}'`
Total local branches: !`git branch --list | wc -l`
Worktrees: !`git worktree list | wc -l`
Worktrunk available: !`command -v wt >/dev/null && echo yes || echo no`
Paseo available: !`command -v paseo >/dev/null && echo yes || echo no`
Scan helper: !`command -v git-cleanup-scan >/dev/null && echo PATH || (test -x "$HOME/.agents/skills/colin-git-cleanup/scripts/git-cleanup-scan" && echo skill-scripts || echo missing)`

# Your task

Help the user clean up stale **local branches** and, when useful, **stale worktrees**. Prefer **worktrunk (`wt`)** over raw git when it is installed — it understands squash merges and can remove worktree + branch together.

**Prefer the mechanical scanner over hand-rolled inventory.** Run `git-cleanup-scan` **first, before any free-form `git branch` / `git worktree` archaeology** (see Step 1). It fetches, lists branches/worktrees, attaches live `/proc/*/cwd` holders, runs cheap integration + optional `wt step prune --dry-run`, and emits JSON categories (`protect` / `auto_delete` / `keep` / `ask`) plus `blanket_wt_prune_safe`. When `paseo` is on PATH, immediately follow with `paseo ls -g --json` and strip any active agent workspaces from the delete set (Step 2). You still present the plan, handle ambiguous `ask` leftovers (deep patch-id / MR corroboration), get confirmation, and execute.

**Hard rule:** Do not invent inventory scripts or re-derive cwd-holder loops in the session. If the scanner is missing, install from `~/.agents/skills/colin-git-cleanup/scripts/git-cleanup-scan` (or `~/.local/bin/git-cleanup-scan`) and only then continue. Hand-rolled inventory is a last resort when the scanner itself fails.

## Colin's typical preferences (defaults)

These are the usual defaults from real cleanup sessions. Override only when `$ARGUMENTS` or the user says otherwise.

### Always protect
- Never delete `master`, `main`, or the **current** branch.
- Never delete a branch that is **checked out in another worktree** via `git branch -D` alone — use `wt remove` (or remove the worktree first).
- **Never remove a worktree that has live processes using it as `cwd`** (agents, shells, MCP servers, etc.) — even if content is integrated into the default branch. Same-commit-as-main is irrelevant while agents still hold the tree.
- **Never remove a worktree that is the `cwd` of an active Paseo agent** (see Paseo cross-check below). `/proc` may miss agents the daemon still owns.
- **Keep `release/*` worktrees/branches** unless the user explicitly asks to remove a specific release line.

### Auto-delete (no need to re-confirm each name once the plan is accepted)
1. **Gone** — upstream shows `[gone]` (remote branch deleted). Safe; usually squash-merged MRs.
2. **Tracked, 0 ahead of upstream** — live remote still exists and local has no unpushed commits. Safe to drop the local ref; can always `git switch <branch>` / re-fetch later. *This is the main "thin the local branch list" cleanup.*
3. **Content-integrated into the default branch** (cheap + deep checks below) — including untracked / no-upstream branches.
4. **Worktrees whose only MR is already merged** *and* with **no live cwd users** *and* **not an active Paseo agent cwd** — remove with `wt remove -y` (add `-f` if dirty, `-D` if git still thinks unmerged).
5. **Detached stale review worktrees** the user names (e.g. old ultra-review sandboxes), only if the cwd test and Paseo cross-check are clean.

### Ask before deleting
1. **Tracked, ahead of upstream** — has local-only commits. List with ahead count; default **keep**.
2. **Untracked / no upstream that still fail deep checks** — default **keep** (WIP, `backup/*` restack snapshots, open bugfix stacks).
3. **Worktrees tied to open MRs** — keep; optionally show `glab mr list --source-branch <branch>`.
4. **Worktrees with live cwd processes** (agents) — **keep**; list PIDs/commands. Do not auto-delete; user may force after stopping agents.
5. **Worktrees that are active Paseo agent cwds** — **keep**; list agent shortId / status / name. Do not auto-delete; user may force after archiving/stopping the agent.
6. Anything the checks are unsure about.

### Default branch name
Many ShipStream repos use **`master`** as `origin` HEAD (not `main`). Detect via remote HEAD; do not assume `main`. Some worktrees (e.g. knowledge-base) track a different remote (`kb-remote`); do not judge those against `origin/master`.

---

## Integration detection

Do **not** treat "tracked and 0 ahead of *feature* remote" as "merged to master" — that only means the local ref matches `origin/feature`. Still safe to delete locally because the remote copy remains.

### Prefer worktrunk first
When `wt` is available:
- `wt step prune --dry-run` (add `--min-age=0s` to include young worktrees) previews integrated worktrees **and** branch-only refs.
- `wt step prune -y --foreground` bulk-removes safe candidates — **only after** excluding worktrees that fail the active-cwd test **or** the Paseo agent cross-check below. If any prune candidate has live cwd users or an active Paseo agent, do **not** run blanket prune; delete branch-only refs with `git branch -D` and leave the busy worktree alone.
- `wt list` / `wt list --branches` shows `_` (same commit) and `⊂` (content integrated).
- `wt remove [-f] [-D] -y --foreground <branch-or-path>` for targeted worktree+branch removal (after cwd test and Paseo cross-check are clean).

Worktrunk's six checks (cheapest first): same commit → ancestor → empty 3-dot → trees match → merge-adds-nothing → patch-id match.

### Active-cwd / live-agent test (required before any worktree remove)

Integration alone is **not** enough to remove a worktree. Paseo / Claude / other agents often sit on a worktree whose branch already matches `main` (same commit). Removing it mid-session kills the agent.

For **every** worktree path that is a prune/`wt remove` candidate (everything except the primary checkout you are running from, if it is `main`/`master`):

```bash
# Quick scan (human-readable)
ls -la /proc/*/cwd 2>/dev/null | grep -F '<worktree-path>'

# Enumerate holders with PID + command
for p in /proc/[0-9]*; do
  cwd=$(readlink "$p/cwd" 2>/dev/null) || continue
  case "$cwd" in
    <worktree-path>|<worktree-path>/*)
      pid=${p#/proc/}
      cmd=$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null | head -c 200)
      echo "pid=$pid cwd=$cwd cmd=$cmd"
      ;;
  esac
done
```

- **Any hit** (e.g. `claude`, `ssrag-mcp`, `node`, a long-lived shell) → **keep** that worktree + its branch. Report PIDs/commands in the summary. Do not call `wt remove` / include it in `wt step prune`.
- **No hits** → worktree is idle; integration/MR rules may auto-delete as usual.
- Re-run the test immediately before execute — agents can start between inventory and confirmation.

Example from a real session: `durable-anti-flap` @ same commit as `main`, `wt step prune` wanted it gone, but `/proc/*/cwd` showed live `claude` + `ssrag-mcp` under `~/.paseo/worktrees/.../upbeat-elephant`. Correct verdict: **keep worktree**; only delete other integrated **branch-only** refs.

### Paseo agent workspace cross-check (required when `paseo` is on PATH)

`/proc/*/cwd` alone is not enough for Paseo: the daemon tracks agents (running **and** idle) whose workspace must stay until the agent is archived/closed. If `paseo` is available, **always** inventory agents and exclude their workspaces from deletion — even when the scanner marks the worktree idle/integrated.

Skip this section only when `command -v paseo` fails (CLI not installed). Do not invent alternate Paseo APIs; use the CLI.

```bash
# Prefer JSON; -g so agents outside the current cwd still protect this repo's worktrees
paseo ls -g --json
# Optional: human-readable companion
paseo ls -g
```

Default `paseo ls` already excludes archived agents. Treat each entry as:

| Field | Use |
|-------|-----|
| `cwd` | Workspace path (often `~/.paseo/worktrees/<slug>/<animal>` or a repo worktree). Expand `~` → `$HOME` before matching. |
| `status` | **Protect** when not `closed` (at least `running` and `idle`). `closed` may still have leftover dirs — still protect if `/proc` shows holders; otherwise integration rules may apply. |
| `shortId` / `name` | Report in the keep list so the user can identify which agent owns the tree. |

**Cross-reference before any worktree remove / blanket prune:**

1. Build a set of protected absolute paths from every non-`closed` agent `cwd` (realpath if the path exists; otherwise expanded tilde form).
2. For every worktree path in the auto-delete / prune candidate set, if it **equals** a protected path, or is a **parent/child** of one (agent cwd under the worktree, or worktree under the agent cwd), **keep** that worktree + its branch.
3. Also protect when the agent `cwd` path **basename** matches a Paseo animal worktree basename under `~/.paseo/worktrees/` that maps to a candidate — prefer path equality over basename when possible.
4. Branch-only deletes (`git branch -D` with no worktree) are unaffected.
5. If any candidate is protected this way, set the plan as if `blanket_wt_prune_safe=false`: **never** run blanket `wt step prune -y`; only delete idle, non-Paseo targets explicitly.
6. Re-run `paseo ls -g --json` immediately before execute — agents can start between inventory and confirmation.

Example: scan says `ugly-gopher` is integrated and idle on disk, but `paseo ls` shows `status: running`, `cwd: ~/.paseo/worktrees/.../ugly-gopher`. Correct verdict: **keep worktree**; do not `wt remove` / prune it.

If `paseo ls` fails (daemon down), say so, fall back to the `/proc` active-cwd test, and **do not** bulk-remove paths under `~/.paseo/worktrees/` without user confirmation.

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

## Step 1: Run `git-cleanup-scan` (required)

Resolve the binary (first hit wins):

```bash
command -v git-cleanup-scan \
  || echo "$HOME/.local/bin/git-cleanup-scan" \
  || echo "$HOME/.agents/skills/colin-git-cleanup/scripts/git-cleanup-scan"
```

Then from the repo root:

```bash
git-cleanup-scan              # JSON (default); includes fetch --prune
git-cleanup-scan --text       # human table for the user-facing summary
git-cleanup-scan --deep       # also run git cherry on non-integrated leftovers
git-cleanup-scan --no-fetch   # offline re-scan
```

Trust `summary.*` and per-branch `category` / `reasons` / `delete_via` / `worktree_busy` as the inventory source of truth. Do **not** re-derive cwd holders or cheap integration by hand unless the helper is missing.

If the helper is **missing**, fall back to the manual inventory + Active-cwd test below (and tell the user the skill scripts are not installed — `./install.sh --agents` from colin-dotfiles).

### JSON fields you must honor

| Field | Meaning |
|-------|---------|
| `summary.auto_delete_branch_only` | Safe `git branch -D` candidates |
| `summary.auto_delete_worktree` | Idle integrated worktrees → `wt remove` (still filter through Paseo cross-check) |
| `summary.keep` | Includes **live-cwd** worktrees — never auto-remove |
| `summary.ask` | Need deep checks / human judgment |
| `summary.protect` | `main`/`master`/current/`release/*` |
| `summary.blanket_wt_prune_safe` | If **false**, never run blanket `wt step prune` (also force false when Paseo owns a candidate) |
| `summary.recommended_actions` | Suggested commands after confirm (still confirm first; drop Paseo-owned paths) |
| `summary.notes` | Busy worktree warnings with PIDs |

## Step 2: Paseo inventory (required when CLI present)

Right after the scan (and before presenting the plan), if `paseo` is on PATH:

```bash
paseo ls -g --json
```

Cross-reference every non-`closed` agent `cwd` against scan auto-delete worktrees and any `wt step prune` candidates (see **Paseo agent workspace cross-check** above). Promote matching worktrees from auto-delete → **keep**, and force `blanket_wt_prune_safe=false` for the plan when any such match exists.

If `paseo` is missing, skip this step and rely on `/proc` + scan only.

## Step 3: Optional enrichment

Only when needed for `ask` leftovers or user questions:

- `glab mr list --source-branch <branch> --all -F json` (merged vs open)
- Deep patch-id checks (B/C below) if scan was run without `--deep` or cherry was inconclusive
- Manual Active-cwd re-check immediately before `wt remove` (agents can start after scan)
- Re-run `paseo ls -g --json` if the first inventory is stale

### Branch categories (policy; scan already applies these)

| # | Category | Typical action |
|---|----------|----------------|
| 1 | **Gone** (upstream deleted) | Auto-delete |
| 2 | **Tracked, 0 ahead** of live upstream | Auto-delete (re-checkout anytime) |
| 3 | **Tracked, ahead** of upstream | Ask (default keep) |
| 4 | **Untracked** — cheap or deep integrated | Auto-delete |
| 5 | **Untracked** — still unique after deep checks | Ask (default keep) |
| 6 | **Worktree, idle** (no live cwd, not a Paseo agent cwd) | Skip `git branch -D`; manage with `wt remove` / prune |
| 7 | **Worktree, live agents** (cwd holders and/or active Paseo) | **Keep**; never auto-remove |
| 8 | **release/*** | Keep unless user asks |

## Step 4: Present summary

Show counts per category, planned auto-deletes, and keep-lists with **why** (from scan `reasons`, Paseo agent shortId/status when applicable, plus any deep-check notes). Tables beat walls of text. Include busy worktree PID/cmd from scan and Paseo-owned paths when present.

## Step 5: Confirm and execute

1. If the plan matches typical prefs, one confirmation is enough for the whole auto-delete set.
2. Prefer `summary.recommended_actions` after confirm — or equivalent `git branch -D` / `wt remove` commands. Squash merges will not show as `--merged`; use `-D`.
3. If `blanket_wt_prune_safe` is false (scan or Paseo cross-check), **never** run `wt step prune -y`; only branch-only deletes and explicit idle, non-Paseo `wt remove` targets.
4. Re-run `git-cleanup-scan --no-fetch` (or cwd test) **and** `paseo ls -g --json` (when available) right before removing a worktree.
5. Batch deletes where possible.
6. Finish with `git branch -vv`, worktree list, and counts removed.

## Scanner + worktrunk + Paseo cheat sheet

```bash
git-cleanup-scan                     # primary inventory (JSON)
git-cleanup-scan --text              # human table
git-cleanup-scan --deep              # + git cherry on leftovers

paseo ls -g --json                   # active (non-archived) agents + cwd — cross-ref before delete
paseo ls -g                          # human table
# optional: paseo worktree ls --json # Paseo-managed worktrees only

wt list                              # worktree status
wt step prune --dry-run              # preview (scan already incorporates this)
wt step prune --dry-run --min-age=0s
wt step prune -y --foreground        # ONLY if scan.summary.blanket_wt_prune_safe AND no Paseo-owned candidates
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
- **Never trust `wt step prune` alone for worktrees** — it does not know about live agents. `git-cleanup-scan` attaches cwd holders and sets `blanket_wt_prune_safe=false` when busy; honor that. If the helper is missing, run the `/proc/*/cwd` test by hand.
- **Never trust the scanner alone when Paseo is installed** — the scan does not yet query the Paseo daemon. Always run `paseo ls -g --json` and cross-reference agent `cwd`s before deleting worktrees.
- Scanner lives at `~/.agents/skills/colin-git-cleanup/scripts/git-cleanup-scan` and is installed to `~/.local/bin/git-cleanup-scan` by `install.sh --agents`.

# Special Instructions

$ARGUMENTS
