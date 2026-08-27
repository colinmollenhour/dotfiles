# Onboarding Audit: <Product> — "<goal task>"

## Summary

<3–6 sentences: what the product assumes you already know, where the journey broke, and the single biggest root cause. End with the key judgment: does the flow work once you know the shape (discoverability gap) or is it actually broken?>

## Scorecard

| Metric | Result |
|---|---|
| Reached the goal ("aha") | yes / no — <what was achieved> |
| Time to first success | <duration, or "never"> |
| Dead ends hit | <n> |
| Distinct errors encountered | <n> |
| Deepest escalation needed | retry / in-product / docs / web search / source code / gave up |
| Signup email latency & placement | <e.g. 40s, inbox> |

## The mental model the product never taught

<One paragraph, written as the explainer the user should have been shown on screen one. E.g. "A community lives on a relay; your identity is a keypair that works on any relay; you can join with an invite, use a hosted relay, or run your own." This paragraph doubles as proposed onboarding copy.>

## What happened (fresh user, <persona/OS>)

<Chronological narrative, one subsection per surface attempted, in the order a real user would hit them.>

**<Surface, e.g. Desktop app vX.Y.Z>:** <what you tried, what happened, where it dead-ended. Note if current main/latest already changed this, and whether the underlying gap still applies.>

**<CLI>:** <…>

**<Docs>:** <what exists, who it's written for, what's missing for this journey.>

## Friction points

<One entry per root-cause issue, most severe first.>

### <n>. <Short issue title> — **<Blocker | Dead end | Postflight error | Missing mental model | Papercut>**

- **Where:** <surface, screen/command, URL>
- **Evidence:** <verbatim error string / screenshot file / email — e.g. `invalid_name` after submit; `shot-04.png`>
- **Expected:** <what a new user would predict>
- **Actual:** <what happened>
- **Fix:** <concrete and preflight-shaped: show the rule/prerequisite/limit before the attempt, add the missing step to the flow, deep-link to a task page, etc.>

## Proposals

<Prioritized, numbered. Merge per-issue fixes into coherent changes — e.g. "two-path chooser with prerequisites stated up front", "info affordance explaining the core concept", "preflight validation in the create form", "actionable hint on connection failure". Each proposal should say what the user sees, not just what to remove.>

## Environment

- <App/CLI versions tested; latest available at time of writing if different>
- <OS / arch; browser if relevant>
- <Email account used; relevant env/config defaults, e.g. `TOOL_URL=http://localhost:3000` on a machine with nothing listening>
- <Final state: e.g. account created at <address>, community `<name>` live>

## Appendix

- Friction log: `friction-log.md` (chronological, timestamped)
- Evidence: `<dir>/` — <index of screenshots and email dumps with one-line captions>
