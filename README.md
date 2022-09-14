# Colin's dot files

Nothing too fancy, just my dotfiles.

## Features

These dot files apply to or make use of the following tools:

- Bash
- tmux
- Git
- Docker
- Kontena
- Composer
- MySQL
- SSH
- [LSD](https://github.com/Peltoche/lsd)
- [Starship](https://starship.rs/) (optional)

Easily install the following binaries (commands prefixed with "install-"):

- Docker
- GVM
- LSD
- PNPM
- RVM
- Starship

## Installation

Clone this repo and run the `install.sh` script.

**NOTE:** The `.gitconfig` file has my username and email address so you will want to edit this
file before installation if you are not me.

**WARNING:** This will copy the files to your home directory, replacing any existing files.

Pass any file names you do not want replaced as arguments to the `install.sh` script. For example,
`install.sh .gitconfig` will install all files EXCEPT `.gitconfig`.


## Help

Run the `colin-help` command for a list of aliases, commands, tips and tricks.

## VSCode

Install these in a container with `settings.json`:

```json
{
  "dotfiles.repository": "colinmollenhour/dotfiles",
  "dotfiles.targetPath": "~/.dotfiles",
  "dotfiles.installCommand": "~/.dotfiles/install.sh"
}
```
