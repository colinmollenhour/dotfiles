#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="2026.07.11"

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

file_mtime() {
  date -r "$1" '+%Y-%m-%d %H:%M:%S %z' 2>/dev/null || printf 'unknown'
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
  ACTIVE_DESTS["$dest"]=1
  if [[ "$DRY_RUN" == true ]]; then
    can_overwrite "$dest" "$src_abs" && dry_run_msg "install $src_rel → $dest"
    return 0
  fi
  can_overwrite "$dest" "$src_abs" || return 0
  mkdir -p "$(dirname "$dest")"
  cp -f -- "$src_abs" "$dest"
  touch -r "$src_abs" "$dest"
  MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
  MANIFEST_SRC["$dest"]="$src_rel"
}

# Move a pre-rendered tmpfile → dest, recording src_rel in the manifest; always removes tmpfile
install_rendered() {
  local src_rel="$1" tmpfile="$2" dest="$3"
  ACTIVE_DESTS["$dest"]=1
  if [[ "$DRY_RUN" == true ]]; then
    can_overwrite "$dest" "$tmpfile" "$SCRIPT_DIR/$src_rel" && dry_run_msg "render $src_rel → $dest"
    [[ -n "$tmpfile" ]] && rm -f "$tmpfile"
    return 0
  fi
  if ! can_overwrite "$dest" "$tmpfile" "$SCRIPT_DIR/$src_rel"; then
    rm -f "$tmpfile"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  mv -f "$tmpfile" "$dest"
  [[ -f "$SCRIPT_DIR/$src_rel" ]] && touch -r "$SCRIPT_DIR/$src_rel" "$dest"
  MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
  MANIFEST_SRC["$dest"]="$src_rel"
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
  ACTIVE_DESTS["$dest"]=1

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

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "merge $src_rel into $dest (repo scalars win, arrays unioned, your keys preserved)"
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
    mv -f "$tmp" "$dest"
    MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
    MANIFEST_SRC["$dest"]="$src_rel"
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

copy_claude_home() {
  local src=".claude" dest="$HOME/.claude"
  local item base
  if [[ ! -d "$src" ]]; then
    warn "Skipping missing directory: $src"
    return
  fi
  shopt -s nullglob
  for item in "$src"/*; do
    base="$(basename "$item")"
    [[ "$base" == "worktrees" ]] && continue
    if [[ "$base" == "agents" ]]; then
      copy_agent_files "$item" "$dest/agents"
    elif [[ -d "$item" ]]; then
      install_dir_files "$SCRIPT_DIR/$item" "$dest/$base"
    elif [[ -f "$item" ]]; then
      if [[ "$base" == "settings.json" || "$base" == "settings.local.json" ]]; then
        merge_settings_json "$item" "$SCRIPT_DIR/$item" "$dest/$base"
      else
        install_file "$item" "$SCRIPT_DIR/$item" "$dest/$base"
      fi
    fi
  done
  shopt -u nullglob
}

write_file() {
  local path="$1"
  shift

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "write $path"
    return
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$@" > "$path"
}

append_file() {
  local path="$1"
  shift

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "append to $path"
    return
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$@" >> "$path"
}

bashrc_sources_colin() {
  [[ -f "$HOME/.bashrc" ]] && grep -qF 'source ~/.bashrc.colin' "$HOME/.bashrc"
}

gitconfig_includes_colin() {
  [[ -f "$HOME/.gitconfig" ]] && grep -qF 'path = ~/.gitconfig.colin' "$HOME/.gitconfig"
}

show_help() {
  cat << EOF
Install Colin's dotfiles and AI agent configuration.

USAGE
  $SCRIPT_NAME [OPTIONS]

EXAMPLES
  $SCRIPT_NAME --agents
  $SCRIPT_NAME --dotfiles --agents
  $SCRIPT_NAME --all
  $SCRIPT_NAME --dry-run --all
  $SCRIPT_NAME --interactive

OPTIONS
  -a, --all          Install everything: dotfiles, shell/git hooks, and agents
      --dotfiles     Install dotfiles into \$HOME
      --bashrc       Update ~/.bashrc to source ~/.bashrc.colin
      --gitconfig    Update ~/.gitconfig to include ~/.gitconfig.colin
      --agents       Install Claude, OpenCode, Gemini, and OpenAI agent files
  -i, --interactive  Choose components interactively (default when run in a TTY)
  -n, --dry-run      Show what would change without writing files
  -f, --force        Overwrite conflicting files without prompting
      --with-opus    Include colin-mbot-opus.md when installing OpenCode agents (no to avoid accidental usage)
      --no-input     Disable prompts and keep conflicts; requires an install option
  -q, --quiet        Print only warnings and errors
  -h, --help         Show this help message
      --version      Show version and exit

CONFLICTS
  In a TTY, choose per file: keep, overwrite, back up, show a diff, keep all,
  or overwrite all. Non-interactive runs keep conflicts unless --force is used.

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

install_dotfiles() {
  section "Installing dotfiles"

  local install_repo_head install_date dotfile src dest

  if [[ "$DRY_RUN" == false ]]; then
    command -v envsubst >/dev/null 2>&1 || die "envsubst is required to install dotfiles. Install gettext and rerun this script."
  fi

  install_repo_head="$(repo_head)"
  install_date="$(date)"

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

    if [[ "$DRY_RUN" == true ]]; then
      ACTIVE_DESTS["$dest"]=1
      can_overwrite "$dest" && dry_run_msg "render $src → $dest"
    else
      local tmp
      tmp="$(mktemp)"
      INSTALL_REPO_HEAD="$install_repo_head" INSTALL_DATE="$install_date" \
        envsubst '$INSTALL_REPO_HEAD:$INSTALL_DATE' < "$src" > "$tmp"
      install_rendered "$src" "$tmp" "$dest"
    fi
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

install_command_skills() {
  local commands_dir=".claude/commands"
  local skills_dir="${1:-$HOME/.agents/skills}"
  local label="${2:-Claude command skills}"
  local include_openai_yaml="${3:-true}"
  local command_file rel command_path command_name command_subdir command_namespace skill_name skill_dir
  local count=0

  if [[ ! -d "$commands_dir" ]]; then
    warn "Skipping command skills; no $commands_dir directory exists"
    return
  fi

  while IFS= read -r command_file; do
    rel="${command_file#$commands_dir/}"
    command_path="${rel%.md}"
    command_name="$(basename "$command_path")"
    command_subdir="$(dirname "$command_path")"

    if [[ "$command_subdir" == "." ]]; then
      skill_name="$command_name"
      skill_dir="$skills_dir/$command_name"
    else
      command_namespace="${command_subdir//\//:}"
      skill_name="$command_namespace:$command_name"
      skill_dir="$skills_dir/$command_subdir/$command_name"
    fi

    count=$((count + 1))

    local skill_md="$skill_dir/SKILL.md"
    local openai_yaml="$skill_dir/agents/openai.yaml"

    if [[ "$DRY_RUN" == true ]]; then
      ACTIVE_DESTS["$skill_md"]=1
      [[ "$include_openai_yaml" == true ]] && ACTIVE_DESTS["$openai_yaml"]=1
      can_overwrite "$skill_md" && dry_run_msg "generate command skill $skill_name in $skill_dir"
      continue
    fi

    if [[ "$include_openai_yaml" == true ]]; then
      mkdir -p "$skill_dir/agents"
    else
      mkdir -p "$skill_dir"
    fi
    local tmp
    tmp="$(mktemp)"
    awk -v skill_name="$skill_name" '
      BEGIN { frontmatter = 0; inserted = 0 }
      NR == 1 && $0 == "---" {
        print
        print "name: " skill_name
        frontmatter = 1
        inserted = 1
        next
      }
      frontmatter && $0 == "---" {
        print
        frontmatter = 0
        next
      }
      frontmatter && ($0 ~ /^name:[[:space:]]*/ || $0 ~ /^allowed-tools:[[:space:]]*/) {
        next
      }
      !inserted {
        print "---"
        print "name: " skill_name
        print "---"
        inserted = 1
      }
      { print }
    ' "$command_file" > "$tmp"
    install_rendered "$command_file" "$tmp" "$skill_md"
    if [[ "$include_openai_yaml" == true ]]; then
      # openai.yaml is always the same two lines, but still goes through the
      # conflict checks so local changes are never overwritten silently.
      tmp="$(mktemp)"
      printf 'policy:\n  allow_implicit_invocation: false\n' > "$tmp"
      install_rendered "$command_file" "$tmp" "$openai_yaml"
    fi
  done < <(find "$commands_dir" -type f -name '*.md' | sort)

  if [[ "$DRY_RUN" == true ]]; then
    log "Would install $count $label in $skills_dir"
  else
    log "Installed $count $label in $skills_dir"
  fi
}

cleanup_legacy_namespaced_agent_dirs() {
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
  section "Installing AI agent files"

  local claude_settings="$HOME/.claude/settings.json"

  if [[ -f "$claude_settings" ]] && [[ "$(cat "$claude_settings")" != "{}" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "back up $claude_settings to $claude_settings.bak"
    else
      cp "$claude_settings" "$claude_settings.bak"
      log "Backed up ~/.claude/settings.json to ~/.claude/settings.json.bak"
    fi
  fi

  # settings.json is merged (not overwritten) by copy_claude_home so any
  # statusLine set by the simple-statusline plugin is preserved. Configure the
  # statusline itself with `/simple-statusline:setup` (see
  # https://github.com/Postmodum37/simple-claude-code-statusline).
  copy_claude_home

  if [[ -d "$HOME/.config/opencode/command/colin" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "remove legacy OpenCode directories under $HOME/.config/opencode"
    else
      rm -rf "$HOME/.config/opencode/command" "$HOME/.config/opencode/skill" "$HOME/.config/opencode/agent"
      log "Removed legacy OpenCode directories from ~/.config/opencode"
    fi
  fi

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "create $HOME/.opencode/{commands,agents} and $HOME/.agents/skills"
  else
    mkdir -p "$HOME/.opencode/commands" "$HOME/.opencode/agents" "$HOME/.agents/skills"
  fi

  copy_dir_contents ".claude/commands" "$HOME/.opencode/commands"
  copy_dir_contents ".claude/skills" "$HOME/.agents/skills"
  install_command_skills "$HOME/.agents/skills" "Claude command skills" true
  cleanup_legacy_namespaced_agent_dirs
  copy_agent_files ".opencode/agents" "$HOME/.opencode/agents"
  install_file ".claude/agents/megamind.md" "$SCRIPT_DIR/.claude/agents/megamind.md" "$HOME/.opencode/agents/megamind.md"

  # Migrate gemini to antigravity "agy" cli
  if [[ -d "$HOME/.gemini/antigravity/skills" && ! -d "$HOME/.gemini/antigravity-cli/skills" ]]; then
    mkdir -p $HOME/.gemini/antigravity-cli
    mv "$HOME/.gemini/antigravity/skills" "$HOME/.gemini/antigravity-cli/skills"
  fi
    
  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "create $HOME/.gemini/antigravity-cli/skills"
  else
    mkdir -p "$HOME/.gemini/antigravity-cli/skills"
  fi
  copy_dir_contents ".claude/skills" "$HOME/.gemini/antigravity-cli/skills"
  install_command_skills "$HOME/.gemini/antigravity-cli/skills" "Claude command skills as agy skills" false

  if [[ "$DRY_RUN" == true ]]; then
    log "Would install agents and skills to ~/.agents, ~/.claude, ~/.opencode, and ~/.gemini/antigravity-cli"
  else
    log "Installed agents and skills to ~/.agents, ~/.claude, ~/.opencode, and ~/.gemini/antigravity-cli"
  fi

  suggest_statusline_if_missing
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

  if prompt_yes_no "Install Claude/OpenCode/Gemini/OpenAI agent files"; then
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
    log ""
    log "Dry run complete. No files were changed."
  else
    log ""
    log "Installation complete."
  fi
}

main "$@"
