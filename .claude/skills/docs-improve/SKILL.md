---
name: docs-improve
description: Review docs, score issues, preview edits. Use for READMEs, guides, help docs, Markdown/MDX/RST/HTML.
---

# Docs Improve

Review prose documentation and help articles. Produce a structured critique first, then apply only the suggestions the user explicitly approves.

This is a review-first workflow, not an automatic rewrite. Every proposed change must be located, severity-rated, and previewed before any file is edited.

## When To Use

Use this skill when the user asks to improve, review, critique, score, analyze, or fix prose documentation, including:

- README sections
- Guides and tutorials
- Help-center or knowledge-base articles
- Troubleshooting pages
- User-facing Markdown, MDX, RST, TXT, or HTML docs
- Prose API reference pages

Do not use this skill for:

- Source code or inline code comments
- Commit messages
- PR or MR descriptions
- Machine-readable API schemas such as OpenAPI JSON/YAML
- JSON, YAML, TOML, lockfiles, generated config, or binary files
- Legal text, marketing copy, or internal planning docs unless the user explicitly asks for documentation-style review

If the request could mean code review or documentation review, ask one short clarifying question before proceeding.

## Core Rules

- Do not edit until the user approves specific suggestions.
- Do not manufacture problems to fill the suggestion list.
- Prefer local repository evidence over general assumptions.
- Preserve product terminology and existing documentation conventions.
- Treat docs syntax as part of the source. Do not break frontmatter, components, links, anchors, tables, code fences, or placeholders.
- If a suggestion changes technical meaning, command behavior, product claims, or link destinations, require explicit approval for that specific change.

## Step 1: Resolve The Target

Determine which file or files to analyze, in this order:

1. Explicit path from the user: use it.
2. Current file or article in context: use it if unambiguous.
3. Topic or title: search likely documentation files using available file/search tools such as `Glob` and `Grep`.
4. No target: ask the user for a file path or topic, then stop.

Only analyze prose document files: `.md`, `.mdx`, `.mdc`, `.rst`, `.txt`, `.html`, or `.htm`.

If multiple plausible matches exist, list the top 3-5 paths with one-line reasons and ask the user to choose. Do not guess when edits may later be applied.

If no match exists, say:

```text
I couldn't find a document matching '<topic>'. Please provide a file path or describe where the document lives.
```

## Step 2: Gather Context

Read the entire target file when practical.

Before scoring, look for local documentation conventions when practical:

- Nearby docs in the same section
- `README.md` files in docs directories
- `CONTRIBUTING.md`
- `STYLEGUIDE.md`, `DOCS_GUIDELINES.md`, or similar files
- Glossaries or terminology files

Use local conventions over generic writing preferences.

If the file has uncommitted changes or the user asks to review recent edits, consider the diff context and prioritize changed regions. Do not ignore obvious issues outside the diff if they materially affect the page.

## Step 3: Analyze

Think carefully before writing the review. Score the article from 0 to 100 using this rubric.

| Dimension | Weight | High Score | Mid Score | Low Score |
|---|---:|---|---|---|
| Readability | 25 | Natural flow, concise sentences, jargon defined, scannable layout | Some dense passages or unnecessary jargon | Walls of text, undefined acronyms, hard to scan |
| Completeness | 25 | Covers expected reader questions for the stated scope | Missing minor context, outputs, prerequisites, or next steps | Missing major steps, prerequisites, outcomes, or recovery guidance |
| Accuracy | 20 | Claims, commands, links, names, and examples are verified or internally consistent | Some unverifiable or possibly stale details | Clear contradictions, broken local links, wrong commands, or unsupported claims |
| Structure | 15 | Logical page type, heading hierarchy, sequence, and navigation | Minor ordering or hierarchy issues | Disorganized, misleading headings, or FAQ/list anti-patterns |
| Clarity | 15 | Unambiguous language, clear actors, clear outcomes | Some vague pronouns or buried leads | Contradictions, ambiguous instructions, unclear ownership |

Scoring calibration:

- A solid, useful article should usually score 78-88.
- Scores above 90 require near-perfect prose and no meaningful reader friction.
- Scores below 40 mean the article needs substantial restructuring or missing core content.
- Avoid suspiciously round scores unless they are genuinely justified.
- If the file is very short, note that the score has limited confidence.

### Accuracy Verification

For Accuracy findings:

- Prefer repository evidence over guesswork.
- Search for referenced commands, flags, product names, config keys, file paths, and local links when practical.
- For local links, verify that the target file or anchor exists when practical.
- For external links, only call a link broken if you actually checked it.
- If you cannot verify a claim, label it `unverifiable` instead of wrong.
- Do not claim a command, flag, or feature is outdated unless you found supporting evidence.
- If factual accuracy cannot be checked, say so in the review summary.

### Embedded Code And Examples

Code examples are part of documentation, but treat them carefully.

- Review surrounding explanation for clarity and completeness.
- Suggest code snippet changes only for correctness, copy-paste usability, missing context, or documented output.
- Do not rewrite code examples for style alone.
- Do not change commands, flags, config keys, API names, placeholders, or variables unless the issue is clearly Accuracy and evidence supports the change.

## Step 4: Produce Suggestions

Return up to 10 suggestions. Order them by severity: High first, then Medium, then Low. If there are more than 10 issues, pick the 10 most impactful.

Each suggestion must use this format:

```text
[N] CATEGORY - SEVERITY - CONFIDENCE
Location: <section heading or page region>, lines X-Y
Near: "exact quote from the target passage, 15 words or fewer"
Issue: one sentence describing what is wrong and why it matters.
Why it helps: one sentence describing the reader benefit.
Preview:
  BEFORE: exact sentence, fragment, or short passage to change
  AFTER:  proposed replacement
```

Categories:

- Readability
- Completeness
- Accuracy
- Structure
- Clarity
- Tone
- Links
- Media & Tables

Severity:

- High: blocks comprehension, causes errors, breaks trust, or omits a critical step.
- Medium: creates friction, confusion, or reader drop-off.
- Low: polish; the article works without it but improves with it.

Confidence:

- High: directly supported by the document or repository evidence.
- Medium: likely issue based on documentation best practices or local conventions.
- Low: subjective improvement or requires product-owner judgment.

Locator rules:

- Use real line numbers when the file reader provides them.
- Include the nearest section heading when available.
- `Near:` must be verbatim from the file unless the target is a file-level issue. For file-level issues, use `Near: (file-level)`.
- If the same quote appears more than once, the line range is mandatory.
- If you cannot produce a safe locator, include the finding in the review but mark it `not auto-applicable` in the Issue sentence.

Preview rules:

- BEFORE must match the current file text for auto-applicable edits.
- AFTER must preserve formatting, placeholders, and docs syntax.
- For large structural suggestions, provide a concise replacement outline and mark it `not auto-applicable` unless the exact edit is safe.
- Suggestions without BEFORE/AFTER previews are not actionable and should not be included as applyable suggestions.

## Step 5: Present The Review

Use this output format:

```text
========================================
DOCS IMPROVE - <filename>
Score: <N>/100
Confidence: <High|Medium|Low>
========================================

Verdict: <one sentence naming the biggest strength and biggest weakness.>

Verification: <what was checked, or what could not be verified.>

Suggestions
-----------

[1] Completeness - High - High confidence
Location: ## Prerequisites, lines 12-18
Near: "Before you start, create a token"
Issue: The prerequisites omit the required permission, so readers can create unusable tokens.
Why it helps: Readers can verify they have the right access before starting.
Preview:
  BEFORE: Before you start, create a token.
  AFTER:  Before you start, create a token with the `write:packages` permission.

[2] Readability - Medium - Medium confidence
...

Summary
-------
High: N | Medium: N | Low: N | Total: N
Highest-impact fix: [N] <short description>
Verification needed: N suggestions
========================================
```

After the review, ask:

```text
Apply suggestions? Reply with "apply 3", "apply 1,4,5", "apply all", or "skip".
```

If there are no High or Medium findings and the score is 88 or higher, do not invent Low suggestions. Output the score, verdict, verification note, and:

```text
No suggestions to apply. This article is in good shape.
```

## Step 6: Apply Approved Suggestions

Apply suggestions only after explicit user approval.

Accepted user commands:

- `apply N`
- `apply N,M,K`
- `apply all`
- `skip`

If multiple files were reviewed, require the file path in the apply command, such as `apply docs/foo.md 2` or `apply all in docs/foo.md`.

Before editing:

1. Re-read the file.
2. Confirm each approved suggestion still has matching target text.
3. Confirm the edit does not touch protected syntax unless explicitly approved.
4. If multiple approved edits are safe and line-number based, apply them from bottom to top to reduce line-shift risk.

Apply one suggestion at a time. After each application, confirm:

```text
Applied [N]: <one-line description>
```

If a suggestion cannot be applied safely, skip it and explain:

```text
Skipped [N]: <reason>
```

When done, print:

```text
Applied N/M suggestions.
```

Do not apply suggestions the user did not approve.

### Apply Safety Rules

Do not edit these unless the suggestion explicitly targets them and the user explicitly approved that specific change:

- YAML, TOML, or JSON frontmatter
- MDX, MDC, Vue, React, or shortcode components
- Code fences and command examples
- API names, config keys, environment variables, placeholders, or localization variables such as `{name}`, `%s`, `{{value}}`, or `$TOKEN`
- Generated sections marked `do not edit`, `auto-generated`, or similar
- Heading IDs, slugs, anchors, link reference definitions, or link destinations
- Tables where formatting could be broken by an imprecise replacement

Preserve:

- Heading hierarchy
- Markdown, MDX, MDC, RST, and HTML syntax
- Existing tone and product terminology unless the suggestion explicitly improves them
- Accessibility text, image alt text, captions, and table headers unless intentionally improving them
- Whitespace-sensitive formatting

If edit tooling is unavailable, provide a patch-style diff or exact replacement instructions instead of claiming changes were applied.

## Edge Cases

### Multiple Files

- Produce one full review per file.
- Do not mix suggestions across files.
- Include the filename in every review header.
- Ask for apply decisions per file.
- If more than 5 files are requested, ask whether the user wants a batch summary first.

Batch summary format:

```text
| File | Score | Verdict | Suggestions |
|---|---:|---|---:|
```

### Very Large Files

If the file is too large to review fully in one pass, say so. Review by major section and clearly state whether the score applies to the whole file or only reviewed sections.

### Very Short Files

For files under 100 words, note that the file may be too brief to fully evaluate and score with lower confidence.

### Non-English Files

Analyze in the article's language. Note the language in the header or verification line.

### Generated Or Binary Files

Refuse gracefully:

```text
This file doesn't look like prose documentation I can review.
```

### Ambiguous Or Unsafe Requests

Examples:

- `Review package.json`: refuse as machine-readable config.
- `Improve this function comment`: refuse unless it is end-user documentation.
- `Review OpenAPI YAML`: refuse as machine-readable schema; offer to review generated prose docs instead.
- `Apply all suggestions to every file`: ask for confirmation per file if the changes affect protected syntax or technical claims.

## Example Output

```text
========================================
DOCS IMPROVE - docs/receiving/asn-guide.md
Score: 64/100
Confidence: Medium
========================================

Verdict: The guide explains the core ASN workflow clearly, but it omits confirmation feedback readers need to verify success.

Verification: Checked local command references and internal links; external links were not checked.

Suggestions
-----------

[1] Accuracy - High - High confidence
Location: ## Import an ASN, lines 42-44
Near: "run php shell/asn.php --import <file>"
Issue: The documented flag conflicts with the current command reference, so readers may run a failing command.
Why it helps: Readers can copy and run the command successfully.
Preview:
  BEFORE: run php shell/asn.php --import <file>
  AFTER:  run php shell/asn.php --ingest <file>

[2] Completeness - High - Medium confidence
Location: ## Upload the file, lines 29-31
Near: "the system will process the file"
Issue: The guide does not tell readers what success confirmation to expect.
Why it helps: Readers can verify the upload succeeded before moving on.
Preview:
  BEFORE: After uploading, the system will process the file.
  AFTER:  After uploading, the system will process the file. You should see an "ASN Queued" status before continuing.

Summary
-------
High: 2 | Medium: 0 | Low: 0 | Total: 2
Highest-impact fix: [1] Update the import command flag.
Verification needed: 1 suggestion
========================================

Apply suggestions? Reply with "apply 3", "apply 1,4,5", "apply all", or "skip".
```
