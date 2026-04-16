---
description: Multi-model spec critique — surfaces inconsistencies, gaps, naming issues, and inferior design
argument-hint: "[file path or 'current plan' or TaskID] [--agents list...] [--summary]"
allowed-tools: Bash(ls:*), Bash(cat:*), Bash(find:*), Bash(wc:*), Read
---

# Spec Critique

Use the MBOT (many-brain-one-task) skill to launch multiple agents to independently challenge a specification or plan document.
Models surface inconsistencies, major gaps, poor naming, and inferior design choices — but NOT new features or scope expansion.

## Input Resolution

**If an argument is provided:**

| Pattern | How to Resolve |
|---------|----------------|
| File path (e.g., `SPECS-foo.md`) | Read the file directly |
| `TaskID-ish` | Use the ClickUp cli ("cup task X") or ClickUp MCP to fetch the task description |
| `current plan` | Use the plan from the current conversation context |

**If no argument is provided:**
1. Look for `SPECS-*.md` files in the current directory
2. If exactly one found → use it
3. If multiple found → list them and ask user to pick
4. If none found → look for `PLAN*.md` files, same logic
5. If still none → ask user to provide a file path or say `current plan`

## Process

### Step 1: Load the Spec

Resolve the input (see [Input Resolution](#input-resolution) above) and read the full spec content. If the spec references other spec files (e.g., "see `database-design.md`"), read those too — agents need the full picture.

However, **do not** go exploring the codebase.

Report what was loaded:
```
Spec: <filename-or-task-id> (<N> lines)
Referenced files: <list or "none">
```

### Step 2: Critique the Spec

Launch the specified critique agents in parallel (or the 3 defaults if none specified). Pass each agent:
- The full spec content
- Any referenced files or codebase context gathered in Step 2
- The instruction: "Tag each issue with your agent name (e.g., `colin-critique-opus`)"

Each agent independently reviews for:

**Inconsistencies**
- Contradictions between sections
- Terminology used differently in different places
- Requirements that conflict with each other

**Major Gaps**
- Undefined behavior for obvious scenarios
- Missing error handling for likely failure modes
- Unspecified edge cases or state transitions
- Dependencies mentioned but not addressed

**Poor Naming**
- Ambiguous or misleading names for concepts, APIs, fields, components
- Names conflicting with established domain conventions
- Inconsistent naming patterns within the spec

**Design Issues**
- Patterns inferior to well-known industry standards
- Unnecessary coupling or complexity - **"Everything should be made as simple as possible, but not simpler"**
- Approaches that ignore established best practices
- Over-engineering or under-engineering relative to requirements

**CRITICAL: Agents must NOT flag:**
- Missing features or "nice to haves"
- Scope expansion suggestions
- Style/formatting preferences
- Minor wording improvements
- Issues explicitly marked as out of scope

### Step 3: Validate Issues

For each issue found, validate it against the spec content with high confidence. Filter out:
- False positives (the spec actually does address the concern)
- Low-signal issues (pedantic or subjective)
- Feature requests disguised as gaps

When de-duplicating issues found by multiple agents, **merge the agent attribution** — track all agents that independently identified the same issue. Issues found by multiple models are higher signal.

### Step 3.5: Model Comparison Summary (`--summary`)

**Skip this step entirely if `--summary` is not specified.**

After validation completes, compile per-agent performance metrics using **display names**.

#### Metrics per agent

| Metric | Definition |
|--------|------------|
| **Found** | Total issues flagged by this agent |
| **Validated** | Issues that survived validation |
| **False Positives** | Found minus Validated |
| **Unique Finds** | Validated issues flagged by *only* this agent |
| **Shared Finds** | Validated issues also found by at least one other agent |

#### Scoring methods

1. **Unique Value** — Rank by unique validated finds (descending), then by false positive rate (ascending)
2. **Accuracy** — `validated / found` as a percentage. 0 issues shows `—`
3. **Composite Score** — `(+2 × unique finds) + (+1 × shared finds) + (−2 × false positives)`

**Best model** = highest composite score. **Worst model** = lowest.

#### Summary format

```markdown
**Spec Critique — Model Summary**

| Model | Found | Validated | False Pos | Unique | Accuracy | Composite |
|-------|-------|-----------|-----------|--------|----------|-----------|
| Opus 4.6 | 5 | 4 | 1 | 2 | 80% | +7 |
| GPT 5.4 | 3 | 3 | 0 | 1 | 100% | +5 |

**Best model:** Opus 4.6 — 2 unique finds, 80% accuracy, +7 composite
**Worst model:** GLM 5 — 0 unique finds, 50% accuracy, −2 composite
```

### Step 4: Present Results

Display all validated issues grouped by type, with agent attribution:

```
---
## Critique Results: <spec filename>

Models: <comma-separated display names>
Issues found: <N> (<M> unique across models)

---
### Inconsistencies (<count>)

**Issue <N>: <title>**
Section: <section reference>
Flagged by: <agent display name(s)>

<description>

**Why it matters:** <concrete consequence>

---
### Major Gaps (<count>)

...

### Poor Naming (<count>)

...

### Design Issues (<count>)

...
---

<if --summary>
<model comparison table>
</if>
```

If zero issues are found:
```
---
Spec Critique: <filename>
Models: <comma-separated display names>

No issues found. The spec appears internally consistent with no major gaps identified.
---
```

### Step 5: Offer Next Steps

After presenting results, ask the user how they want to proceed:
- **"fix"** or **"address all"** → Update the spec to address all issues
- **"fix issue N"** → Address a specific issue
- **"dismiss issue N"** → Mark as intentional / won't fix
- **"done"** → End the critique

## Notes

- This command does NOT modify the spec unless the user explicitly asks
- The critique is adversarial by design — it looks for problems, not praise
- Issues found by multiple independent models deserve extra attention
- When agents reference "industry standards," they should name the specific standard or pattern

# Command Arguments

----
$ARGUMENTS
----
