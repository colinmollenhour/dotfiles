#!/bin/bash

set -ex
mkdir -p plugins/colin-shipping/skills/skill-writer/
curl -sSL -o plugins/colin-shipping/skills/skill-writer/SKILL.md https://raw.githubusercontent.com/pytorch/pytorch/refs/heads/main/plugins/colin-shipping/skills/skill-writer/SKILL.md
