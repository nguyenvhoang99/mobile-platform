#!/usr/bin/env bash
# conformance.sh — static C/R/S checks from policy/conformance.md
# Cheap, runs on every change. Greps or file comparisons only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
POLICY_ROOT="$(cd "$ROOT/.." && pwd)/policy"

fail=0
check() {
  local id="$1" msg="$2" code="$3"
  if eval "$code"; then
    echo "✅ $id — $msg"
  else
    echo "❌ $id — $msg" >&2
    fail=1
  fi
}

# C1 — exactly one call site constructs a mini-app WebView
# The single factory is MiniAppContainer.create — grep for WebView construction
check "C1" "one WebView factory" '
  count=$(grep -R "new WebView\|<WebView\|WebView(" "$SRC" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "__tests__" | grep -v ".test." | wc -l | tr -d " ");
  # Before the container exists, 0 is allowed; after it exists, must be exactly 1 file
  # Detect the factory file and ensure no other file constructs a WebView
  factory_files=$(grep -R "new WebView\|<WebView" "$SRC" --include="*.ts" --include="*.tsx" -l 2>/dev/null | grep -v "__tests__" | grep -v "\.test\." | wc -l | tr -d " ");
  [ "$factory_files" -le 1 ]
'

# C2 — No consent/permission/tier check in mini-app-facing JS
# We flag consent/permission checks inside the injected SDK surface (if it exists) and mini-app bundles.
# Host-side checks in src/bridge/ and src/miniapps/container are allowed.
check "C2" "no tier/consent check in mini-app JS" '
  ! grep -R "checkConsent\|checkPermission\|hasTier" "$SRC/miniapps/sample" "$SRC/bridge/sdk" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -q .
'

# C3 — No handler reads identity/origin/appId from request envelope
check "C3" "no identity read from envelope" '
  ! grep -R "envelope\.appId\|envelope\.origin\|envelope\.userId\|payload\.appId" "$SRC/bridge" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -q .
'

# C4 — No handler accepts filesystem path nor returns absolute path
check "C4" "no filesystem path in bridge" '
  ! grep -R "filePath.*string.*path\|return.*absolutePath\|path\.resolve" "$SRC/bridge" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -q .
'

# C6 — No Intent parsing in container path
check "C6" "no Intent parsing in container" '
  ! grep -R "Intent\|intent://" "$SRC/miniapps/container" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -q .
'

# C7 — No RN scroll handler on mini-app WebView
check "C7" "no RN scroll handler on WebView" '
  ! grep -R "onScroll.*WebView\|WebView.*onScroll" "$SRC" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -q .
'

# R1 — every handler has capability entry and vice versa
# Handlers are enumerated in src/bridge/register.ts via registerHandler('name', ...)
# File basenames use camelCase, so compare against the registered names, not filenames.
if [ -f "$POLICY_ROOT/capabilities.yaml" ] && [ -f "$SRC/bridge/register.ts" ]; then
  check "R1" "handlers ↔ capabilities.yaml agreement" "
    if command -v yq >/dev/null 2>&1; then
      yq -r '.capabilities[].name' \"$POLICY_ROOT/capabilities.yaml\" 2>/dev/null | sort > /tmp/caps_yaml.txt || true
    else
      grep -E '^\s*-\s*name:' \"$POLICY_ROOT/capabilities.yaml\" 2>/dev/null | sed -E 's/.*name:\s*//' | sed 's/^[[:space:]]*//' | sort > /tmp/caps_yaml.txt || true
    fi
    grep -o \"registerHandler('[^']*'\" \"$SRC/bridge/register.ts\" 2>/dev/null | cut -d\"'\" -f2 | sort > /tmp/caps_handlers.txt || true
    diff -u /tmp/caps_yaml.txt /tmp/caps_handlers.txt >/dev/null 2>&1 || {
      echo '   handlers vs yaml diff:' >&2
      diff -u /tmp/caps_yaml.txt /tmp/caps_handlers.txt 2>&1 | head -n 40 >&2
      false
    }
  "
else
  echo "⊘ R1 — skipped (no register)"
fi

# S2 — budget numbers are imported, not inlined (outside generated file)
check "S2" "budget numbers imported, not inlined" '
  # Look for raw literals that look like budget values outside the budgets module.
  # Test files are exempt: T0-style spec tests import the canonical module and
  # assert its values (change detectors), they cannot ship a diverged constant.
  ! grep -R "16\.67\|FROZEN.*700" "$SRC" --include="*.ts" --include="*.tsx" | grep -v "src/config/budgets.ts" | grep -v "__tests__" | grep -v "\.test\." | grep -q .
'

# S3 — Codegen spec parity: every method in src/native/specs/Native*.ts must
# exist in the native implementation on BOTH platforms. ObjC/Kotlin adopt the
# generated specs at compile time; the Swift module binds via its companion
# .mm, so this grep is the machine that catches Swift-side drift.
# (`addListener`/`removeListeners` are provided by the RCTEventEmitter base on
# iOS and exempted there only.)
check "S3" "spec methods exist on both platforms" '
  spec_fail=0
  check_method() {
    spec_name="$1"; method="$2"; file="$3"; pattern="$4"; side="$5"
    if ! grep -q "$pattern" "$file" 2>/dev/null; then
      echo "   S3 — $spec_name.$method missing on $side" >&2
      spec_fail=1
    fi
  }
  for spec in "$ROOT/src/native/specs"/Native*.ts; do
    base=$(basename "$spec" .ts)
    case "$base" in
      NativeHostStorage)
        kt="$ROOT/android/app/src/main/java/com/miniappplatform/hoststorage/HostStorageModule.kt"
        mm="$ROOT/ios/MiniAppPlatform/HostStorageModule.mm"
        swift=""; base_provided=""
        ;;
      NativeDeviceAccess)
        kt="$ROOT/android/app/src/main/java/com/miniappplatform/deviceaccess/DeviceAccessModule.kt"
        mm="$ROOT/ios/MiniAppPlatform/DeviceAccessModule.mm"
        swift=""; base_provided=""
        ;;
      NativeNotification)
        kt="$ROOT/android/app/src/main/java/com/miniappplatform/notifications/NotificationModule.kt"
        mm=""
        swift="$ROOT/ios/MiniAppPlatform/NotificationModule.swift"
        base_provided="addListener removeListeners"
        ;;
      NativeOnDeviceLlm)
        kt="$ROOT/android/app/src/main/java/com/miniappplatform/ondevicellm/OnDeviceLlmModule.kt"
        mm="$ROOT/ios/MiniAppPlatform/OnDeviceLlmModule.mm"
        swift=""; base_provided=""
        ;;
      *) echo "⚠️  S3 — no native mapping for $base" >&2; spec_fail=1; continue ;;
    esac
    for method in $(grep -oE "^  [A-Za-z0-9_]+" "$spec" | tr -d " "); do
      [ -n "$kt" ] && check_method "$base" "$method" "$kt" "fun $method(" "android"
      [ -n "$mm" ] && check_method "$base" "$method" "$mm" "$method:" "ios"
      if [ -n "$swift" ]; then
        case " $base_provided " in
          *" $method "*) ;;
          *) check_method "$base" "$method" "$swift" "func $method(" "ios" ;;
        esac
      fi
    done
  done
  [ "$spec_fail" -eq 0 ]
'

# S5 — test weakening detection (advisory for now, becomes blocking)
# Count skipped tests
if grep -R "it\.skip\|test\.skip\|describe\.skip\|xit(" "$SRC" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -q .; then
  echo "⚠️  S5 — skipped tests detected (needs gate label):"
  grep -R "it\.skip\|test\.skip\|describe\.skip" "$SRC" --include="*.ts" --include="*.tsx" 2>/dev/null | head -n 10
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "conformance: FAILED — see policy/conformance.md" >&2
  exit 1
fi
echo "conformance: all static checks passed"
