#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HOOK_DST="$REPO_ROOT/.git/hooks/post-merge"
mkdir -p "$(dirname "$HOOK_DST")"
cp "$(dirname "$0")/feature-graph-post-merge.sh" "$HOOK_DST"
chmod +x "$HOOK_DST"
echo "installed post-merge hook → $HOOK_DST"
echo "also consider: ln -sf ../../app/scripts/hooks/feature-graph-post-merge.sh .git/hooks/post-commit  (optional)"
