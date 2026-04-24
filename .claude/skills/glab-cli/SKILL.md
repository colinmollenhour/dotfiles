---
name: glab-cli
description: Use the GitLab CLI for GitLab repository operations including merge requests, discussions, pipelines, notes, labels, and raw API calls. Use when the user gives a GitLab URL or asks to view, create, update, comment on, or inspect GitLab state from the terminal with `glab`.
---

# GitLab CLI

Use this skill for GitLab-hosted work. Prefer `glab` over browser workflows or generic web fetching when the task is about repository state.

## Workflow

### Step 1: Resolve repo and target

- If the user provides a GitLab URL, extract the project path and MR, issue, pipeline, or commit identifier from it
- Otherwise infer the repo from `git remote get-url origin`
- For branch-scoped work, use `git branch --show-current`
- If the repo or target is still ambiguous, ask one short question before mutating anything

### Step 2: Prefer high-level `glab` commands

Use high-level commands first when they cover the task cleanly:

- `glab mr view`, `glab mr list`, `glab mr diff`, `glab mr note`, `glab mr create`, `glab mr update`
- `glab ci list`, `glab ci status`, `glab ci trace`, `glab ci view`

Prefer machine-readable output:

- Use `--output json` when supported
- Pipe to `jq` and keep only the fields needed for the current task

### Step 3: Use `glab api` for gaps

Use `glab api` when a high-level command does not expose the needed operation or fields.

- Prefer `glab api` for discussions, MR versions, compare results, detailed diffs, and other unsupported mutations
- `glab api` supports `:fullpath` as a placeholder for the current repo's URL-encoded path
- For JSON request bodies, send them through `--input -` with `Content-Type: application/json`
- Re-fetch the resource after mutation when confirmation matters

### Step 4: Avoid interactive flows

Always pass explicit flags instead of relying on prompts.

- Good: `--title`, `--description`, `--yes`, `--output json`, `--label`
- Avoid interactive editors or prompts when a non-interactive flag exists

### Step 5: Keep output tight

- Return the minimum fields needed for the task
- Prefer one precise command over multiple exploratory commands
- For large responses, summarize and point to the key fields or URLs

## Common Tasks

- Resolve the open MR for the current branch
- Fetch MR state, author, diffs, and version SHAs
- Fetch the full MR context (metadata + notes + discussions + versions + diff) in one call — see [Bundled helpers](#bundled-helpers)
- Create or update an MR
- Post MR notes or inline diff comments
- Add labels to an MR
- Inspect pipelines and fetch failing job logs
- Compare revisions with the repository compare API

## Bundled helpers

### `mr-context.ts` — fetch all MR context in one call

When a workflow needs the full picture of an MR (metadata + notes + discussions + versions + diff), this bundled wrapper consolidates the five `glab` calls into one parallel fetch. Use it for reviews, audits, and any flow that would otherwise issue four or more sequential `glab` calls just to gather context.

```bash
bun "${CLAUDE_SKILL_DIR}/mr-context.ts" \
  --project shipstream/server \
  --mr 2514 \
  --out-dir .tmp/mr-2514-context
```

Writes `mr.json`, `notes.json`, `discussions.json`, `versions.json`, and `diff.patch` under `--out-dir`. If any individual fetch fails, the helper still writes the rest and emits a per-endpoint `<name>.stderr` file for diagnosis.

stdout is a single JSON summary suitable for `jq`:

```json
{
  "project": "shipstream/server",
  "mr": 2514,
  "dir": ".tmp/mr-2514-context",
  "mr_state": "opened",
  "mr_title": "…",
  "source_branch": "…",
  "target_branch": "main",
  "head_sha": "…", "base_sha": "…", "start_sha": "…",
  "files": { "mr.json": 1234, "notes.json": 567, "diff.patch": 123456, … },
  "errors": { "notes": "Unauthenticated.", … }
}
```

Exit code is 0 only if every fetch succeeded. The diff is written as raw text, not embedded in the summary, so callers can route on metadata without pulling the full diff into context.

## CI Triage

For GitLab CI triage, prefer branch-scoped pipeline inspection first.

- Start with `glab ci list --per-page 3 --output json`
- If the relevant pipeline already passed, stop early
- If a pipeline is still in progress, use `glab ci status --branch <branch> --live`
- If a job failed, use `glab ci trace <job-id> --branch <branch>`
- Use `glab ci view <pipeline-id>` when you need pipeline-level context beyond a single job trace

Detailed command patterns live in [reference.md](reference.md).

## Inline Discussion Rules

When posting GitLab inline diff comments:

- Use the discussions API via `glab api`
- Fetch `base`, `start`, and `head` SHAs from the MR versions API first
- Include a `position` payload for single-line notes
- Add `line_range` for multi-line notes when needed
- Verify success by checking for `"type": "DiffNote"` in the response
- Post exactly one comment per unique issue

## Failure Handling

- If `glab` reports authentication or repo access errors, surface that clearly instead of guessing
- If the command returns no matching MR, pipeline, or job, say so explicitly
- If a mutation succeeds but the response is ambiguous, verify by re-fetching the updated object

## Notes

- Prefer canonical GitLab URLs and full SHAs when constructing code links
- Use `glab api projects/:fullpath/...` for repo-scoped API calls whenever possible
- Use this skill as the shared source for GitLab CLI behavior in command files and other skills
