#!/bin/bash
set -e
dotfiles=".bashrc.colin .gitattributes.global .gitconfig.colin .gitignore.global .tmux.conf .vimrc .config/tmux/tmux-onedark-theme.tmux .config/starship.toml .config/docker-fzf.bash"
cd $(dirname "${BASH_SOURCE[0]}")
if [[ "$*" == '--help' ]]; then
  echo "Usage: install.sh [files-to-install ...]"
  echo "The following files will be overwritten if no arguments are given:"
  for f in $dotfiles; do echo "  $f"; done  
  echo "To install fewer files, specify as arguments the files that should be installed." 
  exit 0
fi
if [[ -z $1 ]]; then installfiles="$dotfiles"; else installfiles="$@"; fi
export INSTALL_REPO_HEAD="$(cat .git/$(awk '{print $2}' .git/HEAD))"
export INSTALL_DATE="$(date)"
mkdir -p ~/.config/tmux
for f in $installfiles; do
  echo "Installing $f"
  envsubst '$INSTALL_REPO_HEAD:$INSTALL_DATE' < $f > ~/$f
done

echo -n "Updating ~/.bashrc... "
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
  echo "no change"
fi

echo -n "Updating .gitconfig... "
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
else
  echo "no change"
fi

echo "Installing .claude/"
cp -rf .claude/ ~/
echo "Installing .config/opencode/"
mkdir -p ~/.config/opencode/{command,skill}
cp -rf .claude/commands/* ~/.config/opencode/command
cp -rf .claude/skills/* ~/.config/opencode/skill
cp -rf .claude/agents/* ~/.config/opencode/agent

