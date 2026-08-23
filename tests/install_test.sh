#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="$ROOT_DIR/install.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/colin-dotfiles-install-test.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT

assert_contains() {
  local output="$1" expected="$2"
  if [[ "$output" != *"$expected"* ]]; then
    printf 'Expected output to contain: %s\n\n%s\n' "$expected" "$output" >&2
    exit 1
  fi
}

assert_not_contains() {
  local output="$1" unexpected="$2"
  if [[ "$output" == *"$unexpected"* ]]; then
    printf 'Expected output not to contain: %s\n\n%s\n' "$unexpected" "$output" >&2
    exit 1
  fi
}

assert_file_missing() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    printf 'Expected file not to exist: %s\n' "$path" >&2
    exit 1
  fi
}

assert_files_equal() {
  local expected="$1" actual="$2"
  if ! cmp -s "$expected" "$actual"; then
    printf 'Expected installed file to match source:\n  source: %s\n  installed: %s\n' "$expected" "$actual" >&2
    exit 1
  fi
}

run_install() {
  local home="$1"
  shift
  HOME="$home" XDG_DATA_HOME="$home/.local/share" "$INSTALLER" "$@" 2>&1
}

UNINSTALLER="$ROOT_DIR/uninstall.sh"

run_uninstall() {
  local home="$1"
  shift
  HOME="$home" XDG_DATA_HOME="$home/.local/share" "$UNINSTALLER" "$@" 2>&1
}

home="$TEST_ROOT/dotfiles-home"
mkdir -p "$home"

output="$(run_install "$home" --dotfiles --no-input --dry-run --quiet)"
assert_contains "$output" "Files that would be written (13):"
assert_contains "$output" "Would create: 13"
assert_file_missing "$home/.bashrc.colin"
assert_file_missing "$home/.local/share/colin-dotfiles/manifest"

output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Files written (13):"
assert_contains "$output" "Created: 13"
assert_contains "$output" "Replaced: 0"
assert_files_equal "$ROOT_DIR/.paseo/orchestration-preferences.json" \
  "$home/.paseo/orchestration-preferences.json"

output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Files written (0):"
assert_contains "$output" "Unchanged (same hash and mtime): 13"
assert_contains "$output" "Replaced: 0"

touch -d '2035-01-01 00:00:00 UTC' "$home/.config/starship.toml"
output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Files written (1):"
assert_contains "$output" "$home/.config/starship.toml"
assert_contains "$output" "Unchanged (same hash and mtime): 12"
assert_contains "$output" "Replaced: 1"

touch -d '2035-01-01 00:00:00 UTC' "$home/.config/docker-fzf.bash"
output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Files written (1):"
assert_contains "$output" "$home/.config/docker-fzf.bash"
assert_not_contains "$output" "Installing dotfiles"

printf '\n# local customization\n' >> "$home/.config/starship.toml"
output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Skipping file modified since the last install: $home/.config/starship.toml"
assert_contains "$output" "Files written (0):"
assert_contains "$output" "Unchanged (same hash and mtime): 12"
assert_contains "$output" "Replaced: 0"
assert_contains "$(<"$home/.config/starship.toml")" "# local customization"

# Source removed + dest unmodified → delete dest. Source removed + dest
# rewritten by another installer → leave dest and drop it from the manifest.
manifest="$home/.local/share/colin-dotfiles/manifest"
unmod_orphan="$home/.agents/skills/gone/SKILL.md"
mod_orphan="$home/.agents/skills/clickup/SKILL.md"
mkdir -p "$(dirname "$unmod_orphan")" "$(dirname "$mod_orphan")"
printf 'vanilla wrapper\n' > "$unmod_orphan"
printf 'cup skill v1.43.0\n' > "$mod_orphan"
printf '%s\t%s\t%s\n' "$(sha256sum "$unmod_orphan" | cut -d' ' -f1)" \
  ".claude/skills/gone/SKILL.md" "$unmod_orphan" >> "$manifest"
printf '%s\t%s\t%s\n' "$(printf 'old wrapper\n' | sha256sum | cut -d' ' -f1)" \
  ".claude/skills/clickup/SKILL.md" "$mod_orphan" >> "$manifest"

output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_file_missing "$unmod_orphan"
assert_contains "$output" "Stopped tracking $mod_orphan"
assert_contains "$output" "1 orphaned file(s) released from tracking (source removed, local copy kept)"
assert_contains "$(<"$mod_orphan")" "cup skill v1.43.0"
if grep -Fq "$unmod_orphan" "$manifest"; then
  printf 'Expected unmodified orphan to be dropped from the manifest: %s\n' "$unmod_orphan" >&2
  exit 1
fi
if grep -Fq "$mod_orphan" "$manifest"; then
  printf 'Expected modified orphan to be dropped from the manifest: %s\n' "$mod_orphan" >&2
  exit 1
fi

output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_not_contains "$output" "$mod_orphan"
assert_not_contains "$output" "Stopped tracking"
assert_contains "$(<"$mod_orphan")" "cup skill v1.43.0"

# --- Test uninstall dotfiles ---
output="$(run_install "$home" --bashrc --gitconfig --no-input --quiet)"
assert_contains "$(<"$home/.bashrc")" "source ~/.bashrc.colin"
assert_contains "$(<"$home/.gitconfig")" "path = ~/.gitconfig.colin"

output="$(run_uninstall "$home" --dotfiles --bashrc --gitconfig --force --no-input --quiet)"
assert_contains "$output" "Files removed ("
assert_file_missing "$home/.bashrc.colin"
assert_file_missing "$home/.gitconfig.colin"
assert_file_missing "$home/.paseo/orchestration-preferences.json"
assert_file_missing "$home/.bashrc"
assert_file_missing "$home/.gitconfig"
assert_file_missing "$home/.local/share/colin-dotfiles/manifest"

agents_home="$TEST_ROOT/agents-home"
mkdir -p "$agents_home/.claude"
cp -p "$ROOT_DIR/.claude/settings.json" "$agents_home/.claude/settings.json"
cp -p "$ROOT_DIR/.claude/settings.json" "$agents_home/.claude/settings.json.bak"
backup_ctime="$(stat -c '%z' "$agents_home/.claude/settings.json.bak")"
output="$(run_install "$agents_home" --agents --no-input --dry-run --quiet)"
assert_contains "$output" "Files that would be written ("
assert_contains "$output" "$agents_home/.opencode/agents/megamind.md"
assert_file_missing "$agents_home/.opencode"
assert_file_missing "$agents_home/.local/share/colin-dotfiles/manifest"

output="$(run_install "$agents_home" --agents --no-input --quiet)"
assert_files_equal "$ROOT_DIR/.claude/agents/megamind.md" \
  "$agents_home/.claude/agents/megamind.md"
assert_files_equal "$ROOT_DIR/.opencode/agents/megamind.md" \
  "$agents_home/.opencode/agents/megamind.md"
assert_files_equal "$ROOT_DIR/.claude/skills/many-brain-one-task/default.md" \
  "$agents_home/.claude/skills/many-brain-one-task/default.md"
assert_files_equal "$ROOT_DIR/.claude/skills/many-brain-one-task/code-review.md" \
  "$agents_home/.claude/skills/many-brain-one-task/code-review.md"
assert_files_equal "$ROOT_DIR/.claude/skills/many-brain-one-task/code-review.md" \
  "$agents_home/.agents/skills/many-brain-one-task/code-review.md"
assert_files_equal "$ROOT_DIR/.claude/skills/megamind/SKILL.md" \
  "$agents_home/.agents/skills/megamind/SKILL.md"
assert_files_equal "$ROOT_DIR/.claude/skills/colin-review/SKILL.md" \
  "$agents_home/.agents/skills/colin-review/SKILL.md"
assert_files_equal "$ROOT_DIR/.claude/skills/colin-review/SKILL.md" \
  "$agents_home/.claude/skills/colin-review/SKILL.md"
assert_file_missing "$agents_home/.claude/commands"
assert_file_missing "$agents_home/.opencode/commands"
assert_contains "$(<"$agents_home/.agents/skills/colin-review/agents/openai.yaml")" \
  "allow_implicit_invocation: false"
assert_file_missing "$agents_home/.agents/skills/gh-cli/agents/openai.yaml"
assert_file_missing "$agents_home/.gemini"
assert_contains "$output" "Unchanged (same hash and mtime): 2"

mkdir -p "$agents_home/.claude/commands" "$agents_home/.opencode/commands"
printf 'stale slash command\n' > "$agents_home/.claude/commands/colin-review.md"
printf 'stale slash command\n' > "$agents_home/.opencode/commands/colin-review.md"

output="$(run_install "$agents_home" --agents --no-input --quiet)"
assert_not_contains "$output" "$agents_home/.agents/skills/megamind/SKILL.md"
assert_not_contains "$output" "$agents_home/.claude/settings.json"
assert_not_contains "$output" "$agents_home/.claude/settings.local.json"
assert_files_equal "$ROOT_DIR/.claude/skills/megamind/SKILL.md" \
  "$agents_home/.agents/skills/megamind/SKILL.md"
assert_file_missing "$agents_home/.claude/commands"
assert_file_missing "$agents_home/.opencode/commands"
if [[ "$(stat -c '%z' "$agents_home/.claude/settings.json.bak")" != "$backup_ctime" ]]; then
  printf 'Expected current settings backup not to be rewritten\n' >&2
  exit 1
fi

# --- Test uninstall agents ---
output="$(run_uninstall "$agents_home" --agents --no-input --quiet)"
assert_file_missing "$agents_home/.opencode/agents/megamind.md"
assert_file_missing "$agents_home/.agents"
assert_file_missing "$agents_home/.local/share/colin-dotfiles/manifest"

# --- Test uninstall --all and modified files ---
all_home="$TEST_ROOT/all-home"
mkdir -p "$all_home"
output="$(run_install "$all_home" --all --no-input --quiet)"

output="$(run_uninstall "$all_home" --all --dry-run --no-input --quiet)"
assert_contains "$output" "Files that would be removed ("

printf '\n# modified\n' >> "$all_home/.tmux.conf"
output="$(run_uninstall "$all_home" --all --no-input --quiet)"
assert_contains "$output" "Skipping file modified since installation: $all_home/.tmux.conf"
if [[ ! -f "$all_home/.tmux.conf" ]]; then
  printf 'Expected modified file to be skipped without --force\n' >&2
  exit 1
fi

output="$(run_uninstall "$all_home" --all --force --no-input --quiet)"
assert_file_missing "$all_home/.tmux.conf"
assert_file_missing "$all_home/.bashrc.colin"
assert_file_missing "$all_home/.opencode"
assert_file_missing "$all_home/.local/share/colin-dotfiles/manifest"

printf 'install.sh and uninstall.sh regression tests passed\n'
