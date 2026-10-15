---
name: glab-cli
user-invocable: false
description: 'Use glab for GitLab MRs, issues, discussions, pipelines, notes, labels, and raw API tasks.'
---

# GitLab CLI

Prefer `glab` over browser workflows. **Prefer bundled scripts over multi-step chat archaeology.**

## Scripts first

| Need | Script |
|---|---|
| Full MR context (view+notes+discussions+versions+diff) | `bun "${CLAUDE_SKILL_DIR}/mr-context.ts" --project G/R --mr N --out-dir .tmp/mr-N` |
| Create/update MR + optional note (commit-and-push path) | `bun "${CLAUDE_SKILL_DIR}/ship-mr.ts" --project G/R --title "…" --description-file body.md [--note-file note.md]` |
| Failed CI for branch/MR | `bun "${CLAUDE_SKILL_DIR}/ci-fail.ts" --project G/R --branch B --out-dir .tmp/ci` |

Each prints a **JSON summary** on stdout; large payloads stay on disk. Do not re-fetch the five MR endpoints one-by-one when `mr-context` covers it. Do not load this whole skill for a routine ship — run `ship-mr.ts`.

Detailed flag encyclopedia and edge cases: [reference.md](reference.md).

## Workflow

1. Resolve project (`git remote` / URL) and target (MR iid, branch, pipeline).
2. Prefer a script above, else high-level `glab` with `--output json` + `jq`.
3. Use `glab api` for gaps. `:fullpath` / `:id` resolve from **cwd git remote** — run inside the repo or pass numeric project id / `-R`.
4. Non-interactive flags only (`--yes`, `--title`, …).
5. Keep tool output tight — summarize; point at files under `.tmp/`.

## Cheat sheet

```bash
glab mr view <iid> -R <project> --output json
glab mr list --source-branch "$(git branch --show-current)" -R <project> --output json
glab mr note <iid> -R <project> -m "text"
glab ci list --per-page 3 --output json
glab api "projects/:fullpath/merge_requests/<iid>/discussions?per_page=100"  # paginate!
```

## Pitfalls (encoded in scripts when possible)

- **Pagination is mandatory** for notes/discussions — missing a page falsely reports "all resolved". `mr-context.ts` paginates.
- **`-f` is not file upload.** `-f description=@body.md` sends the literal string `@body.md`. Use `--input` + `Content-Type: application/json` for raw JSON bodies, `--form "file=@path"` for multipart uploads.
- Long MR descriptions: create MR, then PUT description via API JSON (`ship-mr.ts` does this).
- Upload embeds: use response `markdown` / `url` fields — **never** `full_path` (breaks rendering). Verify with `glab api /markdown` from inside the repo.
- Do not validate upload URLs with `PRIVATE-TOKEN` curl (session-only routes).

## Inline discussions

Fetch version SHAs first; post via discussions API with `position` (+ `line_range` if multi-line). Verify `"type": "DiffNote"`. One comment per issue. Suggestion blocks: multi-line needs `` ```suggestion:-N+M `` — see [reference.md](reference.md#committable-suggestion-blocks).

## Failure handling

Surface auth/access errors; say when no MR/pipeline matches; re-fetch after mutations when confirmation matters.
