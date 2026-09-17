# AGENTS.md

This repository (`~/.local/colin-dotfiles`) is the **source of truth** for the
skills, agents, and OpenCode subagents it contains.

## Do not edit installed copies

`install.sh` copies these trees into live tool dirs. Claude, OpenCode, Codex,
and Seamus **load** the copies. Edits there do not get committed and will
conflict on the next install.

| Source in this repo | Installed (do not edit) |
|---|---|
| `.claude/skills/` | `~/.claude/skills/`, `~/.agents/skills/` |
| `.claude/agents/` | `~/.claude/agents/` |
| `.opencode/agents/` | `~/.opencode/agents/` |
| `pi-megamind/skills/` | Pi/OMP package copy of the Claude skills |

Edit the source path, then `./install.sh --agents` (or `--all`) so the
installed copies update. Keep `pi-megamind/skills/` in sync when you change a
skill that exists in both trees.

`~/Seamus/skills-available/many-brain-one-task` is a symlink into
`.claude/skills/many-brain-one-task/` here — still this repo, not a second
source.
