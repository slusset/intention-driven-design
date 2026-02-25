#!/usr/bin/env bash
set -euo pipefail

SKILLS=(
  skills/solution-narrative
  skills/domain-modeling
  skills/behavior-contract
  skills/e2e-journey-testing
  skills/workflow-guide
  technical-skills/angular-architecture
  technical-skills/angular-from-design
  technical-skills/angular-playwright
  technical-skills/spring-boot-architecture
)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT=""
PROJECT=false

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Install IDD skills to agent runtime directories.

Options:
  --agent claude-code   Install to ~/.claude/skills/ only
  --agent codex         Install to ~/.codex/skills/ only
  --project             Install to ./.claude/skills/ (project-local)
  -h, --help            Show this help message

With no options, installs to both ~/.claude/skills/ and ~/.codex/skills/.
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      AGENT="$2"
      shift 2
      ;;
    --project)
      PROJECT=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

install_to() {
  local dest_root="$1"
  for skill in "${SKILLS[@]}"; do
    dest="$dest_root/$skill"
    mkdir -p "$(dirname "$dest")"
    cp -R "$SCRIPT_DIR/$skill" "$dest"
  done
  echo "Installed ${#SKILLS[@]} skills to $dest_root"
}

if $PROJECT; then
  install_to "./.claude/skills"
  exit 0
fi

case "$AGENT" in
  "")
    install_to "$HOME/.claude/skills"
    install_to "$HOME/.codex/skills"
    ;;
  claude-code|claude)
    install_to "$HOME/.claude/skills"
    ;;
  codex)
    install_to "$HOME/.codex/skills"
    ;;
  *)
    echo "Unknown agent: $AGENT (use claude-code or codex)" >&2
    exit 1
    ;;
esac
