# AGENTS.md

This repository (`~/.local/colin-dotfiles`) is the **source of truth** for the
skills, agents, and OpenCode subagents it contains.

## Do not edit installed copies

`install.sh` copies these trees into live tool dirs. Claude, OpenCode, Codex,
and Seamus **load** the copies. Edits there do not get committed and will
conflict on the next install.

| Source in this repo | Installed (do not edit) |
|---|---|
| `plugins/*/skills/` | `~/.claude/skills/`, `~/.agents/skills/`, `~/.gemini/antigravity-cli/skills/` |
| `plugins/megamind/agents/`, `.claude/agents/` | `~/.claude/agents/` |
| `.opencode/agents/` | `~/.opencode/agents/` |
| `pi-megamind/skills/` | Pi/OMP package copy of the Claude skills |

Edit the source path, then `./install.sh --agents` (or `--all`) so the
installed copies update. Use `--no-skills` only for a host that gets skills through the
marketplace or skills CLI; it skips the personal skill mirrors. Keep
`pi-megamind/skills/` in sync when you change a skill that exists in both trees.

`~/Seamus/skills-available/many-brain-one-task` should point into
`plugins/colin-shipping/skills/many-brain-one-task/` here — still this repo, not a second
source.

## Plugin layout

- `plugins/<name>/` is one complete Claude plugin; keep scripts and assets inside it.
- `.claude-plugin/marketplace.json` lists each plugin with a repository-relative source.
- Keep every skill name unique across plugins, and MBOT/MBOD together for sibling helper paths.
- Bump the affected plugin’s version when releasing changes so cached installs receive updates.
- Declare plugin dependencies in `plugin.json`; the skills CLI requires users to select helper skills themselves.
- Ship `agents/openai.yaml` with `allow_implicit_invocation: false` for user-invoked workflows so all install routes carry the policy.
- Run `python3 tests/plugin_layout_test.py`, `bash tests/install_test.sh`, and `claude plugin validate .` after layout changes.
