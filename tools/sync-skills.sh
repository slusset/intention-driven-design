#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IDD_SOURCE_DIR="$REPO_ROOT/skills"
TECH_SOURCE_DIR="$REPO_ROOT/technical-skills"
CODEX_DIR="$HOME/.codex/skills"
CLAUDE_DIR="$HOME/.claude/skills"

if [[ ! -d "$IDD_SOURCE_DIR" ]]; then
  echo "Missing source dir: $IDD_SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -d "$TECH_SOURCE_DIR" ]]; then
  echo "Missing source dir: $TECH_SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$CODEX_DIR" "$CLAUDE_DIR"

STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGING_DIR"' EXIT

rsync -a --exclude '.DS_Store' "$IDD_SOURCE_DIR/" "$STAGING_DIR/"
rsync -a --exclude '.DS_Store' "$TECH_SOURCE_DIR/" "$STAGING_DIR/"

echo "Syncing repository skills -> $CODEX_DIR"
rsync -a --delete --exclude '.DS_Store' "$STAGING_DIR/" "$CODEX_DIR/"

echo "Syncing repository skills -> $CLAUDE_DIR"
rsync -a --delete --exclude '.DS_Store' "$STAGING_DIR/" "$CLAUDE_DIR/"

echo "Done"
