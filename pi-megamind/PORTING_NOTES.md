# Host adaptation notes

This directory packages Megamind for both OMP and Pi while preserving the original Claude/OpenCode workflow sources elsewhere in the repository.

## Copied sources

- `.claude/agents/megamind.md` → `skills/megamind/SKILL.md`
- `.claude/skills/many-brain-one-task/` → `skills/many-brain-one-task/`
- `.claude/skills/many-brain-one-decision/` → `skills/many-brain-one-decision/`
- `.claude/skills/educational-brief/` → `skills/educational-brief/`
- `.claude/skills/gh-cli/` → `skills/gh-cli/`
- `.claude/skills/glab-cli/` → `skills/glab-cli/`
- `.claude/skills/claude-cli/` → `skills/claude-cli/`
- `.claude/skills/codex-cli/` → `skills/codex-cli/`
- `.claude/skills/grok-cli/` → `skills/grok-cli/`

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
