#!/usr/bin/env bash
# Installiert das Agenten-Team global fuer alle Projekte (~/.claude).
# Ausfuehren auf dem eigenen Rechner:  bash team-kit/install.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${CLAUDE_HOME:-$HOME/.claude}"

mkdir -p "$TARGET/agents" "$TARGET/skills/team"
for f in pm design frontend backend; do
  cp "$DIR/agents/$f.md" "$TARGET/agents/$f.md"
  echo "  -> $TARGET/agents/$f.md"
done
cp "$DIR/skills/team/SKILL.md" "$TARGET/skills/team/SKILL.md"
echo "  -> $TARGET/skills/team/SKILL.md"
echo
echo "Fertig. In jedem Projekt nutzbar mit:  /team <was gebaut werden soll>"
