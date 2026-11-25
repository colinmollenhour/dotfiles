---
name: docs-improve
user-invocable: false
description: Review docs, score issues, preview edits. Use for READMEs, guides, help docs, Markdown/MDX/RST/HTML.
---

# Documentation review

Identify the article from the request, current file, or topic. Ask for a path if the target is ambiguous. Review prose in its own language and follow the project's terminology and documentation conventions.

## Score and evidence

Score each file out of 100. Allocate 25 points each to readability and completeness, 20 to accuracy, and 15 each to structure and clarity. State which sections you reviewed if coverage is partial. Give the score, confidence, a one-sentence verdict, and what you verified.

Check commands, paths, API names, defaults, and links against the project or the source they refer to. Mark unresolved claims as unverified. For generated content, locate the editable source.

## Suggestions

List up to ten findings per file, highest severity first. High means a reader is blocked or likely to make an error. Medium means avoidable friction. Low means polish. Stop when you run out of meaningful findings.

For each finding give its number, category, severity, confidence, heading and line location, the exact passage, and a proposed replacement. Explain the reader impact. If the edit is structural or its location is ambiguous, provide an outline and mark it for manual review. Summarize the counts and highest-impact change.

## Applying a review

Offer the numbered choices `apply 3`, `apply 1,4,5`, `apply all`, or `skip`. Identify the file for multi-file reviews. Apply only the user's selections.

Re-read the target before editing. Skip stale or ambiguous matches and explain why. Preserve frontmatter, code, anchors, component syntax, placeholders, and generated sections unless the approved edit specifically addresses them. Report applied and skipped numbers. If editing is unavailable, supply exact replacements.
