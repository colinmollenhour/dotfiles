---
allowed-tools: Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*), Bash(glab mr list:*), Bash(glab mr update:*), Bash(glab api:*), Bash(git branch:*), Bash(jq:*), Bash(opencode export:*), Bash(opencode session:*), Bash(curl:*), Bash(which opencode:*), Bash(ls:*)
description: Code review a GitLab merge request and post inline comments
argument-hint: "[MR number or URL] [optional: agent names] [optional: --re-review] [optional: --no-post] [optional: --summary]"
---

# GitLab Code Review

Provide a code review for the given merge request and post comments directly to GitLab.

## Resolving the Merge Request

The MR number is **optional**. If not provided, resolve it from the current git branch:

```bash
glab mr list --source-branch="$(git branch --show-current)" --output json \
  | jq '.[0] | {iid, title, state, draft, web_url}'
```

This extracts just the IID, title, state, draft status, and URL from the first matching MR. The `iid` is the **MR IID** used in all subsequent `glab api` calls and as the `<MR>` argument for `glab mr` commands.

If an MR number or URL **is** provided, use it directly. For URLs, extract the IID from the path (the number after `merge_requests/`).

Throughout this document, `<MR>` refers to the resolved MR IID.

## Available Review Agents

Use the **exact agent names** when launching subagents. The **Display Name** is used in `--summary` output and posted comments for readability.

| Approximate Name | Exact Agent Name | Display Name | Model | Temp |
|------------------|------------------|--------------|-------|------|
| opus, opus 4.6 | `colin-review-opus46` | Opus 4.6 | Claude Opus 4.6 | default |
| sonnet, sonnet 4.5 high | `colin-review-sonnet45-high` | Sonnet 4.5 | Claude Sonnet 4.5 | 0.8 |
| gpt high, gpt 5.2 high, codex high | `colin-review-gpt52-codex-high` | GPT 5.2 (high) | GPT 5.2 Codex | 0.8 |
| gpt low, gpt 5.2 low, codex low | `colin-review-gpt52-codex-low` | GPT 5.2 (low) | GPT 5.2 Codex | 0.1 |
| gemini, gemini 3, gemini pro | `colin-review-gemini3-pro` | Gemini 3 Pro | Gemini 3 Pro | 0.4 |
| kimi, kimi k2.5 | `colin-review-kimi-k25` | Kimi K2.5 | Kimi K2.5 | default |
| pickle, big pickle | `colin-review-big-pickle` | Big Pickle | Big Pickle | 0.4 |

**Default agents (if none specified):**
1. `colin-review-opus46`
2. `colin-review-gpt52-codex-high`
3. `colin-review-kimi-k25`

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
   > **AI Code Review (Re-review)** · Models: <comma-separated list of agents used>

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

Each agent should return a list of issues with description and reason flagged. **Tag each issue with the agent name that found it** (e.g., `colin-review-opus46`) — this attribution is preserved through validation and included in the posted comment. When `--summary` is active, the per-agent issue counts from this step feed into the "Found" metric in Step 4.5.

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

When deduplicating issues found by multiple agents, **merge the agent attribution** — track all agents that independently identified the same issue. Issues found by multiple models are higher signal.

When `--summary` is active, preserve the full validation results: for each agent, record which of its issues were validated and which were rejected. This data feeds into the "Validated", "False Positives", and "Unique Finds" metrics in Step 4.5.

### Step 4.5: Model Comparison Summary (`--summary`)

**Skip this step entirely if `--summary` is not specified.**

After validation completes in Step 4, compile per-agent performance metrics using the data already collected in Steps 3–4. Use **display names** (from the agent table) instead of exact agent names in all summary output.

#### Metrics collected per agent

For each agent, compute:

| Metric | Definition |
|--------|------------|
| **Found** | Total issues flagged by this agent in Step 3 |
| **Validated** | Issues from this agent that survived validation in Step 4 |
| **False Positives** | Found minus Validated |
| **Unique Finds** | Validated issues flagged by *only* this agent (no other agent found it) |
| **Shared Finds** | Validated issues also found by at least one other agent |

#### Scoring methods

Compute all three scores for each agent:

1. **Unique Value** — Rank by unique validated finds (descending), then by false positive rate (ascending) as tiebreaker. Answers: *which model adds distinct value?*
2. **Accuracy** — `validated / found` as a percentage. Agents that found 0 issues show `—` instead of a percentage. Answers: *which model is least noisy?*
3. **Composite Score** — `(+2 × unique finds) + (+1 × shared finds) + (−2 × false positives)`. Answers: *overall weighted ranking*.

**Best model** = highest composite score. **Worst model** = lowest composite score. Ties broken by accuracy rate, then unique finds.

#### Summary comment format

Build the following comment body. This is posted as a regular `glab mr note` (not an inline comment).

When at least one issue was flagged by any agent:

```markdown
> **AI Code Review — Model Summary**

| Model | Found | Validated | False Pos | Unique | Accuracy | Composite |
|-------|-------|-----------|-----------|--------|----------|-----------|
| Opus 4.6 | 5 | 4 | 1 | 2 | 80% | +7 |
| GPT 5.2 (high) | 3 | 3 | 0 | 1 | 100% | +5 |
| Kimi K2.5 | 4 | 1 | 3 | 0 | 25% | −4 |

**Best model:** Opus 4.6 — 2 unique finds, 80% accuracy, +7 composite
**Worst model:** Kimi K2.5 — 0 unique finds, 25% accuracy, −4 composite
```

When zero issues were found by all agents:

```markdown
> **AI Code Review — Model Summary**

All <N> models found no issues. No differentiation for this review.

| Model | Found | Validated | False Pos | Unique | Accuracy | Composite |
|-------|-------|-----------|-----------|--------|----------|-----------|
| Opus 4.6 | 0 | 0 | 0 | 0 | — | 0 |
| GPT 5.2 (high) | 0 | 0 | 0 | 0 | — | 0 |
| Kimi K2.5 | 0 | 0 | 0 | 0 | — | 0 |
```

When all agents have the same composite score (and at least one issue was found):

```markdown
**Best model:** Tie — all models scored equally
**Worst model:** Tie — all models scored equally
```

#### `--no-post` interaction

When both `--summary` and `--no-post` are active, display the full summary table to the user after the issue previews, under a heading:

```
---
Model Comparison Summary (would be posted as MR comment):

<summary comment body>
---
```

The summary is included when the user says "post" — post it alongside the inline comments. If the user says "cancel", discard it along with everything else.

### Step 5: Post Comments

#### `--no-post` mode (dry run)

If `--no-post` is specified, **do not post anything to GitLab**. Instead, display all prepared comments to the user for review:

For each issue, output:
```
---
Issue <N>
File: <path>
Line(s): <line or range>
Flagged by: <agent-name(s)>

<full comment body as it would be posted, including the AI attribution header>
---
```

If no issues were found, show the summary comment that would be posted.

If `--summary` is also active, display the model comparison summary after the issue previews (see [Step 4.5 `--no-post` interaction](#step-45-model-comparison-summary---summary)).

After displaying all comments, **stop and wait for user instructions**. The user may:
- Say **"post"** or **"post the notes"** → post all displayed comments as-is
- Say **"drop issue 3"** or **"skip the one about X"** → remove specific issues from the list, then post the rest when told
- Say **"edit issue 2 to say..."** → modify a comment body, then post when told
- Say **"cancel"** → discard everything, post nothing

When the user says to post, post exactly what was shown (with any edits/removals applied) using the same mechanics described below. Do not re-validate or re-confirm.

---

**If NO issues were found**, post a summary comment using `glab mr note`:
```
glab mr note <MR> -m "> **AI Code Review** · Models: <comma-separated list of agents used>

No issues found. Checked for bugs and CLAUDE.md compliance."
```

**If issues were found**, post inline diff comments using the GitLab Discussions REST API via `glab api`.

#### Posting `--summary` comment

If `--summary` is active, post the model comparison summary (prepared in Step 4.5) as an additional `glab mr note` **after** all inline comments have been posted (or after the "no issues found" note). This ensures the summary appears as the last comment in the MR timeline.

```bash
glab mr note <MR> -m "<summary comment body from Step 4.5>"
```

This is a regular (non-inline) comment. Post it regardless of whether issues were found — the zero-issue format from Step 4.5 is used when no issues were flagged.

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

**IMPORTANT:** You MUST use a JSON body piped via `--input -` with `-H "Content-Type: application/json"`. The `-f` flag approach does NOT create proper nested JSON objects — GitLab silently drops the position data and creates a general comment instead of an inline diff note.

For a comment on a **single line** (added line):

```bash
echo '<JSON>' | glab api projects/:fullpath/merge_requests/<MR_IID>/discussions \
  --method POST --input - -H "Content-Type: application/json"
```

Where `<JSON>` is:
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

Line positioning rules:
- **Added line** (green in diff): set `new_line` only, omit `old_line`
- **Removed line** (red in diff): set `old_line` only, omit `new_line`
- **Unchanged context line**: set both `old_line` and `new_line`
- **Lines must be within a diff hunk** — you cannot comment on lines outside the diff. If the target line is outside any hunk, comment on the nearest line that IS in the diff.

For a **multi-line** comment, add `line_range` to the position:

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
    "new_line": <end_line>,
    "line_range": {
      "start": {"type": "new", "new_line": <start_line>},
      "end": {"type": "new", "new_line": <end_line>}
    }
  }
}
```

The `line_range` `type` field should be `"new"` for added lines, `"old"` for removed lines.

**Verify success:** The response should contain `"type": "DiffNote"` (not `"DiscussionNote"`). If you see `DiscussionNote`, the position was rejected — check that the line is within a diff hunk.

**Escaping in heredocs:** Use `cat <<'ENDJSON'` (single-quoted delimiter) to avoid shell interpolation of `$` and backticks in the JSON body. If the comment body itself contains single quotes, escape them as `'\\''` or use a temp file.

#### Comment body format

Every comment must start with an AI attribution header and end with a model attribution footer:

```
> **AI Code Review** · Flagged by: <agent-name(s)>

<issue description>

<suggestion or fix prompt>
```

Where `<agent-name(s)>` is a comma-separated list of the agent names that flagged the issue (e.g., `colin-review-opus46, colin-review-sonnet45-high`). Issues flagged by multiple models independently are stronger signals — this is visible to the reviewer at a glance.

**Issue description**: Brief description of the issue. For small fixes (up to 5 lines), include a committable suggestion using GitLab's suggestion syntax:
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

### Step 6: Export Session Transcript

**Skip this step entirely if the agent harness is not `opencode`** (e.g., if running under Claude Code, Cursor, or another harness). To detect this, check if `opencode` is available:

```bash
which opencode 2>/dev/null
```

If the command is not found, skip this step silently.

#### 6a: Identify the current session

```bash
opencode session list 2>&1 | head -5
```

The current session is the most recent one (first row). Extract its session ID.

#### 6b: Export the session to a temp file

```bash
opencode export <SESSION_ID> > /tmp/mr-<MR>-review-session.json
```

#### 6c: Upload the file to the GitLab project

Use the GitLab uploads API via `curl`. **Important:** Retrieve the token into a shell variable to avoid exposing it in command output or session logs.

```bash
TOKEN=$(glab config get token --host <GITLAB_HOST> 2>/dev/null | head -1)
PROJECT_ID=$(glab api projects/:fullpath --method GET 2>/dev/null | jq '.id')
curl --silent --request POST \
  --header "PRIVATE-TOKEN: ${TOKEN}" \
  "https://<GITLAB_HOST>/api/v4/projects/${PROJECT_ID}/uploads" \
  --form "file=@/tmp/mr-<MR>-review-session.json"
```

Extract the `url` field from the JSON response — this is the markdown-compatible path to the uploaded file (e.g., `/uploads/<hash>/mr-<MR>-review-session.json`).

The `<GITLAB_HOST>` should be extracted from the MR's `web_url` (resolved in the MR resolution step).

#### 6d: Post a note with the session attachment

Post a general MR comment that includes the session file link and an import hint:

```bash
glab mr note <MR> -m '> **AI Code Review — Session Transcript**
>
> Full review session: [mr-<MR>-review-session.json](<uploaded_url>)
>
> To replay this session locally, download the file and run:
> ```
> opencode import mr-<MR>-review-session.json
> ```'
```

#### Combining with `--summary`

When `--summary` is active, **do not** post the session transcript as a separate note. Instead, append the session file link and import hint to the bottom of the `--summary` comment (Step 4.5) before posting it:

```markdown
---

**Session transcript:** [mr-<MR>-review-session.json](<uploaded_url>)

To replay this session locally, download the file and run:
\`\`\`
opencode import mr-<MR>-review-session.json
\`\`\`
```

This keeps the MR timeline cleaner by combining the summary and session into a single comment.

#### `--no-post` interaction

When `--no-post` is active, still export the session and upload the file, but hold the note for user confirmation along with everything else. Display it in the preview output and post it when the user says "post".

### Step 7: Apply Review Label

After all comments have been posted (or after the user confirms posting in `--no-post` mode), add the `:Reviewed-By-AI` label to the merge request:

```bash
glab mr update <MR> --label ":Reviewed-By-AI"
```

**Note:** The colon is part of the label name. This label must already exist in the GitLab project.

If `--no-post` is active and the user says "cancel", do **not** apply the label.

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
