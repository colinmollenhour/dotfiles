#!/bin/bash
set -e
dotfiles=".bashrc.colin .gitattributes.global .gitconfig.colin .gitignore.global .tmux.conf .vimrc .config/tmux/tmux-onedark-theme.tmux .config/starship.toml .config/docker-fzf.bash"
cd $(dirname "${BASH_SOURCE[0]}")

# Function to display help
show_help() {
  cat << EOF
Usage: install.sh [OPTIONS]

Install Colin's dotfiles and configurations.

OPTIONS:
  --help              Show this help message
  --all               Install everything (dotfiles, bashrc, gitconfig, agents)
  --dotfiles          Install only dotfiles (bashrc.colin, gitconfig.colin, vimrc, tmux, etc.)
  --bashrc            Update ~/.bashrc to source ~/.bashrc.colin
  --gitconfig         Update ~/.gitconfig to include ~/.gitconfig.colin
  --agents            Install only AI agent files (commands, skills, etc.)
  --interactive       Interactively choose what to install (default if no options given)

EXAMPLES:
  # Install only AI Agents configurations
  ./install.sh --agents

  # Install dotfiles and Claude configurations
  ./install.sh --dotfiles --agents

  # Install everything
  ./install.sh --all

  # Choose interactively
  ./install.sh --interactive

DOTFILES:
EOF
  for f in $dotfiles; do echo "  $f"; done
}

# Functions for each installation component
install_dotfiles() {
  echo "==> Installing dotfiles..."
  export INSTALL_REPO_HEAD="$(cat .git/$(awk '{print $2}' .git/HEAD))"
  export INSTALL_DATE="$(date)"
  mkdir -p ~/.config/tmux
  for f in $dotfiles; do
    echo "Installing $f"
    envsubst '$INSTALL_REPO_HEAD:$INSTALL_DATE' < $f > ~/$f
  done
}

update_bashrc() {
  echo "==> Updating ~/.bashrc..."
  if ! grep -qF 'source ~/.bashrc.colin' ~/.bashrc; then
    if grep -qF "# Colin's bashrc file" ~/.bashrc; then
      echo "Replacing the old .bashrc file"
      rm ~/.bashrc
    fi
    if ! test -f ~/.bashrc; then
      echo "#!/bin/bash" > ~/.bashrc
      echo "# The old \"Colin's bashrc file\" was moved to ~/.bashrc.colin" >> ~/.bashrc
      echo "" >> ~/.bashrc
    fi
    echo "" >> ~/.bashrc
    echo "# This line was added by install.sh - comment it out to disable the bash changes" >> ~/.bashrc
    echo "source ~/.bashrc.colin" >> ~/.bashrc
    echo "Added ~/.bashrc.colin to ~/.bashrc"
  else
    echo "~/.bashrc already sources ~/.bashrc.colin (no change)"
  fi
}

update_gitconfig() {
  echo "==> Updating ~/.gitconfig..."
  if ! grep -qF 'path = ~/.gitconfig.colin' ~/.gitconfig; then
    if grep -qF "# Colin's .gitconfig" ~/.gitconfig; then
      echo "Replacing the old .gitconfig"
      grep '\[user\]\|\[github\]\|name = \|email =' ~/.gitconfig | grep -v -- '-name' | head -n 5 > ~/.gitconfig.tmp
      rm ~/.gitconfig
      echo "# The old \"Colin's .gitconfig file\" was moved to ~/.gitconfig.colin" > ~/.gitconfig
      cat ~/.gitconfig.tmp >> ~/.gitconfig
      rm ~/.gitconfig.tmp
    fi
    echo "" >> ~/.gitconfig
    echo "# Include Colin's .gitconfig.colin so you can make your own customizations here without them getting clobbered in future updates." >> ~/.gitconfig
    echo "[include]" >> ~/.gitconfig
    echo "    path = ~/.gitconfig.colin" >> ~/.gitconfig
    echo "Added ~/.gitconfig.colin to ~/.gitconfig"
  else
    echo "~/.gitconfig already includes ~/.gitconfig.colin (no change)"
  fi
}

install_agents() {
  echo "==> Installing AI agent files..."
  cp -rf .claude/ ~/
  if [[ -d ~/.config/opencode/command/colin ]]; then
    rm -rf ~/.config/opencode/{command,skill,agent}
  fi
  mkdir -p ~/.opencode/{commands,agents} ~/.agents/skills
  cp -rf .claude/commands/* ~/.opencode/commands/
  cp -rf .claude/skills/* ~/.agents/skills/
  cp -rf .claude/agents/* ~/.opencode/agents/
  mkdir -p ~/.gemini/antigravity/skills
  cp -rf .claude/skills/* ~/.gemini/antigravity/skills/
  echo "Installed agents and skills to .agents/, .claude/, .opencode/ and .gemini/antigravity/"
}

# Interactive mode
interactive_install() {
  echo "Interactive Installation"
  echo "========================"
  echo ""

  read -p "Install dotfiles (bashrc.colin, gitconfig.colin, vimrc, tmux, etc.)? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    install_dotfiles
  fi

  read -p "Update ~/.bashrc to source ~/.bashrc.colin? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    update_bashrc
  fi

  read -p "Update ~/.gitconfig to include ~/.gitconfig.colin? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    update_gitconfig
  fi

  read -p "Install .claude and .config/opencode directories? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    install_agents
  fi

  echo ""
  echo "Installation complete!"
}

# Parse command line arguments
DO_DOTFILES=false
DO_BASHRC=false
DO_GITCONFIG=false
DO_CLAUDE=false
DO_INTERACTIVE=false
DO_ALL=false

if [[ $# -eq 0 ]]; then
  DO_INTERACTIVE=true
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --help)
      show_help
      exit 0
      ;;
    --all)
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
      DO_CLAUDE=true
      shift
      ;;
    --interactive)
      DO_INTERACTIVE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run 'install.sh --help' for usage information."
      exit 1
      ;;
  esac
done

# Execute based on flags
if [[ "$DO_INTERACTIVE" == true ]]; then
  interactive_install
  exit 0
fi

if [[ "$DO_ALL" == true ]]; then
  install_dotfiles
  update_bashrc
  update_gitconfig
  install_agents
  echo ""
  echo "All components installed successfully!"
  exit 0
fi

# Install selected components
if [[ "$DO_DOTFILES" == true ]]; then
  install_dotfiles
fi

if [[ "$DO_BASHRC" == true ]]; then
  update_bashrc
fi

if [[ "$DO_GITCONFIG" == true ]]; then
  update_gitconfig
fi

if [[ "$DO_CLAUDE" == true ]]; then
  install_agents
fi

echo ""
echo "Installation complete!"
