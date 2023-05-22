"# Colin's .vimrc ($INSTALL_REPO_HEAD)
"# Installed on $INSTALL_DATE
"# https://github.com/colinmollenhour/dotfiles

set nocompatible
set backspace=indent,eol,start
set background=dark
:au VimEnter * set tabpagemax=9999|sil tab ball|set tabpagemax&vim

" Spell-check Markdown files and Git Commit Messages
autocmd FileType markdown setlocal spell
autocmd FileType gitcommit setlocal spell
