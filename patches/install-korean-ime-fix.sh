#!/usr/bin/env bash
set -euo pipefail

# PorkCode Korean IME Fix Installer
#
# Builds the PorkCode CLI from source and installs it so that Korean (and other
# CJK) IME last-character truncation does not occur when pressing Enter in Kitty
# and other terminals. The double-defer fix now lives in-tree at
# packages/tui/src/component/prompt/index.tsx, so this script only needs to build
# the current source for your platform and place the binary on PATH.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/imrparker/PorkCode/develop/patches/install-korean-ime-fix.sh | bash
#   # or from a cloned repo:
#   ./patches/install-korean-ime-fix.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
ORANGE='\033[38;5;214m'
MUTED='\033[0;2m'
NC='\033[0m'

PORKCODE_DIR="${PORKCODE_DIR:-$HOME/.porkcode}"
PORKCODE_SRC="${PORKCODE_SRC:-$HOME/.porkcode-src}"
FORK_REPO="${FORK_REPO:-https://github.com/imrparker/PorkCode.git}"
FORK_BRANCH="${FORK_BRANCH:-develop}"

info()  { echo -e "${MUTED}$*${NC}"; }
warn()  { echo -e "${ORANGE}$*${NC}"; }
err()   { echo -e "${RED}$*${NC}" >&2; }
ok()    { echo -e "${GREEN}$*${NC}"; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Error: $1 is required but not installed."
    exit 1
  fi
}

need git
need bun

# ── 1. Clone or update source ──────────────────────────────────────────
if [ -d "$PORKCODE_SRC/.git" ]; then
  info "Updating existing source at $PORKCODE_SRC ..."
  git -C "$PORKCODE_SRC" fetch origin "$FORK_BRANCH"
  git -C "$PORKCODE_SRC" checkout "$FORK_BRANCH"
  git -C "$PORKCODE_SRC" reset --hard "origin/$FORK_BRANCH"
else
  info "Cloning source (shallow) to $PORKCODE_SRC ..."
  git clone --depth 1 --branch "$FORK_BRANCH" "$FORK_REPO" "$PORKCODE_SRC"
fi

# ── 2. Verify the IME fix is present in source ────────────────────────
PROMPT_FILE="$PORKCODE_SRC/packages/tui/src/component/prompt/index.tsx"
if [ ! -f "$PROMPT_FILE" ]; then
  err "Prompt file not found: $PROMPT_FILE"
  exit 1
fi

if grep -q "setTimeout(() => setTimeout" "$PROMPT_FILE"; then
  ok "IME fix present in source."
else
  err "The IME double-defer fix is missing from $PROMPT_FILE."
  info "It may have moved; check packages/tui/src/component/prompt before building."
  exit 1
fi

# ── 3. Install dependencies ────────────────────────────────────────────
info "Installing dependencies (this may take a minute) ..."
cd "$PORKCODE_SRC"
bun install --frozen-lockfile 2>/dev/null || bun install

# ── 4. Build (current platform only) ──────────────────────────────────
info "Building the PorkCode CLI for current platform ..."
cd "$PORKCODE_SRC/packages/cli"
bun run build --single

# ── 5. Install binary ──────────────────────────────────────────────────
mkdir -p "$PORKCODE_DIR/bin"

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
[ "$ARCH" = "aarch64" ] && ARCH="arm64"
[ "$ARCH" = "x86_64" ] && ARCH="x64"

BUILT_BINARY="$PORKCODE_SRC/packages/cli/dist/cli-${PLATFORM}-${ARCH}/bin/porkcode"

if [ ! -f "$BUILT_BINARY" ]; then
  BUILT_BINARY=$(find "$PORKCODE_SRC/packages/cli/dist" -name "porkcode" -type f -executable 2>/dev/null | head -1)
fi

if [ -n "$BUILT_BINARY" ] && [ -f "$BUILT_BINARY" ]; then
  if [ -f "$PORKCODE_DIR/bin/porkcode" ]; then
    cp "$PORKCODE_DIR/bin/porkcode" "$PORKCODE_DIR/bin/porkcode.bak.$(date +%Y%m%d%H%M%S)"
  fi
  cp "$BUILT_BINARY" "$PORKCODE_DIR/bin/porkcode"
  chmod +x "$PORKCODE_DIR/bin/porkcode"
  ok "Installed to $PORKCODE_DIR/bin/porkcode"
else
  err "Build failed - binary not found in dist/"
  info "Try running manually:"
  echo "  cd $PORKCODE_SRC/packages/cli && bun run build --single"
  exit 1
fi

echo ""
ok "Done! Korean IME fix is now active."
