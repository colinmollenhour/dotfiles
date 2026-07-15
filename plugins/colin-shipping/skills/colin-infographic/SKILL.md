---
name: colin-infographic
description: Distill the current task, merge request, pull request, ticket, RFC, or recent change set into a single self-contained image-generation PROMPT for a visual infographic that conveys "what changed and why" to non-implementers. Use when the user asks to make/write/draft/design an infographic for an MR, PR, feature, change, ticket, or task — or to attach a visual to a review. The skill emits only the prompt; image generation is left to a downstream tool (Nano Banana, Midjourney, DALL·E, NotebookLM infographic, gpt-image-1, etc.). Default output is `.tmp/PROMPT_Infographic-<slug>.md`.
---

Invoke the `infographic` skill with these arguments: $ARGUMENTS
