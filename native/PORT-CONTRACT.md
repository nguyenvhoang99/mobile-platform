# Native migration contract — 2026-10-03

Status: executable native PoC implemented; release/device acceptance pending; owner: Mobile Platform. Explicit user direction replaces the RN-host default for the new root `ios/` and `android/` applications. Existing `app/` and its uncommitted work remain the rollback/reference implementation.

## Scope and parity

Port the executable PoC: four tenants, seven catalog entries, category/app pinning, two dock slots, host-controlled route history and approved cross-links, card search/details with all twelve illustrative seed cards, SDK Demo booking fixtures, memory-only scoped storage and bill draft/unsupported AI behavior, account device actions, inbox and host reminders/calendar/Live Activity. Weather/transit/notes/market/badminton catalog surfaces remain route previews, as in RN; SDK Demo owns the local booking fixture. No fabricated live weather, bookings, offers, AI output or authenticated identity.

The native apps have separate development identifiers; they do not overwrite RN installation data. Cross-install migration, signed remote configuration, production auth, FCM/APNs provisioning/backend registration, package verification, real isolated external WebView runtime, review/rollout pipelines and lab enforcement remain open. No external package is executed. Absence of a WebView is a fail-closed PoC boundary, not proof of C1/B1–B5.

## Ownership, data and lifecycle

Host UI → app state/domain → platform adapters. UI owns transient search/sheets/amount/recipient; host snapshot owns versioned tenant-scoped pin/dock preferences and inbox. No sensitive draft persisted. Atomic serialized disk writes; failed writes show failure, not success. Corrupt snapshot preserved for recovery. Sample booking fixture is per-open, resets on close; memory KV is per-(tenant, app, local-preview-user), survives close within process and resets on restart. Caller scope is created by host, never request fields. Sample declares/grants only storage.kv and ai.extract_bill. Registry is generated from `policy/capabilities.yaml`; unknown capability/version, invalid args, missing grant/consent, quota and revoked session return closed codes. Unsupported device bridge adapters fail closed. Host device access is separate from public capabilities.

Foreground one-shot location/speech/auth cancel on background/navigation/tenant switch; callbacks require current generation. No permission ask at launch. Calendar is user-edited via EventKitUI/INSERT intent: presenting editor does not prove save. Notifications request permission at meaningful use; reminders schedule through OS, never report delivery from enqueue. Android alarms are inexact without exact-alarm permission and restored on reboot. iOS ActivityKit is gated by availability and authorization, separate from notification scheduling. Cancel booking cancels associated reminders. Expired notifications cannot route; target must match catalog entrypoint, source, input keys and current tenant. Remote payload carries no tenant authority; no backend topic subscription configured.

## Platform choices

SwiftUI system List/Form/sheets and Dynamic Type; UIKit adapters for calendar; iOS deployment baseline 15.1 retained, ActivityKit extension 16.1. Kotlin platform Activity/ListView/Dialogs, semantic input and native recycling; minSdk 24, compile/targetSdk 36 retained. Native view toolkit avoids additional Compose/AndroidX runtime dependencies in this port. New native binaries lose RN OTA agility: copy/content are bundled fixtures, remote updating remains blocked until signed config exists. Release rollback requires another binary; keeping RN source is only development rollback.

## Gates and evidence

No policy values relaxed. Canonical performance/counter rows remain in `policy/budgets.md`. All startup, memory, frames, release binary size, clean/incremental build, reproducibility and crash rows are unverified until same-device release before/after traces/artifacts exist. Native trace markers enable measurement; no speed or security claim follows from compilation. RN gates continue to cover RN only. Native domain tests, native compilation, content consistency and native boundary tests must run separately. Human owns UX acceptance on actual build/device, screen readers, large text, Reduce Motion, keyboard, offline, deny/revoke, back/close, background/restart and reminders/calendar.

Native checks are not yet wired into hosted CI. Local journal ports only the exercised host event subset; telemetry transport/replay/full instrumentation remain open. Existing RN framework and policies remain reference sources.

New build tooling: Xcode application/extension targets, Android application + Kotlin compiler plugins (existing repo versions/tool cache selected where compatible), one content exporter. No CocoaPods, JS runtime, RN, or third-party UI SDK in either new host. Exporter owner Mobile Platform; removal condition signed configuration replaces bundled content. No custom patches. Count actual artifacts in evidence; existing RN budget script does not count root native projects.


## Addendum — 2026-10-04 bundled Split Bill

The initial migration's absence-of-WebView description is superseded for the explicitly requested bundled Split Bill only. Root hosts now execute the pinned first-party host-target assets in a native WKWebView/WebView, with protocol-compatible native storage/scanner/network adapters. External downloads, author/store signature workflow and production guarantees remain blocked. See SPLIT-BILL-CONTRACT.md and SPLIT-BILL-VERIFICATION.md; RN reference remains unchanged.
