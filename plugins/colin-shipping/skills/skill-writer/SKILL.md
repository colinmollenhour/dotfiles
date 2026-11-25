---
name: skill-writer
disable-model-invocation: true
description: 'Create or improve Agent Skills, SKILL.md frontmatter, structure, instructions, and resources.'
---

# Skill writer

Identify the task the skill should handle, how the user invokes it, and what success looks like. Check nearby skills for overlap. For an update, preserve existing callers, output formats, and invocation policy.

Place the skill in the target project's source tree or personal skills directory as requested. In colin-dotfiles the source is `plugins/<plugin>/skills/<name>/`. Follow the root AGENTS.md for Pi mirrors, installation, and packaging checks.

## Entrypoint

Use a directory matching the lowercase, hyphenated `name`. Write a description that distinguishes the task from adjacent skills. For example:

```yaml
---
name: release-notes
description: Draft release notes from merged changes between two tags.
---
```

Keep the body focused on the inputs, decisions, and output a capable model would otherwise get wrong. Preserve local conventions and demonstrated failure cases. Link detailed references at the step where they become relevant. Use installed CLI help for changing flag lists. Move repeated mechanical work into a tested script when it saves tool calls.

## Verify

Check the frontmatter, relative links, script paths, and invocation mode from the installed layout. Exercise a representative request. For a user-invoked skill, test its explicit command. For an automatically discovered skill, check both a matching request and a nearby task that should leave it idle.

Use `wc -c SKILL.md` as a review aid. The local soft target is about 8 KB. Above 16 KB, check for duplicated examples, generic tutorials, or detail that belongs in a reference. Report the source location, how to invoke it, and what you tested.
