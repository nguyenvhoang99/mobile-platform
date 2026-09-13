# Native Host Core — layer decision

**Status:** partially decided (human review, see "Decisions recorded" below).
P2 native runtime is **deferred** — the bridge/container stays in React Native.
The TypeScript pipeline in `src/bridge/*` and `src/miniapps/container/*`
remains the current implementation.

## Decisions recorded

1. **Keep in shell:** bootstrap, HostStorage, DeviceAccess, generic notification
   transports (permission, FCM/APNs registration, event store, generic reminder
   scheduler, generic calendar presenter, generic Live Activity mechanics).
   Approved.
2. **Badminton out of shell:** `BadmintonReminderScheduler`,
   `BadmintonCalendarEventLauncher`, and badminton Live Activity content moved to
   React Native. The shell exposes only the generic notification module; copy,
   category, channel, and target routing are composed in
   `src/notification/notificationService.ts` and delivered through the unchanged
   generic bridge methods. Done in the same change as this record.
3. **Runtime stays in React Native for now:** bridge transport + gates,
   container/scheme handling/verify, and pool lifecycle remain TS. Rationale:
   no measured overhead justifying a native move, and RN keeps customization
   flexibility. P2 native runtime deferred until a budget row forces it —
   per the layer rule, only a measurement moves code down, never preference.
4. **Codegen for the three transport modules:** done. `src/native/specs/Native*.ts`
   is the single source of truth; Android extends the generated specs,
   ObjC adopts them via `.mm` + `getTurboModule`, Swift binds via the
   `NotificationModule+Spec.mm` companion, and `scripts/conformance.sh` S3
   enforces spec↔native parity on both platforms every change.

**Layer:** native shell (Kotlin/Swift mechanisms) for the mini-app runtime core;
React Native host for first-party product UI; signed remote configuration for policy.
The RN↔core boundary is Codegen TurboModules (JSI) — no hand-written bridge signatures (S3).

```
┌─ native shell ───────────── store, cannot roll back ───────────────────┐
│  Native Host Core (Kotlin / Swift)                                     │
│    MiniApp Runtime · Security · Permissions · WebView container        │
│    Storage · Networking (host-mediated) · Capability executors         │
│    Lifecycle (foreground/background/evict/renderer-death)              │
│  ── JSI boundary: Codegen TurboModule spec, additive-only, snapshot ── │
│  React Native host ─────── OTA updatable ───────────────────────────── │
│    Product Screens · Forms · Feed · Settings · Common UI               │
│    (depends only on host ports, never on core internals)               │
└────────────────────────────────────────────────────────────────────────┘
```

## Why this layer — one forcing constraint per row

| Proposed native row | Forcing constraint (not preference) |
|---|---|
| MiniApp Runtime / WebView / JS engine | Must survive an RN reload or RN JS issue; renderer-death handling must cover pooled/hidden instances (B4), which JS cannot guarantee for itself. **Deferred:** stays in RN until a measured budget row forces the move (decision 3). |
| Security / Permissions / Capability executors | Authority checks in mini-app-facing JS are the drift signal (C2/C3). Production enforcement (SEC-001: origin-bound native bridge, pre-script verify) requires native. **Deferred with the runtime** — PoC keeps the TS pipeline; external mini-apps stay blocked until this lands. |
| Storage / Networking (host-mediated) | Quota, revocation, and lifecycle stop must actually release/stop (JS-only ignore releases nothing); per-tenant isolation is a tenancy boundary. **Kept:** generic transports live in shell; product composition lives in RN (decisions 1–2). |
| Lifecycle | Eviction, memory-pressure teardown, and pool reset must run when JS is busy or gone. **Deferred with the runtime** (decision 3). |
| RN UI for product screens | Default layer: ordinary interactions, ships weekly, remotely updatable. |
| Future SwiftUI/Compose swap | Explicitly **not** the forcing constraint — it is option value from ports + Codegen boundary, not a measured performance claim. |

## Budget it must respect

Canonical rows in `policy/budgets.md` (values live there, not here):
bridge round-trip (one frame), tap→splash, mini-app open warm/cold,
cold/warm start, memory idle / per-WebView / heavy-screen / 3-mini-apps,
binary-size and Hermes-bundle ratchets, clean/incremental build timing.

Two honest statements:

1. Moving code into native typically **costs** binary size and clean-build time.
   The proposal must show headroom on those ratchets, not just wins elsewhere.
2. No performance improvement is claimed by this document. Each row needs a
   lab baseline (low-tier reference, release build) before the native core lands
   and an after-measurement on the same fixture — per `mobile-smoothness`.
   "Should be faster" is not an entry.

## What ships remotely vs in the binary

Binary (mechanisms only): WebView factory + scheme handler, package/signature
verifier, CSP response header, navigation containment, warm pool + reset,
broker transport, capability executors, lifecycle/eviction, audit append.

Remote/signed (policy): quotas, thresholds, tier grants, allowlists
(`egressHosts`, routes), consent purpose strings, token snapshot, rollout
percentages, kill/authority-expiry. A threshold or string found in the binary
is a defect against the thin-shell invariant, not a shortcut.

## Rollback story

Native core rolls back through store review — i.e. slowly. Therefore: ship the
core additive and versioned with a compatibility window (host accepts old+new,
observe, migrate, remove only when the N−2 population permits); kill by server
authority expiry, never by reaching the device. RN UI and remote policy roll
back in minutes. Server-driven minimum version exists as a last resort for
security fixes only.

## Skew tolerance

Assume N−2 native shells are live. The shell exposes core capabilities; the RN
host feature-detects them, never the reverse. A remote JS update must never
require a shell that is not widely adopted yet — otherwise it bricks older
shells until they update.

## One-way doors (hard to undo once depended on)

Codegen/JSI schema, origin scheme, error taxonomy, storage scoping
(per-tenant/user/app), pool reset contract. Changing any of these after
mini-apps or host UI depend on them needs a deprecation calendar and compat
grants — which is exactly what the gate is for.

## Phases

- **P0 — this document + target topology in `architecture.md`.** Done.
- **P0b — badminton out of shell (decisions 1–2).** Done: generic
  `ReminderScheduler`/`CalendarEventLauncher` (Android),
  `ReminderLiveActivityCoordinator` + generic widget (iOS), RN-side copy and
  routing composition with tests. No behavior contract change on the generic
  bridge methods.
- **P1 — Codegen spec + generated types.** Done: specs land first with T0-style
  parity (S3), then native adopts them; TS adapters consume spec types.
  No behavior change — same methods, same wire format.
- **P2 — native runtime core (DEFERRED by human decision 3).** Revive only when
  a measured budget row forces it: WebView admission via `mobile-simplicity`
  refusal log, lab before/after baselines, B1–B10 on a real container.
- **P3 — RN UI depends only on ports.** A future SwiftUI/Compose UI stays a
  recorded option, not a plan, until a product gate asks for it.

## Gates and owners

Human gate required for: any native-shell addition, any new native dependency,
the runtime-model change itself, any budget loosening, any conformance-rule
change. Whoever is blocked by a budget or rule cannot be the one who relaxes it.

## What this decision does NOT do

It claims no measured numbers, moves no code, and does not make the PoC
production-ready. `MEMORY.md` status stays: PoC exists, production/external
enforcement incomplete, until P2 evidence lands.
