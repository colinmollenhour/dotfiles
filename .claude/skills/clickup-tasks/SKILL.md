---
name: clickup-tasks
description: 'Manage ClickUp tasks.'
---

# ClickUp Tasks (Create & Update)

This skill creates and updates ClickUp tasks. It supports two backends:

1. **ClickUp MCP** (preferred) - use MCP tools like `ClickUp_create_task`, `ClickUp_update_task`
2. **`cup` CLI** (fallback) - use `cup create`, `cup update`, `cup field` when MCP is unavailable

## Backend Detection

Before proceeding, check which backend is available:

1. Try `cup auth --json` - if it returns authenticated user, CLI is available
2. Check if ClickUp MCP tools are available (e.g., `ClickUp_create_task`)

**If neither is available, halt and alert the user:**
> ClickUp integration is not available. Neither the ClickUp MCP server nor the `cup` CLI is configured and working. Please set up one of the following:
> - ClickUp MCP server in your opencode config
> - `cup` CLI: run `cup init` to configure your API token

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

ClickUp has a "Task Type" feature (shown as `custom_item_id` in the API). This is separate from the "Value Stream" custom field.

**Task Types:**
| Type | custom_item_id |
|------|----------------|
| Task | 0 (default) |
| Bug | 1001 |

**When to use Bug type:**
- Defects in existing functionality
- Unexpected behavior reported by users
- Issues that need fixing (not new features)

**When to use Task type:**
- New features
- Enhancements
- Documentation
- Refactoring
- General work items

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

### Using MCP:
1. **Find the Sprint list**: Use `ClickUp_get_task` with `taskName` like "Sprint NNN" to find the list ID
2. **Find the assignee**: Use `ClickUp_find_member_by_name` to get the user ID

### Using cup CLI:
1. **Find the Sprint list**: Use `cup sprints` to list sprints, then `cup task <sprintTaskId>` to get the list ID
2. **Find the assignee**: Use `cup members` to list workspace members and find user ID

## Step 5: Create or update the task

### Using MCP:

**Create:** Use `ClickUp_create_task` with:
- `name`: Task name (emoji optional - Bug type provides its own icon)
- `listId`: The sprint list ID (preferred over listName)
- `priority`: 1-4 (1=urgent, 4=low)
- `status`: "Ready to Start" (or as specified)
- `assignees`: Array with user ID, e.g., `[2685610]`
- `markdown_description`: Full formatted description
- `custom_item_id`: Task type ID - use `1001` for Bug type, omit or use `0` for regular Task

**Update:** Use `ClickUp_update_task` with the task ID and fields to update.

**Note:** If the `custom_item_id` parameter is not supported by the MCP tool, inform the user that they will need to manually change the Task Type to "Bug" in ClickUp after creation, or the MCP server needs to be updated to support this parameter.

### Using cup CLI:

**Create:**
```bash
cup create \
  -n "Task Name" \
  -l <listId> \
  -d "Formatted description in markdown" \
  -s "Ready to Start" \
  --priority normal \
  --assignee 2685610 \
  --custom-item-id 1001  # only for Bug type
```

**Update:**
```bash
cup update <taskId> \
  -n "New Name" \
  -d "New description" \
  -s "In Progress" \
  --priority high
```

## Step 6: Set custom fields

### Using MCP:

Use `ClickUp_update_task` to set custom fields:

**Value Stream** (field ID: `49ed7876-0e5f-490e-9cdc-612252997997`):
| Value | Option ID |
|-------|-----------|
| Unknown | `25db8568-9947-4c4f-832d-6f6a4ffa0803` |
| Internal Enhancement | `1e60663d-a01b-4581-8ca9-219d26d539be` |
| External Enhancement | `ed07ceef-8c34-4efa-a18c-e89eeca305ab` |
| Differentiator | `d7ee22ad-2c5d-4bd8-a1a6-426654dca26b` |
| Bug | `4499c3b7-49da-43cd-ad38-f082a56079ef` |
| Must Have | `2901a6cb-07c7-4a15-a0d0-bbe493cf18c1` |
| Who Needs This | `f60e06ad-8f18-4a23-92e8-c31b2f365b9d` |

**Requested By/Affects Clients** (field ID: `40acbf4e-77be-4e77-a0f6-d38b448c2804`):
| Value | Option ID |
|-------|-----------|
| All Clients | `cabb4354-4d0f-480d-9815-d064b6d36e18` |
| RSF | `927a2f33-0026-40df-971b-a21d1395ac58` |
| Falcon | `20473328-70f7-44a8-a99f-f900616517c2` |
| PGW | `edfe590f-d6de-40ef-a8d5-92c2324fd17a` |
| LVLup | `d83b46b3-759f-4f76-82bd-b18562657d3b` |
| Buho | `208ddc4a-3d8a-47fa-9a3f-e6878eb92996` |
| PTAC | `7bb112be-0514-46e9-ba02-0d1d0b148ce0` |
| Prospects | `8616a602-348d-4fe5-9688-b580cd39d3e9` |
| R&S Logistics | `a8833d5d-4646-4c5a-ba24-b3f25241f200` |
| LuckyGunner | `22a6d2ec-b7bc-409d-a071-eafb8492e7fc` |
| RSD | `341e41d8-7f20-4132-8e0c-8926e377d90a` |

Example update call:
```
custom_fields: [
  {"id": "49ed7876-0e5f-490e-9cdc-612252997997", "value": "4499c3b7-49da-43cd-ad38-f082a56079ef"},
  {"id": "40acbf4e-77be-4e77-a0f6-d38b448c2804", "value": ["927a2f33-0026-40df-971b-a21d1395ac58"]}
]
```

### Using cup CLI:

```bash
# Set Value Stream to Bug
cup field <taskId> --set "Value Stream" Bug

# Set Requested By to RSF
cup field <taskId> --set "Requested By/Affects Clients" RSF
```

The `cup field --set` command resolves field and option names case-insensitively. If the name doesn't match, it will list available options.

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

## Common team members

| Name | User ID |
|------|---------|
| Colin | 2685610 |

Use `ClickUp_find_member_by_name` (MCP) or `cup members` (CLI) to find other team members by name or email.

## Tips

- Always use `listId` instead of `listName` when you have it - it's faster and more reliable
- The Sprint list name format is typically "Sprint NNN (MM/DD - MM/DD)"
- **For bugs:** Set BOTH Task Type to Bug (`custom_item_id: 1001`) AND Value Stream to "Bug"
- For client-reported issues, set the appropriate client in "Requested By/Affects Clients"
- Custom field values for dropdowns use the option ID, not the display name
- Custom field values for labels (like "Requested By") take an array of option IDs
- Task Type (Bug vs Task) is different from Value Stream - both should be set appropriately
- When using `cup` CLI, descriptions support markdown natively
- For conversation-derived tasks, the post-write fidelity audit is mandatory; successful API persistence alone is not completion.
