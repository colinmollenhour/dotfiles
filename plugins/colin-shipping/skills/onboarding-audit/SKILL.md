---
name: onboarding-audit
description: Act as a brand-new user of a product and audit its first-run onboarding end to end — sign up with a real email, drive the web app / desktop app / CLI, log every dead end, unexplained error, and undocumented prerequisite, then write a severity-ranked friction report with concrete fixes. Use when asked to "test onboarding", "sign up as a new user", "dogfood the first-run experience", "onboarding QA/audit", or to reproduce a new-user journey and report the friction.
---

# Onboarding Audit

Simulate a genuinely fresh user attempting a product's core first-run task, capture every point of friction as it happens, then synthesize an actionable report. The deliverable is the report — the run only exists to feed it.

## Operating principles

1. **Be a fresh user, not an engineer.** You only know what the product's public surfaces tell you: marketing site, docs, install output, `--help`, UI copy, emails. You do NOT pre-read source code, issue trackers, or internal specs.
2. **Every failure is data, not an obstacle.** Never silently route around a problem. Record it first, then get past it.
3. **Escalate like a human would, and log the rung that unblocked you.** Retry → in-product hints → official docs → web search → reading source code → giving up. If you had to read source to proceed, that is itself a top-severity finding ("model only recoverable from source").
4. **Postflight errors are the enemy.** Any requirement a user discovers *by failing* (name rules, ordering constraints, quotas, account prerequisites) is a finding, even if the error message is polite.
5. **Track the mental model.** Note each concept the product assumes you already hold (e.g. "a community *is* a relay") and where — if anywhere — it actually teaches it. The gap between assumed and taught is usually the root cause behind many surface symptoms.

## Phase 0 — Preflight

1. Pin down from the user (ask only if truly missing): the **product**, the **goal task** (the "aha" outcome, e.g. "create your own community and post in it"), the **persona** (OS, skill level — default: technical-but-new, current machine), and any **surfaces in scope** (web, desktop app, CLI, docs).
2. Verify capabilities before starting: a controllable browser (use the `agent-browser` skill) and a receivable email address. Use whatever email access the session provides (mail CLI/MCP tool, or webmail driven through the browser). If a base address is given, prefer plus-addressing (`user+audit-<product>@…`) so the account is identifiably disposable. If you cannot receive email, stop and say so — signup verification is usually the first friction point worth measuring.
3. Create an evidence directory: `.tmp/onboarding-audit-<product>-<date>/` for screenshots, email dumps, and the friction log.

## Phase 1 — Run the journey

Work the goal task chronologically, keeping a **friction log** (`friction-log.md` in the evidence dir). For every step record:

- **Intent** — what you were trying to accomplish.
- **Expectation** — what a reasonable new user would predict happens next.
- **Action** — exactly what you did (URL, button label, command with args).
- **Observation** — what actually happened. Quote error strings **verbatim** (including internal codes like `missing_mapping`), copy exact URLs, and screenshot every dead end, error state, and confusing screen.
- **Timestamp** — so time-to-first-success and stall durations can be computed later.

Email checks are first-class: for each product email record delivery latency, inbox-vs-spam placement, sender name/address, subject, whether links deep-link correctly (vs landing on marketing home), and whether the copy tells you what to do next.

Cover every in-scope surface even after one succeeds — e.g. if the web flow works, still try the CLI path a new user might reasonably attempt first. Also probe the obvious wrong turns a real user would take (clicking the most prominent button, guessing a command name like `<tool> create`).

## Phase 2 — Synthesize

1. Group log entries into **distinct issues** — one issue per root cause, not per symptom. Several errors often trace to one untaught concept.
2. Classify each issue:
   - **Blocker** — cannot proceed at all on that surface.
   - **Dead end** — flow terminates with no next step or return path (e.g. dumped on a marketing page).
   - **Postflight error** — requirement revealed only after failing (validation rules, quotas, ordering).
   - **Missing mental model** — concept assumed but never taught.
   - **Papercut** — friction that cost time but not progress.
3. Compute the scorecard: reached the aha moment (yes/no), time to first success, dead-end count, distinct-error count, deepest escalation rung needed, email latency.
4. For every issue draft a **concrete, preflight-shaped fix** — surface the rule before the attempt (inline validation, prerequisite checklist, upfront limits), never just "improve the error message". Two standing rules: onboarding links must deep-link to task-oriented setup pages, never the marketing home; and any unreachable-service error should say where the service is supposed to come from.

## Phase 3 — Report

Write the report using [templates/report-template.md](templates/report-template.md). Order: summary → scorecard → the mental model the product never taught (one paragraph a user could have been shown) → what happened per surface → severity-ranked friction points (each with verbatim evidence, expected vs actual, proposed fix) → prioritized proposals → environment → appendix linking the friction log and evidence files.

Report rules:
- Every claim traceable to a log entry, screenshot, or email in the evidence dir.
- Include exact versions (app, CLI, OS) and note if `main`/latest already differs from what you tested.
- End the summary with whether the flow works *once you know the shape* — distinguishing broken flows from undiscoverable ones is the report's most valuable judgment.
- Write in first person as the user who lived it; keep the tone constructive (the reader owns this onboarding and should finish wanting to fix it, not defend it).

Deliverables: the report at `.tmp/onboarding-audit-<product>-<date>/report.md` (also print it in your reply), plus the populated evidence directory.
