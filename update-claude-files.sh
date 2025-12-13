#!/bin/bash

set -ex
mkdir -p .claude/skills/skill-writer/
curl -sSL -o .claude/skills/skill-writer/SKILL.md https://raw.githubusercontent.com/pytorch/pytorch/refs/heads/main/.claude/skills/skill-writer/SKILL.md
