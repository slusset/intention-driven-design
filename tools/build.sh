#!/usr/bin/env bash
set -euo pipefail

echo "DEPRECATED: Use 'npm pack' from the repo root to build a distributable tarball." >&2
echo "  cd $(dirname "${BASH_SOURCE[0]}")/.. && npm pack" >&2
echo "" >&2

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$REPO_ROOT/build"
PLUGIN_NAME="idd-skills"
GIT_HASH="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
ZIP_NAME="${PLUGIN_NAME}-${GIT_HASH}.zip"

# Directories always included
INCLUDE=(
  skills
  docs
  .claude-plugin
)

# Top-level files always included
FILES=(
  LICENSE
  README.md
)

# Parse flags
INCLUDE_TECHNICAL=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-technical)
      INCLUDE_TECHNICAL=true
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Build the idd-skills plugin zip.

Options:
  --with-technical   Include technical-skills/ in the archive
  -h, --help         Show this help message

Output: build/${PLUGIN_NAME}-<git-hash>.zip
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if $INCLUDE_TECHNICAL; then
  INCLUDE+=(technical-skills)
fi

# Stage into a temp dir so the zip has an idd-skills/ prefix
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
DEST="$STAGING/$PLUGIN_NAME"
mkdir -p "$DEST"

for dir in "${INCLUDE[@]}"; do
  src="$REPO_ROOT/$dir"
  if [[ -d "$src" ]]; then
    rsync -a --exclude '.DS_Store' "$src/" "$DEST/$dir/"
  else
    echo "Warning: skipping missing directory $dir" >&2
  fi
done

for file in "${FILES[@]}"; do
  src="$REPO_ROOT/$file"
  if [[ -f "$src" ]]; then
    cp "$src" "$DEST/$file"
  else
    echo "Warning: skipping missing file $file" >&2
  fi
done

mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR/$ZIP_NAME"

(cd "$STAGING" && zip -qr "$BUILD_DIR/$ZIP_NAME" "$PLUGIN_NAME")

echo "$BUILD_DIR/$ZIP_NAME"
