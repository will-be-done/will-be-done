#!/bin/sh
# Installs or updates the Will Be Done CLI (wbd).
#
#   curl -fsSL https://raw.githubusercontent.com/will-be-done/will-be-done/main/apps/cli/install.sh | sh
#   wget -qO- https://raw.githubusercontent.com/will-be-done/will-be-done/main/apps/cli/install.sh | sh
#
# Environment:
#   WBD_VERSION      version to install, e.g. 0.2.0 (default: latest)
#   WBD_INSTALL_DIR  where to put the binary (default: ~/.local/bin)

set -eu

REPO="will-be-done/will-be-done"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# Wrapped in a function so a partially downloaded script never runs.
main() {
  install_dir="${WBD_INSTALL_DIR:-$HOME/.local/bin}"

  if command -v curl >/dev/null 2>&1; then
    fetch() { curl -fsSL "$1"; }
  elif command -v wget >/dev/null 2>&1; then
    fetch() { wget -qO- "$1"; }
  else
    fail "curl or wget is required"
  fi

  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) fail "unsupported OS $(uname -s). Download wbd from https://github.com/$REPO/releases" ;;
  esac

  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) fail "unsupported architecture $(uname -m)" ;;
  esac

  # An x64 shell under Rosetta still runs on Apple silicon.
  if [ "$os" = darwin ] && [ "$arch" = x64 ] &&
    [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
    arch=arm64
  fi

  if [ -n "${WBD_VERSION:-}" ]; then
    tag="cli-v${WBD_VERSION#v}"
  else
    # The repository's "latest" release is the desktop app, so find the newest CLI tag.
    tag=$(fetch "https://api.github.com/repos/$REPO/releases?per_page=100" |
      grep -o '"tag_name": *"cli-v[^"]*"' | head -n 1 | sed 's/.*"\(cli-v[^"]*\)"/\1/')
    [ -n "$tag" ] || fail "could not find a CLI release at https://github.com/$REPO/releases"
  fi

  asset="wbd-$os-$arch"
  base="https://github.com/$REPO/releases/download/$tag"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  printf 'Downloading %s (%s)...\n' "$asset" "$tag"
  fetch "$base/$asset" >"$tmp/wbd" || fail "could not download $base/$asset"
  fetch "$base/checksums.txt" >"$tmp/checksums.txt" || fail "could not download checksums"

  expected=$(grep " $asset\$" "$tmp/checksums.txt" | cut -d ' ' -f 1)
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$tmp/wbd" | cut -d ' ' -f 1)
  else
    actual=$(shasum -a 256 "$tmp/wbd" | cut -d ' ' -f 1)
  fi
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "checksum mismatch for $asset"

  mkdir -p "$install_dir"
  chmod +x "$tmp/wbd"
  mv "$tmp/wbd" "$install_dir/wbd"

  printf '\342\234\223 Installed wbd %s to %s\n' "${tag#cli-v}" "$install_dir/wbd"
  case ":$PATH:" in
    *":$install_dir:"*) ;;
    *) printf '\nAdd it to your PATH:\n  export PATH="%s:$PATH"\n' "$install_dir" ;;
  esac
  printf '\nGet started:\n  wbd auth login\n'
}

main "$@"
