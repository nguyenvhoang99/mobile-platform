# Host Core Components — Stage 1

> One binary serves 4 tenants. Mechanisms in native, policy in remote config. Every module below maps to a skill that owns hitting its budget; the skill owns the number.

## App orchestration — `App.tsx:132`

State hub `navigationRef`, `dockSelection`, `homePreferences` (`hostStorage.ts:36`), `tenantId` (`useTenant.ts:12`), `notificationSnapshot` (`notificationService.ts:246`), `tracking` (`trackingService.ts:297`). Commits via `commitNavigation:158`, dedupes `sameVisibleMiniApp:80`, fires `recordMiniAppOpened:92`/`recordMiniAppsClosed`. Switches `HomeScreen` ↔ `MiniAppScreen:38` ↔ `PlaceholderScreen` on `navigation.miniApps`. Owns `applyShellChrome` and `tenantCatalog` `catalogForTenant` filtering.

## Navigation — `navigation/navigationBroker.ts:21` (pure, no I/O)

`NavigationState {shell: explore|account, miniApps: MiniAppFrame[]}` `21` where `MiniAppFrame {appId, sessionId, entrypoint, history, input}`. Pure functions: `openDockMiniApp:108` (slice or push `rootRoute` with `createMiniAppSessionId:45`), `navigateInsideMiniApp:148` (`isDeclaredRoute:82` + `routeSegments:55` param `:day` match), `openCrossMiniApp:239` (`allowedSources` + `allowedInputKeys` ≤4096), `openNotificationMiniApp:191` (`host_notification` source), `goBack:295` (history pop else frame pop), `showShell:313`/`closeMiniApps:320`. All callers handle `{ok:true, state} | {ok:false, error}` (`APP_NOT_FOUND` etc. `NavigationResult:26`).

## Config & tenancy

- `config/palette.ts:57` 24 semantic tokens → 18 mini-app safe via `miniAppPaletteFrom:87` (no glass/scrim/shadow). `miniAppDesignTokens.ts` serializable snapshot for container.
- `config/motion.ts:34` `feedback 100`/`standard 200`/`emphasized 300`/`travel 24` + `reduceMotion:158` zeroing, validated ordering. `useReducedMotion.ts` reads system preference.
- `config/tenants.ts:32` 4 `TenantMeta` (`vn-hn` #3B5BDB, `vn-hcm` #E8590C, `vn-dn` #0B7285, `fallback`) with `centre` lat/lon + `featuredAppIds` order + `paletteOverrides`. `resolveTenantFromCoords:131` haversine >350km→fallback.
- `config/tenantStorage.ts` persists `tenantId` (host-secure vs memory fallback, never WebView `B1`), `config/budgets.ts:1` generated single source for `policy/budgets.md:68`.
- `config/appConfig.ts:13` remote-config seam — palette/layout/motion/tracking/notification/cards endpoints (signed, fails closed).

## Bridge — `bridge/` (the only door)

| File | Owns |
|---|---|
| `types.ts:14` | `BridgeRequest` (no identity `C3`) + `BridgeSession` derived + `BridgeErrorCode` closed enum + `AuditRecord` hash-chain |
| `registry.ts:24` | 6 `CAPABILITIES` with `risk/consent/os/broker_ui/quota/audit/owner` — mirrors `capabilities.yaml:78` (`R1`) |
| `gates.ts:15` | `G1 gate1Declaration` (manifest + registry), `G2 gate2Consent` (scope+expiry), `G3 gate3OsPermission` (after G2), `checkQuota` token bucket |
| `handler.ts:47` | 10-step pipeline `handleBridgeRequest` → exactly one terminal reply `B6`, `classifyError` to closed enum, `withTimeout BRIDGE_ROUND_TRIP_P95_MS*4`, `appendAudit` before reply `B7` |
| `handlers/*` | `storageKv` per `(tenant,user,appId)` + quotas, `netRequest` exact `egressHosts` no wildcard, `scanner` host UI no pixels, `location.current` coarse once, `crypto.sign` HMAC over challenge, `notify.subscribe` state only |
| `audit.ts` | pure-JS `hashHex` chain, `argsDigest` never raw args |
| `register.ts` | `registerAllHandlers` — single enumeration point for `R1` (`conformance.sh:57`) |

Timers: `BRIDGE_ROUND_TRIP_P95_MS 16` one frame `budgets.ts:10`. Quotas `60/10` etc. per-cap.

## Container — `miniapps/container/`

| File | Owns (conformance) |
|---|---|
| `MiniAppContainer.tsx:63` | **ONE factory `C1`** — exactly one WebView ctor site, incognito wrapper, splash + 4s timeout, `isSecureContext` handling, renderer-death on every instance |
| `containerConfig.ts:12` | `CONTAINER_CONFIG` `domStorage false`/`thirdPartyCookies false`/`allowFileAccess false`/`incognito true` — pool safety `B1`, asserted not assumed |
| `csp.ts:25` | `buildCspHeader` `connect-src 'self' + egressHosts` exact, header never meta `isMetaCsp` `B2`, author may tighten only |
| `navigationGuard.ts:30` | `decideNavigation` `isMainFrame` + `scheme mini:/https` + `host==appId` + `path in declaredRoutes` → cancel `B3` (`C6` no `Intent` parse, `C7` no RN scroll) |
| `warmPool.ts:43` | `WarmPool` generic blank page, `poolSizeForMemoryClass` low 1/0 mid 1/1 high 2/1, LRU evict, `onMemoryPressure` drops to 0, `assertWithinBudget MAX 3` |
| `manifest/*` | `schema.json` = validator `C9` `validator.ts:21`, `archiveSafety.ts` traversal/zip-bomb/size, `signer.ts:63` canonicalize + `hashManifest` + `signPackage`/`verifyPackage` 2 sigs, `B5` verify before first script |

Scheme: `originFor: MiniAppContainer` `mini://appId` iOS / `https://appId.miniapp.platform.local` Android. CSP/nav same manifest field.

## Catalog & Home

- `miniapps/catalog.ts:44` 6 `MiniAppManifest` (`badminton`/`weather`/`transit`/`notes`/`market`/`card`) with `routes`/`publicEntrypoints`/`crossAppLinks`/`trackingEvents` (allowedDataKeys). `catalogTenant.ts` filters by `featuredAppIds` order.
- `home/homeModel.ts:18` `HomePreferences {pinnedCategoryIds, pinnedMiniAppIds, hasCustomized}` + `homeCategoryCatalog` + `orderHomeCategorySuggestions(viewerProfile)` + `normalizeHomePreferences` known-ids filter.
- `cards/*` example domain (cardStore, dataset) daily refresh via `appConfig.cards.endpoint`.
- `components/HomeCollection.tsx:44` `layout constellation|list|rail`, jiggle `±1.2deg` 120ms loop + badge scale `0→1` 100ms + exit `scale+opacity 1→0` 200ms + pulse `0.96→1` on pin, all `useNativeDriver` + `reduceMotion` zero, `isEditing = editingId !== null` (all jiggle, `removeWrap` animated), `signalSelection` 8ms / `signalRemoval` 20ms via `native/haptics.ts:1`.

## Screens & chrome

- `screens/HomeScreen.tsx:92` first-run constellation vs pinned rail+list, picker modals, `isEditing` boolean jiggle for all, `Done` badge to exit, `onPress` while editing just exits (no open), `signalSuccessLight` 10ms on pin.
- `screens/MiniAppScreen.tsx:38` trusted header (`VERIFIED MINI-APP` + `appId`), `TrackedScrollView` depth → `mini_app_scroll_depth`, `GlassTabBar.tsx:20` dock L/R + Explore, `HomeCollectionPickerModal.tsx` + `ExploreSheet.tsx` slide from bottom `emphasized` 300ms `enter` (`mobile-motion:1`).
- `screens/PlaceholderScreen.tsx` host-only device access demo (not via bridge).

## Native (generic transports only — copy/routing composed in RN)

- `native/hostStorage.ts:10` `HostStorage` TurboModule (or JS memory fallback): dock/prefs/tracking/notifications/cardDataset/anonymousId (`getOrCreateAnonymousId` per scope), serial queue `storageQueue` iOS, `Executors` Android, file `tracking-events.jsonl` append.
- `native/nativeShell.ts:19` `applyShellChrome` + `signalNavigationSelection` (`NativeShellControls.selectionChanged` or `Vibration.vibrate(8)` Android fallback).
- `native/haptics.ts:1` facade — `signalSelection 8ms` / `signalSuccessLight 10ms` / `signalRemoval 20ms` — no raw `Vibration` elsewhere (`mobile-haptics` kill).
- `native/deviceAccess.ts:52` host-only `requestDeviceAccess` (`network`/`biometric`/`weatherLocation`/`voiceCommand`) with 1500-4000ms `withTimeout` + `deviceTimeoutResult` (fixes iOS hang) — never exposed to WebView.
- `native/notification.ts:1` `NativeNotificationModule` event emitter + permission/push/pendingEvents + generic `scheduleReminder`/`cancelReminder`/`presentCalendarEvent` (no Badminton aliases).
- Boundary types are Codegen-generated (S3): `native/specs/Native*.ts` owns every
  method signature and module name; Android extends `Native*Spec`, ObjC adopts it
  in `.mm` (`HostStorageModule.mm`, `DeviceAccessModule.mm`), Swift binds via
  `NotificationModule+Spec.mm`; TS adapters consume the spec types.
  `scripts/conformance.sh` S3 fails the change if a spec method is missing natively.
- Android `notifications/ReminderScheduler.kt` generic AlarmManager scheduler (title/body/channel/category/target from RN; legacy badminton keys readable for restore) + `ReminderReceiver`/`ReminderBootReceiver` (manifest); `notifications/CalendarEventLauncher.kt` generic calendar insert (title/location/description/alarmMinutes from RN).
- iOS `ReminderLiveActivityCoordinator.swift` generic ActivityKit schedule/cancel/marker-based start + `ReminderActivityAttributes.swift` (id/title/body) + generic widget (`ReminderLiveActivityWidget.swift`); `NotificationModule.swift` generic calendar payload; `AppDelegate.swift` generic `reminder` deep-link host gated by live-activity match.
- `hooks/useTenant.ts:12` `loadStoredTenant` else `resolveFromLocation` (`requestDeviceAccess weatherLocation` → `resolveTenantFromCoords` haversine) with 4.5s hard deadline → `vn-fallback`, `switchTenant` clears loading, `localTenantProfile` local MVP (prod signed fetch).

## Tracking & Notification (features, see `docs/features/*`)

- `tracking/trackingService.ts:297` + `tracking/types.ts` + `native/hostStorage` journal + `config/budgets.ts` `8MB`/`512KB`/`16KB` + `appConfig.tracking` — see `docs/features/tracking.md`.
- `notification/notificationService.ts:246` + `notification/types.ts` + `native/notification.ts` — see `docs/features/notification.md`.

## Policy & skills — the kill that binds even when no one reads a doc

`policy/budgets.md:14` CI reads, `policy/capabilities.yaml:22` tiers + `never_expose`, `policy/conformance.md:35` C/R/B + adversarial fixtures. `.claude/skills/mobile-spine` routes; `mobile-architecture` decides layer (6-tier narrowest), `mobile-simplicity` refuses deps (ratchet), `mobile-smoothness` + `mobile-motion` own timing/choreography, `mini-app-runtime`/`native-capability` own isolation/door, `mini-app-governance`/`mini-app-pipeline` own tiers/review, `bridge/container/contract/pipeline` build the crossing with drift signals, `ai-development-standard` makes generation safe. `scripts/verify.sh:1` is the mechanical DoD.

*Every path above is a file:line you can open. If a line moves, update the doc — a doc that cannot be opened is a preference.*
