# Colin's dot files

Nothing too fancy, just my dotfiles.

## Features

These dot files apply to or make use of the following tools:

- Bash
- Git
- Docker
- Kontena
- Composer
- MySQL
- SSH
- [Starship](https://starship.rs/) (optional)
- [LSD](https://github.com/Peltoche/lsd)

Easily install the following binaries (commands prefixed with "install-"):

- Docker
- GVM
- LSD
- PNPM
- RVM
- Starship

Use the following flag files to enable/disable features:

- `*/.kontena-ps1`
- `~/.ssh/.auto-agent`
- `$HOME/winhome/AppData/npiperelay.exe` (symlink `~/winhome` to Windows home directory for WSL)
- `~/.no-color`
- `~/.nogitprompt`
- `~/.gitoff`

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
