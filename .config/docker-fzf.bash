#! /usr/bin/bash

export DOCKER_FZF_PREFIX="--no-preview"

_fzf_complete_docker_cli_post() { awk '{print $1}'; }
_fzf_complete_docker_cli() {
  _fzf_complete --nth 1 -- "$@" < <(
    docker --help 2>/dev/null | sed -n -e '/Management Commands:/,$p' | grep -e '^  ' | grep .
  )
}

_fzf_complete_docker_run_post() { awk '{print $1}'; }
_fzf_complete_docker_run () {
  _fzf_complete "$DOCKER_FZF_PREFIX" --no-multi --header-lines=1 --nth 1 -- "$@" < <(
    docker images --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedSince}}"
  )
}

_fzf_complete_docker_common_post() { awk '{print $1}'; }
_fzf_complete_docker_common () {
  _fzf_complete "$DOCKER_FZF_PREFIX" --multi --header-lines=1 --nth 1 -- "$@" < <(
    docker images --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}"
  )
}

_fzf_complete_docker_container_post() { awk '{print $1}'; }
_fzf_complete_docker_container () {
  _fzf_complete "$DOCKER_FZF_PREFIX" --multi --header-lines=1 --nth 1,2 -- "$@" < <(
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
  )
}

_fzf_complete_docker_container_stopped_post() { awk '{print $1}'; }
_fzf_complete_docker_container_stopped () {
  _fzf_complete "$DOCKER_FZF_PREFIX" --multi --header-lines=1 --nth 1,3 -- "$@" < <(
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
  )
}

_fzf_complete_docker() {
  local cur prev words cword
  _get_comp_words_by_ref cur prev words cword

  if ! type _docker > /dev/null 2>&1; then
    _completion_loader "$@"
    complete -F _fzf_complete_docker -o default -o bashdefault docker
  fi

  if [[ $cword -eq 1 ]]; then
    _fzf_complete_docker_cli "$@"
    return
  fi

  local counter=1
  while [ $counter -lt $cword ]; do
    case "${words[$counter]}" in
      run)
        _fzf_complete_docker_run "$@"
        return
      ;;
      inspect|exec|stop|restart|kill|top|port|stats)
        _fzf_complete_docker_container "$@"
        return
      ;;
      start|rm|logs|cp|rename)
        _fzf_complete_docker_container_stopped "$@"
        return
      ;;
      save|load|push|pull|tag|rmi)
        _fzf_complete_docker_common "$@"
        return
      ;;
    esac
    (( counter++ ))
  done
  _fzf_handle_dynamic_completion docker "$@"
}

if command -v _fzf_docker >/dev/null; then
  export _fzf_orig_completion_docker=_docker
  complete -F _fzf_complete_docker -o default -o bashdefault docker
fi
