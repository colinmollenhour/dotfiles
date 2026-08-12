#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="2026.07.14"

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
  ".paseo/orchestration-preferences.json"
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
FORCE=false
CONFLICT_POLICY="ask"

MANIFEST_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/colin-dotfiles/manifest"
declare -A MANIFEST_HASH=()   # dest_abs → hash of dest at last install
declare -A MANIFEST_SRC=()    # dest_abs → src relative to SCRIPT_DIR
declare -a REMOVED_FILES=()
declare -a SKIPPED_FILES=()

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

file_hash() {
  sha256sum "$1" 2>/dev/null | cut -d' ' -f1
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
  if [[ ${#MANIFEST_HASH[@]} -eq 0 ]]; then
    rm -f "$MANIFEST_FILE"
    rmdir "$(dirname "$MANIFEST_FILE")" 2>/dev/null || true
    return 0
  fi
  mkdir -p "$(dirname "$MANIFEST_FILE")"
  local dest tmp
  tmp="$(mktemp "$(dirname "$MANIFEST_FILE")/manifest.XXXXXX")"
  for dest in "${!MANIFEST_HASH[@]}"; do
    printf '%s\t%s\t%s\n' "${MANIFEST_HASH[$dest]}" "${MANIFEST_SRC[$dest]:-}" "$dest"
  done > "$tmp"
  mv -f "$tmp" "$MANIFEST_FILE"
}

prompt_file_uninstall() {
  local dest="$1"
  if [[ "$FORCE" == true || "$CONFLICT_POLICY" == "overwrite" ]]; then
    return 0
  fi
  if [[ "$CONFLICT_POLICY" == "keep" || "$NO_INPUT" == true || "$DRY_RUN" == true || ! -t 0 ]]; then
    warn "Skipping file modified since installation: $dest"
    return 1
  fi

  printf '\nConflict: %s has been modified since installation\n' "$dest" >&2
  local reply
  while true; do
    printf 'Choose [r]emove, [k]eep, remove [a]ll, keep [l]l: ' >&2
    IFS= read -r reply || reply="k"
    case "$reply" in
      ''|k|K|keep)
        return 1
        ;;
      r|R|remove)
        return 0
        ;;
      a|A|remove-all)
        CONFLICT_POLICY="overwrite"
        return 0
        ;;
      l|L|keep-all)
        CONFLICT_POLICY="keep"
        return 1
        ;;
      *)
        warn "Enter r, k, a, or l"
        ;;
    esac
  done
}

is_dotfile_dest() {
  local dest="$1" src="${2:-}" df
  for df in "${DOTFILES[@]}"; do
    if [[ "$dest" == "$HOME/$df" || "$src" == "$df" ]]; then
      return 0
    fi
  done
  return 1
}

is_agent_dest() {
  local dest="$1" src="${2:-}"
  if [[ "$dest" == "$HOME/.claude"* || "$dest" == "$HOME/.opencode"* || "$dest" == "$HOME/.grok"* || "$dest" == "$HOME/.agents"* ]]; then
    return 0
  fi
  if [[ "$src" == ".claude"* || "$src" == ".opencode"* || "$src" == ".grok"* || "$src" == ".agents"* ]]; then
    return 0
  fi
  return 1
}

should_uninstall_dest() {
  local dest="$1" src="${2:-}"
  if [[ "$DO_ALL" == true ]]; then
    return 0
  fi
  if [[ "$DO_DOTFILES" == true ]] && is_dotfile_dest "$dest" "$src"; then
    return 0
  fi
  if [[ "$DO_BASHRC" == true && ("$dest" == "$HOME/.bashrc.colin" || "$src" == ".bashrc.colin") ]]; then
    return 0
  fi
  if [[ "$DO_GITCONFIG" == true && ("$dest" == "$HOME/.gitconfig.colin" || "$src" == ".gitconfig.colin") ]]; then
    return 0
  fi
  if [[ "$DO_AGENTS" == true ]] && is_agent_dest "$dest" "$src"; then
    return 0
  fi
  return 1
}

uninstall_single_file() {
  local dest="$1" src="${2:-}"
  [[ -e "$dest" || -L "$dest" ]] || {
    unset "MANIFEST_HASH[$dest]" "MANIFEST_SRC[$dest]"
    return 0
  }

  local tracked="${MANIFEST_HASH[$dest]:-}"
  local current
  current="$(file_hash "$dest")"
  local is_modified=false

  if [[ -n "$tracked" && "$current" != "$tracked" ]]; then
    is_modified=true
  fi

  if [[ "$is_modified" == true ]]; then
    if ! prompt_file_uninstall "$dest"; then
      SKIPPED_FILES+=("$dest")
      return 0
    fi
  fi

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "remove $dest"
    REMOVED_FILES+=("$dest")
    return 0
  fi

  rm -f -- "$dest"
  unset "MANIFEST_HASH[$dest]" "MANIFEST_SRC[$dest]"
  REMOVED_FILES+=("$dest")
  log "Removed $dest"
}

revert_bashrc() {
  section "Reverting ~/.bashrc"
  local bashrc="$HOME/.bashrc"
  [[ -f "$bashrc" ]] || return 0

  if ! grep -qF 'source ~/.bashrc.colin' "$bashrc" && ! grep -qF '# Added by install.sh' "$bashrc"; then
    log "~/.bashrc does not contain Colin's bash customizations"
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "remove Colin's bash customizations from ~/.bashrc"
    return 0
  fi

  local tmp
  tmp="$(mktemp)"
  grep -v -E "(# Added by install\.sh|source ~/.bashrc\.colin)" "$bashrc" > "$tmp" || true

  local content
  content="$(sed -e '/^[[:space:]]*$/d' -e '/Colin.*bashrc/d' -e '/^#!\/bin\/bash/d' "$tmp")"

  if [[ -z "$content" ]]; then
    rm -f "$bashrc"
    log "Removed ~/.bashrc (was created by install.sh)"
  else
    mv -f "$tmp" "$bashrc"
    log "Removed Colin's bash customizations from ~/.bashrc"
  fi
  rm -f "$tmp" 2>/dev/null || true
}

revert_gitconfig() {
  section "Reverting ~/.gitconfig"
  local gitconfig="$HOME/.gitconfig"
  [[ -f "$gitconfig" ]] || return 0

  if ! grep -qF 'path = ~/.gitconfig.colin' "$gitconfig"; then
    log "~/.gitconfig does not include ~/.gitconfig.colin"
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "remove Colin's gitconfig customizations from ~/.gitconfig"
    return 0
  fi

  local tmp
  tmp="$(mktemp)"
  awk '
    /# Include Colin.*\.gitconfig\.colin/ { next }
    /\[include\]/ {
      getline next_line
      if (next_line ~ /path = ~?\/\.gitconfig\.colin/) {
        next
      } else {
        print $0
        print next_line
        next
      }
    }
    { print }
  ' "$gitconfig" > "$tmp"

  local content
  content="$(sed -e '/^[[:space:]]*$/d' -e '/^# Created by install.sh/d' "$tmp")"

  if [[ -z "$content" ]]; then
    rm -f "$gitconfig"
    log "Removed ~/.gitconfig (was created by install.sh)"
  else
    mv -f "$tmp" "$gitconfig"
    log "Removed Colin's gitconfig customizations from ~/.gitconfig"
  fi
  rm -f "$tmp" 2>/dev/null || true
}

uninstall_agents_extras() {
  section "Reverting AI agent configurations"

  local claude_settings="$HOME/.claude/settings.json"
  if [[ -f "$claude_settings.bak" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "restore $claude_settings from $claude_settings.bak"
    else
      mv -f "$claude_settings.bak" "$claude_settings"
      log "Restored ~/.claude/settings.json from backup"
    fi
  fi

  if command -v omp >/dev/null 2>&1; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "omp uninstall pi-megamind"
    else
      omp uninstall pi-megamind >/dev/null 2>&1 || true
    fi
  fi

  if command -v pi >/dev/null 2>&1; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "pi uninstall pi-megamind"
    else
      pi uninstall pi-megamind >/dev/null 2>&1 || true
    fi
  fi
}

cleanup_empty_dirs() {
  local dirs=(
    "$HOME/.config/tmux-powerline/themes"
    "$HOME/.config/tmux-powerline"
    "$HOME/.config/tmux"
    "$HOME/.config/delta"
    "$HOME/.opencode/commands"
    "$HOME/.opencode/agents"
    "$HOME/.opencode"
    "$HOME/.grok/agents"
    "$HOME/.grok"
    "$HOME/.agents/skills"
    "$HOME/.agents"
    "$HOME/.claude/agents"
    "$HOME/.claude/commands"
    "$HOME/.claude/skills"
    "$HOME/.claude"
    "${XDG_DATA_HOME:-$HOME/.local/share}/colin-dotfiles"
  )
  local dir
  for dir in "${dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    if [[ "$DRY_RUN" == true ]]; then
      if [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
        dry_run_msg "remove empty directory $dir"
      fi
    else
      rmdir "$dir" 2>/dev/null || true
    fi
  done
}

show_uninstall_summary() {
  local path
  if [[ "$DRY_RUN" == true ]]; then
    printf '\nFiles that would be removed (%d):\n' "${#REMOVED_FILES[@]}" >&2
  else
    printf '\nFiles removed (%d):\n' "${#REMOVED_FILES[@]}" >&2
  fi
  if [[ ${#REMOVED_FILES[@]} -eq 0 ]]; then
    printf '  None\n' >&2
  else
    for path in "${REMOVED_FILES[@]}"; do
      printf '  %s\n' "$path" >&2
    done
  fi
  printf 'Skipped (modified or kept): %d\n' "${#SKIPPED_FILES[@]}" >&2
}

show_help() {
  cat << EOF
Uninstall Colin's dotfiles and AI agent configuration.

USAGE
  $SCRIPT_NAME [OPTIONS]

EXAMPLES
  $SCRIPT_NAME --agents
  $SCRIPT_NAME --dotfiles --agents
  $SCRIPT_NAME --all
  $SCRIPT_NAME --dry-run --all
  $SCRIPT_NAME --interactive

OPTIONS
  -a, --all          Uninstall everything: dotfiles, shell/git hooks, and agents
      --dotfiles     Uninstall dotfiles from \$HOME
      --bashrc       Remove ~/.bashrc.colin include from ~/.bashrc
      --gitconfig    Remove ~/.gitconfig.colin include from ~/.gitconfig
      --agents       Uninstall Claude, OpenCode, Gemini, and OpenAI agent files
  -i, --interactive  Choose components interactively (default when run in a TTY)
  -n, --dry-run      Show what would change without removing files
  -f, --force        Force removal of modified files without prompting
      --no-input     Disable prompts and skip modified files unless --force is set
  -q, --quiet        Suppress progress messages (the final write summary remains)
  -h, --help         Show this help message
      --version      Show version and exit
EOF
}

show_version() {
  printf '%s %s\n' "$SCRIPT_NAME" "$VERSION"
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

interactive_uninstall() {
  [[ "$NO_INPUT" == false ]] || die "--interactive cannot be used with --no-input"
  [[ -t 0 ]] || die "--interactive requires a TTY. Use --all or component flags for non-interactive uninstalls."

  section "Interactive uninstallation"

  if prompt_yes_no "Uninstall dotfiles"; then
    DO_DOTFILES=true
  fi

  if grep -qF 'source ~/.bashrc.colin' "$HOME/.bashrc" 2>/dev/null; then
    if prompt_yes_no "Remove ~/.bashrc.colin include from ~/.bashrc"; then
      DO_BASHRC=true
    fi
  fi

  if grep -qF 'path = ~/.gitconfig.colin' "$HOME/.gitconfig" 2>/dev/null; then
    if prompt_yes_no "Remove ~/.gitconfig.colin include from ~/.gitconfig"; then
      DO_GITCONFIG=true
    fi
  fi

  if prompt_yes_no "Uninstall Claude/OpenCode/Gemini/OpenAI agent files"; then
    DO_AGENTS=true
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

run_uninstall() {
  local ran=false

  if [[ "$DO_INTERACTIVE" == true ]]; then
    interactive_uninstall
  fi

  if [[ "$DO_ALL" == true ]]; then
    DO_DOTFILES=true
    DO_BASHRC=true
    DO_GITCONFIG=true
    DO_AGENTS=true
  fi

  # Gather target files to uninstall
  declare -A TARGETS=()

  # 1. From manifest
  local dest src
  for dest in "${!MANIFEST_HASH[@]}"; do
    src="${MANIFEST_SRC[$dest]:-}"
    if should_uninstall_dest "$dest" "$src"; then
      TARGETS["$dest"]="${src}"
    fi
  done

  # 2. Known dotfiles (fallback if not in manifest)
  if [[ "$DO_DOTFILES" == true || "$DO_ALL" == true ]]; then
    local df
    for df in "${DOTFILES[@]}"; do
      TARGETS["$HOME/$df"]="${df}"
    done
  fi

  if [[ "$DO_BASHRC" == true ]]; then
    TARGETS["$HOME/.bashrc.colin"]=".bashrc.colin"
  fi

  if [[ "$DO_GITCONFIG" == true ]]; then
    TARGETS["$HOME/.gitconfig.colin"]=".gitconfig.colin"
  fi

  # Process file uninstalls
  for dest in "${!TARGETS[@]}"; do
    uninstall_single_file "$dest" "${TARGETS[$dest]}"
    ran=true
  done

  if [[ "$DO_BASHRC" == true || "$DO_DOTFILES" == true || "$DO_ALL" == true ]]; then
    revert_bashrc
    ran=true
  fi

  if [[ "$DO_GITCONFIG" == true || "$DO_DOTFILES" == true || "$DO_ALL" == true ]]; then
    revert_gitconfig
    ran=true
  fi

  if [[ "$DO_AGENTS" == true || "$DO_ALL" == true ]]; then
    uninstall_agents_extras
    ran=true
  fi

  cleanup_empty_dirs

  [[ "$ran" == true ]] || die "No uninstall target selected"
}

main() {
  parse_args "$@"
  load_manifest
  run_uninstall
  save_manifest

  if [[ "$DRY_RUN" == true ]]; then
    show_uninstall_summary
    log "Dry run complete. No files were removed."
  else
    show_uninstall_summary
    log "Uninstallation complete."
  fi
}

main "$@"
