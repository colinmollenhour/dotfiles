---
name: animated-visualizations
description: Conceive and build thoughtful interactive animated visualizations using divergent concept design, deterministic timelines, and accessible web graphics. Use for animated diagrams, architecture or protocol simulations, data-flow explainers, lifecycle visualizations, SVG animations, or Cursor-style technical visuals in React, Vue, Svelte, or vanilla projects.
---

# Animated Visualizations

Conceive the right visual explanation before building a deterministic UI simulation. Adapt to the host project's stack and conventions; do not introduce a framework solely for a visualization.

## Workflow

1. Inspect the framework, styling system, animation packages, component conventions, target page, test commands, and nearby visualizations worth matching.
2. Establish the explanatory insight and system truth. Research or ask one focused question rather than inventing behavior.
3. Complete the concept-design process below. Do not choose geometry or implementation during divergence.
4. Model entities, invariants, events, named phases, failure branches, inputs, and the meaningful terminal state.
5. Choose the medium, author desktop and compact layouts, then implement deterministic state and motion.
6. Add controls, accessibility, reduced motion, viewport suspension, and deterministic frame selection.
7. Run project checks and inspect the result in a real browser across phases, interactions, and viewport sizes.

## Concept Design

Start with the insight, not the subject:

> After interacting with this visualization, the viewer understands that ___ because ___.

Identify what is invisible, surprising, or counterintuitive in the real system. Decide what changes over time, what must remain stable for orientation, what the eye should follow, and which visual evidence proves the claim.

Generate four substantially different concepts before selecting one. They must use different visual grammars, not cosmetic variations of boxes and arrows. Consider spatial topology, temporal lanes, state transformation, physical metaphor, accumulation or saturation, healthy-versus-failure contrast, and user-controlled simulation.

For each concept briefly specify:

- The visual grammar or metaphor and why it is faithful.
- What remains fixed, what changes, and what the eye follows.
- How it represents causality rather than mere chronology.
- The strongest memorable beat or reveal.
- A meaningful interaction or counterfactual, if one adds insight.
- Its main risk of confusion or distortion.
- Why animation is necessary rather than decorative.

At least one concept must avoid conventional boxes and arrows. When relevant, include one failure/counterfactual concept and one concept where the viewer manipulates a real system variable.

Evaluate the concepts for explanatory power, fidelity, distinctiveness, animation value, mobile viability, and complexity. Reject attractive concepts that do not clarify the insight. Select the strongest or synthesize complementary ideas, then write a 5-8 beat storyboard before implementation. If the user asked to explore or brainstorm, stop for review; otherwise continue autonomously.

Before building, verify:

- The concept reveals something prose or a static diagram does not.
- Motion follows causality and has a clear focal subject.
- One paused frame remains intelligible.
- The metaphor does not falsify system behavior.
- Accurate but irrelevant implementation details are excluded.

## Framework Policy

Use the project's native reactive model and installed dependencies: hooks in React, Composition API in Vue, native reactivity in Svelte, or inline SVG plus browser APIs without a framework. Do not add a motion dependency for simple interpolation or force a neutral runtime into an established application.

## Scene Architecture

Separate these concerns, even if they remain in one file:

- **Domain model:** entities, relationships, invariants, and adjustable inputs.
- **Timeline:** ordered named phases and event intervals in milliseconds.
- **Layout:** entity anchors and dimensions for each responsive mode.
- **Projection:** a pure derivation of visible state from `{time, inputs, layout}`.
- **Rendering:** semantic graphics and surrounding HTML controls.

Prefer explicit phase schedules over chained callbacks. Derive the visible frame as a pure function of `{time, inputs, layout}`.

Create semantic primitives only when repetition justifies them; keep domain data out of generic primitives.

Represent meaning with semantic state such as `data-kind`, `data-state`, and `data-tone`; let CSS tokens map it to the host design system. Reserve strong color and motion for causality, changes, warnings, and failures.

## Timing And Motion

- Use one scene clock as the source of truth. Do not let independent transitions accumulate timing drift.
- Derive frames deterministically so pause, step, replay, tests, and screenshots produce the same state.
- Throttle reactive updates when 60 FPS is unnecessary; 24-30 FPS usually suffices.
- Suspend the clock outside the viewport with `IntersectionObserver`, allowing a small root margin.
- Prefer transforms and opacity. Animate path geometry or dimensions only when they convey information.
- Keep labels stable while packets, highlights, progress, or status move. Excessive layout motion harms comprehension.
- Add a short loop pause. Complex scenes need pause, previous phase, and next phase controls.
- Support a development-only frame or phase override through a prop or query parameter for visual testing.

Motion libraries handle interpolation, not process truth.

## Layout

- Use a stable `viewBox`, explicit edge anchors, intentional routing, and a fixed label hierarchy.
- Avoid overlap at every sampled phase, including transient packets and error annotations.
- In compact layouts, change topology, abbreviate, or stack regions rather than shrinking text below legibility.
- Reuse the host's spacing, typography, radius, border, and color tokens. Do not impose a generic neon developer aesthetic.

## Interaction And Accessibility

- Passive scenes: use `role="img"` and an `aria-label` that explains the process and outcome, not merely its title.
- Interactive scenes: label the containing region or group and expose every adjustable input.
- Prefer real HTML controls. If SVG must be interactive, provide role, focus, keyboard activation, and appropriate state attributes.
- Expose slider bounds, current and human-readable values, and arrow-key operation.
- Do not communicate state by color alone; combine color with text, shape, stroke pattern, or iconography.
- Honor `prefers-reduced-motion`. Show the most informative terminal frame or allow manual phase navigation; do not merely freeze an empty initial frame.

## Verification

Use browser automation when available. Verify at minimum:

- Initial, midpoint, terminal, and loop-boundary frames.
- Every phase, failure toggle, and transport control, including keyboard operation.
- Reduced motion, desktop, narrow mobile, and offscreen suspension/resume.
- No clipping, text collisions, misleading edge direction, hydration warnings, or console errors.

Prefer deterministic screenshots using the frame override. Test state projection as pure logic for real protocols or algorithms; polish must not hide an incorrect simulation.

## Quality Bar

- The concept answers a specific question; timing reflects causality, not decoration.
- The scene remains intelligible when paused and controls change the simulation, not just labels.
- Failure paths remain correct; mobile is composed rather than miniaturized.
- Reduced-motion users receive equivalent information and new dependencies are justified.

Do not translate prose nouns directly into rectangles or add semantically meaningless particles. The hard work is choosing the visual model, entities, states, transitions, and emphasis; complete it before writing graphics code.
