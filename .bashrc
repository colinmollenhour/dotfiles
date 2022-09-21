#!/bin/bash
# ##################################################################
# Colin's bashrc file ($INSTALL_REPO_HEAD)
# Installed on $INSTALL_DATE
# https://github.com/colinmollenhour/dotfiles
# ##################################################################
#
# Shortcut Aliases and Bash Tricks
#   .. [n]               cd ../[n]
#   cd -                 cd to last directory
#   d                    docker
#   de                   docker exec
#   dip                  docker inspect ... (shows IP of container)
#   dc                   docker-compose
#   dm                   docker-machine
#   dstats               docker stats
#   g                    git (see Git Shortcuts section for more)
#   k                    kontena
#   kc                   kubectl
#   l                    ls -l
#   lcd                  cd && ls
#   ll                   ls -la
#   lvim                 open last-edited file in vim
#   mm                   modman
#   psg <string>         ps aux | grep [s]tring
#   <(cmd)               treat output of command as file (can use multiple times)
#
# Wrappers
#   vd                   run visidata via docker image unless visidata is present in path
#   composer             run composer via docker unless composer is present in path
#
# Scripts/Functions
#   docker-rmi-dangling  remove 'dangling' docker images
#   docker-rmv-dangling  remove 'dangling' docker volumes
#   dush                 like du -sh but sorted by size
#   findcrlf             find files containing CRLF
#   git-clean-merged     clean merged branches from remote
#   git-clean-nomerged   clean not-merged branches from remote
#   git-clean-local      clean local branches
#   git-ignore-symlinks  add all untracked symlinks to the .gitignore file in pwd
#   git-off|git-on       enable or disable git prompt for current directory
#   hdd-write-test       do a simple write test in the current directory
#   ip-summary           show number of connections per ip
#   ipinfo               helper for `curl https://ipinfo.io/$1`
#   kontena-vpn-start    connect to a kontena vpn
#   mysql-extract-table  pipe mysqldump through this to extract a single table
#   mysql-strip-definer  pipe mysqldump through this to strip the DEFINER clauses
#   nsps                 netstat -plunt | sort
#   rdns <ip>            print reverse dns of an ip
#   readthenburn <file>  upload content to readthenburn (use - to read stdin)
#   reencrypt-ssh-key    re-encrypt the ssh private key with PKCS#8
#   rfromdos             run fromdos recursively on current directory
#   rnotabs              replace tabs with four spaces on files in current directory
#   ssh-proxy <1-4> <port> start a ShipStream SSH proxy tunnel to <port>
#   tsv2csv              convert TSV (e.g. from mysql batch mode) to CSV
#   unfubar-upstart      unfubar upstart when it is tracking a PID that doesn't exist
#   update-dotfiles      update the dotfiles from Colin's repo
#   whatismyip           get your IP
#
# Fuzzy Finder (fzf)
#   kill **<TAB>    kill processes using fzf 
#   path/**<TAB>    inline replace with selected path(s) (tab to select)
#   Ctrl+r          search history
#   Ctrl+t          find and insert file paths from current directory
#   Alt+c           find and change directory         
#   F2              while finding, toggle preview on right side
#   Ctrl+a          while finding, select all matching files
#   
# Command Line/Readline
#   Crtl+xe         edit current command in editor
#   Crtl+xu         undo edits to current command
#   Alt+f/b/d       jump forward/jump backward/delete one word
#   Ctrl+u          cut line to readline buffer
#   Ctrl+w          cut word to readline buffer
#   Ctrl+y          paste from readline buffer
#   Ctrl+l          clear screen and redraw current line          
#   Alt+#           comment current line
#   Esc space       mark position
#   Ctrl+xx         return to marked position
#   Ctrl+x (/)/e    macro: start/end/execute recording
#   
# History
#   Ctrl+r          reverse search history (repeatable, abort with Ctrl+g)
#   cmd<up/down>    search previous/next history matching cmd
#   !foo<space>     expand bang in place
#   !:n-m           expands to nth (through mth) argument(s) of last command
#   !:*             expands to all arguments of last command
#   ^foo^FOO        run last command replacing foo with FOO
#   !:gs/foo/FOO    run last command replacing all instances of foo with FOO
#
# Git Shortcuts (with autocompletion)
#   s                 status
#   co                checkout
#   br                branch
#   lg                pretty graph log
#   staged            diff --cached
#   unstage           reset HEAD
#   head              log -n1
#   upstream-branch-name   print the remote tracking branch name
#   preview-pull      preview the changes that would occur by a pull
#   du                diff the current head with the upstream branch
#   files             list the files changed by a commit-ish
#   backport-commit   checkout a branch ($1), fast-forward, cherry-pick commit from master (or $2), push and checkout master
#
# Quick Installers
#   install-bat          Install "cat with wings" - https://github.com/sharkdp/bat
#   install-docker       Install Docker using https://get.docker.com/
#   install-fd           Install alternative to 'find' - https://github.com/sharkdp/fd
#   install-fzf          Install command-line fuzzy finder - https://github.com/junegunn/fzf
#   install-gvm          Install Go Version Manger - https://github.com/moovweb/gvm
#   install-lsd          Install lsd (netx-gen ls command) - https://github.com/Peltoche/lsd
#   install-pnpm         Install pnpm - https://pnpm.io (Install Node.js with `pnpm env use --global lts`)
#   install-recommended  Install some recommended packages (Ubuntu)
#   install-rvm          Install Ruby Version Manager - https://rvm.io
#   install-starship     Install Starship prompt - https://starship.rs/
#
# Special files
#   ~/.bashrc.before     add your own .bashrc customizations without modifying this file
#   ~/.bashrc.after      add your own .bashrc customizations without modifying this file
#   ~/.bash_aliases      add your own .bashrc customizations without modifying this file
#   <git-root>/.gitoff   disable git-enhanced prompt for a specific repo
#   .kontena-ps1         enable the Kontena prompt info
#   ~/.no-color          disable colored prompt
#   ~/.nogitprompt       disable git-enhanced prompt
#   ~/.ssh/.auto-agent   enable auto-start of SSH Agent
#   ~/winhome/AppData/npiperelay.exe  symlink `~/winhome` to Windows home directory for WSL
#
# END

# run "colin-help" to get help

test -f ~/.bashrc.before && . ~/.bashrc.before

# Automatically setup ssh agent using Windows' OpenSSH Authentication Agent service if npiperelay exists
# See https://github.com/jstarks/npiperelay/releases
npiperelay=$HOME/winhome/AppData/npiperelay.exe
if [[ -z $SSH_AUTH_SOCK ]] && [[ -f $npiperelay ]] && [[ -f ~/.ssh/.auto-agent ]]; then
  export SSH_AUTH_SOCK=$HOME/.ssh/agent.sock
  ss -a | grep -q $SSH_AUTH_SOCK
  if [ $? -ne 0   ]; then
    rm -f $SSH_AUTH_SOCK
    ( setsid socat UNIX-LISTEN:$SSH_AUTH_SOCK,fork EXEC:"$npiperelay -ei -s //./pipe/openssh-ssh-agent",nofork & ) >/dev/null 2>&1
    echo "Starting new Windows OpenSSH Agent Service socket"
  elif [[ -S $SSH_AUTH_SOCK ]]; then
    echo "Using existing Windows OpenSSH Agent Service socket"
  else 
    unset SSH_AUTH_SOCK
  fi
fi

# Automatically setup ssh-agent if flag file exists (any Linux)
if [[ -z $SSH_AUTH_SOCK ]] && [[ -f ~/.ssh/.auto-agent ]]; then
  # Allow cygwin to use PuTTY's pageant
  if [[ -f /usr/bin/ssh-pageant ]]; then
    eval $(/usr/bin/ssh-pageant -ra $TEMP/.ssh-pageant)
    [[ $- == *c* ]] || echo "Using PuTTY's Pageant"
  # Use Linux ssh-agent and do not use Gnome Keyring
  elif [[ -f /usr/bin/ssh-agent ]] && [[ $SSH_AUTH_SOCK != /tmp/ssh-* ]]; then
    for agent in /tmp/ssh-*/agent.*; do
      export SSH_AUTH_SOCK=$agent
      ssh-add -l >/dev/null 2>&1
      if [[ $? -lt 2 ]]; then
        [[ $- == *c* ]] || echo "Using already running ssh-agent"
        break
      else
        rm -f $agent
        unset SSH_AUTH_SOCK
      fi
    done
    if [[ -z "$SSH_AUTH_SOCK" ]]; then
      eval $(ssh-agent)
      [[ $- == *c* ]] || echo "Starting new ssh-agent"
    fi
  fi
fi

# Stop here if not a terminal
[[ $- == *c* ]] && return

# Automatically source 'rvm' if it is installed
if ! command -v rvm >/dev/null; then
  if [[ -f ~/.rvm/scripts/rvm ]]; then
    source ~/.rvm/scripts/rvm
  elif [[ -f /usr/local/rvm/scripts/rvm ]]; then
    source /usr/local/rvm/scripts/rvm
  fi
fi

# set PATH so it includes user's private bin if it exists
if [[ -d "$HOME/bin" ]] && ! [[ $PATH =~ "$HOME/bin" ]] ; then PATH="$HOME/bin:$PATH"; fi

export FIGNORE=.svn:.bzr:.git
export HISTIGNORE="&:l[sl]:[bf]g:exit:history:git status"

# don't put duplicate lines in the history, force ignoredups and ignorespace
export HISTCONTROL=ignoreboth

# set most as pager if no other pager set and most is installed
if [[ -z $PAGER ]] && command -v most >/dev/null; then
  export PAGER='most'
fi

# Setup fzf if present (https://github.com/junegunn/fzf)
if [[ -f ~/.fzf.bash ]]; then
  if command -v fd >/dev/null; then
    FD_OPTIONS="--follow --exclude .git --exclude node_modules"
    PREVIEW="--preview='[[ \$(file --mime {}) =~ binary ]] && echo {} is a binary file || (bat --style=numbers --color=always --line-range :300 {} || head -n 300 {}) 2>/dev/null'"
    BIND_F2='f2:toggle-preview'
    BIND_CTRL_A='ctrl-a:select-all'
    export FZF_DEFAULT_OPTS="--height 50% -1 --reverse --inline-info"
    export FZF_DEFAULT_COMMAND="fd --type f --type l --strip-cwd-prefix --hidden $FD_OPTIONS"
    export FZF_COMPLETION_OPTS="--multi $PREVIEW --bind='$BIND_F2,$BIND_CTRL_A' --header='Press F2 to toggle preview, Ctrl+A to select all'"
    export FZF_CTRL_T_COMMAND="fd $FD_OPTIONS"
    export FZF_CTRL_T_OPTS="--multi $PREVIEW --bind='$BIND_F2,$BIND_CTRL_A' --header='Press F2 to toggle preview, Ctrl+A to select all'"
    export FZF_ALT_C_COMMAND="fd --type d $FD_OPTIONS"
    export FZF_ALT_C_OPTS="--header='Foo'"
  fi
  source ~/.fzf.bash
fi

# Setup modman alias with completion
if command -v _modman >/dev/null; then
  alias mm='modman'
  complete -F _modman mm
fi

# Run composer via docker
if ! command -v composer >/dev/null; then
  alias composer='docker run --rm -it -u $(id -u):$(id -g) -e COMPOSER_IGNORE_PLATFORM_REQS=1 -v ${COMPOSER_HOME:-$HOME/.composer}:/tmp -v $(pwd):/app composer --no-scripts'
fi

# Run visidata via docker
if ! command -v vd >/dev/null; then
  alias vd='docker run --rm -it -u $(id -u):$(id -g) -v $(pwd):/work jauderho/visidata:latest'
fi

# append to the history file, don't overwrite it
shopt -s histappend

###################
# aliases
###################
alias l='ls -l'
alias ll='ls -al'
alias vi='vim -p'
alias colin-help="awk 'BEGIN{f=1}/END/{f=0}f' ~/.bashrc | tail -n +2 | sed 's/^#//' | ${PAGER:-less}"
alias rdns='dig +short -x'
alias lvim="vim -c \"normal '0\""
alias rfromdos='find . -type f -not \( -name "*.png" -o -name "*.gif" -o -name "*.jpg" -o -name "*.ico" -o -name "*gz" -o -name "*.swf" -o -path "./.*" \) -print0 | xargs -0 -r fromdos'
alias rnotabs='find . -type f -not \( -name "*.png" -o -name "*.gif" -o -name "*.jpg" -o -name "*.ico" -o -name "*gz" -o -name "*.swf" -o -path "./.*" \) -print0 | xargs -0 -r sed -i -e "s/	/    /g"'
if [ -f ~/.bash_aliases ]; then . ~/.bash_aliases; fi
alias hdd-write-test='dd bs=1M count=512 if=/dev/zero of=__test conv=fdatasync; rm __test'
alias nsps='netstat -plunt | sort'
alias g='git'

## install shortcuts
alias install-bat='(set -e; cd /tmp; curl -sSL -o bat.deb https://github.com/sharkdp/bat/releases/download/v0.22.1/bat-musl_0.22.1_amd64.deb; sudo dpkg -i bat.deb; rm bat.deb)'
alias install-docker="curl -sSL https://get.docker.com/ | sudo sh && curl -s https://api.github.com/repos/docker/compose/releases/latest   | grep browser_download_url   | grep docker-compose-\$(uname -s)-\$(uname -p) | cut -d \"\\\"\" -f 4 | head -n 1 | sudo wget -q -O /usr/local/bin/docker-compose -i -   && sudo chmod +x /usr/local/bin/docker-compose   && sudo curl -sSL https://raw.githubusercontent.com/docker/compose/master/contrib/completion/bash/docker-compose -o /etc/bash_completion.d/docker-compose"
alias install-fd='(set -e; cd /tmp; curl -sSL -o fd.deb https://github.com/sharkdp/fd/releases/download/v8.4.0/fd-musl_8.4.0_amd64.deb; sudo dpkg -i fd.deb; rm fd.deb)'
alias install-fzf='(set -e; cd; git clone https://github.com/junegunn/fzf.git .fzf; cd .fzf; ./install)'
alias install-gvm='bash < <(curl -s -S -L https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)'
alias install-recommended='sudo apt install bash-completion vim git most curl wget httpie net-tools gzip unzip jq lsd openssl pwgen whois xxd'
alias install-rvm='gpg --keyserver hkp://keys.gnupg.net --recv-keys 409B6B1796C275462A1703113804BB82D39DC0E3 && \curl -sSL https://get.rvm.io | bash -s stable'
alias install-pnpm='curl -fsSL https://get.pnpm.io/install.sh | sh -'
alias install-starship='curl -sS https://starship.rs/install.sh | sh && echo "Start a new session to use Starship. You may need to install a nerd font (nerdfonts.com)"'
alias install-lsd='(set -e; curl -sSL -o lsd.deb https://github.com/Peltoche/lsd/releases/download/0.23.1/lsd_0.23.1_amd64.deb; sudo dpkg -i lsd.deb; rm lsd.deb)'

######################################
# Functions for non-interactive shells
######################################

function findcrlf { grep -r $'\r' -l * | grep -v -E '(png|jpg|gif|gz|zip|bz2|swp|swf|fla|ttf|ico|xap|pdf|mp3|woff|otf|eot)$'; }
function dush { du -sh "$@" | sort -hr; } # Disk usage sorted descending and human readable
function psg { ps aux | grep "[${1:0:1}]${1:1}"; } # ps | grep and excluding the grep process
function extract-table {
  [ -z $1 ] && { echo "no table specified"; return 1; }
  awk "/Table structure for table \`$1\`/{f=1}f;/UNLOCK TABLES;/{f=0}"
}
function ip-summary {
  netstat -ntu | tail -n +3 | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -n
}
function tsv2csv {
  sed -e 's/"/\\"/g' -e 's/	/","/g' -e 's/^/"/' -e 's/$/"/' -e 's/"NULL"//g'
}
function ssh-proxy {
  [[ -z $1 || $1 = "--help" ]] && { echo "
Usage: ssh-proxy {command} [options]
Commands:
  start {num:1-4} {local_port} [{local_addr}]
  stop {num:1-4}
  list
  --help
"; return 1; }
  remoteIP=172.17.0.1
  [[ $1 = "list" ]] && {
    echo "Ports in use:"
    ssh root@runner2.h.shipstream.io netstat -plunt | grep $remoteIP:
    return 0
  }
  [[ $1 =~ ^start|stop$ ]] || { echo "Invalid command."; return 1; }
  [[ $2 =~ [1-4] ]] || { echo "You must specify a proxy number (1-4)."; return 1; }
  remotePort=$((10000 - $2))
  pid=$(pgrep -f "$remoteIP:$remotePort")
  [[ "$pid" = "" ]] || { kill -9 "$pid" && echo "Killed existing tunnel."; }
  [[ "$1" = "stop" ]] && return 0
  [[ $3 =~ [0-9]+ ]] || { echo "You must specify a local port to forward to or 'stop' to kill existing tunnel."; return 1; }
  host=ssh-proxy-$2.shipstream.io
  [[ $2 -eq 1 ]] && host=ssh-proxy.shipstream.io
  localAddr=0.0.0.0
  [[ $4 =~ [0-9.]+ ]] && localAddr=$4
  if ssh -fNT -g -R $remoteIP:$remotePort:$localAddr:$3 root@runner2.h.shipstream.io ; then
    echo "SSH tunnel active, forwarding https://$host/ to local port $localAddr:$3"
  fi
}
function whatismyip {
  curl https://ipinfo.io/ip
}
function ipinfo {
  curl https://ipinfo.io/$1
}
function mysql-strip-definer {
  sed -e 's/DEFINER=[^*]*\*/\*/'
}
function git-ignore-symlinks {
  test -f .gitignore || { echo "Current directory does not contain a .gitignore file."; return 1; }
  for f in $(git status --porcelain | grep '^??' | sed 's/^?? //'); do
    test -L "$f" && echo $f >> .gitignore;
    test -d "$f" && echo $f\* >> .gitignore;
  done
}
function readthenburn {
  [[ -n "$1" ]] || { echo "Usage: pass filename to upload file or use - to read stdin"; return 1; }
  [[ "$1" = '-' ]] && { secret='<-'; action=write; } || { secret="@$1"; action=upload; }
  url=$(curl -s -XPOST -F "secret=$secret" https://secure.bss-llc.com/readthenburn?action=$action)
  if [[ $? -eq 0 && $action = "write" ]]; then echo "$url/raw"; else echo $url; fi
}
function reencrypt-ssh-key {
  [ -f $1 ] || { echo "Usage: reencrypt-ssh-key <file>"; return 1; }
  cp $1 ${1}.old && \
  openssl pkcs8 -topk8 -v2 des3 -in ${1}.old -out ${1} && \
  chmod 600 ${1} && \
  rm ${1}.old && \
  { echo "Successfully re-encrypted key."; return 0; }
  echo "An error occurred. Old key is saved as ${1}.old"
  return 1
}
function unfubar-upstart {
  : ${1?"Usage: unfubar-upstart <pid>"}
(
  false &
  while (( $! >= $1 )); do false & done
  local testPID=$(($1 - 1))
  while (( $! < $testPID )); do false & done
  sleep 1 &
  echo "Init will reap PID=$!"
)
}
function update-dotfiles {
  echo 'Update by navigating to the repository working directory and run:'
  echo '  git pull && ./install.sh'
  echo 'See: https://github.com/colinmollenhour/dotfiles'
}
function kontena-vpn-start {
  set -e
  local pidfile=/var/run/kontena-openvpn.pid
  if [[ -s $pidfile ]] && [[ -f /proc/$(cat $pidfile)/stat ]]; then
    echo -n "Killing old OpenVPN process... "
    sudo kill -TERM $(cat $pidfile)
    while [[ -f /proc/$(cat $pidfile)/stat ]]; do sleep 1; done
    echo "Done"
  fi
  local tmpfile=$(mktemp -t openvpn.XXXXX)
  echo -n "Loading VPN config... "
  kontena vpn config "$@" > $tmpfile
  echo -n "Starting OpenVPN connection to $(awk '/^remote /{print $2}' $tmpfile)... "
  sudo openvpn --daemon --writepid $pidfile --config $tmpfile
  echo "Done"
  (sleep 5; rm $tmpfile; rm -f /tmp/openvpn.*)&
}

test -f ~/.bashrc.after && . ~/.bashrc.after

#################################################################
## Everything below here is for interactive sessions only
#################################################################

[ -z "$PS1" ] && return

#----------------------------------------------------------------
#----------------------------------------------------------------
#----------------------------------------------------------------
# Copyright (C) 2016-2017 Cyker Way
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later
# version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
# details.
#
# You should have received a copy of the GNU General Public License along with
# this program.  If not, see <http://www.gnu.org/licenses/>.

# Function: Debug.
_debug() {
    echo
    echo "COMP_WORDS=("
    for x in "${COMP_WORDS[@]}"; do
        echo "'$x'"
    done
    echo ")"
    echo "#COMP_WORDS=${#COMP_WORDS[@]}"
    echo "COMP_CWORD=${COMP_CWORD}"
    echo "COMP_LINE='${COMP_LINE}'"
    echo "COMP_POINT=${COMP_POINT}"
    echo
}

# Register: Function return value.
_retval=0

# Refcnt: Use alias iff _use_alias == 0.
_use_alias=0

# Function: Test whether the given array contains the given element.
# Usage: _in <elem> <arr_elem_0> <arr_elem_1> ...
_in () {
    for e in "${@:2}"; do
        [[ "$e" == "$1" ]] && return 0
    done
    return 1
}

# Function: Expand aliases in a command line.
# Return: Difference of #COMP_WORDS (before/after expansion).
_expand_alias () {
    local beg="$1" end="$2" ignore="$3" n_used="$4"; shift 4
    local used=( "${@:1:$n_used}" ); shift $n_used

    if [[ "$beg" -eq "$end" ]]; then
        # Case 1: Range is empty.
        _retval=0
    elif [[ -n "$ignore" ]] && [[ "$beg" -eq "$ignore" ]]; then
        # Case 2: Beginning index is ignored. Pass it.
        _expand_alias "$(( $beg+1 ))" "$end" "$ignore" "${#used[@]}" "${used[@]}"
        _retval="$_retval"
    elif ! ( alias "${COMP_WORDS[$beg]}" &>/dev/null ) || ( _in "${COMP_WORDS[$beg]}" "${used[@]}" ); then
        # Case 3: Command is not an alias or is an used alias.
        _retval=0
    else
        # Case 4: Command is an unused alias.

        # Expand 1 level of command alias.
        local cmd="${COMP_WORDS[$beg]}"
        local str0="$( alias "$cmd" | sed -r 's/[^=]*=//' | xargs )"

        # The old way of word breaking (using xargs) is not accurate enough.
        #
        # For example:
        #
        # > alias foo='docker run -u $(id -u $USER):$(id -g $USER)'
        #
        # will be broken as:
        #
        # > docker
        # > run
        # > -u
        # > $(id
        # > -u
        # > $USER):$(id
        # > -g
        # > $USER)
        #
        # while the correct word breaking is:
        #
        # > docker
        # > run
        # > -u
        # > $(id -u $USER)
        # > :
        # > $(id -g $USER)
        #
        # Therefore we implement our own word breaking which gives the correct
        # behavior in this case. It takes the alias body ($str0) as input,
        # breaks it into words and stores them in an array ($words0).
        {
            # An array that will contain the broken words.
            words0=()

            # Create a temp stack which tracks quoting while breaking words.
            local sta=()

            # Examine each char of $str0.
            local i=0 j=0
            for (( j=0;j<${#str0};j++ )); do
                if [[ $' \t\n' == *"${str0:j:1}"* ]]; then
                    # Whitespace chars.
                    if [[ ${#sta[@]} -eq 0 ]]; then
                        if [[ $i -lt $j ]]; then
                            words0+=("${str0:i:j-i}")
                        fi
                        (( i=j+1 ))
                    fi
                elif [[ "><=;|&:" == *"${str0:j:1}"* ]]; then
                    # Break chars.
                    if [[ ${#sta[@]} -eq 0 ]]; then
                        if [[ $i -lt $j ]]; then
                            words0+=("${str0:i:j-i}")
                        fi
                        words0+=("${str0:j:1}")
                        (( i=j+1 ))
                    fi
                elif [[ "\"')}" == *"${str0:j:1}"* ]]; then
                    # Right quote chars.
                    if [[ ${#sta[@]} -ne 0 ]] && [[ "${str0:j:1}" == ${sta[-1]} ]]; then
                        unset sta[-1]
                    fi
                elif [[ "\"'({" == *"${str0:j:1}"* ]]; then
                    # Left quote chars.
                    if [[ "${str0:j:1}" == "\"" ]]; then
                        sta+=("\"")
                    elif [[ "${str0:j:1}" == "'" ]]; then
                        sta+=("'")
                    elif [[ "${str0:j:1}" == "(" ]]; then
                        sta+=(")")
                    elif [[ "${str0:j:1}" == "{" ]]; then
                        sta+=("}")
                    fi
                fi
            done
            # Append the last word.
            if [[ $i -lt $j ]]; then
                words0+=("${str0:i:j-i}")
            fi

            # Unset the temp stack.
            unset sta
        }

        # Rewrite COMP_LINE and COMP_POINT.
        local i j=0
        for (( i=0; i < $beg; i++ )); do
            for (( ; j <= ${#COMP_LINE}; j++ )); do
                [[ "${COMP_LINE:j}" == "${COMP_WORDS[i]}"* ]] && break
            done
            (( j+=${#COMP_WORDS[i]} ))
        done
        for (( ; j <= ${#COMP_LINE}; j++ )); do
            [[ "${COMP_LINE:j}" == "${COMP_WORDS[i]}"* ]] && break
        done

        COMP_LINE="${COMP_LINE[@]:0:j}""$str0""${COMP_LINE[@]:j+${#cmd}}"
        if [[ $COMP_POINT -lt $j ]]; then
            :
        elif [[ $COMP_POINT -lt $(( j+${#cmd} )) ]]; then
            (( COMP_POINT=j+${#str0} ))
        else
            (( COMP_POINT+=${#str0}-${#cmd} ))
        fi

        # Rewrite COMP_WORDS and COMP_CWORD.
        COMP_WORDS=( "${COMP_WORDS[@]:0:beg}" "${words0[@]}" "${COMP_WORDS[@]:beg+1}" )
        if [[ $COMP_CWORD -lt $beg ]]; then
            :
        elif [[ $COMP_CWORD -lt $(( $beg+1 )) ]]; then
            (( COMP_CWORD=beg+${#words0[@]} ))
        else
            (( COMP_CWORD+=${#words0[@]}-1 ))
        fi

        # Rewrite ignore if it's not empty.
        # If ignore is not empty, we already know it's not equal to beg because
        # we have checked it in Case 2.
        if [[ -n "$ignore" ]] && [[ $ignore -gt $beg ]]; then
            (( ignore+=${#words0[@]}-1 ))
        fi

        # Recursively expand Part 0.
        local used0=( "${used[@]}" "$cmd" )
        _expand_alias "$beg" "$(( $beg+${#words0[@]} ))" "$ignore" "${#used0[@]}" "${used0[@]}"
        local diff0="$_retval"

        # Recursively expand Part 1.
        if [[ -n "$str0" ]] && [[ "${str0: -1}" == ' ' ]]; then
            local used1=( "${used[@]}" )
            _expand_alias "$(( $beg+${#words0[@]}+$diff0 ))" "$(( $end+${#words0[@]}-1+$diff0 ))" "$ignore" "${#used1[@]}" "${used1[@]}"
            local diff1="$_retval"
        else
            local diff1=0
        fi

        # Return value.
        _retval=$(( ${#words0[@]}-1+diff0+diff1 ))
    fi
}

# Function: Set a command's completion function to the default one.
# Users may edit this function to fit their own needs.
_set_default_completion () {
    local cmd="$1"

    case "$cmd" in
        bind)
            complete -A binding "$cmd"
            ;;
        help)
            complete -A helptopic "$cmd"
            ;;
        set)
            complete -A setopt "$cmd"
            ;;
        shopt)
            complete -A shopt "$cmd"
            ;;
        bg)
            complete -A stopped -P '"%' -S '"' "$cmd"
            ;;
        service)
            complete -F _service "$cmd"
            ;;
        unalias)
            complete -a "$cmd"
            ;;
        builtin)
            complete -b "$cmd"
            ;;
        command|type|which)
            complete -c "$cmd"
            ;;
        fg|jobs|disown)
            complete -j -P '"%' -S '"' "$cmd"
            ;;
        groups|slay|w|sux)
            complete -u "$cmd"
            ;;
        readonly|unset)
            complete -v "$cmd"
            ;;
        traceroute|traceroute6|tracepath|tracepath6|fping|fping6|telnet|rsh|\
            rlogin|ftp|dig|mtr|ssh-installkeys|showmount)
            complete -F _known_hosts "$cmd"
            ;;
        aoss|command|do|else|eval|exec|ltrace|nice|nohup|padsp|then|time|tsocks|vsound|xargs)
            complete -F _command "$cmd"
            ;;
        fakeroot|gksu|gksudo|kdesudo|really)
            complete -F _root_command "$cmd"
            ;;
        a2ps|awk|base64|bash|bc|bison|cat|chroot|colordiff|cp|csplit|cut|date|\
            df|diff|dir|du|enscript|env|expand|fmt|fold|gperf|grep|grub|head|\
            irb|ld|ldd|less|ln|ls|m4|md5sum|mkdir|mkfifo|mknod|mv|netstat|nl|\
            nm|objcopy|objdump|od|paste|pr|ptx|readelf|rm|rmdir|sed|seq|\
            sha{,1,224,256,384,512}sum|shar|sort|split|strip|sum|tac|tail|tee|\
            texindex|touch|tr|uname|unexpand|uniq|units|vdir|wc|who)
            complete -F _longopt "$cmd"
            ;;
        *)
            _completion_loader "$cmd"
            ;;
    esac
}

# Function: Programmable completion function for aliases.
_complete_alias () {
    # Get command.
    local cmd="${COMP_WORDS[0]}"

    # We expand aliases only for the original command line (i.e. the command
    # line as verbatim when user presses 'Tab'). That is to say, we expand
    # aliases only in the first call of this function. Therefore we check the
    # refcnt and expand aliases iff it's equal to 0.
    if [[ $_use_alias -eq 0 ]]; then

        # Find the range of indexes of COMP_WORDS[COMP_CWORD] in COMP_LINE. If
        # COMP_POINT lies in this range, don't expand this word because it may
        # be incomplete.
        local i j=0
        for (( i=0; i < $COMP_CWORD; i++ )); do
            for (( ; j <= ${#COMP_LINE}; j++ )); do
                [[ "${COMP_LINE:j}" == "${COMP_WORDS[i]}"* ]] && break
            done
            (( j+=${#COMP_WORDS[i]} ))
        done
        for (( ; j <= ${#COMP_LINE}; j++ )); do
            [[ "${COMP_LINE:j}" == "${COMP_WORDS[i]}"* ]] && break
        done

        # Now j is at the beginning of word COMP_WORDS[COMP_CWORD] and so the
        # range is [j, j+#COMP_WORDS[COMP_CWORD]]. Compare it with COMP_POINT.
        if [[ $j -le $COMP_POINT ]] && [[ $COMP_POINT -le $(( $j+${#COMP_WORDS[$COMP_CWORD]} )) ]]; then
            local ignore="$COMP_CWORD"
        else
            local ignore=""
        fi

        # Expand aliases.
        _expand_alias 0 "${#COMP_WORDS[@]}" "$ignore" 0
    fi

    # Increase _use_alias refcnt.
    (( _use_alias++ ))

    # Since aliases have been fully expanded, we no longer need to consider
    # aliases in the resulting command line. So we now set this command's
    # completion function to the default one (which is alias-agnostic). This
    # avoids infinite recursion when a command is aliased to itself (i.e. alias
    # ls='ls -a').
    _set_default_completion "$cmd"

    # Do actual completion.
    _command_offset 0

    # Decrease _use_alias refcnt.
    (( _use_alias-- ))

    # Reset this command's completion function to `_complete_alias`.
    complete -F _complete_alias "$cmd"
}

# Set alias completions.
#
# Uncomment and edit these lines to add your own alias completions.
#
#complete -F _complete_alias myalias1
#complete -F _complete_alias myalias2
#complete -F _complete_alias myalias3
#----------------------------------------------------------------
#----------------------------------------------------------------
#----------------------------------------------------------------

# Setup docker and composer aliases
if command -v docker >/dev/null; then
  if [[ -f /usr/share/bash-completion/completions/docker ]]; then
    . /usr/share/bash-completion/completions/docker
  fi
  alias d='docker'
  complete -F _docker d
  alias dm='docker-machine'
  complete -F _docker_machine dm
  alias dc='docker-compose'
  complete -F _docker_compose dc
  alias dip="docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"
  alias de='docker exec'
  complete -F _complete_alias dip de
  alias docker-rmi-dangling='docker rmi $(docker images -f "dangling=true" -q)'
  alias docker-rmv-dangling='docker volume rm $(docker volume ls -qf dangling=true)'
  alias dstats='docker stats $(docker ps --format={{.Names}})'
fi
if command -v kubectl >/dev/null; then
  alias kc='kubectl'
  source <(kubectl completion bash)
  complete -F _complete_alias kc
fi

# check the window size after each command and, if necessary, update the values of LINES and COLUMNS.
shopt -s checkwinsize

# set a fancy prompt
if [ ! -f ~/.no-color ]; then
  if command -v starship >&/dev/null; then
    export SHELL_ICON=🚀
    eval "$(starship init bash)"
  elif [[ $USER = "root" ]]; then
    if [ "$(type -t __git_ps1)" = "function" ] && ! [ -f ~/.nogitprompt ]; then
      PS1='\[\e]0;\u@\h: \w\a\]\[\e[36m\]$(printf "%(%r)T") \[\e[31m\]\u@\h\n\[\e[33m\]\w\[\e[31m\]$(__git_ps1)\[\e[0m\] # '
    else
      PS1='\[\e]0;\u@\h: \w\a\]\[\e[36m\]$(printf "%(%r)T") \[\e[31m\]\u@\h\n\[\e[33m\]\w\[\e[0m\] # '
    fi
  else
    if [ "$(type -t __git_ps1)" = "function" ] && ! [ -f ~/.nogitprompt ]; then
      PS1='\[\e]0;\u@\h: \w\a\]\[\e[36m\]$(printf "%(%r)T") \[\e[32m\]\u@\h\[\e[31m\]$(__git_ps1)\[\e[1;30m\] $(__git_colin_dirty)\[\e[0m\] \e[2m\e[95m$(__kontena_ps1)\e[22m'$'\n''\[\e[33m\]\w\[\e[0m\] $ '
    else
      PS1='\[\e]0;\u@\h: \w\a\]\[\e[36m\]$(printf "%(%r)T") \[\e[32m\]\u@\h\[\e[0m\]\n\[\e[33m\]\w\[\e[0m\] $ '
    fi
  fi
else
  if [[ $USER = "root" ]]; then
    PS1='$(printf "%(%r)T")  \u@\h\n\w # '
  else
    PS1='$(printf "%(%r)T")  \u@\h\n\w \$ '
  fi
fi
unset color_prompt force_color_prompt

# If this is an xterm set the title to user@host:dir
case "$TERM" in
xterm*|rxvt*)
  PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h: \w\a\]$PS1"
  ;;
esac

# enable color support of ls and also add handy aliases
if [ -x /usr/bin/dircolors ]; then
    eval "`dircolors -b`"
    alias ls='ls --color=auto'
    alias grep='grep --color=auto'
fi
command -v lsd >&/dev/null && alias ls='lsd'

###################
# key bindings
###################
bind '"\e[A"':history-search-backward # up
bind '"\e[B"':history-search-forward  # down
bind Space:magic-space # space expands bang

###################
# useful functions
###################
function lcd { builtin cd -- "$@" && { [ "$PS1" = "" ] || ls -hrt --color; }; }
function .. { local arg=${1:-1}; local dir=""; while [ $arg -gt 0 ]; do dir="../$dir"; arg=$(($arg - 1)); done; cd $dir; }
function __git_colin_root {
  local root=$(pwd)
  while [ "$root" != "" ]; do
    [ -d $root/.git ] && { echo $root; return 0; }
	root=${root%/*}
  done
  return 1
}
function git-off {
  local root=$(__git_colin_root)
  [ "$root" == "" ] || touch "$root/.gitoff"
}
function git-on {
  local root=$(__git_colin_root)
  [ "$root" == "" ] || rm "$root/.gitoff"
}
function __git_colin_dirty {
  local root=$(__git_colin_root)
  [ "$root" == "" ] && return
  [ -f $root/.gitoff ] && { echo '(off)'; return; }
  (git status --porcelain && git status --long | grep 'Your branch') | awk \
'/^# Your branch is ahead/ { track=sprintf(" (%s %s)", $9, $5) }
/^# Your branch is behind/ { track=sprintf(" (%s %s)", $8, $5) }
/^Your branch is ahead/ { track=sprintf(" (%s %s)", $8, $4) }
/^Your branch is behind/ { track=sprintf(" (%s %s)", $7, $4) }
/^[A-Z ][A-Z]/ { dirty++ }
/^[A-Z] / { staged++ }
/\?/ { untracked++ }
END {
  if (staged+dirty+untracked) printf("%d staged / %d dirty / %d untracked" track, staged, dirty, untracked);
  else print "clean" track;
}';
}
function git-clean-merged {
  [ -z $1 ] && { echo "no remote specified"; return 1; }
  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u})
  git fetch $1 && git remote prune $1 && \
    for br in $(git branch -a --merged $upstream | grep remotes/$1/ | grep -v $upstream); do
      br=${br#remotes/$1/}
      read -p "Delete $br? (y/n) " i
      [ "$i" = "y" ] && git push $1 :$br
    done
}
function git-clean-nomerged {
  [ -z $1 ] && { echo "no remote specified"; return 1; }
  read -p "This command will allow you to delete not-merged remote branches! Continue? (y|n) " i
  [ "$i" = "y" ] || return
  git fetch $1 && git remote prune $1 && \
    for br in $(git branch -a --no-merged | grep remotes/$1/ | grep -v master); do
      br=${br#remotes/$1/}
      read -p "Delete $br? (y/n) " i
      [ "$i" = "y" ] && git push $1 :$br
    done
}
function git-clean-local {
  read -p "This command will allow you to delete unmerged local branches! Continue? (y|n) " i
  [ "$i" = "y" ] || return
  for br in $(git branch --list | grep -v '^* '); do
    echo
    echo '---------------------------------------------------------------------------'
    echo "$(tput bold)$(git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads | grep $br)$(tput sgr0)"
    if git rev-parse --abbrev-ref --symbolic-full-name $br@{upstream} >/dev/null 2>&1; then
      upstream=$(git rev-parse --abbrev-ref --symbolic-full-name $br@{upstream} >/dev/null 2>&1)
    else
      upstream=origin/master
    fi
    git log --shortstat -n 1 $br
    echo
    read -p "Delete $br? (y/n/l) " i
    [ "$i" = "l" ] && { git log $br -n 30; read -p "Delete $br? (y/n) " i; }
    [ "$i" = "y" ] && git branch -D $br
  done
}

# Improve git completion for aliases.
if ! type __git_complete >/dev/null 2>&1 && test -f /usr/share/bash-completion/completions/git; then
    source /usr/share/bash-completion/completions/git
fi
if type __git_complete >/dev/null 2>&1; then
    __git_complete g __git_main
fi

function __kontena_ps1 {
  [[ -f ~/.kontena_client.json ]] && [[ -f ./.kontena-ps1 ]] && awk '/"current_server"/{master=$2} /"name"/{active = $2 == master} /"grid"/ && active{grid=$2} END{gsub(/[",]/,"",master);gsub(/[",]/,"",grid);printf("%s/%s", master, grid);}' < ~/.kontena_client.json
}

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
