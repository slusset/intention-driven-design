#!/usr/bin/env bash
set -euo pipefail

CODEX_DIR="$HOME/.codex/skills"
CLAUDE_DIR="$HOME/.claude/skills"

if [[ ! -d "$CODEX_DIR" || ! -d "$CLAUDE_DIR" ]]; then
  echo "Both $CODEX_DIR and $CLAUDE_DIR must exist" >&2
  exit 1
fi

diff -qr "$CODEX_DIR" "$CLAUDE_DIR" || true
