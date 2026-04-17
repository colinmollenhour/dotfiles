# GitHub CLI Reference

## Resolve Current Branch PR

```bash
gh pr list --head "$(git branch --show-current)" --state open --json number,title,state,isDraft
```

## PR Summary

```bash
gh pr view <PR> --json state,isDraft,title,author,headRefOid,files
```

## PR Diff

```bash
gh pr diff <PR>
```

## Create PR

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

## Add PR Label

```bash
gh pr edit <PR> --add-label ":Reviewed-By-AI"
```

## Create Repository Security Advisory

Use `--input` with a HEREDOC for the advisory payload because the request body is nested JSON.

```bash
gh api repos/{owner}/{repo}/security-advisories \
  --method POST \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  --input - <<'EOF'
{
  "summary": "A new important advisory",
  "description": "A more in-depth description of what the problem is.",
  "severity": "high",
  "cve_id": null,
  "vulnerabilities": [
    {
      "package": {
        "name": "a-package",
        "ecosystem": "npm"
      },
      "vulnerable_version_range": "< 1.0.0",
      "patched_versions": "1.0.0",
      "vulnerable_functions": [
        "important_function"
      ]
    }
  ],
  "cwe_ids": [
    "CWE-1101",
    "CWE-20"
  ],
  "credits": [
    {
      "login": "monalisa",
      "type": "reporter"
    }
  ]
}
EOF
```

Notes:

- Requires repository admin or security manager access
- Token scope must include `repo` or `repository_advisories:write`
- GitHub docs: `https://docs.github.com/en/rest/security-advisories/repository-advisories?apiVersion=2026-03-10`

## Post PR Summary Comment

```bash
gh pr comment <PR> --body "$(cat <<'EOF'
> **AI Code Review** · Models: <comma-separated list>

No issues found. Checked for bugs and AGENTS.md compliance.
EOF
)"
```

## Get PR Head SHA

```bash
gh pr view <PR> --json headRefOid --jq '.headRefOid'
```

## Post Inline Review Comment with `gh api`

Single-line comment:

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments \
  --method POST \
  -f "body=<comment text>" \
  -f "commit_id=<head_commit_sha>" \
  -f "path=<file_path>" \
  -F "line=<line_number>" \
  -f "side=RIGHT"
```

Multi-line comment:

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments \
  --method POST \
  -f "body=<comment text>" \
  -f "commit_id=<head_commit_sha>" \
  -f "path=<file_path>" \
  -F "start_line=<start_line>" \
  -f "start_side=RIGHT" \
  -F "line=<end_line>" \
  -f "side=RIGHT"
```

Line positioning rules:

- Added or unchanged lines: `RIGHT`
- Removed lines: `LEFT`
- Use `-F` for integer fields

## Issue Queries

```bash
gh issue view <ISSUE> --json title,body,state,author,url
gh issue list --limit 50 --json number,title,state,author,url
gh search issues --repo <owner>/<repo> --match title,body "<query>"
```

## Workflow Runs

```bash
gh run list --branch "$(git branch --show-current)" --limit 3 --json databaseId,displayTitle,conclusion,status
gh run view <RUN_ID> --log-failed
gh run watch <RUN_ID>
```

## PR Checks

```bash
gh pr checks <PR>
```

## Branch CI Triage Pattern

Preferred sequence:

1. `gh run list --branch "$(git branch --show-current)" --limit 3 --json databaseId,displayTitle,conclusion,status`
2. If all recent runs passed, stop
3. If a run is still running, `gh run watch <RUN_ID>`
4. If a run failed, `gh run view <RUN_ID> --log-failed`

## Notes

- Prefer `--json ... --jq ...` over parsing human-readable output
- Re-fetch after mutations when you need confirmation
- Use HEREDOCs for multiline bodies to avoid escaping bugs
