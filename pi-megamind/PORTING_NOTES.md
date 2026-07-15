# Porting notes

This directory is a first-cut Pi package assembled by copying source material from the current repo without changing the originals.

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

## Pi-specific additions

- `package.json` declares the Pi package manifest.
- `prompts/megamind.md` provides the `/megamind` prompt template.
- Hardcoded `CLAUDE_SKILL_DIR` examples in copied package files were changed to explicit absolute-path placeholders so Pi agents know to resolve helper scripts from the installed skill directory.
- The package adds Pi-backed default MBOT/MBOD profiles. These prefer the lightweight `pi-fast-subagent` extension when installed and otherwise fall back to `pi --print < prompt.md`.

## Likely follow-up work before publishing

- Replace placeholder paths in examples with package-relative wording throughout MBOT/MBOD docs.
- Decide whether to keep Claude/OpenCode-specific routing prose or split it into host-specific sections.
- Consider adding a Pi extension later if `/megamind` should become a native command instead of a prompt template.
- Consider adding tests or a smoke-check script that runs `pi -e ./pi-megamind` and verifies skill/template discovery.
