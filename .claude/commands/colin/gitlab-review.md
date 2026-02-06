---
allowed-tools: Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*), Bash(glab mr list:*), Bash(glab api:*), Bash(git branch:*), Bash(jq:*)
description: Code review a GitLab merge request and post inline comments
argument-hint: "[MR number or URL] [optional: agent names] [optional: --re-review]"
---

# GitLab Code Review

Provide a code review for the given merge request and post comments directly to GitLab.

## Resolving the Merge Request

The MR number is **optional**. If not provided, resolve it from the current git branch:

```bash
glab mr list --source-branch="$(git branch --show-current)" --state=opened --output json \
  | jq '.[0] | {iid, title, state, draft, web_url}'
```

This extracts just the IID, title, state, draft status, and URL from the first matching MR. The `iid` is the **MR IID** used in all subsequent `glab api` calls and as the `<MR>` argument for `glab mr` commands.

If an MR number or URL **is** provided, use it directly. For URLs, extract the IID from the path (the number after `merge_requests/`).

Throughout this document, `<MR>` refers to the resolved MR IID.

## Available Review Agents

Use the **exact agent names** when launching subagents:

| Approximate Name | Exact Agent Name | Model | Temp |
|------------------|------------------|-------|------|
| opus, opus 4.6 | `colin-review-opus46` | Claude Opus 4.6 | default |
| sonnet, sonnet 4.5 high | `colin-review-sonnet45-high` | Claude Sonnet 4.5 | 0.8 |
| gpt high, gpt 5.2 high, codex high | `colin-review-gpt52-codex-high` | GPT 5.2 Codex | 0.8 |
| gpt low, gpt 5.2 low, codex low | `colin-review-gpt52-codex-low` | GPT 5.2 Codex | 0.1 |
| gemini, gemini 3, gemini pro | `colin-review-gemini3-pro` | Gemini 3 Pro | 0.4 |
| kimi, kimi k2.5 | `colin-review-kimi-k25` | Kimi K2.5 | default |
| pickle, big pickle | `colin-review-big-pickle` | Big Pickle | 0.4 |

**Default agents (if none specified):**
1. `colin-review-opus46`
2. `colin-review-sonnet45-high`
3. `colin-review-gpt52-codex-high`

## Process

### Re-review Mode

If `--re-review` is specified in the arguments, this is a follow-up review of an MR that was previously reviewed. The goal is to review only the new changes and avoid re-flagging issues from the previous review.

**When `--re-review` is active, the following modifications apply to the process below:**

1. **Step 1 (Pre-flight)**: Skip the "already commented" check — prior comments are expected.

2. **Step 2 (Gather Context)**: In addition to the normal context gathering, also gather re-review context in parallel:

   a. **Get your previous comments** — Fetch your username and all discussions in parallel:
      ```bash
      # Get current username
      glab api user | jq -r '.username'

      # Get all discussions, extract only your authored comments with position info
      glab api projects/:fullpath/merge_requests/<MR_IID>/discussions | jq --arg me "<YOUR_USERNAME>" '
        [.[] | select(.notes[0].author.username == $me) | {
          id,
          body: .notes[0].body,
          created_at: .notes[0].created_at,
          position: (.notes[0].position // null | if . then {
            new_path, old_path, new_line, old_line
          } else null end)
        }]
      '
      ```
      This gives a compact list of your **prior review comments** with just the body, timestamp, and file/line position.

   b. **Determine what changed since the last review** — Use the MR versions to find the diff boundary:
      ```bash
      glab api projects/:fullpath/merge_requests/<MR_IID>/versions \
        | jq '[.[] | {id, head_commit_sha, created_at}]'
      ```
      The versions array is ordered newest-first. Compare `created_at` timestamps against your most recent review comment. The last version created **before** your comment is the version you reviewed. Call its `head_commit_sha` the **previous review HEAD**.

      Then compute the incremental diff — the changes between the previous review HEAD and the current HEAD:
      ```bash
      glab api "projects/:fullpath/repository/compare?from=<previous_review_HEAD>&to=<current_HEAD>" \
        | jq '{
          commits: [.commits[] | {short_id, title}],
          diffs: [.diffs[] | {new_path, old_path, diff}]
        }'
      ```
      This returns only the files and hunks that changed since your last review, with commit metadata trimmed down.

3. **Step 3 (Review)**: Provide the review agents with:
   - The **incremental diff** (not the full MR diff) as the primary focus
   - The **full MR diff** as background context only
   - The **list of prior review comments** so they know what was already flagged

   Agents should:
   - Focus on the incremental diff for new issues
   - **NOT** re-flag any issue that overlaps with a prior comment (same file, same or overlapping lines, same concern)
   - Check whether prior issues were actually fixed in the new changes — if a prior issue was **not fixed**, it may be re-flagged with a note that it was previously raised

4. **Step 5 (Post Comments)**: When posting the "no issues found" summary, use:
   ```
   ## Re-review

   No new issues found in the latest changes.
   ```

### Step 1: Pre-flight Checks

Launch a fast agent to check if any of the following are true:
- The merge request is closed or merged, or is a draft/WIP:
  ```bash
  glab mr view <MR> --output json | jq '{state, draft, title, author: .author.username}'
  ```
- The merge request does not need code review (e.g., automated MR, trivial change)
- You have already commented on this MR (check `glab mr view <MR> --comments`) — **skip this check if `--re-review`**

If any condition is true, stop and do not proceed.

Note: Still review AI-generated MRs.

### Step 1.5: Triage & Filter

Fetch the file list for the MR and filter out noise before reviewing.

**Fetch all changed files and apply exclusion filters in one pass:**

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

This gives each file's paths, diff content, metadata flags, and a line count for triage.

**Apply exclusion rules.** Remove files matching any of these criteria:

1. **Generated files**: `generated_file` is `true`
2. **Vendored/dependency directories**: `new_path` starts with any of:
   - `vendor/`, `node_modules/`, `.yarn/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.venv/`, `third_party/`
3. **Lock files and artifacts**: `new_path` matches any of:
   - `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `*.min.css`, `*.map`
4. **Oversized file diffs**: `diff_lines` exceeds **5000** (likely generated or vendored)

You can apply all exclusions with a single `jq` filter:

```bash
# Pipe the output from above into this filter
jq '
  [.[] | select(
    .generated_file != true
    and (.new_path | test("^(vendor|node_modules|\\.yarn|dist|build|\\.next|__pycache__|\\.venv|third_party)/") | not)
    and (.new_path | test("(package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|go\\.sum|composer\\.lock|Gemfile\\.lock|Cargo\\.lock|poetry\\.lock|\\.min\\.js|\\.min\\.css|\\.map)$") | not)
    and .diff_lines <= 5000
  )]
'
```

**Report triage results** before proceeding:
```
Triage: <N> files in MR, <M> excluded (<reasons>), reviewing <N-M> files (<L> diff lines)
```

If the remaining diff is very large (over 10,000 lines), warn the user but proceed.

**The filtered file list and their diffs are used for all subsequent steps.** Do not re-fetch or use `glab mr diff` for the full unfiltered diff.

### Step 2: Gather Context

Launch agents in parallel to:
1. Return a list of file paths for all relevant CLAUDE.md files including:
   - The root CLAUDE.md file, if it exists
   - Any CLAUDE.md files in directories containing files modified by the MR (use the **filtered** file list from Step 1.5)
2. View the merge request and return a summary of the changes:
   - `glab mr view <MR>` for title, description, metadata
   - The filtered diffs from Step 1.5 (already fetched — do not re-fetch)
3. If `--re-review`: gather re-review context (see [Re-review Mode](#re-review-mode) above)

### Step 3: Review the Changes

Launch the specified review agents in parallel (or the 3 default agents if none specified). Use the **exact agent names** from the table above.

Each agent should return a list of issues with description and reason flagged.

**Review Categories:**
- CLAUDE.md compliance (only consider CLAUDE.md files that share a file path with the file or parents)
- Bug detection (focus only on the diff, flag only significant bugs)
- Security issues, incorrect logic within the changed code

**CRITICAL: Only flag HIGH SIGNAL issues:**
- Objective bugs that will cause incorrect behavior at runtime
- Clear, unambiguous CLAUDE.md violations where you can quote the exact rule being broken

**Do NOT flag:**
- Subjective concerns or "suggestions"
- Style preferences not explicitly required by CLAUDE.md
- Potential issues that "might" be problems
- Anything requiring interpretation or judgment calls

If you are not certain an issue is real, do not flag it. False positives erode trust.

### Step 4: Validate Issues

For each issue found, launch a validation agent to confirm the issue is real with high confidence. Filter out any issues that fail validation.

### Step 5: Post Comments

**If NO issues were found**, post a summary comment using `glab mr note`:
```
glab mr note <MR> -m "## Code Review

No issues found. Checked for bugs and CLAUDE.md compliance."
```

**If issues were found**, post inline diff comments using the GitLab Discussions REST API via `glab api`.

#### Posting inline diff comments

The `glab mr note` command only supports general comments — it cannot attach a comment to a specific file/line in the diff. To post inline (positioned) comments, use the Discussions API via `glab api`.

**Step 5a: Get the merge request diff version SHAs**

```bash
glab api projects/:fullpath/merge_requests/<MR_IID>/versions \
  | jq '.[0] | {base_commit_sha, head_commit_sha, start_commit_sha}'
```

This extracts the three SHAs from the latest version:
- `base_commit_sha` → use as `position[base_sha]`
- `head_commit_sha` → use as `position[head_sha]`
- `start_commit_sha` → use as `position[start_sha]`

**Step 5b: Post each inline comment as a new discussion thread**

For a comment on a **single line** (new/added line):

```bash
glab api projects/:fullpath/merge_requests/<MR_IID>/discussions --method POST \
  -f "body=<comment text>" \
  -f "position[position_type]=text" \
  -f "position[base_sha]=<base_commit_sha>" \
  -f "position[head_sha]=<head_commit_sha>" \
  -f "position[start_sha]=<start_commit_sha>" \
  -f "position[old_path]=<file_path>" \
  -f "position[new_path]=<file_path>" \
  -f "position[new_line]=<line_number>"
```

Line positioning rules:
- **Added line** (green in diff): set `position[new_line]` only, omit `position[old_line]`
- **Removed line** (red in diff): set `position[old_line]` only, omit `position[new_line]`
- **Unchanged line**: set both `position[old_line]` and `position[new_line]`

For a **multi-line** comment, add `position[line_range]` parameters:

```bash
glab api projects/:fullpath/merge_requests/<MR_IID>/discussions --method POST \
  -f "body=<comment text>" \
  -f "position[position_type]=text" \
  -f "position[base_sha]=<base_commit_sha>" \
  -f "position[head_sha]=<head_commit_sha>" \
  -f "position[start_sha]=<start_commit_sha>" \
  -f "position[old_path]=<file_path>" \
  -f "position[new_path]=<file_path>" \
  -f "position[new_line]=<end_line>" \
  -f "position[line_range][start][type]=new" \
  -f "position[line_range][start][new_line]=<start_line>" \
  -f "position[line_range][end][type]=new" \
  -f "position[line_range][end][new_line]=<end_line>"
```

The `line_range` `type` field should be `new` for added lines, `old` for removed lines.

#### Comment body format

- `body`: Brief description of the issue. For small fixes (up to 5 lines), include a committable suggestion using GitLab's suggestion syntax:
  ````
  ```suggestion:-0+0
  corrected code here
  ```
  ````

  The `:-0+0` means replace 0 lines above and 0 lines below the commented line. For multi-line suggestions, adjust accordingly (e.g., `:-2+0` to include 2 lines above).

  **Suggestions must be COMPLETE.** If a fix requires additional changes elsewhere, do NOT use a suggestion block.

  For larger fixes (6+ lines, structural changes, or multi-location changes), do NOT use suggestion blocks. Instead:
  1. Describe what the issue is
  2. Explain the suggested fix at a high level
  3. Include a copyable prompt:
     ```
     Fix [file:line]: [brief description of issue and suggested fix]
     ```

**IMPORTANT: Only post ONE comment per unique issue. Do not post duplicate comments.**

## Code Link Format

When linking to code in inline comments, use GitLab's format:
`https://gitlab.com/OWNER/REPO/-/blob/FULL_SHA/path/to/file.ext#L10-15`

Requirements:
- Full git SHA (not abbreviated)
- `#` sign after the file name
- Line range format: `L[start]-[end]`
- Provide at least 1 line of context before and after

## Notes

- Use `glab` CLI to interact with GitLab (`glab mr view`, `glab mr diff`, `glab mr note`)
- Use `glab api` for operations not supported by high-level commands (inline diff comments, file list with metadata)
- Pipe `glab api` and `glab mr ... --output json` through `jq` to select only relevant fields — reduces token usage and improves readability
- The `glab api` command supports `:fullpath` as a placeholder for the current repo's URL-encoded path
- **Dependencies:** `glab`, `jq`, `git`
- Create a todo list before starting
- Cite and link each issue in inline comments (e.g., link to CLAUDE.md if referring to it)

### Excluded file patterns

The following are excluded from review in Step 1.5. To update, edit this list:

**Directories:** `vendor/`, `node_modules/`, `.yarn/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.venv/`, `third_party/`

**Files:** `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `*.min.css`, `*.map`

**Thresholds:** Single file diff > 5,000 lines, `generated_file: true`
