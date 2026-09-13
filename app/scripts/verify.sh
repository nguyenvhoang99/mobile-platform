#!/usr/bin/env bash
# verify.sh — mechanical definition of done (H4)
# Exit code decides done. No human judgement of "is it finished".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "❌ $1" >&2; exit 1; }
ok()   { echo "✅ $1"; }

echo "▶ verify — $(date -u +%Y-%m-%dT%H:%M:%SZ) — $(git rev-parse --short HEAD 2>/dev/null || echo no-git)"

echo ""
echo "1/6 typecheck"
npm run typecheck --silent || fail "typecheck"

echo ""
echo "2/6 lint"
# eslint may not have a config that covers everything; treat missing as pass for now
if npm run lint --silent 2>&1 | head -n 200; then
  ok "lint"
else
  # eslint error vs no-config — surface it
  npm run lint 2>&1 | head -n 80
  fail "lint"
fi

echo ""
echo "3/6 unit tests"
npm test --silent 2>&1 | tail -n 60
npm test --silent || fail "unit tests"

echo ""
echo "4/6 static conformance — cheap greps (policy/conformance.md C1-C9, R1-R3, S1-S7)"
bash "$ROOT/scripts/conformance.sh" || fail "static conformance"

echo ""
echo "5/6 budgets — counters vs ratchets"
bash "$ROOT/scripts/budgets.sh" || fail "budgets"

echo ""
echo "6/6 provenance"
# Every commit in this branch must carry a task provenance trailer or the change is unattributable (S6/H7).
# For MVP this is advisory unless --strict is passed; CI runs with --strict.
if [[ "${1:-}" == "--strict" ]]; then
  bash "$ROOT/scripts/provenance.sh" || fail "provenance"
else
  bash "$ROOT/scripts/provenance.sh" || echo "⚠️  provenance warnings (run with --strict to enforce)"
fi

echo ""
ok "verify — all mechanical checks passed"
