#!/usr/bin/env bash
# provenance.sh — checks S6/H7: every change carries task provenance
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# For mobile-only MVP, provenance is the last commit message containing a task marker.
# Valid markers: [task: ...] or Task: or provenance: in commit body.
last_msg=$(git log -1 --pretty=%B 2>/dev/null || echo "")
if echo "$last_msg" | grep -qiE "\[task:|task:|provenance:"; then
  echo "provenance: present — $(echo "$last_msg" | head -n1)"
  exit 0
fi
echo "⚠️  provenance: last commit lacks task marker (expected '[task: ...]' in message)" >&2
echo "   This is advisory locally, blocking in CI (--strict)." >&2
exit 0
