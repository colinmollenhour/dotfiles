# Host adaptation notes

This directory packages Megamind for both OMP and Pi while preserving the original Claude/OpenCode workflow sources elsewhere in the repository.

## Copied sources

- `plugins/megamind/skills/megamind/SKILL.md` → `skills/megamind/SKILL.md`
- `plugins/colin-shipping/skills/many-brain-one-task/` → `skills/many-brain-one-task/`
- `plugins/colin-shipping/skills/many-brain-one-decision/` → `skills/many-brain-one-decision/`
- `plugins/colin-shipping/skills/educational-brief/` → `skills/educational-brief/`
- `plugins/colin-shipping/skills/colin-mr-description/` → `skills/colin-mr-description/`
- `plugins/colin-shipping/skills/gh-cli/` → `skills/gh-cli/`
- `plugins/colin-shipping/skills/glab-cli/` → `skills/glab-cli/`
- `plugins/colin-cli-bridges/skills/claude-cli/` → `skills/claude-cli/`
- `plugins/colin-cli-bridges/skills/codex-cli/` → `skills/codex-cli/`
- `plugins/colin-cli-bridges/skills/grok-cli/` → `skills/grok-cli/`

## Host-specific behavior

- `package.json` retains the Pi package manifest. OMP accepts the same manifest and discovers its `skills/` and `prompts/` surfaces.
- `prompts/megamind.md` provides `/megamind` in both hosts and explicitly keeps Megamind in the current user-visible main session.
- On OMP, Megamind, MBOT, and MBOD use native `task` batches for child work and keep moderation, artifact ownership, delivery, and CI monitoring in `Main`.
- On Pi, the defaults prefer `pi-fast-subagent` and fall back to `pi --print`.
- Explicit `--agents`, model, or harness selections override the host-native defaults.
- Hardcoded `CLAUDE_SKILL_DIR` examples in copied package files use explicit absolute-path placeholders so installed agents know to resolve helper scripts from the skill directory.

## Remaining publication work

- Replace placeholder paths in examples with package-relative wording throughout MBOT/MBOD docs.
- Decide whether to keep Claude/OpenCode-specific routing prose or split it into host-specific references.
- Add a scripted Pi discovery smoke check if this package is published independently.
