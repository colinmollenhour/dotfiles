---
name: clickup
description: 'Use when managing ClickUp tasks, sprints, or comments via the cup CLI. Prefer cup-recipes and clickup-tasks over loading encyclopedic manuals.'
---

# ClickUp CLI (`cup`) — agent thin skill

**Do not** dump `cup --help` or load a 90KB flag encyclopedia into context for routine work.

## First commands

```bash
# Token-cheap recipes (print and follow)
bash "${CLAUDE_SKILL_DIR}/../clickup-tasks/scripts/cup-recipes"
# or:
bash "${HOME}/.agents/skills/clickup-tasks/scripts/cup-recipes"

cup auth    # must succeed; else tell user to run cup init
```

## Workflow skills

| Job | Use |
|---|---|
| Create/update task with fidelity audit | **`clickup-tasks`** skill |
| Workspace IDs (ShipStream fields, members) | **`shipstream-clickup`** (repo skill) |
| Unknown advanced flag | `cup <cmd> --help \| head -80` only for that command |

## Recipes (inline)

```bash
cup task <id|url>
cup sprints
cup members
cup create -n "Title" --list sprint:current --description-file /abs/body.md
cup create -n "Sub" --parent <parentId>    # NOT -p (that is --profile)
cup update <id> --status "in progress"
cup field <id> --set "Value Stream" Bug
cup comment <id> --message-file /abs/note.md
cup tasks --list sprint:current
```

## Gotchas

- `-p` ≠ parent on `cup create` → always `--parent`
- Bugs need **both** custom item type Bug and Value Stream `Bug`
- Prefer list IDs; `sprint:current` for active sprint

If you need the full generated cup manual, regenerate with `cup skill` into a local reference file and **Read only the section you need** — never paste the whole manual into the session.
