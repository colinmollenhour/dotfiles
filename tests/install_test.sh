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

run_install() {
  local home="$1"
  shift
  HOME="$home" XDG_DATA_HOME="$home/.local/share" "$INSTALLER" "$@" 2>&1
}

home="$TEST_ROOT/dotfiles-home"
mkdir -p "$home"

output="$(run_install "$home" --dotfiles --no-input --dry-run --quiet)"
assert_contains "$output" "Files that would be written (12):"
assert_contains "$output" "Would create: 12"
assert_file_missing "$home/.bashrc.colin"
assert_file_missing "$home/.local/share/colin-dotfiles/manifest"

output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Files written (12):"
assert_contains "$output" "Created: 12"
assert_contains "$output" "Replaced: 0"

output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Files written (0):"
assert_contains "$output" "Unchanged (same hash and mtime): 12"
assert_contains "$output" "Replaced: 0"

touch -d '2035-01-01 00:00:00 UTC' "$home/.config/starship.toml"
output="$(run_install "$home" --dotfiles --no-input --quiet)"
assert_contains "$output" "Files written (1):"
assert_contains "$output" "$home/.config/starship.toml"
assert_contains "$output" "Unchanged (same hash and mtime): 11"
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
assert_contains "$output" "Unchanged (same hash and mtime): 11"
assert_contains "$output" "Replaced: 0"
assert_contains "$(<"$home/.config/starship.toml")" "# local customization"

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
assert_contains "$output" "Unchanged (same hash and mtime): 1"
if [[ "$(stat -c '%z' "$agents_home/.claude/settings.json.bak")" != "$backup_ctime" ]]; then
  printf 'Expected current settings backup not to be rewritten\n' >&2
  exit 1
fi

printf 'install.sh regression tests passed\n'
