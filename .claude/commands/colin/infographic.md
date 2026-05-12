---
description: Distill the current task, merge request, pull request, ticket, RFC, or recent change set into a single self-contained image-generation PROMPT for a visual infographic that conveys "what changed and why" to non-implementers. Use when the user asks to make/write/draft/design an infographic for an MR, PR, feature, change, ticket, or task — or to attach a visual to a review. The skill emits only the prompt; image generation is left to a downstream tool (Nano Banana, Midjourney, DALL·E, NotebookLM infographic, gpt-image-1, etc.). Default output is `.tmp/PROMPT_Infographic-<slug>.md`.
---

# Infographic Prompt Generator

Produce a single self-contained image-generation prompt that takes a complex change (MR, PR, ticket, feature, RFC, recent work) and turns it into one infographic that conveys the WHY, BEFORE → AFTER, and OPERATIONAL IMPACT to people who will not read code.

You are not generating the image. You are generating the prompt that another tool/agent will use to generate the image. The downstream agent will not have access to this conversation, the repo, or the ticket — every concrete fact it needs must be inlined into the prompt.

### User special requests
--------------------------------------------------
$ARGUMENTS
--------------------------------------------------

## When to use

Trigger on phrases like:

- "Make / draft / write / design an infographic for [this MR / PR / branch / ticket / change]"
- "Visual / one-pager / explainer / TL;DR graphic for the change"
- "Create a graphic to attach to the merge request"
- "Distill this work into an infographic"
- Explicit: `/colin:infographic` (if registered as a slash command), or any user mention of "the infographic skill"

Do NOT trigger when the user asks for the actual image (defer to image-generation tools or skills like `nano-banana`).

## Outputs

Default: `.tmp/PROMPT_Infographic-<slug>.md` inside the project root. Create `.tmp/` if missing.

Override via the user's request:

- "save it to <path>" → use that path verbatim
- "stdout" / "print it" → emit to chat instead of file
- "no slug" → use `.tmp/PROMPT_Infographic.md`

The slug is lowercase, kebab-case, ≤ 40 chars, derived from (in priority order):

1. Ticket / issue ID present in scope (e.g. `dev-2981`, `wl-005`).
2. MR/PR title's main noun phrase (e.g. `per-tenant-kafka-topics`).
3. Branch name with `wip/`, `feat/`, `fix/` prefix stripped.
4. Topic phrase the user typed in the request.

If multiple candidates exist, prefer the most operator-meaningful one (ticket > feature noun > branch).

## Step 1 — Resolve scope

Determine what the infographic is about. Honor the user's explicit hint first; otherwise infer.

| User said | Scope |
|---|---|
| "for this MR / PR / merge request / pull request" or any URL | Open MR/PR for the current branch (or the URL). Use `gh-cli` / `glab-cli` skill for fetch. |
| "for this branch" / "what I just did" / nothing | Current branch vs its base; pull commit log + MR/PR if open; pull recent ledger files if any (`.tmp/uber-code-*/`, `PLANS-*`, `SPECS-*`). |
| "for ticket DEV-NNNN" / "JIRA NNN" / "WL-NNN" / "issue NN" | Fetch the ticket body (gh / glab / jira / clickup as available); the diff is secondary unless requested. |
| "for the feature in <dir>" | Diff scoped to that path; use `git log -- <dir>` to bound the topic. |
| "for SPECS-foo.md" / "for PLANS-foo.md" / a single spec or plan | Read the file; it is the source of truth. |
| "for the RFC at URL" | Fetch the URL via `WebFetch`. |

If nothing in context tells you which change to summarize, ask one focused question and stop. Do not guess the topic.

## Step 2 — Gather only the operational story

The infographic is about **business logic and operational impact**. By default, EXCLUDE everything below from the prompt unless the user explicitly says "include technical details":

- File paths, line numbers, function names, class names
- Commit SHAs, branch names, MR/PR numbers (the MR/PR ID may appear once as a stamp; that is fine)
- Test names, framework names, lint/format outputs, coverage percentages (one summary number is OK)
- Implementation language, library versions, ORM choices
- Internal abbreviations only the team uses, unless they appear verbatim in the source materials

INCLUDE:

- The pain it relieves (the BEFORE state, in operator/user terms)
- The new behavior (the AFTER state, in operator/user terms)
- The transformation arrows that flip between them
- Any "interesting decisions" — non-obvious choices and the reasoning, especially trade-offs
- Operational impact (capacity, isolation, blast radius, recovery time, data safety, cost, UX) with concrete numbers when known
- Failure modes the change protects against (chaos scenarios, error budgets, edge cases)
- Roll-out / migration story if the change is breaking
- One terminal "result" or "shipped state" stat (e.g. "13/13 CI jobs green in 4 min")

If the source materials contain numbered decisions (D1, D2, ...), preserve those identifiers. They are anchors reviewers may want.

If the source materials contain named scenarios (K-04, S-12, ...), preserve those identifiers and pair them with one-sentence descriptions.

## Step 3 — Decide visual structure

Pick one structure based on the change's shape:

| Shape of the change | Suggested layout |
|---|---|
| Replaces a thing with another thing | BEFORE / AFTER side-by-side with arrows in between |
| Adds a missing capability | One large block "what was impossible" → "what is now possible" |
| Refactor / rename with no user-visible behavior change | Grid of "old name → new name" + a "why this rename matters" panel |
| Bug fix / security fix | "Failure scenario" panel → "Mitigation" panel → "Detection" panel |
| Performance / cost win | Left: "old characteristic + number" → Right: "new characteristic + number" + the lever pulled |
| Spec or RFC | Three vertical panels: "Problem", "Proposal", "Trade-offs" |
| Process / workflow | Left-to-right pipeline diagram with annotated stages |
| Multi-decision design (5+ Ds) | A central concept with a ring of decision badges; each badge has the decision id + 1-line rationale |

If the user gave a hint about layout, honor it.

Always keep:

- One clear focal point (usually the AFTER state, or the central concept).
- Pre-resolved text — never `<insert here>` placeholders.
- A constraints block telling the image agent what NOT to draw.

## Step 4 — Write the prompt file

Write the prompt using the template below. Fill EVERY brace `{...}`. Do not leave any token unresolved. Resolve numbers concretely (don't say "improved performance" — say "median p99 dropped from 850 ms to 90 ms" if you have it; if you don't have it, drop the claim).

### Prompt template (the file the skill emits)

```markdown
# Infographic prompt — {short title}

> Auto-generated by the `colin:infographic` skill. The downstream image-generation agent has no context other than this file. Every fact it needs is inlined here. Do NOT modify before generating; instead regenerate the file from updated context.

## Subject

{One paragraph. What this infographic is about, in plain language. End with the canonical identifier — e.g. "MR !7", "PR #1234", "ticket DEV-2981", or "WL-005" — so reviewers can map back.}

## Audience

{One sentence: who will look at the resulting image. Default: "Merge-request reviewers and stakeholders who will not read the code." Adjust if the user specified.}

## Goal in one sentence

{One sentence describing what the viewer should walk away knowing. Use plain operator/business language.}

## Visual style

- Orientation: {landscape | portrait | square — default landscape unless the user said otherwise}
- Style: {professional editorial | sketch-note | bento grid | scientific | retro print | kawaii — default "professional editorial" unless stated}
- Color discipline: {one or two strong accent colors; rest neutral. Specify the accent if the project has brand colors; otherwise say "neutral with one accent color the image generator chooses, but apply it consistently"}
- Typography: clean sans-serif, dense but legible.
- Density: pack content; this is a one-pager, not a billboard.
- Mode: {single image | print-friendly | dark-mode-aware — default single image, light background}

## Layout

{Describe the chosen structure from the table above. Be concrete. Examples:

- "Two vertical halves separated by a thick arrow band running left → right. Left half labeled BEFORE; right half labeled AFTER."
- "Central hexagon labeled '<concept>' with a ring of N decision badges around it; arrows show dependencies."
- "Left-to-right pipeline of K stages; each stage is a labeled box with one icon and one stat."
}

## Sections (must appear, in this order)

### 1. {Section name — e.g. "BEFORE: the legacy state"}

Bullets:

- {bullet 1, 6-12 words}
- {bullet 2}
- {bullet 3 — keep to 3-6 bullets per section}

Visual hint: {what the panel should look like — e.g. "muted gray, single shared topic icon with a crowd of small tenant glyphs piled on it"}

### 2. {Section name — e.g. "AFTER: the new state"}

Bullets:

- ...

Visual hint: ...

### 3. {Section name — e.g. "TRANSFORMATION"}

Bullets describing what flips, in arrow form:

- "{old} → {new}"
- "{old} → {new}"

Visual hint: ...

### 4. {Decisions — only if 2+ non-obvious choices were made}

Each as a small badge:

- **{D-id or name}**: {one-line rationale}
- **{D-id or name}**: {one-line rationale}

Visual hint: badges arranged as a ring or a row.

### 5. {Operational impact / result}

- {one concrete stat or outcome}
- {one concrete stat or outcome}

Visual hint: ...

## Hard constraints (the image MUST honor)

- DO NOT include file paths, function names, line numbers, or commit SHAs.
- DO NOT include test names, framework names, or coverage percentages (one summary stat is OK if listed in §5).
- DO NOT include the literal word "git", "PR", or any tooling chrome unless it is part of the canonical identifier above.
- DO NOT invent decisions, numbers, or scenarios that are not listed in this prompt.
- DO NOT use placeholder text like "lorem ipsum" or "TBD" — every cell of the visual must contain real content drawn from this prompt.
- DO NOT exceed {N — default 1 for landscape, 2 for portrait} pages/canvases. Single image only.

## Hard musts (the image MUST contain)

- The canonical identifier "{e.g. MR !7 / DEV-2981}" stamped once, small, in a corner.
- Every section listed above, in order, with the headings (or stylized equivalents) visible.
- Every {D-id} (if present) → reviewers may need to map to the source decision document.
- A clear directional cue (arrow, sequence, or focus) so the viewer's eye moves from BEFORE → AFTER (or whatever the chosen layout dictates).

## Notes for the image-generation agent

- This prompt is exhaustive. Do not request additional context.
- If a fact in this prompt seems wrong, render it anyway — the prompt is the contract.
- If your output format requires a single rendered image, render exactly one. If your tool supports multi-panel composition, keep all panels in one canvas.
- Filename suggestion for the output: `Infographic-{slug}.png`.
```

## Step 5 — Quality bar

Before saving the file, run this self-check:

1. **Self-containedness.** A reader who has never seen this repo, ticket, or conversation could read the prompt and produce the right infographic. No `<insert>`, no "see the plan", no relative references.
2. **No leakage.** Grep your own output for: file extensions like `.py`, `.ts`, `.go`; SHA-like 7-40-char hex strings; the word `commit`; the word `branch` (other than in the canonical identifier); `def `, `class `, `import `, `function`. If any of those appear in the prompt body (not in this skill's own instructions), revise.
3. **Concrete numbers.** Either you have the number and you state it, or you remove the claim. No fuzzy "fast", "many", "fewer".
4. **Decision IDs preserved.** If the source materials say "D2 forced from `target_id` to `target_name`", the prompt must say "D2" and a one-line rationale that operator-stakeholders can read.
5. **Single canonical identifier.** The MR/PR/ticket id appears exactly once, as a stamp. Not in every section.
6. **Layout fits the change.** If the change is a rename, do not use BEFORE/AFTER halves; use a grid. Match the structure to the shape of the work.

If any check fails, fix the prompt before writing.

## Step 6 — Save and report

Write the file to `.tmp/PROMPT_Infographic-<slug>.md` (or whatever path the user specified). Make sure the directory exists.

Report to the user, in chat, in 4 lines or less:

```
✓ Wrote .tmp/PROMPT_Infographic-<slug>.md (<size> bytes, <N> sections)
Layout: <chosen layout>
Slug derived from: <source>
Pipe to your image tool, e.g.:
  - nano-banana skill
  - notebooklm generate infographic --json (paste the prompt as instructions)
  - gpt-image-2 via codex CLI
```

Do not paste the prompt into chat. The artifact is the file.

## Examples — bad vs good

### Bad (the user's example, distilled)

> Create a detailed, step-by-step infographic explaining the business logic and operational impact of the DEV-2981 Historical LCM update. Focus entirely on the system's operational concepts, bypassing all file paths, commit details, and test suites.

Problems: no BEFORE, no AFTER, no decisions, no numbers, no layout, no audience, no constraints block. The downstream agent will produce something generic that has nothing specific to DEV-2981.

### Good (after applying this skill)

The Good version is the entire filled-in template above, with every brace resolved against the source materials. It is long. That is the point — the downstream agent has zero context, so the prompt carries everything.

## Anti-patterns

- ❌ Embedding raw diff hunks. Diffs belong in the MR; the infographic is for non-implementers.
- ❌ Quoting the spec verbatim. Distill it; do not paste it.
- ❌ Listing every test that was added. The number of tests is a stat for §5, not a section.
- ❌ Using emoji as the primary signal — emoji are okay as accents, never as the only differentiator.
- ❌ Asking the user for image style preference when the project already has obvious branding (e.g. ShipStream's existing color palette). Infer first; ask only if there is no signal.
- ❌ Producing a prompt longer than ~500 lines. If you exceed that, you are quoting source material — distill harder.

## Edge cases

- **Mixed change (feature + refactor).** Pick the dominant shape and list the secondary as a side panel.
- **No public ticket/MR.** Use the branch name as the canonical identifier and note "internal change" in §Audience.
- **The user says "make it technical".** Override Step 2's exclusion list, but still keep file paths to a maximum of 5 (the most architecturally significant ones), and keep the prompt within the section structure.
- **The user gave only a one-line topic with no context to gather.** Generate a prompt with `[NEEDS DATA]` markers exactly where facts are missing, and STOP rather than fabricate. Tell the user which facts are missing.
- **Multiple iterations.** If the user asks for a revision, read the existing file and edit only the affected sections — preserve the slug.

## Suggested followups (offer once after the file is written)

- "Would you like me to also generate the actual image via the `nano-banana` skill / NotebookLM infographic / external tool?"
- "Want me to embed the resulting image in the MR description with a link below it to the source artifact?" (only relevant if an MR exists)
