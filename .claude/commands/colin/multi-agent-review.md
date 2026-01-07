---
description: Multi-agent code review
argument-hint: The commit range to examine. E.g. "origin/main..HEAD"
---
First, look at "git diff --stat $ARGUMENTS" to make sure there is something sensical to review. Stop if there is nothing.

Then, dispatch two subagents to carefully review the diff for $ARGUMENTS. Tell them that they're competing with another agent. Make sure they look at both architecture and implementation.
Tell them that whomever finds more issues gets promoted, but they are penalized for false positives or pedantic findings. Provide a summary of all findings, deduplicated and sorted by urgency.

Agent 1 should use Claude Sonnet 4.5
Agent 2 should use OpenAI ChatGPT 5.2

