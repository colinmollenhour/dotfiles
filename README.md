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
- and a lot more...

Easily install the following binaries (commands prefixed with "install-"):

- Docker
- GVM
- LSD
- PNPM
- RVM
- Starship
- Various recommended tools for Ubuntu

## Installation

Clone this repo and run the `install.sh` script.

**NOTE:** The `.gitconfig` file has my username and email address so you will want to edit this
file before installation if you are not me.

**WARNING:** This will copy the files to your home directory, replacing any existing files.

Run with `--help` to see a list of files that will be replaced. If you do not want to install all files
pass the file names of the files you **do** want installed as arguments to the `install.sh` script.

For example, `install.sh .gitconfig` will install **only** `.gitconfig`.

## Help

Run the `colin-help` command for a list of aliases, commands, tips and tricks or see [here](https://github.com/colinmollenhour/dotfiles/blob/main/.bashrc#L2) for the same info online.

## VSCode

Install these in a container with `settings.json`:

```json
{
  "dotfiles.repository": "colinmollenhour/dotfiles",
  "dotfiles.targetPath": "~/.dotfiles",
  "dotfiles.installCommand": "~/.dotfiles/install.sh"
}
```
