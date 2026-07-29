---
name: colin-roborev-summary
description: >
  Report unclosed roborev failing reviews across all tracked projects for a time
  window (default last 24h), map each branch to its worktree, use git log to
  judge whether findings are already fixed, and emit a residual-bugs report
  organized by repo/worktree/branch. Report-only: never write code, commit,
  close reviews, or switch branches. Use when the user asks for a roborev
  summary, open/unfixed roborev bugs, unclosed findings across projects,
  /colin-roborev-summary, or "which roborev bugs are still open".
---

# colin-roborev-summary

Produce a **read-only residual-findings report** for open failing roborev
reviews across all tracked repos. Goal: surface bugs that are **likely still
unfixed** at each branch tip, grouped by repo / worktree / branch.

This is **not** `/roborev-fix`. Do not fix code, do not `roborev comment`,
do not `roborev close`, do not commit, and **do not change branches or
checkouts** (worktrees may have in-progress work).

## Hard rules

1. **Report only.** No code edits, no commits, no review close/comment.
2. **Never switch branches.** Prefer `git -C <path> …` and worktree paths.
3. **Never checkout, reset, clean, or stash.** Dirty worktrees are expected.
4. **Residual truth = latest open Fail job on a branch**, not every historical
   open job. Older open jobs on the same branch are “superseded” unless the
   tip review still reports the same issue.
5. If roborev/daemon is down, report the error and stop (suggest `roborev status`
   / `roborev daemon`).

## Prerequisites

```bash
command -v roborev
command -v wt   # worktrunk CLI (https://worktrunk.dev); not `worktrunk`
roborev status
```

Optional window override from the user (default **24 hours**):
`--since 24h`, “last 48 hours”, “since yesterday”, etc.

## Workflow

### 1. Inventory repos

```bash
roborev repo list
```

Record each `NAME` and `PATH` (repo root). If empty, stop and tell the user
nothing is tracked (`roborev init` per repo).

### 2. Discover open failing jobs (all branches)

`roborev list --open` defaults to **current branch of the invoking cwd** and
is unreliable for multi-branch inventory. Prefer:

```bash
for path in $(roborev repo list | awk 'NR>1 && $2 ~ /^\// {print $2}'); do
  echo "======== $(basename "$path") ========"
  (cd "$path" && roborev fix --list --all-branches)
done
```

Collect for each job: **job id**, **git_ref**, **branch**, **subject**,
**finished** time, **severity summary**.

`roborev fix --list` already lists **open failing** (actionable) jobs only.
Do not “fix” them — listing only.

If you need full metadata (verdict, closed, finished_at, commit_subject):

```bash
# Per branch when needed (branch flag required for non-current):
roborev list --open --repo <path> --branch <branch> --json --limit 200
```

Treat `verdict != "F"` or `closed: true` as non-actionable.

### 3. Filter to the time window

Default cutoff: `now - 24h` (UTC).

Keep jobs whose `finished_at` (or list “Finished:” timestamp) is **≥ cutoff**.
Report the cutoff and “now” in the summary so the window is auditable.

If the user asks for “all open” with no window, skip the time filter but still
prefer residual-per-branch reporting.

### 4. Map worktrees (do not switch)

For each repo root:

```bash
wt -C <repo_root> list
git -C <repo_root> worktree list
```

Build a map: `(repo, branch) → worktree path` and current **HEAD SHA / subject**.
If `wt` is missing, fall back to `git worktree list` only.

Common layouts:

| Situation | Path to use for git |
|-----------|---------------------|
| Branch checked out in a worktree | That worktree path |
| Branch only on main repo checkout | Repo root path |
| Branch deleted / no worktree | Resolve via `git -C <root> rev-parse <branch>` or note missing; still inspect commit if SHA known |

### 5. Residual job per branch

Group windowed open-F jobs by `(repo, branch)`.

For each group:

- **Latest residual job** = highest job id (or most recent `finished_at`).
- Fetch full findings:

```bash
roborev show --job <job_id>
# or
roborev show --job <job_id> --json
```

Parse findings: severity, location (file:line), problem, fix suggestion.
Ignore agent process chatter; use the structured `## Review Findings` body.

Older open job IDs on the same branch → list as **superseded** (not residual)
unless you confirm the tip still lacks a later fail review.

### 6. Git “already fixed?” check (read-only)

For residual job at `git_ref` on worktree/path `P` and branch `B`:

```bash
git -C "$P" rev-parse HEAD
git -C "$P" log -1 --format='%h %s' HEAD
git -C "$P" log --oneline <git_ref>..HEAD
```

If no worktree, use:

```bash
git -C <repo_root> log --oneline <git_ref>..<branch>
# or if branch missing:
git -C <repo_root> merge-base --is-ancestor <git_ref> master   # or main
git -C <repo_root> log --oneline <git_ref>..master
```

**Heuristics (report confidence, not certainty):**

| Evidence | Classification |
|----------|----------------|
| `HEAD` equals reviewed `git_ref` (no commits after) | **Likely unfixed** |
| Commits after, none touch finding paths / none say address review / fix finding | **Likely unfixed** |
| Commits after that clearly implement the review’s suggested fix (paths + messages + diff intent) | **Likely fixed** (still open in roborev only because never closed) |
| Only merge-from-main / unrelated chore / ticket rename | **Likely unfixed** (noise after tip review) |
| Branch merged to main/master; no follow-up fix for the finding | **Likely unfixed** (may now live on default branch) |
| Scratch/fixture branch (subjects like `fixture`, `scratch:`) | Call out as **noise / intentional scratch** |

When “maybe”, spot-check with `git log -p <git_ref>..HEAD -- <finding-files>` or
`git blame` on the cited lines — still read-only.

**Do not** re-review the whole codebase; residual open Fail + git evidence is enough.

### 7. Emit the report

Structure the user-facing report as follows. Keep it scannable: tables first,
then residual findings only.

```markdown
# Unaddressed roborev bugs (<window>)

**Scope:** Open failing reviews finished since <cutoff UTC>.
**Method:** fix --list --all-branches; residual = latest F per branch; git log vs tip.
**Rules:** no code changes, no branch switches.

## Summary table
| Repo | Open F in window | Residual unfixed branches | Likely fixed (open-only) |

## Residual unfixed (by repo / worktree / branch)

### <repo> — `<branch>`
| Root | Worktree | Tip SHA / subject | Latest job | Also open (superseded) | Git after review |
### Findings table
| Sev | Job | Location | Problem |

## Likely already fixed (still open in roborev)
… short; note suggested close-only follow-up …

## Priority view
1. High …
2. Medium clusters …
3. Low / noise …

## Notes
- cutoff/now
- discovery caveats (list --open branch scoping)
- anything not checked out / scratch branches
```

**Priority ordering for residual unfixed:** High → Medium → Low; within severity,
prefer branches whose tip **is** the reviewed commit (nothing after) over
branches with ambiguous later work.

### 8. What not to do after the report

- Do not start fixing unless the user explicitly asks.
- Do not close “likely fixed” jobs unless asked (closing is a separate action
  with `roborev comment` + `roborev close`).
- Do not run `/roborev-fix` as a side effect of this skill.

## CLI cheat sheet

```bash
roborev status
roborev repo list
roborev fix --list --all-branches          # from inside each repo root
roborev show --job <id>
roborev show --job <id> --json
roborev list --open --repo <path> --branch <b> --json --limit 200

wt -C <repo_root> list
git -C <path> worktree list
git -C <path> log --oneline <ref>..HEAD
git -C <path> log -p <ref>..HEAD -- <files>
```

## Edge cases

- **Daemon down / empty list:** report error; do not invent findings.
- **Panel/synthesis jobs:** `fix --list` shows parents only; treat parent output
  as the residual findings set (same as roborev-fix guidance).
- **`roborev list --open` without `--branch`:** only current branch — never use
  alone for “all projects / all branches”.
- **Multiple worktrees, same branch:** rare; prefer the path from `wt list`
  that matches the branch name.
- **Reviewed ref not in worktree history:** note “cannot verify”; leave as
  unfixed until proven otherwise.
- **Pass-only open jobs:** ignore (not bugs).
- **Jobs older than window still open:** omit from residual unless user asks
  for all-time open; optionally one-line “N older open F outside window”.

## Example invocation

User: “Summarize unclosed roborev bugs for the last 24 hours across all projects.”

Agent:

1. `roborev repo list` + `fix --list --all-branches` per root  
2. Filter finished ≥ now−24h  
3. `wt -C` / `git worktree list` for paths  
4. `roborev show --job` for latest F per branch  
5. `git log <ref>..HEAD` to classify fixed vs unfixed  
6. Report residual unfixed by repo/worktree/branch + priority list  

## Related

- `/roborev-fix` — **fixes** open findings (code + close). Different skill.
- `roborev compact` — consolidates findings (optional, not required here).
- `roborev tui` — interactive monitoring; not a substitute for this report.
