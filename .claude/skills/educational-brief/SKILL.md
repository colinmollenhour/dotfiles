---
name: educational-brief
description: Create a grounded educational brief for delivered PRs, MRs, branches, features, or agent runs. Use when packaging a journey, design decisions, architecture, diagrams, and lessons into a dense reviewer-facing or future-agent-facing brief.
---

# Educational Brief

Produce a grounded educational brief for a delivered change or agent run. The brief explains the journey from request to delivery, the design decisions made and why, the architecture of the delivered output, and lessons that future humans or agents can reuse.

This is not marketing copy, a generic summary, or an infographic prompt. It is a compact teaching artifact for reviewers and future agents.

## Inputs

The orchestrating agent should provide the output path, scope, review URL if one exists, base branch, head branch, and available evidence. Useful sources include:

- PR/MR URL and number/IID, if one exists
- Base branch and head branch
- Original request, issue, ticket, plan, or spec
- Planning, critique, and decision artifacts
- Work-package or implementation notes
- Agent final reports or handoff notes
- Integration checks and review findings
- Fix reports, if any exist
- Local gate output and delivery notes
- `git diff --stat <base>...HEAD`
- Relevant changed-file diffs or file excerpts needed to explain the final architecture

Use only grounded artifacts, diffs, changed files, command outcomes, and review metadata. Do not infer product intent, architecture, performance characteristics, or operational behavior that the evidence does not support.

## Output

Write the brief to the path requested by the orchestrating agent. If no output path is provided and the caller is using a run directory, prefer:

```text
final/educational-material.md
```

For a fully qualified run directory, write under that directory, for example:

```text
.tmp/<run-slug>/final/educational-material.md
```

Length should match the value of the material: short for simple changes, longer for complex architecture or decision history. Prefer dense bullets, compact tables, and diagrams over long prose.

## Required Structure

```markdown
## Journey

How the request moved through planning, decisions, implementation, review, fixes, gates, and delivery. Include only meaningful turns in the journey.

## Design Decisions

Bullets or a compact table with: decision, why it was made, important alternative rejected, and source artifact or changed file.

## Architecture

Overall structure of the delivered code or configuration. Include Mermaid diagrams when they clarify module relationships, request/data flow, state transitions, or deployment/runtime structure. Skip diagrams when they would be ornamental.

## Lessons

Actionable lessons future humans or agents could reuse. Call out improvements that may belong in agent memory files, skills, repo conventions, planning templates, review prompts, or local gates.

## Evidence

Claim-to-source map for the most important claims, using artifact paths, changed files, commands, or review references.
```

## Guidance

- Preserve grounding over completeness.
- Include file paths and artifact paths where they make the material more useful.
- Keep the journey focused on decisions and pivots, not every command that ran.
- Explain design decisions in terms of constraints, tradeoffs, and rejected alternatives.
- Use Mermaid only when it clarifies actual structure or flow.
- Do not duplicate the review summary or test plan unless needed to explain the journey.
- Do not include secrets, credential values, raw logs, or noisy full diffs.
- If evidence is missing for an expected section, say what is missing briefly instead of guessing.

## Mermaid Rules

Use diagrams sparingly. Good diagram candidates include:

- Module ownership or dependency boundaries
- Request/data flow through changed components
- State transitions introduced or modified by the change
- Deployment or runtime relationships affected by the change

Avoid diagrams for:

- One-file or trivial changes
- Cosmetic summaries already clear from bullets
- Structures not visible in the diff or artifacts

## Validation Handoff

The orchestrating agent, not this synthesis pass, owns final grounding validation before posting or publishing. Make that validation easy by ensuring the `Evidence` section maps claims to sources.

The orchestrator should write a validation note that lists checked claim groups, corrections made, and residual uncertainty before the brief is appended to a PR/MR, issue, release note, or final delivery artifact.
