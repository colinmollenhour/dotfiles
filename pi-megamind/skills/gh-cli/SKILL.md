---
name: gh-cli
description: 'Use gh for GitHub PRs, issues, runs, releases, comments, checks, labels, and raw API tasks.'
---

# GitHub CLI

Prefer `gh` over browser workflows. **Prefer bundled scripts over multi-step chat archaeology.**

## Scripts first

| Need | Script |
|---|---|
| Full PR context (view+comments+reviews+files+diff) | `bun "${CLAUDE_SKILL_DIR}/pr-context.ts" --repo O/R --pr N --out-dir .tmp/pr-N` |

stdout is a JSON summary; large payloads stay on disk. Detailed patterns: [reference.md](reference.md).

## Workflow

1. Resolve `owner/repo` and PR/issue/run from URL or `git remote` + current branch.
2. Prefer `pr-context.ts` for reviews/audits; else high-level `gh` with `--json … --jq …`.
3. `gh api` / `gh api graphql` for gaps (thread resolve, advisories, nested JSON).
4. Non-interactive flags only. Multiline bodies via files (`--body-file`) not fragile HEREDOCs with `!`.
5. Keep tool output tight.

## Cheat sheet

```bash
gh pr view <N> --json state,isDraft,title,author,headRefOid,baseRefOid,url
gh pr list --head "$(git branch --show-current)" --state open --json number,title,state
gh pr create --title "…" --body-file /abs/body.md
gh pr comment <N> --body-file /abs/note.md
gh run list --branch "$(git branch --show-current)" --limit 3 --json databaseId,conclusion,status
gh run view <ID> --log-failed
```

## Pitfalls

- GraphQL with `!` (e.g. `ID!`): write query to a file; pass `-F query=@file`. Interactive bash history expansion mangles `!` in HEREDOCs — see [reference.md](reference.md).
- Inline review comments: MCP tool preferred; else `gh api` with `RIGHT`/`LEFT` sides. Suggestion block line count must equal anchor range.
- Resolving review threads: GraphQL `resolveReviewThread` only (no high-level command).

## Failure handling

Surface auth errors; say when no PR/run matches; re-fetch after mutations when confirmation matters.
