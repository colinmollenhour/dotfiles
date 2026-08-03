---
name: glab-cli
description: 'Use glab for GitLab MRs, issues, discussions, pipelines, notes, labels, and raw API tasks.'
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
- `glab api` supports `:fullpath` and `:id` as placeholders for the current repo. **They resolve from the working directory's git remote** — running from a scratch/artifact directory fails with `Unable to expand placeholder in path: no git remotes found`. Run from inside the repo, or pass the numeric project id explicitly
- For JSON request bodies, use `--input <path>` (or `--input -`) **with** `-H "Content-Type: application/json"`. Omitting the header returns `HTTP 415 {"error":"The provided content-type '' is not supported."}`. Any `--input` path is resolved against the directory `glab` runs in — use an absolute path when the file lives outside the repo
- Re-fetch the resource after mutation when confirmation matters

#### Pagination Is Mandatory For Comments

**Warning: GitLab discussion and note APIs are paginated. Missing a page means missing review comments. This has caused unresolved MR comments to be falsely reported as resolved.**

When inspecting MR/issue comments, discussions, or notes, do **not** rely on a single default `glab api` response. Always do one of the following:

- Request a high `per_page` value, usually `?per_page=100`, when the result set is known to fit in one page
- Follow pagination headers and fetch every page when more than 100 items may exist
- Fetch user-provided note URLs directly by note ID, even if a discussion listing did not show them

Safe patterns:

```bash
glab api 'projects/:fullpath/merge_requests/19/discussions?per_page=100&page=1'
glab api 'projects/:fullpath/merge_requests/19/notes?per_page=100&page=1'
glab api 'projects/:fullpath/merge_requests/19/notes/160554'
```

Before declaring "no unresolved comments", explicitly filter the complete paged result set for unresolved resolvable discussions:

```bash
glab api 'projects/:fullpath/merge_requests/19/discussions?per_page=100&page=1' \
  | jq '.[] | select(.resolvable == true and .resolved == false)'
```

If there may be more than one page, repeat for subsequent pages or use a helper/script that follows `X-Next-Page`. Never state that all comments are resolved until pagination has been accounted for.

#### Flag semantics — `-f` is NOT "form"

These three look interchangeable and are not. Getting this wrong fails quietly, not loudly.

| Flag | Meaning | `@file` behavior |
|---|---|---|
| `-f` / `--raw-field` | Add a **string** parameter | **None.** `-f description=@body.md` sends the literal text `@body.md` |
| `--form` | **Multipart** form field (no short flag) | `--form "file=@path"` uploads the file. Forces POST |
| `--input <path>` | Use a file as the raw request body | n/a — pair with `-H "Content-Type: application/json"` |

There is no `-F` shorthand for `--form`. Reaching for `-F`/`-f` to attach a file is the usual cause of "the API returned 200 but my content is literally `@file.md`".

#### File Uploads (MR attachments)

`glab api` **can** send multipart — use the long `--form` flag. No `curl` or manual token extraction needed:

```bash
glab api projects/:id/uploads -X POST --form "file=@diagram.png"
```

Response fields, and **which one to embed**:

| Field | Value | Use it? |
|---|---|---|
| `markdown` | `![name](/uploads/<hash>/<file>)` | **Yes** — ready to paste |
| `url` | `/uploads/<hash>/<file>` | **Yes** — what `markdown` wraps |
| `full_path` | `/-/project/<id>/uploads/<hash>/<file>` | **No — renders broken** |

**Never embed `full_path`.** It looks more explicit and therefore safer; it is not. GitLab treats it as a *repository-relative* path and rewrites it against the default branch, producing `/<group>/<repo>/-/blob/main/-/project/<id>/uploads/...` — a blob URL that does not exist. The description saves fine and the image is broken.

Because the correct `/uploads/<hash>/<file>` form resolves **relative to the project containing the description**, an upload from project A embedded in project B's MR silently 404s. Upload separately per project when posting the same asset to more than one MR.

#### Verify that embedded media actually renders

A link being present in a description is not the same as a link that renders, and a 200 from the uploads endpoint proves nothing about it. Before calling an attachment task done, render the snippet through GitLab's own markdown engine in project context:

```bash
# Run from INSIDE the repo — glab picks the host from the local remote.
# Outside it, glab falls back to gitlab.com and returns `404 Project Not Found`
# for a self-hosted project, which looks like a broken link but is a host mixup.
cd /path/to/repo && glab api /markdown -X POST -f gfm=true -f project=<group>/<repo> \
  -f 'text=![x](/uploads/<hash>/<file>)'
```

- Correct → `data-canonical-src="/uploads/<hash>/<file>"` in the returned HTML, and `data-src` expanded to `https://<host>/-/project/<id>/uploads/...`
- Broken → the `href` contains `/-/blob/`, meaning GitLab resolved it as a repo path

Note the asymmetry that makes `full_path` tempting: GitLab *emits* `/-/project/<id>/uploads/...` as the resolved absolute URL, so it looks like the canonical form. It is an output, not an input — authored as a relative markdown path it gets resolved against the repository instead.

Do **not** try to validate an upload URL with `curl -H "PRIVATE-TOKEN: ..."`. Upload routes are served to browser **sessions**, not API tokens; you will get a 302 or the login HTML regardless of whether the file exists. That is a misleading signal — use the markdown render instead.

Images render inline; archives and other files render as attachment links. Never echo a token into command output.

#### Long MR descriptions from a file

`glab mr create` has **no** `--description-file` flag; only `-d/--description` (a string, or `-` to open an editor). For a long body, avoid `-d "$(cat body.md)"` — command substitution is blocked in some sandboxes and mangles quoting. Create the MR first, then set the description via the API with a JSON payload:

```bash
# Build {"description": "<file contents>"} without shell quoting problems
node -e 'const fs=require("fs");fs.writeFileSync("/abs/body.json",JSON.stringify({description:fs.readFileSync("/abs/body.md","utf8")}))'

glab api projects/:id/merge_requests/<iid> -X PUT \
  -H "Content-Type: application/json" --input /abs/body.json
```

Run it from inside the repo so `:id` resolves, and use absolute paths for the payload. Re-read the returned `description` to confirm the content landed rather than a literal `@path` string.

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
- Fetch the full MR context (metadata + **all paged notes/discussions** + versions + diff) in one call — see [Bundled helpers](#bundled-helpers)
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

For temporary output directories, do **not** hardcode `/tmp/...`; Claude Code may run with `/tmp` mounted read-only. Prefer a project-local `.tmp/...` path when downstream tools need repo-relative access, or use `$TMPDIR/...` when the artifact is only for the current shell/session.

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
- Whenever the comment includes a `` ```suggestion `` block, follow the [Committable Suggestion Blocks](reference.md#committable-suggestion-blocks) rules — multi-line replacements on a single-line anchor REQUIRE the explicit `:-N+M` range modifier on the fence, otherwise GitLab applies a broken patch

## Failure Handling

- If `glab` reports authentication or repo access errors, surface that clearly instead of guessing
- If the command returns no matching MR, pipeline, or job, say so explicitly
- If a mutation succeeds but the response is ambiguous, verify by re-fetching the updated object

## Notes

- Prefer canonical GitLab URLs and full SHAs when constructing code links
- Use `glab api projects/:fullpath/...` for repo-scoped API calls whenever possible
- Use this skill as the shared source for GitLab CLI behavior in command files and other skills
