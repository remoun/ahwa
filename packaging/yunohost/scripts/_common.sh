#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later

# Shared helpers for the Ahwa YunoHost package. Sourced by every
# install/remove/upgrade/backup/restore script.

# Pinned Bun version. Bun moves fast; pin so installs are reproducible.
# Update this value when intentionally rolling forward.
readonly BUN_VERSION="1.3.12"

# Install Bun into the per-app install_dir. Vendoring Bun per-app keeps
# YNH backup/restore self-contained and avoids depending on a system
# Bun that an admin might upgrade or remove behind our back.
install_bun() {
    local install_dir="$1"
    export BUN_INSTALL="$install_dir/.bun"
    # The Bun installer reads $HOME to update shell rc files. YNH scripts
    # run with `set -u`, and HOME isn't set in the install context, so the
    # installer trips on "HOME: unbound variable". Pin HOME to the install
    # dir — Bun's rc-file edits land in $install_dir/.bashrc which we don't
    # care about anyway.
    export HOME="$install_dir"
    mkdir -p "$BUN_INSTALL"
    curl -fsSL "https://bun.sh/install" | bash -s "bun-v${BUN_VERSION}"
}

# Path to the bun binary inside an install_dir.
bun_bin() {
    local install_dir="$1"
    echo "$install_dir/.bun/bin/bun"
}
