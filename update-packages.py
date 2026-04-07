#!/usr/bin/env python3
"""
Package updater tool that supports multiple package managers and sources.
Can update specific packages or all installed packages with --all flag.
"""

import argparse
import json
import os
import subprocess
import sys
from typing import Dict, List, Optional, Tuple

class PackageConfig:
    def __init__(self, command: str, install: str, upgrade: str, source: str):
        self.command = command
        self.install = install
        self.upgrade = upgrade
        self.source = source

class PackageUpdater:
    def __init__(self):
        self.packages = self._load_package_config()
        self.installed_packages = self._detect_installed_packages()
    
    def _load_package_config(self) -> Dict[str, PackageConfig]:
        """Load package configuration from embedded data."""
        # Package configuration with command, install command, upgrade command, and source type
        package_data = {
            "brew": PackageConfig(
                command="brew",
                install='/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
                upgrade="brew update",
                source="shell"
            ),
            "lazygit": PackageConfig(
                command="lazygit",
                install="brew install lazygit",
                upgrade="brew upgrade lazygit",
                source="brew"
            ),
            "crush": PackageConfig(
                command="crush",
                install="brew install charmbracelet/tap/crush",
                upgrade="brew upgrade charmbracelet/tap/crush",
                source="brew"
            ),
            "qwen": PackageConfig(
                command="qwen",
                install="pnpm add -g @qwen-code/qwen-code",
                upgrade="pnpm upgrade -g @qwen-code/qwen-code",
                source="pnpm"
            ),
            "gemini": PackageConfig(
                command="gemini",
                install="pnpm add -g @google/gemini-cli",
                upgrade="pnpm upgrade -g @google/gemini-cli",
                source="pnpm"
            ),
            "codex": PackageConfig(
                command="codex",
                install="pnpm add -g @openai/codex",
                upgrade="pnpm upgrade -g @openai/codex",
                source="pnpm"
            ),
            "claude": PackageConfig(
                command="claude",
                install="pnpm add -g @anthropic-ai/claude-code",
                upgrade="pnpm upgrade -g @anthropic-ai/claude-code",
                source="pnpm"
            ),
            "opencode": PackageConfig(
                command="opencode",
                install="brew install anomalyco/tap/opencode",
                upgrade="brew upgrade anomalyco/tap/opencode",
                source="brew"
            ),
            "starship": PackageConfig(
                command="starship",
                install="brew install starship",
                upgrade="brew upgrade starship",
                source="brew"
            ),
            "bat": PackageConfig(
                command="bat",
                install="brew install bat",
                upgrade="brew upgrade bat",
                source="brew"
            ),
            "csvtk": PackageConfig(
                command="csvtk",
                install="brew install csvtk",
                upgrade="brew upgrade csvtk",
                source="brew"
            ),
            "docker": PackageConfig(
                command="docker",
                install="curl -sSL https://get.docker.com/ | sudo sh",
                upgrade="apt upgrade docker-ce 2>/dev/null || brew upgrade docker 2>/dev/null || curl -sSL https://get.docker.com/ | sudo sh",
                source="shell"
            ),
            "fd": PackageConfig(
                command="fd",
                install="brew install fd",
                upgrade="brew upgrade fd",
                source="brew"
            ),
            "fly": PackageConfig(
                command="flyctl",
                install="brew install flyctl",
                upgrade="brew upgrade flyctl",
                source="brew"
            ),
            "fzf": PackageConfig(
                command="fzf",
                install="brew install fzf",
                upgrade="brew upgrade fzf",
                source="brew"
            ),
            "git-delta": PackageConfig(
                command="delta",
                install="brew install git-delta",
                upgrade="brew upgrade git-delta",
                source="brew"
            ),
            "gvm": PackageConfig(
                command="gvm",
                install="bash < <(curl -s -S -L https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)",
                upgrade="gvm install go1.21 2>/dev/null || echo 'GVM upgrade requires manual intervention'",
                source="shell"
            ),
            "hey": PackageConfig(
                command="hey",
                install="brew install hey",
                upgrade="brew upgrade hey",
                source="brew"
            ),
            "icdiff": PackageConfig(
                command="icdiff",
                install="brew install icdiff",
                upgrade="brew upgrade icdiff",
                source="brew"
            ),
            "pnpm": PackageConfig(
                command="pnpm",
                install="brew install pnpm",
                upgrade="brew upgrade pnpm",
                source="brew"
            ),
            "lsd": PackageConfig(
                command="lsd",
                install="brew install lsd",
                upgrade="brew upgrade lsd",
                source="brew"
            ),
            "exa": PackageConfig(
                command="exa",
                install="apt install exa 2>/dev/null || brew install exa",
                upgrade="apt upgrade exa 2>/dev/null || brew upgrade exa",
                source="apt"
            ),
            "ripgrep": PackageConfig(
                command="rg",
                install="brew install ripgrep",
                upgrade="brew upgrade ripgrep",
                source="brew"
            ),
            "tmux": PackageConfig(
                command="tmux",
                install="brew install tmux",
                upgrade="brew upgrade tmux",
                source="brew"
            ),
            "neovim": PackageConfig(
                command="nvim",
                install="brew install neovim",
                upgrade="brew upgrade neovim",
                source="brew"
            ),
            "teleport": PackageConfig(
                command="tsh",
                install="(set -e; version=$(curl https://tele.ops.shipstream.io/webapi/automaticupgrades/channel/stable/cloud/version); curl https://cdn.teleport.dev/install-v16.4.0.sh | bash -s ${version:1} oss)",
                upgrade="(set -e; version=$(curl https://tele.ops.shipstream.io/webapi/automaticupgrades/channel/stable/cloud/version); curl https://cdn.teleport.dev/install-v16.4.0.sh | bash -s ${version:1} oss)",
                source="shell"
            ),
        }
        return package_data
    
    def _detect_installed_packages(self) -> List[str]:
        """Detect which packages from the list are currently installed."""
        installed = []
        
        for package_name, config in self.packages.items():
            if self._is_command_installed(config.command):
                installed.append(package_name)
        
        return installed
    
    def _is_command_installed(self, command: str) -> bool:
        """Check if a command is available in the system."""
        try:
            result = subprocess.run(
                ["which", command],
                capture_output=True,
                text=True
            )
            return result.returncode == 0
        except FileNotFoundError:
            return False
    
    def _run_command(self, command: str) -> Tuple[bool, str]:
        """Execute a shell command and return success status and output."""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            return result.returncode == 0, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return False, "Command timed out"
        except Exception as e:
            return False, str(e)
    
    def list_installed_packages(self) -> List[str]:
        """Return list of installed packages from the configured list."""
        return self.installed_packages
    
    def update_package(self, package_name: str) -> Tuple[bool, str]:
        """Update a specific package."""
        if package_name not in self.packages:
            return False, f"Package '{package_name}' not found in configuration"
        
        config = self.packages[package_name]
        
        if package_name not in self.installed_packages:
            return False, f"Package '{package_name}' is not installed"
        
        print(f"Updating {package_name}...")
        success, output = self._run_command(config.upgrade)
        
        return success, output
    
    def install_package(self, package_name: str) -> Tuple[bool, str]:
        """Install a specific package."""
        if package_name not in self.packages:
            return False, f"Package '{package_name}' not found in configuration"
        
        config = self.packages[package_name]
        
        if package_name in self.installed_packages:
            return False, f"Package '{package_name}' is already installed"
        
        print(f"Installing {package_name}...")
        success, output = self._run_command(config.install)
        
        # Refresh installed packages list after installation
        if success:
            self.installed_packages = self._detect_installed_packages()
        
        return success, output
    
    def update_all_packages(self) -> Dict[str, Tuple[bool, str]]:
        """Update all installed packages."""
        results = {}
        
        if not self.installed_packages:
            print("No packages from the configured list are installed.")
            return results
        
        print(f"Updating {len(self.installed_packages)} packages...")
        
        for package_name in self.installed_packages:
            success, output = self.update_package(package_name)
            results[package_name] = (success, output)
            
            if success:
                print(f"✓ {package_name} updated successfully")
            else:
                print(f"✗ {package_name} update failed")
        
        return results
    
    def display_package_list(self) -> None:
        """Display the list of installed packages for user selection."""
        if not self.installed_packages:
            print("No packages from the configured list are installed.")
            return
        
        print("\nInstalled packages:")
        sorted_packages = sorted(self.installed_packages)
        for i, package in enumerate(sorted_packages, 1):
            config = self.packages[package]
            print(f"  {i}. {package} (source: {config.source})")
        return sorted_packages
    
    def get_package_selection(self) -> List[str]:
        """Get user selection of packages to update."""
        if not self.installed_packages:
            return []
        
        sorted_packages = self.display_package_list()
        
        while True:
            try:
                choice = input("\nEnter package numbers to update (e.g., 1,3,5) or 'all': ").strip().lower()
                
                if choice == 'all':
                    return sorted(self.installed_packages)
                
                if not choice:
                    continue
                
                # Parse comma-separated numbers
                indices = [int(x.strip()) for x in choice.split(',') if x.strip().isdigit()]
                
                if not indices:
                    print("Invalid input. Please enter numbers separated by commas.")
                    continue
                
                selected = []
                for idx in indices:
                    if 1 <= idx <= len(sorted_packages):
                        selected.append(sorted_packages[idx - 1])
                    else:
                        print(f"Invalid number: {idx}")
                        break
                else:
                    return selected
                    
            except (ValueError, KeyboardInterrupt):
                print("\nOperation cancelled.")
                return []

def main():
    parser = argparse.ArgumentParser(
        description="Update user-installed packages from various sources",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                    # Interactive selection of packages to update
  %(prog)s --all             # Update all installed packages
  %(prog)s crush qwen        # Update specific packages
  %(prog)s --list            # List installed packages
  %(prog)s --install fzf bat # Install specific packages
        """
    )
    
    parser.add_argument(
        "packages",
        nargs="*",
        help="Specific packages to update"
    )
    
    parser.add_argument(
        "--all",
        action="store_true",
        help="Update all installed packages"
    )
    
    parser.add_argument(
        "--install",
        action="store_true",
        help="Install packages instead of updating"
    )
    
    parser.add_argument(
        "--list",
        action="store_true",
        help="List installed packages and exit"
    )
    
    args = parser.parse_args()
    
    updater = PackageUpdater()
    
    if args.list:
        updater.display_package_list()
        return
    
    if args.all:
        results = updater.update_all_packages()
        
        print("\n" + "="*50)
        print("UPDATE SUMMARY")
        print("="*50)
        
        for package, (success, output) in results.items():
            status = "SUCCESS" if success else "FAILED"
            print(f"{package}: {status}")
            if not success and output.strip():
                print(f"  Error: {output.strip()}")
        
        return
    
    if args.install:
        # Install specific packages
        if not args.packages:
            print("Error: No packages specified for installation. Use: update-packages.py --install package1 package2")
            return
        
        for package in args.packages:
            if package not in updater.packages:
                print(f"Package '{package}' not found in configuration")
                continue
            
            if package in updater.installed_packages:
                print(f"Package '{package}' is already installed")
                continue
            
            success, output = updater.install_package(package)
            
            if success:
                print(f"✓ {package} installed successfully")
                if output.strip():
                    print(f"  {output.strip()}")
            else:
                print(f"✗ {package} installation failed")
                if output.strip():
                    print(f"  Error: {output.strip()}")
        return
    
    if args.packages:
        # Update specific packages
        for package in args.packages:
            if package not in updater.packages:
                print(f"Package '{package}' not found in configuration")
                continue
            
            if package not in updater.installed_packages:
                print(f"Package '{package}' is not installed")
                continue
            
            success, output = updater.update_package(package)
            
            if success:
                print(f"✓ {package} updated successfully")
                if output.strip():
                    print(f"  {output.strip()}")
            else:
                print(f"✗ {package} update failed")
                if output.strip():
                    print(f"  Error: {output.strip()}")
    else:
        # Interactive mode
        selected = updater.get_package_selection()
        
        if not selected:
            print("No packages selected for update.")
            return
        
        print(f"\nUpdating {len(selected)} selected packages...")
        
        for package in selected:
            success, output = updater.update_package(package)
            
            if success:
                print(f"✓ {package} updated successfully")
                if output.strip():
                    print(f"  {output.strip()}")
            else:
                print(f"✗ {package} update failed")
                if output.strip():
                    print(f"  Error: {output.strip()}")

if __name__ == "__main__":
    main()
