---
name: clickup-task-authoring
description: 'Author a ClickUp task from a conversation, plan, review, incident, or spec as CUFM via cup task-sync. Covers the source-fidelity ledger, rich description structure (banners, toggles, mermaid, tldraw, tables), open-decision blocks (question, AI Recommendation, two alternatives), title conventions, ShipStream Value Stream / Requested By / Bug-type rules, and the post-write audit. Use when creating or updating ClickUp task content (file a bug, write a ticket, turn this into a task). Load the clickup skill from `cup skill` for CUFM syntax and task-sync flags. Workspace IDs live in shipstream-clickup. Formerly clickup-tasks.'
---

# ClickUp task authoring

What to put in a ShipStream ClickUp task. **Load the `clickup` skill** (install/refresh with `cup skill`) and **read `references/cufm.md` before writing or updating any description.** That skill owns CUFM syntax and `cup task-sync` flags. Workspace IDs are **`shipstream-clickup`** (WMS repo).

**Prerequisite:** `cup auth` must succeed. If it fails, halt and tell the user to run `cup init`.

## Tools

Descriptions are **always CUFM**, persisted **only** with `cup task-sync` (`init` / `pull` / `push`). Do not author via inline `-d` or `--description-file`. Comments are not CUFM.

```bash
cup sprints
cup members
cup task-types
cup create -n "Title" --list sprint:current \
  --assignee <userId> --priority normal --custom-item-id <taskTypeId> \
  --field "Value Stream" Bug --field "Requested By/Affects Clients" RSF
cup create -n "Subtask" --parent <parentId>   # never -p (that is --profile)
cup field <id> --set "Value Stream" Bug
cup task-sync init <id> task.md
cup task-sync pull [file]
cup task-sync push [file]
cup task <id>                                 # re-fetch for the audit
```

`cup create` / `cup field` set metadata (list, type, fields, assignee). The body is a local CUFM file pushed with task-sync. Directory graphs (parent/subtasks/deps) are in the `clickup` skill.

Use the dialect, not plain markdown. Reach for a component when it carries meaning; omit empty ones.

| Reach for | When |
|-----------|------|
| `::banner` | User story, warnings, constraints that must not be weakened |
| `::toggle` | Evidence, long file lists, rejected alternatives |
| mermaid | Flows, state machines, sequences |
| tldraw | Spatial / architecture diagrams (flowchart is the wrong shape) |
| `::table` | Any table (set column widths) |
| `:badge` | Short type/status chips |

## Source Fidelity Contract

For a task derived from a conversation, plan, review, incident, or specification, first build an internal requirement ledger covering:

- requested outcomes and accepted decisions
- exact bounds, defaults, identifiers, and behavior
- security, retention, failure, and recovery constraints
- deployment, rollout, rollback, and operational requirements
- tests, end-to-end verification, rejected alternatives, and unresolved decisions

Classify each item as **Required**, **Constraint**, **Guidance**, or **Unresolved**. Do not promote an unaccepted assistant suggestion into a requirement or weaken a user requirement into guidance.

Write the shortest self-contained task that preserves every Required and Constraint item. Distill repeated rationale, combine related requirements, use exact bullets instead of explanatory prose, and omit headings that add no contract. Fidelity means preserving semantics, not preserving the source wording.

- Keep exact values and named behaviors; `1 GiB` must not become "large," and "backoff with jitter" must not become "retry."
- Put mandatory work in acceptance criteria, not only under solution, discovery, scope, or file lists.
- Do not depend on the original conversation remaining available.
- Keep unresolved decisions visible.
- For independently deliverable components or repositories, preserve a concise parent contract and use explicit subtasks rather than compressing away requirements.

## Gather

Ask if any of these are missing:

1. **Task name** — concise title (see naming below)
2. **Task Type** — Task (default) or Bug. This is **not** Value Stream.
3. **Description** — user story, problem, and/or solution
4. **Sprint/List** — e.g. "Sprint 119"; prefer a list ID, or `sprint:current`
5. **Priority** — Urgent (1), High (2), Normal (3), Low (4). Default: Normal
6. **Status** — default "Ready to Start"
7. **Assignee**
8. **Value Stream** — Bug, Internal Enhancement, External Enhancement, Differentiator, Must Have, …
9. **Requested By/Affects Clients** — RSF, Falcon, PGW, LVLup, Buho, PTAC, All Clients, … (client-reported work only)

## Task type vs Value Stream

ClickUp "Task Type" (`--custom-item-id`) is separate from the "Value Stream" custom field. **Bugs need both.**

- **Bug type:** defects, unexpected behavior, issues to fix
- **Task type:** features, enhancements, docs, refactors, general work

IDs: `shipstream-clickup`, or `cup task-types`. Set type at creation; changing it later is a separate step.

## Format

### Title

- Bug: `Fix...` or `Ignore...` (no emoji — Bug type supplies the icon)
- Feature: `Add...` or `Implement...`
- Enhancement: `Improve...` or `Optimize...`
- Documentation: `Document...`
- Refactor: `Refactor...`

### Description

CUFM skeleton — include only sections that apply. Syntax for each component is in `cufm.md`.

```mdc
::banner{color="blue"}
**As a** [role], **I want** [capability], **So that** [benefit].
::

# Problem
[Current behavior and why it must change.]

::toggle{title="Evidence"}
[Logs, URLs, screenshots, failing cases.]
::

::mermaid
flowchart LR
  A["Current"] --> B["Desired"]
::

# Requirements
- [Required / Constraint items, exact values]

::banner{color="yellow"}
Constraints that must not be weakened.
::

# Scope
::table{widths="200,360"}
| Component | Change |
|-----------|--------|
| `component` | Required change |
::

# Acceptance Criteria
1. [Observable, testable requirement]

# Verification
1. [Exact boundaries, real integration paths]

# Open Decisions
[One numbered question per unresolved item — see "Open decisions" below.]
```

Narrow tasks can drop mermaid/tldraw/toggles when there is no flow, diagram, or secondary material. Prefer a mermaid (or tldraw) over a prose walkthrough of a process. Wrap every table in `::table`. Acceptance criteria are canonical — do not also repeat the same requirement in background prose.

## Open decisions

An unresolved decision is only useful if a reviewer can settle it in one pass. A bare "Overflow allowance: percent vs absolute?" makes them re-derive the whole problem first. Give every open item a plain-language question, the stakes in a sentence or two, and three concrete options — the pick, plus the two credible answers it beat.

```mdc
# Open Decisions

*Each item below is a question still to answer. The **AI Recommendation** is what an AI review of this plan would pick and why; the two alternatives are the other credible answers, with their cost. Choose one, or say why none fit.*

---

**1. Question in the words the person answering it would use?**

What is actually at stake, and why the answer is not obvious.

**AI Recommendation —** The pick, then why it wins.

**AI Alternative 1 —** A real option. What it buys, then what it costs.

**AI Alternative 2 —** A real option. What it buys, then what it costs.
```

- Both alternatives must be defensible. A strawman is not an alternative, and neither is "do nothing" unless doing nothing is genuinely on the table.
- Name the cost of the recommendation too. One with no downside is usually one nobody examined.
- Number the questions so review comments can cite them ("OD 2").
- Keep the section at top level. Collapse rejected alternatives and evidence into `::toggle`; never collapse a question that needs an answer.
- Resolving a decision does not delete it. Fold the answer into the contract prose and leave a one-line marker where the question was: `*(Resolved — was OD 1: sync endpoint vs fast-poll. **Ratified sync**, see §6.1. Do not implement fast-poll.)*`
- Decisions **you** took rather than the user get their own section — `# Decisions Taken in <what> (need sign-off)` — in the same three-option shape, each pointing at the section that now encodes the answer. A reader must never mistake a machine's choice for a ratified one.
- When the same decisions are mirrored in a repo document, keep both lists in the same order and have each point at the other, so sign-off happens once.

### Separators

ClickUp renders consecutive paragraphs tight, so a run of decisions arrives as one wall of bold labels. Put a `---` divider before each numbered question, including the first, so each decision reads as its own card. CUFM has no empty-paragraph primitive, and whitespace alone does not survive:

| Written in CUFM | Rendered in ClickUp |
|-----------------|---------------------|
| `---` alone on a line | divider block — use this |
| one blank line | ordinary paragraph separator — no gap |
| two blank lines | collapses to the same — no gap |
| `<br>` | stored as a raw-HTML `cufm` fence, not a break |
| `&nbsp;` alone on a line | empty block — whitespace without a line, if a divider is too heavy |

A divider is a block, not text: it does not appear in the plaintext `description` from `cup task <id> --json`. Audit separators against the rendered `cup task <id>` output instead.

## Persist

Every task needs **Value Stream**. Client-reported work also needs **Requested By/Affects Clients**. Names resolve case-insensitively; a bad name lists valid options. Option IDs: `shipstream-clickup`.

After `cup create`, `task-sync init` the new id, write CUFM, then `push`. Updates: `pull` (or `init`), edit, `push`.

## Post-write fidelity audit

After `task-sync push`:

1. Re-fetch the persisted task (`cup task <id>`).
2. Compare the persisted description against the internal requirement ledger.
3. Verify every Required and Constraint item is present without semantic weakening.
4. Verify exact numeric values, units, names, failure behaviors, security boundaries, and verification scenarios survived serialization.
5. Verify required work appears in acceptance criteria or explicit subtasks, not only in background prose.
6. Verify unresolved decisions remain visibly unresolved, each with a recommendation and two real alternatives, spaced apart as above.
7. Amend the CUFM file, `push` again, and re-fetch until the audit passes.

Do not report success until the persisted task passes. Catch transformations such as:

| Source requirement | Invalid task wording |
|--------------------|----------------------|
| Payloads from 0 B through 1 GiB | "Large payloads" |
| Exponential backoff with jitter | "Retries with backoff" |
| Sidecar, bucket, IAM, alerts, and lookup CLI are required | Listed only as "discovery targets" |
| PHP must never receive archive credentials | "Use restricted credentials" |
| Test through real S3-compatible and telemetry pipelines | "Add unit tests" |

## Report

```
**ClickUp Task Created:**

| Field | Value |
|-------|-------|
| **ID** | DEV-XXXX |
| **Name** | Task name |
| **Type** | Bug |
| **List** | Sprint NNN |
| **Status** | Ready to Start |
| **Priority** | Normal |
| **Assignee** | Name |
| **Value Stream** | Bug |
| **Requested By** | RSF |

**Fidelity Audit:**

| Check | Result |
|-------|--------|
| Required capabilities preserved | Pass |
| Exact constraints preserved | Pass |
| Security and failure requirements preserved | Pass |
| Deployment and operations preserved | Pass |
| Verification scenarios preserved | Pass |
| Unresolved decisions recorded | Pass |
| Intentionally omitted requirements | None |

**URL:** https://app.clickup.com/t/XXXXXXXX
```

List every intentional omission and its rationale instead of reporting "None." If the task was updated rather than created, change the report heading accordingly.
