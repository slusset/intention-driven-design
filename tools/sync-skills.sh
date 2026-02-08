#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/skills"
CODEX_DIR="$HOME/.codex/skills"
CLAUDE_DIR="$HOME/.claude/skills"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Missing source dir: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$CODEX_DIR" "$CLAUDE_DIR"

echo "Syncing repository skills -> $CODEX_DIR"
rsync -a --delete --exclude '.DS_Store' "$SOURCE_DIR/" "$CODEX_DIR/"

echo "Syncing repository skills -> $CLAUDE_DIR"
rsync -a --delete --exclude '.DS_Store' "$SOURCE_DIR/" "$CLAUDE_DIR/"

echo "Done"
