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
