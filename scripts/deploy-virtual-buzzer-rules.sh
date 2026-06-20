#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-berean-board-virtual-buzzers}"
RULES_FILE="docs/developer-docs/virtual-buzzers-rtdb-rules.json"

if [ ! -f "$RULES_FILE" ]; then
  echo "Missing $RULES_FILE. Run this script from the repository root." >&2
  exit 1
fi

python -m json.tool "$RULES_FILE" >/dev/null
npx --yes firebase-tools@latest deploy --only database --project "$PROJECT_ID" --non-interactive
