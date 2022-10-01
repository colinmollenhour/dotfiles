#!/bin/bash
set -e
dotfiles=".bashrc .gitattributes.global .gitconfig .gitignore.global .tmux.conf .vimrc .config/tmux/tmux-onedark-theme.tmux .config/starship.toml .config/docker-fzf.bash"
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
