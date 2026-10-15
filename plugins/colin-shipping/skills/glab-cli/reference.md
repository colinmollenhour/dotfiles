# GitLab CLI Reference

## Resolve Current Branch MR

```bash
glab mr list --source-branch="$(git branch --show-current)" --output json | jq '.[0] | {iid, title, state, draft, web_url}'
```

## MR Summary

```bash
glab mr view <MR> --output json | jq '{state, draft, title, author: .author.username}'
```

## MR Diff

```bash
glab mr diff <MR>
```

## Create MR

```bash
glab mr create --title "<title>" --description "<description>" --remove-source-branch --squash-before-merge --yes
```

## Add MR Label

```bash
glab mr update <MR> --label ":Reviewed-By-AI"
```

## Post MR Summary Note

```bash
glab mr note <MR> -m "> **AI Code Review** · Models: <comma-separated list>

No issues found. Checked for bugs and AGENTS.md compliance."
```

## MR Versions API

```bash
glab api projects/:fullpath/merge_requests/<MR_IID>/versions \
  | jq '.[0] | {base_commit_sha, head_commit_sha, start_commit_sha}'
```

## Compare Revisions

```bash
glab api "projects/:fullpath/repository/compare?from=<FROM_SHA>&to=<TO_SHA>"
```

## List MR Diffs with Metadata

```bash
glab api projects/:fullpath/merge_requests/<MR_IID>/diffs --paginate | jq '
  [.[] | {
    new_path,
    old_path,
    diff,
    generated_file,
    new_file,
    deleted_file,
    renamed_file,
    diff_lines: (.diff | split("\n") | length)
  }]
'
```

## Post Inline Diff Comment with `glab api`

```bash
glab api projects/:fullpath/merge_requests/<MR_IID>/discussions \
  --method POST \
  --input - \
  -H "Content-Type: application/json"
```

Single-line payload:

```json
{
  "body": "<comment text>",
  "position": {
    "position_type": "text",
    "base_sha": "<base_commit_sha>",
    "head_sha": "<head_commit_sha>",
    "start_sha": "<start_commit_sha>",
    "old_path": "<file_path>",
    "new_path": "<file_path>",
    "new_line": <line_number>
  }
}
```

Multi-line addition:

```json
{
  "line_range": {
    "start": {"type": "new", "new_line": <start_line>},
    "end": {"type": "new", "new_line": <end_line>}
  }
}
```

Successful inline comments should include `"type": "DiffNote"` in the response.

## Committable Suggestion Blocks

A `` ```suggestion `` block lets the MR author one-click-apply a literal patch from a review comment. **The number of lines inside the block must equal the number of lines being replaced** at the comment's anchor — mismatch produces silently-wrong patches.

GitLab anchors a single-line note to one line. To replace a range, the suggestion fence MUST use the explicit modifier:

````
```suggestion:-N+M
<replacement lines>
```
````

- `N` = lines **above** the anchor to also replace
- `M` = lines **below** the anchor to also replace
- Total lines replaced = `N + 1 + M`, must equal lines inside the body
- Empty body deletes the range without inserting anything
- Reference: <https://docs.gitlab.com/ee/user/project/merge_requests/reviews/suggestions.html#multi-line-suggestions>

A bare `` ```suggestion `` (no `:-N+M`) only ever replaces one line — the anchor — regardless of how many lines are in the block. **Multi-line bodies without the modifier are the most common cause of broken suggestion-apply commits**: GitLab inserts the new lines while leaving the original surrounding lines in place, producing stray fragments, unbalanced braces, or duplicated declarations. Some such corruption parses cleanly and is silently wrong; some causes loud parse errors.

For multi-line discussion notes (a comment anchored across N..M with `line_range`), the suggestion's body line count must equal `M - N + 1` and the `:-N+M` modifier is not needed. The modifier is only required when the comment itself is single-line but the suggestion replaces a range.

**Self-check before posting any suggestion block:**

1. Count lines inside the body
2. Identify the exact range of lines it should replace at the anchor
3. If the counts do not match, do not emit a `` ```suggestion `` block — describe the fix in prose with a fenced ` ``` ` example block instead

## Pipelines

```bash
glab ci list --per-page 3 --output json
glab ci status --branch <branch> --live
glab ci trace <job-id> --branch <branch>
glab ci view <pipeline-id>
```

## Branch CI Triage Pattern

Preferred sequence:

1. `glab ci list --per-page 3 --output json`
2. If the relevant pipeline already passed, stop
3. If a pipeline is still running, `glab ci status --branch <branch> --live`
4. If a job failed, `glab ci trace <job-id> --branch <branch>`
5. Use `glab ci view <pipeline-id>` when you need more pipeline context

## Notes

- Prefer `--output json` plus `jq` over parsing human-readable output
- Use `projects/:fullpath/...` instead of hardcoding URL-encoded project paths
- Re-fetch after mutations when you need confirmation
- Do not hardcode `/tmp/...` for helper output. Use project-local `.tmp/...` when later tools need repo-relative files, or `$TMPDIR/...` for shell-local scratch data; `/tmp` can be read-only in Claude Code.


# Agent pitfalls (from prior SKILL.md)

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


## Bundled helpers (extended)

### `ship-mr.ts` — create-or-update MR + note

```bash
bun "${CLAUDE_SKILL_DIR}/ship-mr.ts" \
  --project shipstream/server \
  --title "Fix widget" \
  --description-file /abs/body.md \
  --note-file /abs/note.md
```

### `ci-fail.ts` — pipeline + failed job traces

```bash
bun "${CLAUDE_SKILL_DIR}/ci-fail.ts" \
  --project shipstream/server \
  --branch my-feature \
  --out-dir .tmp/ci-fail
```

### `mr-context.ts` — full MR gather

See SKILL.md. Writes mr.json, notes.json, discussions.json, versions.json, diff.patch.
