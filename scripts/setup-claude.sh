#!/bin/bash
# Sets up Claude Code slash commands for this project.
# Run once after cloning the repo.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE="$SCRIPT_DIR/claude-commands"
TARGET="$PROJECT_DIR/.claude/commands"

mkdir -p "$TARGET"

count=0
for file in "$SOURCE"/*.md; do
  [ -f "$file" ] || continue
  cp "$file" "$TARGET/"
  count=$((count + 1))
  echo "  Installed: $(basename "$file")"
done

if [ "$count" -eq 0 ]; then
  echo "No commands found in $SOURCE"
  exit 1
fi

echo ""
echo "Done. $count command(s) installed to .claude/commands/"
echo "Restart Claude Code to use them (e.g. /scrape-game 04-07)"
