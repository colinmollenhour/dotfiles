#!/bin/bash
set -e
dotfiles=".bashrc .gitattributes.global .gitconfig .gitignore.global .tmux.conf .vimrc"
cd $(dirname "${BASH_SOURCE[0]}")
if [[ "$*" == '--help' ]]; then
  echo "Usage: install.sh [files-to-skip...]"
  echo "The following files will be overwritten:" 
  for f in $dotfiles; do echo "  $f"; done  
  exit 0
fi
for f in $dotfiles; do
  if [[ "$*" != *$f* ]]; then
    cp $f ~/$f
  fi
done
mkdir -p ~/.config/tmux
cp .config/tmux/tmux-onedark-theme.tmux ~/.config/tmux/tmux-onedark-theme.tmux
