---
name: docs-writer
description: Use whenever writing or editing user-facing technical documentation, including READMEs, tutorials, how-to guides, API references, conceptual explanations, release notes, changelogs, troubleshooting pages, error messages, and any prose that helps users accomplish something with a technical product. Triggers on requests like "write docs", "document this", "improve the docs", "write a README", "write a tutorial", "write a guide", "API reference", "release notes", or "troubleshooting". Do not use for marketing copy, internal design docs, or academic writing.
---

# Docs writer

Use this skill to write, review, or restructure developer documentation that ships. It synthesizes Diataxis, Google's developer documentation style guide, Microsoft's writing style guide, The Good Docs Project, and Write the Docs.

Good docs come from four choices:

1. Pick the right page type.
2. Use the right skeleton.
3. Write clean, skimmable prose.
4. Verify examples, links, and workflow before shipping.

Ask one short question when the page type, audience, or scope is unclear. Do not guess your way into a hybrid page.

## Rule zero: pick one page type

Every page is exactly one of four types. If a draft tries to answer two reader questions, split it.

| Type | Purpose | Reader question | Voice |
| --- | --- | --- | --- |
| Tutorial | Learning by doing | "Teach me from scratch" | First-person plural: "Let's..." |
| How-to guide | Solving a real problem | "How do I do X?" | Imperative: "Run..." |
| Reference | Finding exact facts | "What does X accept or return?" | Austere, neutral, complete |
| Explanation | Understanding why | "Why does this work this way?" | Discursive; opinions allowed |

### Tutorial

Use a tutorial when the reader is learning by doing. Success means the reader built something and can build more.

- Lead by the hand with one tested path.
- Use "we" and "let's" where it helps the lesson feel guided.
- Avoid alternatives, optional branches, and conceptual detours.
- Use real commands, real file names, real output, and a clean environment.
- State prerequisites before the first step.
- End with proof of what the reader built and two or three next links.
- If a step needs improvisation, the tutorial is broken.

Tutorial shape:

1. What you'll build.
2. What you need.
3. Setup and verification.
4. Numbered steps, each with intent, command or code, and visible result.
5. What you built.
6. Where to go next.

### How-to guide

Use a how-to guide when the reader has a specific task. Success means the problem is solved.

- Title starts with "How to" and names a real task.
- Assume competence; do not teach basics or explain theory.
- Allow branch points when real environments vary.
- Use numbered steps for ordered work.
- Link to explanation or reference pages instead of embedding them.
- Stop when the task is complete. Do not add a recap.

### Reference

Use reference when the reader needs exact behavior. Success means they found the fact.

- Describe the system and nothing else.
- Mirror the structure of the code, API, CLI, schema, or configuration.
- Prefer generated reference when a source of truth exists.
- Use tables for parameters, fields, return values, flags, errors, env vars, and exit codes.
- Avoid motivation, narrative, opinions, jokes, and tutorial steps.
- Keep one canonical home per fact. Link instead of duplicating.

For each endpoint, function, type, command, or option, document:

- Name and signature.
- One-sentence purpose in present tense.
- Parameters or fields: name, type, required, default, and description.
- Return value or response shape.
- Errors: code, condition, and fix.
- Example request and response when useful.
- Permissions, rate limits, idempotency, and side effects when relevant.
- Version added and version deprecated when applicable.

### Explanation

Use explanation when the reader wants understanding. Success means the design makes sense.

- Discuss why, history, alternatives, tradeoffs, constraints, and consequences.
- State a viewpoint when the project has one.
- Never instruct the reader to perform a task.
- Do not include reference tables or command sequences.
- Link to how-to and reference pages instead of reproducing them.

## Start from a skeleton

Use a known documentation skeleton instead of a blank page.

- README: install, quickstart, usage, configuration, links, status, contributing, license.
- Tutorial: what you'll build, prerequisites, setup, steps, result, next links.
- How-to: goal, prerequisites, steps, verification, cleanup or rollback when relevant.
- Reference: generated or structured facts, tables, examples, error behavior.
- Troubleshooting: symptom, cause, fix.
- Release notes: user-visible changes grouped by category.

## README formula

A README is the front door to the project. Optimize for title, one-line description, install, and quickstart.

Opening sentence:

> With PROJECT_NAME you can VERB NOUN. Unlike ALTERNATIVE, PROJECT_NAME DIFFERENTIATOR.

Use the differentiator only when it is concrete. If you cannot name one, omit that clause.

Recommended order:

1. Install.
2. Quickstart.
3. Usage.
4. Configuration.
5. Links to full docs, contributing, license, and support.
6. Status: supported versions, maintenance state, build status when relevant.

Rules:

- The first sentence must work as the repository description.
- The quickstart must be the smallest runnable example.
- Code blocks must run as-is in a clean environment.
- Save architecture, philosophy, and history for explanation pages.

## Voice and prose defaults

Use these defaults unless the local style guide says otherwise.

- Write in second person: "You configure the token", not "The user configures the token".
- Use active voice and present tense.
- Use contractions when they sound natural.
- Use sentence case for headings and UI titles.
- Use the serial comma.
- Use one space after periods.
- Use descriptive headings that work out of context.
- Lead with the answer, then add details.
- Put one idea in each sentence and one topic in each paragraph.
- Use short paragraphs. If a paragraph runs more than five lines, split it.
- Use tables for comparisons and structured facts.
- Use lists for three or more parallel items. Put two items in prose.
- Avoid jokes, idioms, cultural references, and cute headings.

## Procedures

- Use numbered lists for ordered steps and bullets for unordered sets.
- Start procedure steps with an imperative verb.
- Put conditions before instructions: "If you use macOS, run `brew install X`."
- Use one action per step.
- Start optional steps with `Optional:`.
- Tell the reader what they should see after actions where verification matters.
- Show command output when output matters.
- Use substeps only when necessary: lowercase letters, then lowercase Roman numerals.
- Keep code samples minimal, runnable, and copy-pasteable.
- Avoid ellipses and pseudocode unless the block is explicitly labeled as pseudocode.

## Formatting code, UI, and placeholders

- Use backticks for commands, file paths, env vars, flags, code identifiers, and strings the reader types.
- Give every code block a language hint.
- Use **bold** for UI elements, menu items, buttons, and labels.
- Use `ALL_CAPS_WITH_UNDERSCORES` for placeholders.
- Use angle brackets only when they make a placeholder clearer, such as `<YOUR_API_KEY>`.
- Link to the most specific stable anchor available.
- Use descriptive link text. Never use "click here", "here", "this link", or "read more".
- Do not hide critical information behind a link.

## Word list

Search for these terms before shipping.

| Avoid | Use |
| --- | --- |
| click here, here, this link | Descriptive link text |
| blacklist, whitelist | denylist, allowlist |
| master, slave | primary, replica; leader, follower; main, secondary |
| sanity check | quick check, confirmation |
| dummy value | placeholder, sample value |
| kill the process | stop the process |
| hit the endpoint | call the endpoint, send a request |
| enable you to | lets you |
| allows you to | lets you |
| in order to | to |
| utilize | use |
| leverage | use |
| facilitate | help, ease |
| via | with, through, by |
| e.g., i.e. | for example, that is |
| etc., and so on | finish the list or give examples |
| simply, just, easy, obvious, of course | delete or state the real requirement |
| currently | delete or replace with a version/date |
| please | delete in instructions |
| we recommend | use the imperative when the action is the recommendation |
| should | use "must" for requirements or rephrase |
| would, could, might | use a direct verb when the behavior is known |

## Bias-free and global writing

- Use singular "they".
- Avoid gendered terms such as "guys", "manpower", and "man-hours".
- Avoid disability as metaphor, including "blind to", "tone-deaf", "crippled", and "lame".
- Prefer neutral, precise technical language over violent metaphors.
- Do not use "pets vs. cattle"; describe lifecycle behavior directly.
- Spell out acronyms on first use per page.
- Use unambiguous dates: `YYYY-MM-DD` or `May 4, 2026`.
- Include time zones for times.
- Pick one term per concept and use it consistently.
- Avoid idioms such as "out of the box", "low-hanging fruit", "ballpark", and "moving the needle".
- Avoid modifier stacks. Rewrite "extremely well thought-out Windows migration project plan" as "a thoroughly planned migration to Windows".

## Error messages

Error messages are docs at the moment of need.

- Say what failed, why it failed, and how to fix it.
- Use "problem" in user-facing prose more often than "error" or "issue".
- Say "sorry" only for serious failures such as data loss, a security problem, or required support contact.
- Lead with what to do. Put raw codes, stack traces, and low-level details under a details affordance.
- Do not blame the reader.
- Write one message per problem.

Good shape:

```text
Cannot read config.yml: file not found.

Fix: create the file at ./config.yml, or pass --config <PATH> to use another location.
```

Bad shape:

```text
ERROR: Something went wrong.
Traceback (most recent call last): ...
```

## Troubleshooting

Troubleshooting pages are for search-driven readers under pressure.

- Title each entry by the symptom the reader sees, preferably the exact message.
- Use one symptom per entry.
- Structure entries as symptom, cause, and fix.
- Use numbered steps for fixes.
- If the cause is unknown but a workaround exists, label it `Workaround:`.
- If a bug is fixed in a known version, say `Fixed in vX.Y.Z` and remove stale entries later.

## Release notes and changelogs

- Write one entry per user-visible change.
- Group entries as Added, Changed, Deprecated, Removed, Fixed, and Security.
- Phrase entries as user impact, not engineering activity.
- Include the version, release date in `YYYY-MM-DD`, and a one-line headline.
- Link to the relevant doc page when behavior changes.
- Put breaking changes in their own callout with a migration guide link.
- Do not include internal refactors unless users observe the effect.

## Docs-as-code workflow

- Store docs next to the code they describe when possible.
- Use plain-text source: Markdown, MDX, reStructuredText, AsciiDoc, or the repo's existing format.
- Edit docs in the same pull request as the code change.
- Review docs with the same seriousness as code.
- Lint docs in CI with Vale or an equivalent prose linter.
- Run link checks and spell checks in CI.
- Test tutorials, quickstarts, and important snippets in CI when feasible.
- Generate reference docs from OpenAPI, GraphQL SDL, JSON Schema, type signatures, typedoc, sphinx-autoapi, godoc, rustdoc, or similar sources when available.
- Treat broken examples as bugs.
- Treat release notes as product documentation, not commit summaries.
- Use ARID: accept useful repetition in documentation. Repeat critical setup where it saves the reader; link deeper theory and canonical facts.

## Architecture principles

Apply these across a doc set, not only within one page.

- Precursory: start docs before the feature ships.
- Nearby: keep source docs close to the code.
- Current: remove or version stale content.
- Skimmable: headings and tables of contents must help readers find answers fast.
- Discoverable: use the words readers search for.
- Addressable: give sections stable anchors and deep links.
- Cumulative: introduce prerequisites before relying on them.
- Complete: state scope and cover the full surface a real user touches.
- Consistent: use the same terms, templates, and heading patterns across pages.
- Participatory: make the source of truth reachable so readers can suggest fixes.

## Anti-patterns

- FAQ pages. Move each question to a how-to, reference, or explanation page.
- Hybrid pages that mix tutorial, how-to, reference, and explanation.
- Tutorials with branches or optional paths.
- Reference pages with motivation or theory.
- Explanation pages with commands.
- Generic headings like "Overview", "Introduction", or "Getting started" without a specific object.
- Walls of prose without headings, lists, tables, or examples.
- "Coming soon", "TODO", and stub pages.
- Screenshots of text.
- Stale "last updated" dates without review.
- Duplicate fact descriptions across pages.
- Out-of-date version numbers repeated in prose instead of a single source of truth.

## Final review checklist

Before declaring documentation done, verify every applicable item.

**Page type**

- [ ] Page is exactly one of tutorial, how-to, reference, or explanation.
- [ ] Title, tone, and structure match the page type.
- [ ] Hybrid content has been split or linked.

**Reader and structure**

- [ ] Audience and scope are clear.
- [ ] Headings are descriptive, sentence case, and unique.
- [ ] A scanning reader can find the answer from headings, tables, and links.
- [ ] Prerequisites appear before they are needed.
- [ ] The page has stable deep-link targets when the publishing system supports them.

**Prose**

- [ ] Second person, active voice, and present tense.
- [ ] Conditions come before instructions.
- [ ] Filler and banned terms are removed.
- [ ] Acronyms are expanded on first use.
- [ ] Terms are consistent across the page.
- [ ] Bias-free and global-English checks pass.

**Code, UI, and links**

- [ ] Inline code, UI labels, and placeholders are formatted correctly.
- [ ] Code blocks have language hints.
- [ ] Examples run as-is in a clean environment, or limitations are explicit.
- [ ] Expected output or verification is shown where it matters.
- [ ] Link text is descriptive and points to the most specific useful target.
- [ ] Link checker, spell checker, and prose linter pass when available.

**Workflow**

- [ ] Source lives in version control, near the code when possible.
- [ ] Docs changed with the code change.
- [ ] Public API changes include reference docs.
- [ ] Behavior changes include release notes.
- [ ] Generated reference docs are regenerated when source changes.

**Type-specific**

- [ ] Tutorial: clean-machine path tested, no branches, clear final payoff.
- [ ] How-to: title starts with "How to", solves a real problem, and avoids teaching concepts.
- [ ] Reference: every parameter, return, error, flag, env var, and side effect is documented.
- [ ] Explanation: no instructions, no command sequences, and clear discussion of why and tradeoffs.
