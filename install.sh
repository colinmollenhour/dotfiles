#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="2026.07.15"

DOTFILES=(
  ".bashrc.colin"
  ".gitattributes.global"
  ".gitconfig.colin"
  ".gitignore.global"
  ".tmux.conf"
  ".vimrc"
  ".config/tmux/tmux-onedark-theme.tmux"
  ".config/starship.toml"
  ".config/docker-fzf.bash"
  ".config/delta/themes.gitconfig"
  ".config/tmux-powerline/config.sh"
  ".config/tmux-powerline/themes/colin.sh"
)

DO_DOTFILES=false
DO_BASHRC=false
DO_GITCONFIG=false
DO_AGENTS=false
DO_INTERACTIVE=false
DO_ALL=false
DRY_RUN=false
NO_INPUT=false
QUIET=false
WITH_OPUS=false
FORCE=false
CONFLICT_POLICY="ask"

MANIFEST_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/colin-dotfiles/manifest"
declare -A MANIFEST_HASH=()   # dest_abs → hash of dest at last install
declare -A MANIFEST_SRC=()    # dest_abs → src relative to SCRIPT_DIR
declare -A ACTIVE_DESTS=()    # dest_abs → 1 (visited this run)
declare -A UNCHANGED_DESTS=() # dest_abs → 1 (matching hash and mtime)
declare -A WRITTEN_DESTS=()   # dest_abs → created, replaced, or updated
declare -a WRITTEN_FILES=()
N_UNCHANGED=0
N_CREATED=0
N_REPLACED=0
N_UPDATED=0

cd "$SCRIPT_DIR"

# --- Colors (disabled when stderr is not a TTY or NO_COLOR is set) ---
if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
else
  C_RESET=''; C_BOLD=''; C_CYAN=''; C_GREEN=''; C_YELLOW=''
fi

log() {
  [[ "$QUIET" == true ]] && return
  printf '%s\n' "$*" >&2
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

die() {
  printf 'Error: %s\n\n' "$*" >&2
  printf 'Run `%s --help` for usage.\n' "$SCRIPT_NAME" >&2
  exit 1
}

section() {
  log "==> $*"
}

dry_run_msg() {
  log "Would $*"
}

ensure_repo_file() {
  local path="$1"
  [[ -e "$path" ]] || die "Required repository file is missing: $path"
}

# --- Manifest tracking ---

file_hash() {
  sha256sum "$1" 2>/dev/null | cut -d' ' -f1
}

same_hash() {
  local first="$1" second="$2"
  [[ -f "$first" && -f "$second" ]] || return 1
  [[ "$(file_hash "$first")" == "$(file_hash "$second")" ]]
}

file_mtime() {
  date -r "$1" '+%Y-%m-%d %H:%M:%S %z' 2>/dev/null || printf 'unknown'
}

file_mtime_key() {
  stat -c '%y' -- "$1" 2>/dev/null
}

same_hash_and_mtime() {
  local dest="$1" candidate="$2"
  local mtime_source="${3:-$candidate}"
  [[ -f "$mtime_source" ]] || return 1
  same_hash "$dest" "$candidate" || return 1
  [[ "$(file_mtime_key "$dest")" == "$(file_mtime_key "$mtime_source")" ]]
}

record_unchanged() {
  local path="$1"
  [[ -v WRITTEN_DESTS[$path] || -v UNCHANGED_DESTS[$path] ]] && return
  UNCHANGED_DESTS["$path"]=1
  N_UNCHANGED=$((N_UNCHANGED + 1))
}

record_written() {
  local path="$1" kind="$2"
  [[ -v WRITTEN_DESTS[$path] ]] && return

  if [[ -v UNCHANGED_DESTS[$path] ]]; then
    unset "UNCHANGED_DESTS[$path]"
    N_UNCHANGED=$((N_UNCHANGED - 1))
  fi

  WRITTEN_DESTS["$path"]="$kind"
  WRITTEN_FILES+=("$path")
  case "$kind" in
    created) N_CREATED=$((N_CREATED + 1)) ;;
    replaced) N_REPLACED=$((N_REPLACED + 1)) ;;
    updated) N_UPDATED=$((N_UPDATED + 1)) ;;
  esac
}

show_install_summary() {
  local path
  if [[ "$DRY_RUN" == true ]]; then
    printf '\nFiles that would be written (%d):\n' "${#WRITTEN_FILES[@]}" >&2
  else
    printf '\nFiles written (%d):\n' "${#WRITTEN_FILES[@]}" >&2
  fi
  if [[ ${#WRITTEN_FILES[@]} -eq 0 ]]; then
    printf '  None\n' >&2
  else
    for path in "${WRITTEN_FILES[@]}"; do
      printf '  %s\n' "$path" >&2
    done
  fi
  printf 'Unchanged (same hash and mtime): %d\n' "$N_UNCHANGED" >&2
  if [[ "$DRY_RUN" == true ]]; then
    printf 'Would replace: %d\n' "$N_REPLACED" >&2
    printf 'Would create: %d\n' "$N_CREATED" >&2
    printf 'Would update in place: %d\n' "$N_UPDATED" >&2
  else
    printf 'Replaced: %d\n' "$N_REPLACED" >&2
    printf 'Created: %d\n' "$N_CREATED" >&2
    printf 'Updated in place: %d\n' "$N_UPDATED" >&2
  fi
}

show_file_diff() {
  local dest="$1" candidate="$2"
  if [[ -z "$candidate" || ! -f "$candidate" ]]; then
    warn "No incoming file is available to diff against $dest"
    return
  fi

  if command -v diff >/dev/null 2>&1; then
    diff -u --label "$dest (existing)" --label "$dest (incoming)" "$dest" "$candidate" >&2 || true
  else
    warn "diff is not installed"
  fi
}

backup_existing_file() {
  local dest="$1" backup="$dest.bak" suffix=1
  while [[ -e "$backup" || -L "$backup" ]]; do
    backup="$dest.bak.$suffix"
    suffix=$((suffix + 1))
  done
  if ! cp -p -- "$dest" "$backup"; then
    warn "Could not back up $dest; existing file was left unchanged"
    return 1
  fi
  record_written "$backup" created
  log "Backed up $dest to $backup"
}

prompt_file_conflict() {
  local reason="$1" dest="$2" candidate="$3" incoming_mtime_source="$4"

  if [[ "$FORCE" == true || "$CONFLICT_POLICY" == "overwrite" ]]; then
    warn "Overwriting $reason: $dest"
    return 0
  fi
  if [[ "$CONFLICT_POLICY" == "keep" || "$NO_INPUT" == true || "$DRY_RUN" == true || ! -t 0 ]]; then
    warn "Skipping $reason: $dest"
    return 1
  fi

  printf '\nConflict: %s\n' "$dest" >&2
  printf '  Existing file: %s\n' "$(file_mtime "$dest")" >&2
  if [[ -n "$incoming_mtime_source" && -f "$incoming_mtime_source" ]]; then
    printf '  Repository source: %s\n' "$(file_mtime "$incoming_mtime_source")" >&2
  fi
  printf '  Reason: %s\n' "$reason" >&2

  local reply
  while true; do
    printf 'Choose [k]eep, [o]verwrite, [b]ack up and overwrite, [d]iff, keep [a]ll, overwrite a[l]l: ' >&2
    IFS= read -r reply || reply="k"
    case "$reply" in
      ''|k|K|keep)
        return 1
        ;;
      o|O|overwrite)
        return 0
        ;;
      b|B|backup)
        if backup_existing_file "$dest"; then
          return 0
        fi
        return 1
        ;;
      d|D|diff)
        show_file_diff "$dest" "$candidate"
        ;;
      a|A|keep-all)
        CONFLICT_POLICY="keep"
        return 1
        ;;
      l|L|overwrite-all)
        CONFLICT_POLICY="overwrite"
        return 0
        ;;
      *)
        warn "Enter k, o, b, d, a, or l"
        ;;
    esac
  done
}

load_manifest() {
  MANIFEST_HASH=()
  MANIFEST_SRC=()
  [[ -f "$MANIFEST_FILE" ]] || return 0
  local hash src dest
  while IFS=$'\t' read -r hash src dest; do
    [[ -n "$hash" && -n "$dest" ]] || continue
    MANIFEST_HASH["$dest"]="$hash"
    MANIFEST_SRC["$dest"]="$src"
  done < "$MANIFEST_FILE"
}

save_manifest() {
  [[ "$DRY_RUN" == true ]] && return
  mkdir -p "$(dirname "$MANIFEST_FILE")"
  local dest tmp
  tmp="$(mktemp "$(dirname "$MANIFEST_FILE")/manifest.XXXXXX")"
  for dest in "${!MANIFEST_HASH[@]}"; do
    printf '%s\t%s\t%s\n' "${MANIFEST_HASH[$dest]}" "${MANIFEST_SRC[$dest]:-}" "$dest"
  done > "$tmp"
  mv -f "$tmp" "$MANIFEST_FILE"
}

# Returns 0 if dest can be safely overwritten or the user approves it. Untracked
# existing files are treated as potentially manual unless they already match the
# incoming file. Interactive runs offer conflict actions; --no-input keeps the
# existing file and --force overwrites it.
can_overwrite() {
  local dest="$1"
  local candidate="${2:-}"
  local incoming_mtime_source="${3:-$candidate}"
  [[ -f "$dest" ]] || return 0
  local tracked="${MANIFEST_HASH[$dest]:-}"
  local current
  current="$(file_hash "$dest")"
  if [[ -z "$tracked" ]]; then
    if [[ -n "$candidate" && -f "$candidate" && "$current" == "$(file_hash "$candidate")" ]]; then
      return 0
    fi
    prompt_file_conflict "untracked existing file" "$dest" "$candidate" "$incoming_mtime_source"
    return
  fi
  [[ "$current" == "$tracked" ]] && return 0
  # If the user changed the file and later changed it back to match what this
  # install would write, it is no longer meaningfully modified. Allow the
  # install to proceed so the manifest hash is refreshed to the current repo
  # content and future runs stop warning about a stale tracked hash.
  if [[ -n "$candidate" && -f "$candidate" && "$current" == "$(file_hash "$candidate")" ]]; then
    return 0
  fi
  prompt_file_conflict "file modified since the last install" "$dest" "$candidate" "$incoming_mtime_source"
}

# Install src_abs → dest, recording src_rel in the manifest
install_file() {
  local src_rel="$1" src_abs="$2" dest="$3"
  local existed=false
  ACTIVE_DESTS["$dest"]=1
  if [[ "$DRY_RUN" == true ]]; then
    can_overwrite "$dest" "$src_abs" || return 0
    if same_hash_and_mtime "$dest" "$src_abs"; then
      record_unchanged "$dest"
    elif [[ -f "$dest" ]]; then
      record_written "$dest" replaced
      dry_run_msg "replace $dest from $src_rel"
    else
      record_written "$dest" created
      dry_run_msg "create $dest from $src_rel"
    fi
    return 0
  fi
  can_overwrite "$dest" "$src_abs" || return 0
  [[ -f "$dest" ]] && existed=true
  if [[ "$existed" == true ]] && same_hash_and_mtime "$dest" "$src_abs"; then
    MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
    MANIFEST_SRC["$dest"]="$src_rel"
    record_unchanged "$dest"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  cp -f -- "$src_abs" "$dest"
  touch -r "$src_abs" "$dest"
  MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
  MANIFEST_SRC["$dest"]="$src_rel"
  if [[ "$existed" == true ]]; then
    record_written "$dest" replaced
  else
    record_written "$dest" created
  fi
}

# Move a pre-rendered tmpfile → dest, recording src_rel in the manifest; always removes tmpfile
install_rendered() {
  local src_rel="$1" tmpfile="$2" dest="$3"
  local existed=false mtime_source="$SCRIPT_DIR/$src_rel"
  ACTIVE_DESTS["$dest"]=1
  if [[ "$DRY_RUN" == true ]]; then
    if can_overwrite "$dest" "$tmpfile" "$mtime_source"; then
      if same_hash_and_mtime "$dest" "$tmpfile" "$mtime_source"; then
        record_unchanged "$dest"
      elif [[ -f "$dest" ]]; then
        record_written "$dest" replaced
        dry_run_msg "replace $dest from rendered $src_rel"
      else
        record_written "$dest" created
        dry_run_msg "create $dest from rendered $src_rel"
      fi
    fi
    rm -f "$tmpfile"
    return 0
  fi
  if ! can_overwrite "$dest" "$tmpfile" "$SCRIPT_DIR/$src_rel"; then
    rm -f "$tmpfile"
    return 0
  fi
  [[ -f "$dest" ]] && existed=true
  if [[ "$existed" == true ]] && same_hash_and_mtime "$dest" "$tmpfile" "$mtime_source"; then
    rm -f "$tmpfile"
    MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
    MANIFEST_SRC["$dest"]="$src_rel"
    record_unchanged "$dest"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  mv -f "$tmpfile" "$dest"
  [[ -f "$mtime_source" ]] && touch -r "$mtime_source" "$dest"
  MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
  MANIFEST_SRC["$dest"]="$src_rel"
  if [[ "$existed" == true ]]; then
    record_written "$dest" replaced
  else
    record_written "$dest" created
  fi
}

# Merge a JSON settings file rather than overwriting it. The repo file is the
# baseline; the user's live file is layered on top with these rules:
#   - repo scalars win (the baseline is authoritative for keys it ships)
#   - the known permission/sandbox arrays are unioned, order-preserving, so
#     neither the repo's nor the user's entries are ever lost
#   - any key the user has that the repo does not ship (e.g. statusLine,
#     enabledPlugins) is preserved untouched
# Falls back to a plain install when jq is missing or the live file is
# absent/empty/invalid. The merge is non-destructive, so it runs unconditionally
# instead of going through can_overwrite (which would otherwise skip the file
# forever once the user's live copy diverges from the baseline).
merge_settings_json() {
  local src_rel="$1" src_abs="$2" dest="$3"
  local existed=false
  ACTIVE_DESTS["$dest"]=1
  [[ -f "$dest" ]] && existed=true

  if ! command -v jq >/dev/null 2>&1; then
    warn "jq not found; installing $src_rel without merge"
    install_file "$src_rel" "$src_abs" "$dest"
    return
  fi

  # No usable existing file → just install the baseline.
  if [[ ! -f "$dest" ]] || [[ "$(cat "$dest")" == "{}" ]] || ! jq -e . "$dest" >/dev/null 2>&1; then
    install_file "$src_rel" "$src_abs" "$dest"
    return
  fi

  local tmp
  tmp="$(mktemp)"
  if jq -s '
        def ou: reduce .[] as $x ([]; if any(.[]; . == $x) then . else . + [$x] end);
        .[0] as $repo | .[1] as $live |
        ($live * $repo)
        | (if ($repo.permissions.allow or $live.permissions.allow)
             then .permissions.allow = ((($repo.permissions.allow // []) + ($live.permissions.allow // [])) | ou) else . end)
        | (if ($repo.permissions.deny or $live.permissions.deny)
             then .permissions.deny = ((($repo.permissions.deny // []) + ($live.permissions.deny // [])) | ou) else . end)
        | (if ($repo.sandbox.excludedCommands or $live.sandbox.excludedCommands)
             then .sandbox.excludedCommands = ((($repo.sandbox.excludedCommands // []) + ($live.sandbox.excludedCommands // [])) | ou) else . end)
        | (if ($repo.sandbox.network.allowedDomains or $live.sandbox.network.allowedDomains)
             then .sandbox.network.allowedDomains = ((($repo.sandbox.network.allowedDomains // []) + ($live.sandbox.network.allowedDomains // [])) | ou) else . end)
      ' "$src_abs" "$dest" > "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      rm -f "$tmp"
      record_written "$dest" replaced
      dry_run_msg "merge $src_rel into $dest (repo scalars win, arrays unioned, your keys preserved)"
      return
    fi
    mv -f "$tmp" "$dest"
    MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
    MANIFEST_SRC["$dest"]="$src_rel"
    if [[ "$existed" == true ]]; then
      record_written "$dest" replaced
    else
      record_written "$dest" created
    fi
    log "Merged baseline $src_rel into $dest (your customizations preserved)"
  else
    rm -f "$tmp"
    warn "Failed to merge $src_rel into $dest; left existing file unchanged"
  fi
}

# If the user has no statusLine configured, point them at the simple-statusline
# plugin (this repo no longer ships a statusline of its own). Advisory only.
suggest_statusline_if_missing() {
  local claude_settings="$HOME/.claude/settings.json"
  command -v jq >/dev/null 2>&1 || return 0
  [[ -f "$claude_settings" ]] || return 0
  # Already configured? Nothing to suggest.
  jq -e '.statusLine != null' "$claude_settings" >/dev/null 2>&1 && return 0

  log ""
  log "${C_BOLD}${C_CYAN}╭─ No statusline configured in ~/.claude/settings.json${C_RESET}"
  log "${C_CYAN}│${C_RESET}  Install the ${C_BOLD}simple-statusline${C_RESET} plugin for a clean two-line statusline"
  log "${C_CYAN}│${C_RESET}  (model, git status, context usage, rate limits). In Claude Code run:"
  log "${C_CYAN}│${C_RESET}"
  log "${C_CYAN}│${C_RESET}    ${C_GREEN}/plugin marketplace add Postmodum37/simple-claude-code-statusline${C_RESET}"
  log "${C_CYAN}│${C_RESET}    ${C_GREEN}/plugin install simple-statusline${C_RESET}"
  log "${C_CYAN}│${C_RESET}    ${C_GREEN}/simple-statusline:setup${C_RESET}  ${C_YELLOW}(after restarting Claude Code)${C_RESET}"
  log "${C_CYAN}│${C_RESET}"
  log "${C_CYAN}╰─ Docs: https://github.com/Postmodum37/simple-claude-code-statusline#installation${C_RESET}"
}

# Recursively install all files under src_abs into dest_dir, tracking each in the manifest
install_dir_files() {
  local src_abs="$1" dest_dir="$2"
  local item base src_rel
  if [[ ! -d "$src_abs" ]]; then
    warn "Skipping missing directory: $src_abs"
    return
  fi
  shopt -s nullglob
  for item in "$src_abs"/*; do
    base="$(basename "$item")"
    if [[ -d "$item" ]]; then
      install_dir_files "$item" "$dest_dir/$base"
    elif [[ -f "$item" ]]; then
      src_rel="${item#$SCRIPT_DIR/}"
      install_file "$src_rel" "$item" "$dest_dir/$base"
    fi
  done
  shopt -u nullglob
}

# Delete installed files whose source was removed from the repo (if still unmodified)
cleanup_deleted() {
  local dest src_path current_hash n_removed=0 n_modified=0
  for dest in "${!MANIFEST_HASH[@]}"; do
    [[ -v ACTIVE_DESTS[$dest] ]] && continue
    src_path="${MANIFEST_SRC[$dest]:-}"
    [[ -n "$src_path" && -e "$SCRIPT_DIR/$src_path" ]] && continue  # source still exists
    if [[ ! -f "$dest" ]]; then
      unset "MANIFEST_HASH[$dest]" "MANIFEST_SRC[$dest]"
      continue
    fi
    current_hash="$(file_hash "$dest")"
    if [[ "$current_hash" == "${MANIFEST_HASH[$dest]}" ]]; then
      if [[ "$DRY_RUN" == true ]]; then
        dry_run_msg "delete $dest (source removed, file unmodified)"
      else
        rm -f "$dest"
        log "Deleted $dest (source removed from dotfiles)"
        unset "MANIFEST_HASH[$dest]" "MANIFEST_SRC[$dest]"
      fi
      n_removed=$((n_removed + 1))
    else
      warn "Not deleting manually modified orphan: $dest"
      warn "  Its source ($src_path) was removed from dotfiles. Delete manually if no longer needed."
      n_modified=$((n_modified + 1))
    fi
  done
  [[ $n_removed -gt 0 ]] && log "Deleted $n_removed orphaned file(s) whose sources were removed"
  [[ $n_modified -gt 0 ]] && warn "$n_modified orphaned file(s) skipped (manually modified)"
  return 0
}

# --- Copy helpers ---

copy_dir_contents() {
  local src="$1" dest="$2"
  if [[ ! -d "$src" ]]; then
    warn "Skipping missing directory: $src"
    return
  fi
  install_dir_files "$SCRIPT_DIR/$src" "$dest"
}

copy_agent_files() {
  local src="$1" dest="$2"
  local item base src_rel
  if [[ ! -d "$src" ]]; then
    warn "Skipping missing directory: $src"
    return
  fi
  shopt -s nullglob
  for item in "$src"/*; do
    base="$(basename "$item")"
    [[ "$WITH_OPUS" == false && "$base" == "colin-mbot-opus.md" ]] && continue
    src_rel="$item"  # already relative to SCRIPT_DIR
    install_file "$src_rel" "$SCRIPT_DIR/$item" "$dest/$base"
  done
  shopt -u nullglob
}

write_file() {
  local path="$1"
  local existed=false
  shift

  if [[ "$DRY_RUN" == true ]]; then
    if [[ -f "$path" ]]; then
      record_written "$path" replaced
    else
      record_written "$path" created
    fi
    dry_run_msg "write $path"
    return
  fi

  [[ -f "$path" ]] && existed=true
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$@" > "$path"
  if [[ "$existed" == true ]]; then
    record_written "$path" replaced
  else
    record_written "$path" created
  fi
}

append_file() {
  local path="$1"
  local existed=false
  shift

  if [[ "$DRY_RUN" == true ]]; then
    if [[ -f "$path" ]]; then
      record_written "$path" updated
    else
      record_written "$path" created
    fi
    dry_run_msg "append to $path"
    return
  fi

  [[ -f "$path" ]] && existed=true
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$@" >> "$path"
  if [[ "$existed" == true ]]; then
    record_written "$path" updated
  else
    record_written "$path" created
  fi
}

bashrc_sources_colin() {
  [[ -f "$HOME/.bashrc" ]] && grep -qF 'source ~/.bashrc.colin' "$HOME/.bashrc"
}

gitconfig_includes_colin() {
  [[ -f "$HOME/.gitconfig" ]] && grep -qF 'path = ~/.gitconfig.colin' "$HOME/.gitconfig"
}

show_help() {
  cat << EOF
Install Colin's dotfiles and non-skill AI agent files.

Skills, former slash-command workflows, and multi-agent procedures install via
the Vercel skills CLI or Claude plugin marketplace — not this script. See README.

USAGE
  $SCRIPT_NAME [OPTIONS]

EXAMPLES
  $SCRIPT_NAME --agents
  $SCRIPT_NAME --dotfiles --agents
  $SCRIPT_NAME --all
  $SCRIPT_NAME --dry-run --all
  $SCRIPT_NAME --interactive

  # Skills (separate from this script):
  npx skills add colinmollenhour/dotfiles -g --all

OPTIONS
  -a, --all          Install everything: dotfiles, shell/git hooks, and agents
      --dotfiles     Install dotfiles into \$HOME
      --bashrc       Update ~/.bashrc to source ~/.bashrc.colin
      --gitconfig    Update ~/.gitconfig to include ~/.gitconfig.colin
      --agents       Install agent definitions + Claude settings (not skills)
  -i, --interactive  Choose components interactively (default when run in a TTY)
  -n, --dry-run      Show what would change without writing files
  -f, --force        Overwrite conflicting files without prompting
      --with-opus    Include colin-mbot-opus.md when installing OpenCode agents (no to avoid accidental usage)
      --no-input     Disable prompts and keep conflicts; requires an install option
  -q, --quiet        Suppress progress messages (the final write summary remains)
  -h, --help         Show this help message
      --version      Show version and exit

--agents installs only what the skills CLI cannot:
  - Claude settings merge (~/.claude/settings.json)
  - MBOT persona agents (~/.claude/agents, ~/.opencode/agents)
  - Megamind agent (~/.claude/agents/megamind.md) for Claude Code and grok --agent megamind

DOTFILES
EOF
  printf '  %s\n' "${DOTFILES[@]}"
}

show_version() {
  printf '%s %s\n' "$SCRIPT_NAME" "$VERSION"
}

repo_head() {
  if command -v git >/dev/null 2>&1 && git rev-parse --verify HEAD >/dev/null 2>&1; then
    git rev-parse HEAD
  else
    printf 'unknown'
  fi
}

repo_date() {
  if command -v git >/dev/null 2>&1 && git rev-parse --verify HEAD >/dev/null 2>&1; then
    git show -s --format='%cD' HEAD
  else
    date -r "$SCRIPT_DIR/install.sh" '+%a, %d %b %Y %H:%M:%S %z'
  fi
}

install_dotfiles() {
  section "Installing dotfiles"

  local install_repo_head install_date dotfile src dest

  command -v envsubst >/dev/null 2>&1 || die "envsubst is required to install dotfiles. Install gettext and rerun this script."

  install_repo_head="$(repo_head)"
  install_date="$(repo_date)"

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "create $HOME/.config/tmux, $HOME/.config/tmux-powerline/themes, and $HOME/.config/delta"
  else
    mkdir -p "$HOME/.config/tmux" "$HOME/.config/tmux-powerline/themes" "$HOME/.config/delta"
  fi

  for dotfile in "${DOTFILES[@]}"; do
    src="$dotfile"
    dest="$HOME/$dotfile"
    ensure_repo_file "$src"
    log "Installing $dotfile"

    local tmp
    tmp="$(mktemp)"
    INSTALL_REPO_HEAD="$install_repo_head" INSTALL_DATE="$install_date" \
      envsubst '$INSTALL_REPO_HEAD:$INSTALL_DATE' < "$src" > "$tmp"
    install_rendered "$src" "$tmp" "$dest"
  done
}

update_bashrc() {
  section "Updating ~/.bashrc"

  local bashrc="$HOME/.bashrc"

  if bashrc_sources_colin; then
    log "~/.bashrc already sources ~/.bashrc.colin"
    return
  fi

  if [[ -f "$bashrc" ]] && grep -qF "# Colin's bashrc file" "$bashrc"; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "replace old $bashrc"
    else
      log "Replacing old ~/.bashrc"
      rm "$bashrc"
    fi
  fi

  if [[ ! -f "$bashrc" ]]; then
    write_file "$bashrc" \
      "#!/bin/bash" \
      "# The old \"Colin's bashrc file\" was moved to ~/.bashrc.colin" \
      ""
  fi

  append_file "$bashrc" \
    "" \
    "# Added by install.sh - comment this line to disable Colin's bash customizations." \
    "source ~/.bashrc.colin"

  if [[ "$DRY_RUN" == true ]]; then
    log "Would add ~/.bashrc.colin to ~/.bashrc"
  else
    log "Added ~/.bashrc.colin to ~/.bashrc"
  fi
}

update_gitconfig() {
  section "Updating ~/.gitconfig"

  local gitconfig="$HOME/.gitconfig"
  local tmp

  if gitconfig_includes_colin; then
    log "~/.gitconfig already includes ~/.gitconfig.colin"
    return
  fi

  if [[ -f "$gitconfig" ]] && grep -qF "# Colin's .gitconfig" "$gitconfig"; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "replace old $gitconfig while preserving user identity fields"
    else
      log "Replacing old ~/.gitconfig"
      tmp="$(mktemp)"
      grep '\[user\]\|\[github\]\|name = \|email =' "$gitconfig" | grep -v -- '-name' | head -n 5 > "$tmp" || true
      rm "$gitconfig"
      write_file "$gitconfig" "# The old \"Colin's .gitconfig file\" was moved to ~/.gitconfig.colin"
      cat "$tmp" >> "$gitconfig"
      rm "$tmp"
    fi
  elif [[ ! -f "$gitconfig" ]]; then
    write_file "$gitconfig" "# Created by install.sh"
  fi

  append_file "$gitconfig" \
    "" \
    "# Include Colin's .gitconfig.colin so customizations here do not get clobbered by future updates." \
    "[include]" \
    "    path = ~/.gitconfig.colin"

  if [[ "$DRY_RUN" == true ]]; then
    log "Would add ~/.gitconfig.colin to ~/.gitconfig"
  else
    log "Added ~/.gitconfig.colin to ~/.gitconfig"
  fi
}

# Resolve a path that may be a symlink (for plugin agent files that point at skills).
resolve_src() {
  local path="$1"
  if command -v realpath >/dev/null 2>&1; then
    realpath -e "$path" 2>/dev/null || realpath "$path" 2>/dev/null || printf '%s' "$path"
  elif command -v readlink >/dev/null 2>&1; then
    readlink -f "$path" 2>/dev/null || printf '%s' "$path"
  else
    printf '%s' "$path"
  fi
}

install_agent_file() {
  # src_rel is the repo-relative path used for manifest tracking (the agent path).
  # Content is read through symlinks so megamind.md → SKILL.md installs as a real file.
  local src_rel="$1"
  local dest="$2"
  local src_abs resolved
  src_abs="$SCRIPT_DIR/$src_rel"
  ensure_repo_file "$src_rel"
  resolved="$(resolve_src "$src_abs")"
  install_file "$src_rel" "$resolved" "$dest"
}

cleanup_legacy_skill_and_command_mirrors() {
  # Skills and former slash commands are no longer installed by this script.
  # Offer to remove old mirrored paths that previous installs created.
  local legacy_dirs=(
    "$HOME/.agents/skills/colin"
    "$HOME/.claude/commands/colin"
    "$HOME/.opencode/commands/colin"
  )
  local existing=() dir

  for dir in "${legacy_dirs[@]}"; do
    [[ -e "$dir" ]] && existing+=("$dir")
  done

  [[ ${#existing[@]} -gt 0 ]] || return 0

  if [[ "$DO_ALL" == true && "$FORCE" == true ]]; then
    :
  elif ! prompt_yes_no "Remove old namespaced agent/command directories (${existing[*]})"; then
    warn "Skipping old namespaced agent/command directories. Re-run with --all --force to remove automatically."
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    for dir in "${existing[@]}"; do
      dry_run_msg "remove legacy namespaced directory $dir"
    done
    return 0
  fi

  rm -rf -- "${existing[@]}"
  log "Removed old namespaced agent/command directories"
}

install_agents() {
  section "Installing agent definitions and Claude settings"
  log "Skills are not installed here. Use: npx skills add colinmollenhour/dotfiles -g --all"

  local claude_settings="$HOME/.claude/settings.json"
  local megamind_agent="plugins/megamind/agents/megamind.md"

  if [[ -f "$claude_settings" ]] && [[ "$(cat "$claude_settings")" != "{}" ]]; then
    local backup_existed=false
    [[ -f "$claude_settings.bak" ]] && backup_existed=true
    if same_hash "$claude_settings" "$claude_settings.bak"; then
      if same_hash_and_mtime "$claude_settings.bak" "$claude_settings"; then
        record_unchanged "$claude_settings.bak"
      fi
      log "Backup already current: $claude_settings.bak"
    elif [[ "$DRY_RUN" == true ]]; then
      if [[ "$backup_existed" == true ]]; then
        record_written "$claude_settings.bak" replaced
      else
        record_written "$claude_settings.bak" created
      fi
      dry_run_msg "back up $claude_settings to $claude_settings.bak"
    else
      cp -p "$claude_settings" "$claude_settings.bak"
      if [[ "$backup_existed" == true ]]; then
        record_written "$claude_settings.bak" replaced
      else
        record_written "$claude_settings.bak" created
      fi
      log "Backed up ~/.claude/settings.json to ~/.claude/settings.json.bak"
    fi
  fi

  # settings.json is merged (not overwritten) so any statusLine set by the
  # simple-statusline plugin is preserved. Configure the statusline with
  # `/simple-statusline:setup` (see
  # https://github.com/Postmodum37/simple-claude-code-statusline).
  if [[ -f ".claude/settings.json" ]]; then
    merge_settings_json ".claude/settings.json" "$SCRIPT_DIR/.claude/settings.json" "$HOME/.claude/settings.json"
  fi
  if [[ -f ".claude/settings.local.json" ]]; then
    merge_settings_json ".claude/settings.local.json" "$SCRIPT_DIR/.claude/settings.local.json" "$HOME/.claude/settings.local.json"
  fi

  # MBOT persona agents for Claude Code (and hosts that read ~/.claude/agents,
  # including grok --agent <name>).
  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "create $HOME/.claude/agents"
  else
    mkdir -p "$HOME/.claude/agents"
  fi
  copy_agent_files ".claude/agents" "$HOME/.claude/agents"
  install_agent_file "$megamind_agent" "$HOME/.claude/agents/megamind.md"

  # OpenCode agents: full MBOT persona set + megamind
  if [[ -d "$HOME/.config/opencode/command/colin" ]] || [[ -d "$HOME/.config/opencode/agent" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "remove legacy OpenCode directories under $HOME/.config/opencode"
    else
      rm -rf "$HOME/.config/opencode/command" "$HOME/.config/opencode/skill" "$HOME/.config/opencode/agent"
      log "Removed legacy OpenCode directories from ~/.config/opencode"
    fi
  fi

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "create $HOME/.opencode/agents"
  else
    mkdir -p "$HOME/.opencode/agents"
  fi
  copy_agent_files ".opencode/agents" "$HOME/.opencode/agents"
  install_agent_file "$megamind_agent" "$HOME/.opencode/agents/megamind.md"

  cleanup_legacy_skill_and_command_mirrors

  if [[ "$DRY_RUN" == true ]]; then
    log "Would install agent definitions to ~/.claude/agents and ~/.opencode/agents"
  else
    log "Installed agent definitions to ~/.claude/agents and ~/.opencode/agents"
  fi

  suggest_statusline_if_missing
  log ""
  log "Install skills separately (all plugins / all agents):"
  log "  npx skills add colinmollenhour/dotfiles -g --all"
  log "Claude plugin marketplace (optional):"
  log "  /plugin marketplace add colinmollenhour/dotfiles"
  log "  /plugin install colin-shipping@colin-dotfiles"
  log "  /plugin install megamind@colin-dotfiles"
}

prompt_yes_no() {
  local prompt="$1"

  if [[ "$NO_INPUT" == true || ! -t 0 ]]; then
    return 1
  fi

  local reply
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

interactive_install() {
  [[ "$NO_INPUT" == false ]] || die "--interactive cannot be used with --no-input"
  [[ -t 0 ]] || die "--interactive requires a TTY. Use --all or component flags for non-interactive installs."

  section "Interactive installation"

  if prompt_yes_no "Install dotfiles"; then
    install_dotfiles
  fi

  if bashrc_sources_colin; then
    log "~/.bashrc already sources ~/.bashrc.colin"
  elif prompt_yes_no "Update ~/.bashrc to source ~/.bashrc.colin"; then
    update_bashrc
  fi

  if gitconfig_includes_colin; then
    log "~/.gitconfig already includes ~/.gitconfig.colin"
  elif prompt_yes_no "Update ~/.gitconfig to include ~/.gitconfig.colin"; then
    update_gitconfig
  fi

  if prompt_yes_no "Install agent definitions and Claude settings (not skills — use npx skills for those)"; then
    install_agents
  fi
}

parse_args() {
  if [[ $# -eq 0 ]]; then
    if [[ -t 0 && "$NO_INPUT" == false ]]; then
      DO_INTERACTIVE=true
    else
      show_help >&2
      exit 2
    fi
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        show_help
        exit 0
        ;;
      --version)
        show_version
        exit 0
        ;;
      -a|--all)
        DO_ALL=true
        shift
        ;;
      --dotfiles)
        DO_DOTFILES=true
        shift
        ;;
      --bashrc)
        DO_BASHRC=true
        shift
        ;;
      --gitconfig)
        DO_GITCONFIG=true
        shift
        ;;
      --agents)
        DO_AGENTS=true
        shift
        ;;
      --with-opus)
        WITH_OPUS=true
        shift
        ;;
      -i|--interactive)
        DO_INTERACTIVE=true
        shift
        ;;
      -n|--dry-run)
        DRY_RUN=true
        shift
        ;;
      -f|--force)
        FORCE=true
        shift
        ;;
      --no-input)
        NO_INPUT=true
        shift
        ;;
      -q|--quiet)
        QUIET=true
        shift
        ;;
      --)
        shift
        [[ $# -eq 0 ]] || die "Unexpected positional argument: $1"
        ;;
      -*)
        die "Unknown option: $1"
        ;;
      *)
        die "Unexpected positional argument: $1"
        ;;
    esac
  done
}

run_install() {
  local ran=false

  if [[ "$DO_INTERACTIVE" == true ]]; then
    interactive_install
    return
  fi

  if [[ "$DO_ALL" == true ]]; then
    DO_DOTFILES=true
    DO_BASHRC=true
    DO_GITCONFIG=true
    DO_AGENTS=true
  fi

  if [[ "$DO_DOTFILES" == true ]]; then
    install_dotfiles
    ran=true
  fi

  if [[ "$DO_BASHRC" == true ]]; then
    update_bashrc
    ran=true
  fi

  if [[ "$DO_GITCONFIG" == true ]]; then
    update_gitconfig
    ran=true
  fi

  if [[ "$DO_AGENTS" == true ]]; then
    install_agents
    ran=true
  fi

  [[ "$ran" == true ]] || die "No install target selected"
}

main() {
  parse_args "$@"
  load_manifest
  run_install
  cleanup_deleted
  save_manifest

  if [[ "$DRY_RUN" == true ]]; then
    show_install_summary
    log "Dry run complete. No files were changed."
  else
    show_install_summary
    log "Installation complete."
  fi
}

main "$@"
