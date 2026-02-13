# Colin's dot files

Nothing too fancy, just my dotfiles.

## Features

These dot files apply to or make use of the following tools:

- Bash
- tmux
- Git
- Docker
- Composer
- MySQL
- SSH
- [LSD](https://github.com/Peltoche/lsd)
- [Starship](https://starship.rs/) (optional)
- and a lot more...

Easily install the following binaries (commands prefixed with "install-"):

- Docker
- LSD
- Starship
- Various recommended tools for Ubuntu

## Installation

Clone this repo and run the `install.sh` script.

```bash
# Interactive mode (choose what to install)
./install.sh

# Install only Claude Code configurations
./install.sh --claude

# Install everything
./install.sh --all

# See all options
./install.sh --help
```

**Common Options:**
- `--claude` - Install only `.claude` and `.config/opencode` directories
- `--dotfiles` - Install dotfiles (bashrc, gitconfig, vimrc, tmux, etc.)
- `--all` - Install everything
- `--interactive` - Interactive mode (default)

The `.bashrc` and `.gitconfig` files will **not** be replaced but rather updated to include the `.colin` variants.

## Help

Run the `colin-help` command for a list of aliases, commands, tips and tricks or see [here](https://github.com/colinmollenhour/dotfiles/blob/main/.bashrc#L2) for the same info online.

## VSCode

Install these in a container with `settings.json`:

```json
{
  "dotfiles.repository": "colinmollenhour/dotfiles",
  "dotfiles.targetPath": "~/.dotfiles",
  "dotfiles.installCommand": "~/.dotfiles/install.sh --all"
}
```
