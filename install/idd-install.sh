#!/bin/sh
# Standalone IDD Toolkit CLI installer.
#
# Installs one immutable release of the toolkit into a versioned directory and
# links `idd` into a bin directory, with no dependency on a repository-local
# node_modules, a global npm prefix, or a plugin host. Releases sit side by
# side, so a consumer gate can call the exact accepted version directly:
#
#   ~/.idd/toolkits/<version>/bin/idd
#
# The release tarball is the npm pack artifact attached to every GitHub
# release; its dist/bin/idd.js bundle inlines the CLI, the validators, and the
# runtime dependencies, so only Node.js (>= 18) is required at runtime.
#
# Usage:
#   sh idd-install.sh                       # latest release
#   sh idd-install.sh --version 0.1.0-uat.4 # an exact release
#   sh idd-install.sh --from-file idd-toolkit-0.1.0-uat.4.tgz
#   sh idd-install.sh --prefix ~/.idd --bin-dir ~/.local/bin
#
# Environment: IDD_INSTALL_PREFIX, IDD_INSTALL_BIN_DIR mirror the flags.
set -eu

REPO="slusset/intention-driven-design"
PREFIX="${IDD_INSTALL_PREFIX:-$HOME/.idd}"
BIN_DIR="${IDD_INSTALL_BIN_DIR:-$HOME/.local/bin}"
VERSION=""
FROM_FILE=""
NO_LINK=0

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
}

fail() {
  echo "idd-install: $1" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:?--version needs a value}"; shift 2 ;;
    --from-file) FROM_FILE="${2:?--from-file needs a value}"; shift 2 ;;
    --prefix) PREFIX="${2:?--prefix needs a value}"; shift 2 ;;
    --bin-dir) BIN_DIR="${2:?--bin-dir needs a value}"; shift 2 ;;
    --no-link) NO_LINK=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
done

command -v node >/dev/null 2>&1 || fail "Node.js is required (>= 18) and was not found on PATH"
command -v tar >/dev/null 2>&1 || fail "tar is required"

VERSION="${VERSION#v}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -n "$FROM_FILE" ]; then
  [ -f "$FROM_FILE" ] || fail "no such file: $FROM_FILE"
  TARBALL="$FROM_FILE"
else
  command -v curl >/dev/null 2>&1 || fail "curl is required to download a release (or pass --from-file)"
  if [ -z "$VERSION" ]; then
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1)"
    [ -n "$VERSION" ] || fail "could not determine the latest release; pass --version"
  fi
  ASSET="idd-toolkit-$VERSION.tgz"
  BASE="https://github.com/$REPO/releases/download/v$VERSION"
  echo "Downloading $ASSET"
  curl -fsSL -o "$WORK/$ASSET" "$BASE/$ASSET" || fail "download failed: $BASE/$ASSET"
  TARBALL="$WORK/$ASSET"
  # Verify against the published checksum when the release carries one.
  if curl -fsSL -o "$WORK/SHA256SUMS" "$BASE/SHA256SUMS" 2>/dev/null; then
    EXPECTED="$(grep " $ASSET\$" "$WORK/SHA256SUMS" | cut -d ' ' -f 1)"
    if [ -n "$EXPECTED" ]; then
      if command -v sha256sum >/dev/null 2>&1; then ACTUAL="$(sha256sum "$TARBALL" | cut -d ' ' -f 1)"
      elif command -v shasum >/dev/null 2>&1; then ACTUAL="$(shasum -a 256 "$TARBALL" | cut -d ' ' -f 1)"
      else ACTUAL=""; fi
      if [ -n "$ACTUAL" ]; then
        [ "$ACTUAL" = "$EXPECTED" ] || fail "checksum mismatch for $ASSET"
        echo "Checksum verified"
      fi
    fi
  fi
fi

mkdir -p "$WORK/unpack"
tar -xzf "$TARBALL" -C "$WORK/unpack"
[ -f "$WORK/unpack/package/package.json" ] || fail "tarball does not contain an npm package"
[ -f "$WORK/unpack/package/dist/bin/idd.js" ] || fail "tarball has no self-contained bundle (dist/bin/idd.js); releases before 0.1.0-uat.3 are not standalone"

PKG_VERSION="$(node -p "require('$WORK/unpack/package/package.json').version")"
if [ -n "$VERSION" ] && [ "$PKG_VERSION" != "$VERSION" ]; then
  fail "requested $VERSION but the tarball is $PKG_VERSION"
fi
VERSION="$PKG_VERSION"

TARGET="$PREFIX/toolkits/$VERSION"
if [ -d "$TARGET" ]; then
  echo "Replacing existing $TARGET"
  rm -rf "$TARGET"
fi
mkdir -p "$PREFIX/toolkits"
mv "$WORK/unpack/package" "$TARGET"
chmod +x "$TARGET/bin/idd" "$TARGET/bin/idd.js" 2>/dev/null || true

# The bin/idd wrapper prefers a repository-local node_modules when present and
# otherwise runs dist/bin/idd.js, so a standalone install never needs npm.
"$TARGET/bin/idd" version >/dev/null || fail "installed toolkit does not run"

echo "Installed idd-toolkit $VERSION to $TARGET"

if [ "$NO_LINK" -eq 0 ]; then
  mkdir -p "$BIN_DIR"
  ln -sfn "$TARGET/bin/idd" "$BIN_DIR/idd"
  echo "Linked $BIN_DIR/idd -> $TARGET/bin/idd"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "Add $BIN_DIR to PATH to use \`idd\` directly; the versioned path works without it." ;;
  esac
fi

echo "Verify with: $TARGET/bin/idd version"
