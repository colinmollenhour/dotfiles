---
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr edit:*), Bash(gh api:*), Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*), Bash(glab mr list:*), Bash(glab mr update:*), Bash(glab api:*), Bash(git *), Bash(jq:*), Bash(curl:*), Bash(which opencode:*), Bash(ls:*), mcp__github_inline_comment__create_inline_comment
description: Code review for GitHub PRs, GitLab MRs, or any git diff
argument-hint: "[PR/MR number, URL, or git description] [agents] [--re-review] [--no-post] [--summary]"
---

# Code Review

Provide a code review for a GitHub pull request, GitLab merge request, or arbitrary git diff. Posts inline comments directly to the platform when reviewing a PR/MR.

## Input Resolution

**If no argument is provided:**
1. Check the git remote origin URL: `git remote get-url origin`
2. If it contains `github.com` → GitHub PR mode, resolve PR from current branch
3. If it contains `gitlab` or matches a GitLab host → GitLab MR mode, resolve MR from current branch
4. Otherwise → Error, cannot determine platform

**If an argument is provided, detect the type:**

| Pattern | Mode | How to Resolve |
|---------|------|----------------|
| `github.com/.../pull/123` | GitHub PR | Extract PR number from URL |
| `gitlab.*/.../merge_requests/123` | GitLab MR | Extract MR IID from URL |
| `https://github.com/OWNER/REPO` | GitHub PR | Owner/repo from URL, resolve PR from branch |
| Numeric only (e.g., `123`) | Platform from origin | Use number as PR/MR ID |
| `last N commits` | Git diff | `git diff HEAD~N..HEAD` |
| `whole repo` or `entire codebase` | Git diff | Analyze all tracked files |
| `branch NAME` | Git diff | `git diff main...NAME` (or default branch) |
| `SHA..SHA` or `SHA...SHA` | Git diff | Direct git revision range |
| Any other text | Git diff | Interpret as git rev spec |

### Resolving PR/MR from Current Branch

**GitHub:**
```bash
gh pr list --head "$(git branch --show-current)" --state open --json number,title,state,isDraft
```

**GitLab:**
```bash
glab mr list --source-branch="$(git branch --show-current)" --output json \
  | jq '.[0] | {iid, title, state, draft, web_url}'
```

## Available Review Agents

Use the **exact agent names** when launching subagents. The **Display Name** is used in `--summary` output and posted comments for readability.

| Approximate Name    | Exact Agent Name             | Display Name   |
|---------------------|------------------------------|----------------|
| opus, opus 4.6      | `colin-review-opus`          | Opus 4.6       |
| sonnet, sonnet 4.6  | `colin-review-sonnet`        | Sonnet 4.6     |
| gpt, gpt 5.4        | `colin-review-gpt`           | GPT 5.4        |
| gpt-codex, codex    | `colin-review-gpt-codex`     | GPT 5.3 Codex  |
| gemini, gemini pro  | `colin-review-gemini-pro`    | Gemini 3.1 Pro |
| kimi, kimi k2.5     | `colin-review-kimi`          | Kimi K2.5      |
| pickle, big pickle  | `colin-review-big-pickle`    | Big Pickle     |
| glm, glm 5          | `colin-review-glm`           | GLM 5          |
| minimax             | `colin-review-minimax`       | MiniMax M2.5   |
| mimo                | `colin-review-mimo`          | MiMo V2 Pro    |

**Default agents (if none specified):**
1. `colin-review-opus`
2. `colin-review-gpt`
3. `colin-review-glm`

## Re-review Mode

If `--re-review` is specified, this is a follow-up review of a PR/MR that was previously reviewed. The goal is to review only the new changes and avoid re-flagging issues from the previous review.

**When `--re-review` is active, the following modifications apply to the process below:**

1. **Step 1 (Pre-flight)**: Skip the "already commented" check — prior comments are expected.

2. **Step 2 (Gather Context)**: In addition to normal context gathering, also gather re-review context:

   **GitHub:**
   ```bash
   # Get PR timeline to find last review
   gh pr view <PR> --comments --json comments
   
   # Get commits since a specific SHA
   gh api repos/{owner}/{repo}/pulls/<PR>/commits
   ```

   **GitLab:**
   a. **Get your previous comments** — Fetch your username and all discussions in parallel:
   ```bash
   glab api user | jq -r '.username'
   
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
   
   b. **Determine what changed since the last review** — Use the MR versions:
   ```bash
   glab api projects/:fullpath/merge_requests/<MR_IID>/versions \
     | jq '[.[] | {id, head_commit_sha, created_at}]'
   ```
   
   Compare timestamps to find the version you reviewed, then get incremental diff:
   ```bash
   glab api "projects/:fullpath/repository/compare?from=<previous_review_HEAD>&to=<current_HEAD>" \
     | jq '{
       commits: [.commits[] | {short_id, title}],
       diffs: [.diffs[] | {new_path, old_path, diff}]
     }'
   ```

3. **Step 3 (Review)**: Provide agents with:
   - The **incremental diff** (not the full diff) as primary focus
   - The **full diff** as background context only
   - The **list of prior review comments** so they know what was already flagged

   Agents should:
   - Focus on the incremental diff for new issues
   - **NOT** re-flag any issue that overlaps with a prior comment
   - Check whether prior issues were fixed — if not fixed, may re-flag with note

4. **Step 5 (Post Comments)**: When posting "no issues found" summary:
   ```
   > **AI Code Review (Re-review)** · Models: <comma-separated list>
   
   No new issues found in the latest changes.
   ```

## Process

### Step 1: Pre-flight Checks

**For GitHub PRs:**
```bash
gh pr view <PR> --json state,isDraft,title,author --jq '{state, isDraft, title, author: .author.login}'
```

**For GitLab MRs:**
```bash
glab mr view <MR> --output json | jq '{state, draft, title, author: .author.username}'
```

Stop and do not proceed if:
- The PR/MR is closed or merged
- The PR/MR is a draft/WIP
- The PR/MR does not need code review (e.g., automated, trivial change)
- You have already commented on this PR/MR (**skip this check if `--re-review`**)

Note: Still review AI-generated PRs/MRs.

**For Git diff mode:** Skip pre-flight checks entirely.

### Step 1.5: Triage & Filter

Fetch the file list and filter out noise before reviewing.

**GitHub:**
```bash
gh pr view <PR> --json files --jq '.files[] | {path: .path, additions, deletions}'
gh pr diff <PR>
```

**GitLab:**
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

**Git diff mode:**
```bash
git diff --stat <revision>
git diff <revision>
```

**Apply exclusion rules.** Remove files matching any of these criteria:

1. **Generated files**: `generated_file` is `true` (GitLab only)
2. **Vendored/dependency directories**: Path starts with:
   - `vendor/`, `node_modules/`, `.yarn/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.venv/`, `third_party/`
3. **Lock files and artifacts**: Path matches:
   - `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `*.min.css`, `*.map`
4. **Oversized file diffs**: Diff exceeds **5000** lines

**Report triage results:**
```
Triage: <N> files, <M> excluded (<reasons>), reviewing <N-M> files (<L> diff lines)
```

### Step 2: Gather Context

Launch agents in parallel to:
1. Return a list of file paths for all relevant AGENTS.md files including:
   - The root AGENTS.md file, if it exists
   - Any AGENTS.md files in directories containing modified files (use the **filtered** file list)
2. Get the diff/PR/MR summary and return a summary of the changes
3. If `--re-review`: gather re-review context (see [Re-review Mode](#re-review-mode) above)
4. **External context** (see [Fetching External Context](#fetching-external-context) below)

#### Fetching External Context

Scan the title, description, and any linked issues/tasks for URLs. For each URL found, if the corresponding MCP tool is available, launch a sub-agent to fetch and summarize context. Skip silently if the tool is not available.

| URL Pattern | MCP Tool | What to Fetch |
|---|---|---|
| `clickup.com/t/<task_id>` | `mcp__clickup__*` | Task title, description, acceptance criteria, comments |
| `app.intercom.com/*/conversation/<id>` | `mcp__Intercom__get_conversation` | Full conversation, user-reported issue |
| `*.sentry.io/issues/<issue_id>` | `mcp__Sentry__get_issue_details` | Issue details, stacktrace, frequency |

**Usage:** Pass summaries to review agents alongside the diff. Do NOT post external context as comments.

### Step 3: Review the Changes

Launch the specified review agents in parallel (or the 3 default agents if none specified). Use the **exact agent names** from the table above.

Each agent should return a list of issues with description and reason flagged. **Tag each issue with the agent name that found it** (e.g., `colin-review-opus`) — this attribution is preserved through validation and included in the posted comment.

**Review Categories:**
- AGENTS.md compliance (only consider AGENTS.md files that share a file path with the file or parents)
- Bug detection (focus only on the diff, flag only significant bugs)
- Security issues, incorrect logic within the changed code

**CRITICAL: Only flag HIGH SIGNAL issues:**
- Objective bugs that will cause incorrect behavior at runtime
- Clear, unambiguous AGENTS.md violations where you can quote the exact rule being broken

**Do NOT flag:**
- Subjective concerns or "suggestions"
- Style preferences not explicitly required by AGENTS.md
- Potential issues that "might" be problems
- Anything requiring interpretation or judgment calls

If you are not certain an issue is real, do not flag it. False positives erode trust.

### Step 4: Validate Issues

For each issue found, launch a validation agent to confirm the issue is real with high confidence. Filter out any issues that fail validation.

When deduplicating issues found by multiple agents, **merge the agent attribution** — track all agents that independently identified the same issue. Issues found by multiple models are higher signal.

When `--summary` is active, preserve full validation results for each agent.

### Step 4.5: Model Comparison Summary (`--summary`)

**Skip this step entirely if `--summary` is not specified.**

After validation completes, compile per-agent performance metrics using **display names**.

#### Metrics per agent

| Metric | Definition |
|--------|------------|
| **Found** | Total issues flagged by this agent |
| **Validated** | Issues that survived validation |
| **False Positives** | Found minus Validated |
| **Unique Finds** | Validated issues flagged by *only* this agent |
| **Shared Finds** | Validated issues also found by at least one other agent |

#### Scoring methods

1. **Unique Value** — Rank by unique validated finds (descending), then by false positive rate (ascending)
2. **Accuracy** — `validated / found` as a percentage. 0 issues shows `—`
3. **Composite Score** — `(+2 × unique finds) + (+1 × shared finds) + (−2 × false positives)`

**Best model** = highest composite score. **Worst model** = lowest.

#### Summary comment format

When at least one issue was found:

```markdown
> **AI Code Review — Model Summary**

| Model | Found | Validated | False Pos | Unique | Accuracy | Composite |
|-------|-------|-----------|-----------|--------|----------|-----------|
| Opus 4.6 | 5 | 4 | 1 | 2 | 80% | +7 |
| GPT 5.3 Codex | 3 | 3 | 0 | 1 | 100% | +5 |

**Best model:** Opus 4.6 — 2 unique finds, 80% accuracy, +7 composite
**Worst model:** Kimi K2.5 — 0 unique finds, 25% accuracy, −4 composite
```

When zero issues were found:

```markdown
> **AI Code Review — Model Summary**

All <N> models found no issues. No differentiation for this review.

| Model | Found | Validated | False Pos | Unique | Accuracy | Composite |
|-------|-------|-----------|-----------|--------|----------|-----------|
| Opus 4.6 | 0 | 0 | 0 | 0 | — | 0 |
| GPT 5.3 Codex | 0 | 0 | 0 | 0 | — | 0 |
```

### Step 5: Post/Display Comments

#### Git Diff Mode (Preview Only)

**Always behave as if `--no-post` is active.** Display all issues to the user without posting:

```
---
Issue <N>
File: <path>
Line(s): <line or range>
Flagged by: <agent-name(s)>

<full comment body>
---

<Repeat for each issue>

---
Review complete. <N> issues found in <M> files.
---
```

Do NOT attempt to post anywhere. Skip to Step 7 (no labels in git diff mode).

#### `--no-post` Mode (Dry Run)

If `--no-post` is specified for a PR/MR, **do not post anything**. Display all prepared comments:

```
---
Issue <N>
File: <path>
Line(s): <line or range>
Flagged by: <agent-name(s)>

<full comment body as it would be posted>
---
```

After displaying, **stop and wait for user instructions**:
- **"post"** → post all displayed comments as-is
- **"drop issue 3"** → remove specific issues, then post when told
- **"edit issue 2 to say..."** → modify a comment, post when told
- **"cancel"** → discard everything, post nothing

#### No Issues Found

Post a summary comment:

**GitHub:**
```bash
gh pr comment <PR> --body "> **AI Code Review** · Models: <comma-separated list>

No issues found. Checked for bugs and AGENTS.md compliance."
```

**GitLab:**
```bash
glab mr note <MR> -m "> **AI Code Review** · Models: <comma-separated list>

No issues found. Checked for bugs and AGENTS.md compliance."
```

#### Issues Found — Post Inline Comments

**GitHub:**

Prefer the MCP tool if available, otherwise use `gh api`.

*Option A: MCP tool*
Use `mcp__github_inline_comment__create_inline_comment`:
- `path`: file path
- `line` (and `startLine` for ranges): buggy lines
- `body`: comment body

*Option B: gh api*

Get the PR's head commit SHA:
```bash
gh pr view <PR> --json headRefOid --jq '.headRefOid'
```

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
- Added/unchanged lines: `side` = `RIGHT`
- Removed lines: `side` = `LEFT`
- Use `-F` for integer fields

**GitLab:**

Use the Discussions API via `glab api` for inline comments.

Get diff version SHAs:
```bash
glab api projects/:fullpath/merge_requests/<MR_IID>/versions \
  | jq '.[0] | {base_commit_sha, head_commit_sha, start_commit_sha}'
```

Post inline comment:
```bash
echo '<JSON>' | glab api projects/:fullpath/merge_requests/<MR_IID>/discussions \
  --method POST --input - -H "Content-Type: application/json"
```

JSON for single-line comment:
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

For multi-line, add `line_range`:
```json
{
  "line_range": {
    "start": {"type": "new", "new_line": <start_line>},
    "end": {"type": "new", "new_line": <end_line>}
  }
}
```

**Verify success:** Response should contain `"type": "DiffNote"`.

#### Posting `--summary` Comment

If `--summary` is active, post the model comparison summary as an additional comment **after** all inline comments:

**GitHub:**
```bash
gh pr comment <PR> --body "<summary comment body>"
```

**GitLab:**
```bash
glab mr note <MR> -m "<summary comment body>"
```

#### Comment Body Format

Every comment must start with an AI attribution header:

```
> **AI Code Review** · Flagged by: <agent-name(s)>

<issue description>
```

Where `<agent-name(s)>` is a comma-separated list of agents that flagged the issue.

For small fixes (up to 5 lines), include a committable suggestion:

**GitHub:**
````markdown
```suggestion
corrected code here
```
````

**GitLab:**
````markdown
```suggestion:-0+0
corrected code here
```
````

**Suggestions must be COMPLETE.** If a fix requires additional changes elsewhere, do NOT use a suggestion block. Instead:
1. Describe the issue
2. Explain the suggested fix
3. Include a copyable prompt:
   ```
   Fix [file:line]: [brief description of issue and suggested fix]
   ```

**IMPORTANT: Only post ONE comment per unique issue.**

### Step 6: Apply Review Label

**Skip this step for Git diff mode.**

After all comments have been posted (or user confirms in `--no-post` mode), add the `:Reviewed-By-AI` label:

**GitHub:**
```bash
gh pr edit <PR> --add-label ":Reviewed-By-AI"
```

**GitLab:**
```bash
glab mr update <MR> --label ":Reviewed-By-AI"
```

**Note:** The colon is part of the label name. The label must already exist.

If `--no-post` is active and the user says "cancel", do **not** apply the label.

## Code Link Format

**GitHub:** `https://github.com/OWNER/REPO/blob/FULL_SHA/path/to/file.ext#L10-L15`

**GitLab:** `https://gitlab.com/OWNER/REPO/-/blob/FULL_SHA/path/to/file.ext#L10-15`

Requirements:
- Full git SHA (not abbreviated)
- `#` sign after the file name
- Line range format: `L[start]-L[end]` (GitHub) or `L[start]-[end]` (GitLab)
- Provide at least 1 line of context before and after

## Notes

- Use `gh` CLI for GitHub, `glab` CLI for GitLab
- Use `glab api` or `gh api` for operations not supported by high-level commands
- Pipe API output through `jq` to select relevant fields — reduces token usage
- The `glab api` command supports `:fullpath` as a placeholder for the current repo's URL-encoded path
- **Dependencies:** `gh`, `glab`, `jq`, `git`
- Create a todo list before starting
- Cite and link each issue in inline comments (e.g., link to AGENTS.md if referring to it)

### Excluded file patterns

**Directories:** `vendor/`, `node_modules/`, `.yarn/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.venv/`, `third_party/`

**Files:** `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `*.min.css`, `*.map`

**Thresholds:** Single file diff > 5,000 lines, `generated_file: true` (GitLab)
