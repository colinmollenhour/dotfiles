#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="2026.05.03"

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

MANIFEST_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/colin-dotfiles/manifest"
declare -A MANIFEST_HASH=()   # dest_abs → hash of dest at last install
declare -A MANIFEST_SRC=()    # dest_abs → src relative to SCRIPT_DIR
declare -A ACTIVE_DESTS=()    # dest_abs → 1 (visited this run)

cd "$SCRIPT_DIR"

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

# Returns 0 if dest can be safely overwritten; prints warning and returns 1 otherwise.
# Untracked existing files are treated as potentially manual and require --force.
can_overwrite() {
  local dest="$1"
  [[ -f "$dest" ]] || return 0
  local tracked="${MANIFEST_HASH[$dest]:-}"
  if [[ -z "$tracked" ]]; then
    [[ "$FORCE" == true ]] && return 0
    warn "Skipping untracked existing file (use --force to overwrite on first run): $dest"
    return 1
  fi
  local current
  current="$(file_hash "$dest")"
  [[ "$current" == "$tracked" ]] && return 0
  if [[ "$FORCE" == true ]]; then
    warn "Force-overwriting manually modified: $dest"
    return 0
  fi
  warn "Skipping manually modified file (use --force to overwrite): $dest"
  return 1
}

# Install src_abs → dest, recording src_rel in the manifest
install_file() {
  local src_rel="$1" src_abs="$2" dest="$3"
  ACTIVE_DESTS["$dest"]=1
  if [[ "$DRY_RUN" == true ]]; then
    can_overwrite "$dest" && dry_run_msg "install $src_rel → $dest"
    return 0
  fi
  can_overwrite "$dest" || return 0
  mkdir -p "$(dirname "$dest")"
  cp -f "$src_abs" "$dest"
  MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
  MANIFEST_SRC["$dest"]="$src_rel"
}

# Move a pre-rendered tmpfile → dest, recording src_rel in the manifest; always removes tmpfile
install_rendered() {
  local src_rel="$1" tmpfile="$2" dest="$3"
  ACTIVE_DESTS["$dest"]=1
  if [[ "$DRY_RUN" == true ]]; then
    [[ -n "$tmpfile" ]] && rm -f "$tmpfile"
    can_overwrite "$dest" && dry_run_msg "render $src_rel → $dest"
    return 0
  fi
  if ! can_overwrite "$dest"; then
    rm -f "$tmpfile"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  mv -f "$tmpfile" "$dest"
  MANIFEST_HASH["$dest"]="$(file_hash "$dest")"
  MANIFEST_SRC["$dest"]="$src_rel"
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
      install_file "$item" "$SCRIPT_DIR/$item" "$dest/$base"
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
  -f, --force        Overwrite files that were manually modified since last install
      --with-opus    Include colin-mbot-opus.md when installing OpenCode agents (no to avoid accidental usage)
      --no-input     Disable prompts; requires at least one install option
  -q, --quiet        Print only warnings and errors
  -h, --help         Show this help message
      --version      Show version and exit

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
  local skills_dir="$HOME/.agents/skills"
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
      ACTIVE_DESTS["$openai_yaml"]=1
      can_overwrite "$skill_md" && dry_run_msg "generate command skill $skill_name in $skill_dir"
      continue
    fi

    mkdir -p "$skill_dir/agents"
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
    # openai.yaml is always the same two lines; write and track it directly
    printf 'policy:\n  allow_implicit_invocation: false\n' > "$openai_yaml"
    MANIFEST_HASH["$openai_yaml"]="$(file_hash "$openai_yaml")"
    MANIFEST_SRC["$openai_yaml"]="$command_file"
    ACTIVE_DESTS["$openai_yaml"]=1
  done < <(find "$commands_dir" -type f -name '*.md' | sort)

  if [[ "$DRY_RUN" == true ]]; then
    log "Would install $count Claude command skills in $skills_dir"
  else
    log "Installed $count Claude command skills in $skills_dir"
  fi
}

install_agents() {
  section "Installing AI agent files"

  local claude_settings="$HOME/.claude/settings.json"
  local statusline_script="$HOME/.claude/statusline/statusline.sh"
  local tmp

  if [[ -f "$claude_settings" ]] && [[ "$(cat "$claude_settings")" != "{}" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      dry_run_msg "back up $claude_settings to $claude_settings.bak"
    else
      cp "$claude_settings" "$claude_settings.bak"
      log "Backed up ~/.claude/settings.json to ~/.claude/settings.json.bak"
    fi
  fi

  copy_claude_home

  if [[ -f "$statusline_script" ]]; then
    if command -v jq >/dev/null 2>&1; then
      if [[ "$DRY_RUN" == true ]]; then
        dry_run_msg "configure Claude statusLine in $claude_settings"
      else
        tmp="$(mktemp)"
        jq '. + {statusLine: {type: "command", command: "bash ~/.claude/statusline/statusline.sh"}}' \
          "$claude_settings" > "$tmp" && mv "$tmp" "$claude_settings"
        # Re-record hash after jq mutation so the file doesn't look manually modified next run
        MANIFEST_HASH["$claude_settings"]="$(file_hash "$claude_settings")"
        log "Added statusLine to ~/.claude/settings.json"
      fi
    else
      warn "jq not found; skipping statusLine injection into ~/.claude/settings.json"
    fi
  else
    log "Skipping statusLine; no $statusline_script"
  fi

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
  install_command_skills
  copy_agent_files ".opencode/agents" "$HOME/.opencode/agents"
  install_file ".claude/agents/megamind.md" "$SCRIPT_DIR/.claude/agents/megamind.md" "$HOME/.opencode/agents/megamind.md"

  if [[ "$DRY_RUN" == true ]]; then
    dry_run_msg "create $HOME/.gemini/antigravity/skills"
  else
    mkdir -p "$HOME/.gemini/antigravity/skills"
  fi
  copy_dir_contents ".claude/skills" "$HOME/.gemini/antigravity/skills"

  if [[ "$DRY_RUN" == true ]]; then
    log "Would install agents and skills to ~/.agents, ~/.claude, ~/.opencode, and ~/.gemini/antigravity"
  else
    log "Installed agents and skills to ~/.agents, ~/.claude, ~/.opencode, and ~/.gemini/antigravity"
  fi
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
