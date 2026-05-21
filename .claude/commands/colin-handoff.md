---
description: Quick session handoff dump. Generates a portable markdown document from current conversation context for resuming in any AI tool.
argument-hint: [optional: output path]
---

Generate a handoff document from what you already know in this conversation. Do NOT go on an information-gathering quest — no tool calls, no file reads, no git commands. Just dump using your current context.

Write to one of the following:
- $ARGUMENTS
- Else if there is nothing specified above and `HANDOFF.md` doesn't exist, then `HANDOFF.md`
- Else generate a file name like `HANDOFF_Some-short-and-useful-description.md`

Always create a new file — never append to an existing one.

Use exactly this structure. If a section doesn't apply, write "N/A" on one line and move on. Be dense. Be specific. No filler.

```markdown
# Session Handoff — [Title]
> [timestamp] | [coding|research|writing|debugging|planning] | [tool name]

## 1. ORIGINAL INTENT
[The request that started this session — verbatim or faithful paraphrase]

## 2. PIVOTS & KEY DECISIONS
[Chronological. For each: what changed, why, what was chosen over what.
If linear session with no pivots, say so in one line.]

## 3. BRAIN DUMP — WHERE WE ARE RIGHT NOW
[This is the big one. Write as a stream-of-consciousness download of everything
you currently "know" about this work. What's working, what's broken, the mental
model you've built, non-obvious gotchas, things that surprised you, open questions.
A fresh AI reading only this section should be able to pick up the thread.]

## 4. FILES TOUCHED
[Table: file path | what changed | status (done/partial/stub)]
[For non-coding: list documents, outlines, artifacts instead]

## 5. NEXT STEPS
1. [Immediate — exact enough to execute without clarification]
2. [Then this]
3. [Then this]
[Flag anything that's blocked and on what]

## 6. DEAD ENDS (if debugging session)
[What was tried, how it failed, why not to retry it.
Most important section for preventing wasted time in the next session.]

## 7. LESSONS LEARNED
[Anything discovered that has value beyond this task.
Technical, process, or tool insights. Keep it tight.]

## 8. RESUME PROMPT
[A self-contained prompt someone can paste into any AI tool to continue.
~3-5 sentences: what we're doing, where we are, what's next, what to avoid.]
```

After writing the file, print the path and the resume prompt from section 8 so the user can copy it immediately.
