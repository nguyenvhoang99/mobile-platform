# Architecture — PoC Stage 1 System

> **PoC Stage 1 scope:** one binary serves `vn-hn`/`vn-hcm`/`vn-dn`/`vn-fallback`, 6 capabilities, WebView container, tracking + notification + Live Activity, no payments. All budgets provisional until baselined on Galaxy A14 `policy/budgets.md:48`. Visuals at `app/docs/architecture-visual.md:1`.

## 1. Thesis and invariants

From `CLAUDE.md:4` — a super-app is a **platform with tenants** under two asymmetries:

- **Release agility:** native cannot roll back (store review), remote can. Mechanism in binary, policy/threshold/copy in remote config — shell stays thin.
- **Trust:** mini-app is third-party code reaching the device through **one audited door** or not at all.

**Four invariants (never relax without a gate):**

1. **Thin shell** — `app/src/native/nativeShell.ts:19` only chrome/haptics; all thresholds from `app/src/config/appConfig.ts:13` (Invariant 1)
2. **Bridge is only door** — no direct `fetch`/`fs`/`Intent` in mini-app; every call via `src/bridge/handler.ts:47` 10-step pipeline (Invariant 2, `policy/conformance.md:35` C2-C4)
3. **Budgets in CI** — `policy/budgets.md:14` single source, `app/src/config/budgets.ts:1` import, `scripts/verify.sh:1` fails on breach (Invariant 3)
4. **Untrusted until signed + tier** — `src/miniapps/manifest/signer.ts:63` store+author HMAC, verify before first script `B5` `src/miniapps/container/MiniAppContainer.tsx:114` (Invariant 4)

`budget: stopwatch/gauge → mobile-smoothness, counter → mobile-simplicity` is the rule that stops two skills claiming one budget.

## 2. Layer picture — downward = less trust, upward = less agility

```
┌─ native shell ────────────── store, cannot roll back ──────────────┐
│  launch / splash  permission sheets  NativeShellControls  HostStorage Module
│  ┌─ React Native host ────── OTA updatable ────────────────────────┐
│  │  App.tsx:132 orchestration  navigationBroker.ts:21 (pure)       │
│  │  Screens  GlassTabBar  useTenant  Home/Track/Notif/Bridge JS    │
│  │  ┌─ capability bridge ── native, ONLY door ──────────────────┐  │
│  │  │  registry.ts  handler.ts  gates.ts  audit.ts  handlers/*  │  │
│  │  │  ┌─ WebView ─┐  ┌─ WebView ─┐ one per mini-app, one origin│  │
│  │  │  │ mini-app  │  │ mini-app  │  mini://appId (iOS) or      │  │
│  │  │  │ tenant A  │  │ tenant B  │  https://appId.miniapp.*    │  │
│  │  │  └───────────┘  └───────────┘  (Android)                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         ──► CI enforces (budgets + conformance) across all layers ──►
```

**Ownership (from `references/host-architecture.md:7` via `mobile-architecture:40`):**

| Layer | Owns | Must not own |
|---|---|---|
| Host UI | shell screens, presentation | raw mini-app protocol |
| Application/domain | use cases, policy, authz | React/SDK types |
| Host ports | runtime/storage/identity/network ports | concrete vendor behavior |
| Native adapters | Swift/Kotlin lifecycle, OS integration | mini-app authz |
| Runtime adapter | package load, lifecycle, transport, accounting | host service access |
| Capability broker | typed versioned API, validation, error mapping | arbitrary native exposure |

Narrowest-effective order: **TS → TurboModule (Codegen) → Fabric → C++ → native screen** — choose the smallest that covers the need with measured value.

## 3. Component map (Stage 1)

```
app/src/ — 12 top-level modules
├── bridge/              registry, handler (10 steps), gates (G1/G2/G3/quota), audit, handlers/*[6]
├── mini-apps/
│   ├── catalog.ts + catalogTenant.ts   per-tenant featured filter, 6 apps (badminton/weather/transit/notes/market/card)
│   ├── manifest/ schema.json+validator + signer + archiveSafety
│   ├── container/ MiniAppContainer (ONE factory C1) + containerConfig + csp + navigationGuard + warmPool
│   └── pipeline/ review.ts (7 local checks) + adversarial fixtures
├── navigation/          navigationBroker.ts pure state machine (no I/O)
├── notification/        notificationService + types
├── tracking/            trackingService + types + trace
├── config/              palette, motion, tenants (4 MVP), budgets (generated), layout, appConfig
├── home/                homeModel (categories/prefs, known-ids filter)
├── cards/               cardStore/dataset example, daily refresh
├── native/              hostStorage, nativeShell, deviceAccess, notification, haptics
├── screens/             HomeScreen, MiniAppScreen, PlaceholderScreen
├── components/          GlassTabBar, HomeCollection (jiggle), ExploreSheet, etc.
├── hooks/               useTenant (location-first)
└── performance/         (warm pool sizing, trace markers)
policy/  budgets.md, capabilities.yaml (6 caps), conformance.md (C/R/B/S)
.claude/skills/ 14 skills — 6 decide, 4 build, 2 motion/haptics, spine, feature-graph
```

**File index (where to look):** orchestration `App.tsx:132`, nav pure `navigation/navigationBroker.ts:21`, tenancy `hooks/useTenant.ts:12`/`config/tenants.ts:32`, bridge `bridge/handler.ts:47`, container `miniapps/container/MiniAppContainer.tsx:63`, manifest `miniapps/manifest/validator.ts:21`, catalog `miniapps/catalog.ts:44`, tracking `tracking/trackingService.ts:297`, notif `notification/notificationService.ts:246`, tokens `config/palette.ts:57`/`motion.ts:34`, policy `policy/budgets.md:68`.

## 4. Trust and data flow

Mini-app JS is untrusted. Every request is `BridgeRequest {id, capability, operation, version, args}` `bridge/types.ts:30` **without** identity — `BridgeSession {appId, tenantId, userId, origin, isMainFrame} types.ts:40` is derived from WebView binding (C3). Flow: `declare → consent → OS → quota → execute(bg) → audit (hash-chain, digest) → exactly one terminal reply B6` `handler.ts:47`. Egress is host-mediated to exact `egressHosts` (no cookie, `connect-src 'self'` + hosts, header never meta `csp.ts:25` B2). Navigation allowlist: `isMainFrame + scheme mini:/https + host==appId + path in declaredRoutes` `navigationGuard.ts:30` B3. Storage is per `(tenant, user, appId)` KV with quotas; no `localStorage`/`IndexedDB` inside WebView (pool safety `B1`).

## 5. Policy enforcement — what ships vs what is deferred

CI reads `policy/*` on every change (`scripts/verify.sh:1` → `scripts/conformance.sh:1` C/R/S + `scripts/budgets.sh:1` counters). Runtime enforces the rest: signature before first script, CSP/header, navigation cancel, renderer-death on every instance including pooled `B4`, quota burst/sustained, audit before reply `B7`.

**Deferred:** payments (server-bound order + native sheet hooks present, no PSP), 63-province expansion (add to `tenants.ts:32` no code change), expanded caps, field baselines for provisional rows, store backend (local `review.ts:35` + `fixtures/adversarial/` ratchet).

## 6. Reference devices and trace

Low Galaxy A14 `policy/budgets.md:48`, mid A54, high iPhone 14. Budgets `FRAME 16.67 TAP 100 SPLASH 50/100 BRIDGE 5/16 WARM 350/800 COLD 700/1500 MAX 3` `budgets.ts:10`. Markers `buds.ts:58` `process_start … bridge_response` + `tenant_resolved` — app-owned, tools are replaceable.

*Stage 1 is a vertical slice: one binary can discover, verify, contain, broker, observe, and recover a mini-app without trusting it, on the low-tier device, with the kill (conformance + budgets) green.*

## 7. Target topology: thin shell transports + RN runtime (partially decided)

Full decision: `host-core-layer-decision.md:1`. Summary only — that file owns the rationale.
Human review kept the bridge/container in React Native (no measured overhead case)
and moved badminton product logic out of the shell; the native runtime core (P2)
is deferred until a budget row forces it.

```
┌──────────────────────────────────────┐
│            Native Host Core          │
│                                      │
│ Kotlin                     Swift     │
│                                      │
│ MiniApp Runtime                      │
│ Security                             │
│ Permissions                          │
│ WebView / JS Engine                  │
│ Storage                              │
│ Networking                           │
│ Native capabilities                  │
│ Lifecycle                            │
└──────────────────┬───────────────────┘
                   │ JSI (Codegen TurboModules,
                   │      additive-only, snapshot-gated)
┌──────────────────▼───────────────────┐
│          React Native UI             │
│                                      │
│ Product Screens                      │
│ Forms                                │
│ Feed                                 │
│ Settings                             │
│ Common UI                            │
└──────────────────────────────────────┘
```

RN is the UI/product framework and, by current decision, also the runtime and
composition layer: bridge, container, reminder copy/routing, and product screens
all live in the RN host. The shell owns generic transports only — scheduling,
delivery, ActivityKit/EventKit/AlarmManager mechanics — and renders content it
receives, never product content of its own.

**PoC now → decided target:**

| Concern | Before | After (this change) |
|---|---|---|
| Bridge 10-step pipeline `bridge/handler.ts:47` | TS orchestrator | Stays in RN (P2 deferred) |
| Container `MiniAppContainer.tsx:63`, pool, CSP, nav guard | TS model/stub (no WebView dep) | Stays in RN (P2 deferred) |
| Reminder scheduling (Android) | `BadmintonReminderScheduler` (native, badminton copy) | Generic `ReminderScheduler` (native); copy/routing from RN |
| Calendar insert (Android) | `BadmintonCalendarEventLauncher` (native copy) | Generic `CalendarEventLauncher` (native); copy from RN |
| Live Activity + local fallback (iOS) | `BadmintonLiveActivityCoordinator` (native copy/category) | Generic `ReminderLiveActivityCoordinator` + widget; marker-based start |
| Reminder/calendar deep-link + AppDelegate | Badminton category/host/strings | Generic `reminder` host, `live_activity` marker, RN-supplied fields |
| `native/hostStorage.ts`, `deviceAccess.ts`, notification | TS adapters + hand-written TurboModules | Unchanged (Codegen pending, decision 4) |
| Thresholds/quotas/tiers/copy | `config/*`, `capabilities.yaml` | Signed remote config (unchanged principle) |

**Non-goals of this section:** no measured perf claims, no WebView admission,
no PoC file deprecated beyond the renamed native files. If a line here conflicts
with `policy/*`, the narrower source wins and this doc is corrected.
