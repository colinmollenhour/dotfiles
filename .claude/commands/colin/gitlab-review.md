---
description: Code review a GitLab merge request and post inline comments
argument-hint: "<MR number or URL> [optional: agent names]"
---

# GitLab Code Review

Provide a code review for the given merge request and post comments directly to GitLab.

## Available Review Agents

Use the **exact agent names** when launching subagents:

| Approximate Name | Exact Agent Name | Model | Temp |
|------------------|------------------|-------|------|
| opus low, opus 4.5 low | `colin-review-opus45-low` | Claude Opus 4.5 | 0.1 |
| opus high, opus 4.5 high | `colin-review-opus45-high` | Claude Opus 4.5 | 0.8 |
| sonnet high, sonnet 4.5 high | `colin-review-sonnet45-high` | Claude Sonnet 4.5 | 0.8 |
| gpt high, gpt 5.1 high, codex high | `colin-review-gpt51-codex-high` | GPT 5.1 Codex | 0.8 |
| gpt low, gpt 5.1 low, codex low | `colin-review-gpt51-codex-low` | GPT 5.1 Codex | 0.1 |
| gemini, gemini 3, gemini pro | `colin-review-gemini3-pro` | Gemini 3 Pro | 0.4 |
| pickle, big pickle | `colin-review-big-pickle` | Big Pickle | 0.4 |

**Default agents (if none specified):**
1. `colin-review-opus45-low`
2. `colin-review-sonnet45-high`
3. `colin-review-gpt51-codex-high`

## Process

### Step 1: Pre-flight Checks

<!-- TODO: Choose CLI tool - glab CLI or GitLab MCP -->
<!-- Check if MR is closed, draft, or already reviewed -->

Launch a fast agent to check if any of the following are true:
- The merge request is closed or merged
- The merge request is a draft/WIP
- The merge request does not need code review (e.g., automated MR, trivial change)
- You have already commented on this MR

If any condition is true, stop and do not proceed.

Note: Still review AI-generated MRs.

### Step 2: Gather Context

Launch agents in parallel to:
1. Return a list of file paths for all relevant CLAUDE.md files including:
   - The root CLAUDE.md file, if it exists
   - Any CLAUDE.md files in directories containing files modified by the MR
2. View the merge request and return a summary of the changes

<!-- TODO: glab CLI commands or GitLab MCP calls -->
<!-- glab mr view <MR> -->
<!-- glab mr diff <MR> -->

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

<!-- TODO: Choose method for posting comments -->
<!-- Option A: glab CLI -->
<!-- glab mr note <MR> -m "comment" -->
<!-- Option B: GitLab MCP for inline comments -->

**If NO issues were found**, post a summary comment:
```
## Code Review

No issues found. Checked for bugs and CLAUDE.md compliance.
```

**If issues were found**, post inline comments for each issue:
- `path`: the file path
- `line` (and `startLine` for ranges): select the buggy lines
- `body`: Brief description of the issue. For small fixes (up to 5 lines), include a committable suggestion:
  ```suggestion
  corrected code here
  ```

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

<!-- TODO: Define allowed-tools once CLI/MCP choice is made -->
<!-- Example for glab: -->
<!-- allowed-tools: Bash(glab mr view:*), Bash(glab mr diff:*), Bash(glab mr note:*) -->
<!-- Example for GitLab MCP: -->
<!-- allowed-tools: mcp__gitlab__* -->

- Create a todo list before starting
- Cite and link each issue in inline comments (e.g., link to CLAUDE.md if referring to it)
