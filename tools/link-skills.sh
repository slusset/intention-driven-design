#!/usr/bin/env bash
set -euo pipefail

echo "DEPRECATED: Use 'idd install-skills' instead." >&2
echo "  npm install -g idd-toolkit   # or npx idd install-skills claude" >&2
echo "  idd install-skills claude [--with-technical] [--link]" >&2
echo "" >&2

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IDD_SOURCE_DIR="$REPO_ROOT/skills"
TECH_SOURCE_DIR="$REPO_ROOT/technical-skills"

usage() {
  cat <<EOF
Usage: $(basename "$0") <target> [--with-technical]

Symlink skill directories into the target agent's skills folder.

Targets:
  claude       ~/.claude/skills
  codex        ~/.codex/skills
  all          Both claude and codex

Options:
  --with-technical   Also link technical-skills
  --unlink           Remove symlinks instead of creating them
  -h, --help         Show this help message
EOF
  exit 0
}

# ── Parse args ────────────────────────────────────────────────

TARGET=""
INCLUDE_TECHNICAL=false
UNLINK=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    claude|codex|all) TARGET="$1"; shift ;;
    --with-technical)  INCLUDE_TECHNICAL=true; shift ;;
    --unlink)          UNLINK=true; shift ;;
    -h|--help)         usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Error: target is required (claude, codex, or all)" >&2
  echo ""
  usage
fi

# ── Resolve target dirs ──────────────────────────────────────

TARGETS=()
case "$TARGET" in
  claude) TARGETS=("$HOME/.claude/skills") ;;
  codex)  TARGETS=("$HOME/.codex/skills") ;;
  all)    TARGETS=("$HOME/.claude/skills" "$HOME/.codex/skills") ;;
esac

# ── Collect source skill dirs ────────────────────────────────

SOURCE_DIRS=()
if [[ -d "$IDD_SOURCE_DIR" ]]; then
  for d in "$IDD_SOURCE_DIR"/*/; do
    [[ -d "$d" ]] && SOURCE_DIRS+=("$d")
  done
else
  echo "Missing source dir: $IDD_SOURCE_DIR" >&2
  exit 1
fi

if $INCLUDE_TECHNICAL; then
  if [[ -d "$TECH_SOURCE_DIR" ]]; then
    for d in "$TECH_SOURCE_DIR"/*/; do
      [[ -d "$d" ]] && SOURCE_DIRS+=("$d")
    done
  else
    echo "Warning: $TECH_SOURCE_DIR not found, skipping" >&2
  fi
fi

# ── Link or unlink ───────────────────────────────────────────

for target_dir in "${TARGETS[@]}"; do
  mkdir -p "$target_dir"

  for src in "${SOURCE_DIRS[@]}"; do
    name="$(basename "$src")"
    link="$target_dir/$name"

    if $UNLINK; then
      if [[ -L "$link" ]]; then
        rm "$link"
        echo "  Removed $link"
      fi
    else
      # Remove stale link or existing directory
      if [[ -L "$link" ]]; then
        rm "$link"
      elif [[ -d "$link" ]]; then
        echo "  Warning: replacing directory $link with symlink" >&2
        rm -rf "$link"
      fi

      ln -s "$src" "$link"
      echo "  $link -> $src"
    fi
  done

  if $UNLINK; then
    echo "Unlinked from $target_dir"
  else
    echo "Linked to $target_dir"
  fi
done
