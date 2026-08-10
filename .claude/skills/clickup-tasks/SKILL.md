---
name: clickup-tasks
description: 'Manage ClickUp tasks.'
---

# ClickUp Tasks (Create & Update)

Workflow for creating and updating ClickUp tasks via the `cup` CLI.

Composes with:

- **`cup-recipes`** — run `bash "${CLAUDE_SKILL_DIR}/scripts/cup-recipes"` for the token-cheap cheat sheet. Prefer this over `cup --help` or loading any encyclopedic ClickUp skill.
- **`clickup`** (thin) — only when you need a broader cup map; do **not** load huge generated manuals.
- **`shipstream-clickup`** (in the ShipStream repo) — workspace identifiers: custom field IDs, option IDs, task type IDs, team member user IDs.

**Prerequisite:** `cup auth` must return an authenticated user. If it fails, halt and tell the user to run `cup init` to configure their API token.

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

## Step 1: Gather task information

Ask clarifying questions if any required information is missing:

1. **Task name** - Clear, concise title (will be prefixed with appropriate emoji)
2. **Task Type** - Task (default) or Bug. **Important:** This is different from Value Stream!
3. **Description** - User story, problem statement, and/or solution details
4. **Sprint/List** - Which sprint or list to add the task to (e.g., "Sprint 119")
5. **Priority** - Urgent (1), High (2), Normal (3), or Low (4). Default: Normal
6. **Status** - Default: "Ready to Start"
7. **Assignee** - Who should be assigned (can search by name or email)
8. **Value Stream** - Bug, Internal Enhancement, External Enhancement, Differentiator, Must Have, etc.
9. **Requested By/Affects Clients** - RSF, Falcon, PGW, LVLup, Buho, PTAC, All Clients, etc.

## Step 2: Determine Task Type

ClickUp's "Task Type" feature (`custom_item_id` in the API, `--custom-item-id` on `cup create`) is separate from the "Value Stream" custom field. Both must be set for bugs.

**Use Bug type for:** defects in existing functionality, unexpected behavior reported by users, issues that need fixing (not new features).

**Use Task type for:** new features, enhancements, documentation, refactoring, general work items.

For the `custom_item_id` values, see `shipstream-clickup` (or run `cup task-types`).

## Step 3: Format the task

#### Task Name
Prefix with an appropriate emoji based on type:
- Bug: `Fix...` or `Ignore...` (no emoji needed - the Bug type provides the icon)
- Feature: `Add...` or `Implement...`
- Enhancement: `Improve...` or `Optimize...`
- Documentation: `Document...`
- Refactor: `Refactor...`

#### Description Format

Use the simple template for narrow tasks:

```markdown
**As a** [role],
**I want** [capability],
**So that** [benefit].
# Problem Statement
[Describe the problem, including evidence, examples, or references.]
# Solution
[Describe the proposed solution and implementation approach.]
# Files to Modify
| File | Change |
|------|--------|
| `path/to/file.php` | Description of change |
# Acceptance Criteria
1. [Observable, testable criterion]
2. [Observable, testable criterion]
3. [Observable, testable criterion]
```

For conversation-derived or cross-component work, use only the relevant sections from this compact specification template:

```markdown
**As a** [role],
**I want** [capability],
**So that** [benefit].
# Problem
[Current behavior, evidence, and why the change is needed.]
# Requirements
- [Accepted design and exact behavioral constraints]
- [Security, failure, retention, deployment, and operational constraints]
# Scope
| Component | Change |
|-----------|--------|
| `component` | Required change |
# Acceptance Criteria
1. [Observable, testable requirement]
2. [Observable, testable requirement]
# Verification
1. [Specific scenario, including exact boundaries and real integration paths]
# Open Decisions
1. [Decision and options; omit this section when none]
```

Omit empty or redundant sections. Do not repeat the same requirement in background prose and acceptance criteria; acceptance criteria are canonical.

#### Syntax

ClickUp renders extra white space as visible gaps. Avoid blank lines inside task descriptions. A blank line before a list or table is acceptable when the preceding line is regular text rather than a heading or code block.

## Step 4: Find the list and assignee

Use `cup sprints` to find the sprint list and `cup members` to resolve an assignee to a user ID. Prefer a list ID over a list name — faster and unambiguous. `cup create --list sprint:current` targets the active sprint directly.

## Step 5: Create or update the task

Use `cup create` / `cup update`. See the `clickup` skill for the full flag list.

**`--parent` must be spelled out in full.** The short `-p` resolves to the global `--profile` flag, not `create`'s `--parent`, despite what `cup create --help` shows:

```bash
cup create -n "Subtask" -p abc123def       # WRONG: Profile "abc123def" not found
cup create -n "Subtask" --parent abc123def # correct (list auto-detected from parent)
```

Set the task type at creation time with `--custom-item-id` — changing it afterward is a separate step.

## Step 6: Set custom fields

Every task needs **Value Stream**; client-reported work also needs **Requested By/Affects Clients**.

```bash
cup field <taskId> --set "Value Stream" Bug
cup field <taskId> --set "Requested By/Affects Clients" RSF
```

Names resolve case-insensitively and a bad name lists the valid options, so option IDs are rarely needed. When a raw API payload does need them, see `shipstream-clickup`. Custom fields can also be set inline at creation with `cup create --field "Name" value`.

## Step 7: Run the post-write fidelity audit

After creating or updating the task:

1. Re-fetch the persisted task from ClickUp.
2. Compare the persisted description against the internal requirement ledger.
3. Verify that every Required and Constraint item is present without semantic weakening.
4. Verify that exact numeric values, units, names, failure behaviors, security boundaries, and verification scenarios survived serialization.
5. Verify that required work appears in acceptance criteria or explicit subtasks, not only in background prose.
6. Verify that unresolved decisions remain visibly unresolved rather than being silently decided or omitted.
7. Amend and re-fetch the task until the audit passes.

Do not report the task as successfully created or updated until the persisted task passes this audit. The audit must catch transformations such as:

| Source requirement | Invalid task wording |
|--------------------|----------------------|
| Payloads from 0 B through 1 GiB | "Large payloads" |
| Exponential backoff with jitter | "Retries with backoff" |
| Sidecar, bucket, IAM, alerts, and lookup CLI are required | Listed only as "discovery targets" |
| PHP must never receive archive credentials | "Use restricted credentials" |
| Test through real S3-compatible and telemetry pipelines | "Add unit tests" |

## Step 8: Report the result

After creating or updating the task, provide the task summary and fidelity result:

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

## Tips

- **For bugs:** set BOTH Task Type to Bug AND Value Stream to "Bug" — they are different fields
- For client-reported issues, set the appropriate client in "Requested By/Affects Clients"
- For conversation-derived tasks, the post-write fidelity audit is mandatory; successful API persistence alone is not completion
