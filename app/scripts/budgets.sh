#!/usr/bin/env bash
# budgets.sh — counter budgets vs ratchets (policy/budgets.md)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

# Count direct runtime dependencies
dep_count=$(node -p "Object.keys(require('./package.json').dependencies||{}).length" 2>/dev/null || echo "?")
echo "deps: $dep_count direct runtime dependencies"
# No hard ceiling yet — ratchet only. Report as metric.
if [ "$dep_count" != "?" ] && [ "$dep_count" -gt 30 ]; then
  echo "⚠️  direct deps >30 — needs refusal-log entry per mobile-simplicity" >&2
fi

# Count native modules: runtime deps shipping android/ or ios/ sources
native_count=0
native_list=""
if [ -d "$ROOT/node_modules" ]; then
  for dep in $(node -p "Object.keys(require('./package.json').dependencies||{}).join(' ')" 2>/dev/null); do
    if [ -d "$ROOT/node_modules/$dep/android" ] || [ -d "$ROOT/node_modules/$dep/ios" ]; then
      native_count=$((native_count + 1))
      native_list="$native_list $dep"
    fi
  done
  echo "native modules: $native_count (${native_list# })"
else
  echo "native modules: node_modules missing — skipped (CI installs first)"
fi

# Unsupported / unmaintained candidates: native deps without first-class New Arch support
if [ -d "$ROOT/node_modules" ]; then
  unsupported=""
  for dep in $(node -p "Object.keys(require('./package.json').dependencies||{}).join(' ')" 2>/dev/null); do
    if [ -d "$ROOT/node_modules/$dep/android" ] || [ -d "$ROOT/node_modules/$dep/ios" ]; then
      if [ "$dep" = "react" ] || [ "$dep" = "react-native" ]; then continue; fi
      has_codegen=$(node -p "try{Boolean(require('./node_modules/$dep/package.json').codegenConfig)}catch(e){false}" 2>/dev/null || echo "false")
      if [ "$has_codegen" != "true" ]; then
        unsupported="$unsupported $dep(no-codegenConfig)"
      fi
    fi
  done
  if [ -n "$unsupported" ]; then
    echo "unsupported candidates:${unsupported} — each needs gate + refusal-log entry per policy/budgets.md"
  else
    echo "unsupported packages: 0 candidates"
  fi
fi

# iOS Pod dependencies (transitive, from Podfile.lock) — ratchet, report as metric
if [ -f "$ROOT/ios/Podfile.lock" ]; then
  pod_count=$(awk '/^PODS:/,/^DEPENDENCIES:/' "$ROOT/ios/Podfile.lock" | grep -c "^  - " || true)
  echo "pods: $pod_count transitive entries in ios/Podfile.lock (ratchet: no growth without gate)"
else
  echo "pods: ios/Podfile.lock missing — skipped"
fi

# Gradle plugins and buildscript classpaths — ratchet, report as metric
if [ -d "$ROOT/android" ]; then
  gradle_classpath=$(grep -rhoE 'classpath\(["'\''][^"'\'']+["'\'']\)' "$ROOT/android" --include="*.gradle" 2>/dev/null | sort -u | wc -l | tr -d ' ')
  gradle_apply=$(grep -rhoE 'apply plugin:[[:space:]]*["'\''][^"'\'']+["'\'']|id\(["'\''][^"'\'']+["'\'']\)' "$ROOT/android" --include="*.gradle" 2>/dev/null | sort -u | wc -l | tr -d ' ')
  echo "gradle: $gradle_classpath classpaths + $gradle_apply apply/id entries (ratchet: no growth without gate)"
  if [ "${gradle_classpath:-0}" -gt 0 ]; then
    grep -rhE 'classpath\(["'\''][^"'\'']+["'\'']\)' "$ROOT/android" --include="*.gradle" 2>/dev/null | sort -u | head -n 20
  fi
fi

# Custom build scripts and extra build phases — ratchet, report as metric
script_count=$(ls -1 "$ROOT/scripts/"*.sh "$ROOT/scripts/"*.mjs 2>/dev/null | wc -l | tr -d ' ')
echo "build scripts: $script_count files in scripts/ (ratchet: each new script needs owner + removal condition)"
ls -1 "$ROOT/scripts/"*.sh "$ROOT/scripts/"*.mjs 2>/dev/null | head -n 20

# Custom native patches — 0 preferred
patch_count=0
if [ -d "$ROOT/patches" ]; then
  patch_count=$(ls -1 "$ROOT/patches" 2>/dev/null | wc -l | tr -d ' ')
fi
has_patch_package=$(node -p "Boolean((require('./package.json')['patch-package'])||(require('./package.json').scripts||{})['postinstall']&&String((require('./package.json').scripts||{}).postinstall).includes('patch-package'))" 2>/dev/null || echo "false")
echo "native patches: $patch_count files in patches/ (preferred 0; any addition needs gate + upstream link + removal plan)"
if [ "$patch_count" != "0" ] && [ "$patch_count" != "" ]; then
  echo "⚠️  custom native patches present — list them in the feature report" >&2
  ls -1 "$ROOT/patches" 2>/dev/null | head -n 20
fi
if [ "$has_patch_package" = "true" ]; then
  echo "⚠️  patch-package hook detected in package.json — counts as a native patch" >&2
fi

# Distinct ways check — grep for second navigation/storage/fetch libs
if grep -R "from 'react-navigation\|from '@react-navigation" "$ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null | head -n 2 | wc -l | grep -q .; then
  nav_count=$(grep -R "from '@react-navigation\|from 'react-native-navigation" "$ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null | cut -d"'" -f2 | sort -u | wc -l | tr -d ' ')
  if [ "${nav_count:-0}" -gt 1 ]; then echo "❌ distinct nav libs >1" >&2; fail=1; fi
fi

# Open flags past removal date — look for TODO with date.
# Report-only: must never fail the gate (hence || true under pipefail).
if grep -R "removeBy\|REMOVE_BY\|flag.*20[0-9][0-9]-" "$ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -q .; then
  echo "flags with removal dates:"
  grep -R "removeBy\|REMOVE_BY" "$ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null | head -n 20 || true
fi

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "budgets: counters ok (ratchets are enforced per-release, not per-commit)"
