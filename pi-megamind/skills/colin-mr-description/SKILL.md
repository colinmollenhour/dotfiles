---
name: colin-mr-description
description: Write or update the description of a GitHub PR or GitLab MR - summary, why, changes, exact test plan, AI attribution, and a validated educational brief. Use whenever creating a PR/MR, rewriting its description, or posting a note for new commits on an existing one. Do not use when the user asks for a quick, fast, or simple PR/MR.
---

# MR Description

Write the description a reviewer reads first: what changed, why, how it was verified, and, for non-trivial changes, a grounded educational brief. Works for GitHub PRs and GitLab MRs, for new ones and for updates.

Callers such as Megamind may pass an attribution label, an evidence directory, a brief heading, and output paths. Use them when given; otherwise use the defaults below.

## Gather

Collect before writing:

- Base and head branch; `git log --oneline <base>..HEAD`; `git diff --stat <base>...HEAD`
- Relevant diffs or file excerpts for the changes that matter
- The request: task/ticket/issue ID and link, user instructions, plan or spec
- Decisions made in the session and alternatives rejected
- Verification commands that actually ran, with outcomes
- Caller-provided evidence (for example a run directory), which outranks session memory
- The existing description, when the PR/MR already exists

## Body

Write the body to a file, never an inline HEREDOC.

```markdown
> **<Label>** · By: <harness> with <model>

## Summary

## Why

## Changes

## Test Plan

## Risk and Rollout

## Educational Brief
```

- **Attribution line**: include only when an agent authored the code. Default label `AI`; callers may override it (Megamind uses `AI Megamind`). Omit the line when a human wrote the code and the agent only ships it.
- **Summary**: two to four sentences on the outcome. No file inventory.
- **Why**: the problem or request, with the task/ticket link when one exists.
- **Changes**: grouped by behavior or component, not by file. Call out anything a reviewer could miss: migrations, config, public API, removed behavior.
- **Test Plan**: exact commands and outcomes (`bun test` - 212 passed). List what was not run and why. Never claim a check that did not run.
- **Risk and Rollout**: only when there is something real: migrations, flags, deploy order, backwards compatibility, rollback. Otherwise drop the section.
- **Educational Brief**: see below.

Link only what a reviewer can open: commits, files on the branch, tickets, CI runs, uploaded attachments. Never reference local paths such as `.tmp/`, scratch dirs, or `/home/...`; summarize their content instead.

## Educational Brief

Include a brief by default. Skip it only for trivial changes: a small single-file fix, typo, rename, formatting, dependency or version bump, revert, generated-files-only, or docs wording. When skipped, omit the heading entirely.

1. Load `educational-brief`. Delegate synthesis to a sub-agent when the harness supports it, passing the gathered inputs and an output path: the caller's, otherwise `educational-material.md` in a fresh temp dir outside the repo.
2. Validate the result before posting:
   1. Spot-check each substantive claim against diffs, changed files, command output, or caller evidence.
   2. Correct or remove claims that are ungrounded, overstated, stale, or unsupported.
   3. Check every diagram against the actual code structure. For tldraw, confirm each referenced PNG and its `.tldr` source exist; for Mermaid, confirm the lint passed.
   4. Write `educational-validation.md` beside the brief: claim groups checked, corrections, residual uncertainty.
3. Host diagram images:
   - GitLab: upload each PNG via the project uploads endpoint (see `glab-cli` reference) and embed the returned `markdown`, never `full_path`.
   - GitHub: there is no attachment API. Use `snip-upload --no-copy --no-random <png>` when available; otherwise redraw the diagram as Mermaid, which GitHub renders natively.
   - Keep the `.tldr` source and local PNG beside the brief.
4. Insert the brief under `## Educational Brief` (or the caller's heading) and demote its own `##` headings to `###`.

## Create or Update

Create:

- GitLab: `bun "${HOME}/.agents/skills/glab-cli/ship-mr.ts" --title "<title>" --description-file /abs/body.md` (fall back to `~/.claude/skills/glab-cli/ship-mr.ts`).
- GitHub: `gh pr create --title "<title>" --body-file /abs/body.md`.

Update an existing description:

1. Fetch the current body: `gh pr view <N> --json body -q .body`, or `glab mr view <IID> --output json` and read `description`.
2. Replace only the sections this skill owns, matched by heading. Preserve human-written text and sections added by others. Never append a second copy of a heading.
3. Refresh Summary, Changes, and Test Plan when new commits change scope. Regenerate the brief only when architecture or design changed materially.
4. Write the full body back: `gh pr edit <N> --body-file /abs/body.md`, or `ship-mr.ts --description-file /abs/body.md` (which replaces the whole description).

For new commits pushed to an existing PR/MR, also post a short note (`gh pr comment --body-file`, or `ship-mr.ts --note-file`). When the agent authored the commit, start it with:

```text
> **AI Commit Note** · Commit: <sha> · By: <harness> with <model>

<short description>
```

Omit the header when the human wrote the code.

If a platform call fails (permissions, API error), record the exact command and error excerpt in the caller's artifact or the final reply, and continue. Do not loop on retries.
