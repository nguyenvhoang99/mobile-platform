#!/usr/bin/env bash
# hook: regenerate feature graph when src/ or policy/capabilities.yaml changed
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if git -C "$ROOT/.." diff --name-only HEAD@{1}..HEAD 2>/dev/null | grep -qE '^(app/src/|policy/capabilities.yaml)'; then
  echo "feature-graph: changes detected — regenerating docs/feature-graph.*"
  node "$ROOT/scripts/feature-graph.mjs"
  echo "feature-graph: done — run: git add docs/feature-graph.*"
fi
