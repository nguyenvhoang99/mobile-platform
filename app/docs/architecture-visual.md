# Architecture Visual — Mini-App Super-App

> Generated 2026-08-30 against `policy/budgets.md:68` low-tier Galaxy A14 and `policy/capabilities.yaml:78` 6-capability registry. All numbers/budgets imported from `src/config/budgets.ts:1` (single source; CI reads `policy/budgets.md:14`).

Render with any Mermaid renderer (GitHub, VS Code, `npx mermaid`). An interactive copy is at `architecture-visual.html`.

---

## 1 — Overall Architecture (C4 L1/L2)

The thesis from `CLAUDE.md:4`: **release agility** (native cannot roll back) + **trust** (one audited door). Downward = decreasing trust, upward = decreasing release agility.

```mermaid
flowchart TB
    subgraph Shell ["Native Shell — thin, ships via store, cannot roll back<br/>App.tsx:174 applyShellChrome · src/native/nativeShell.ts:19"]
        Launch["Launch / Splash<br/>tap→splash 50ms p50 / 100ms p95<br/>policy/budgets.md:80"]
        PermSheets["Permission Sheets<br/>OS prompt is 1-shot, per-host-app<br/>src/native/deviceAccess.ts"]
        HostStorageNative["HostStorage NativeModule<br/>src/native/hostStorage.ts:10"]
    end

    subgraph RNHost ["React Native Host — remotely updatable OTA<br/>App.tsx:132 App() orchestration"]
        App["App.tsx:132 — state hub<br/>navigationRef, dock, homePrefs, tenant, notification, tracking"]
        NavBroker["navigationBroker.ts:21 — pure state machine<br/>openDock / navigate / crossApp / notification"]
        Screens["Screens<br/>HomeScreen.tsx:92 · MiniAppScreen.tsx:38<br/>PlaceholderScreen.tsx"]
        TabBar["GlassTabBar.tsx:20 — dock L/R + Explore"]
        TenantHook["useTenant.ts:12 — location-first resolve"]
        TenantCfg["tenants.ts:32 — 4 tenants, haversine"]
        TrackingSvc["TrackingService.ts:297 — journal, batch, transport"]
        NotifSvc["NotificationService.ts:246 — inbox, foreground, retry"]
        BridgeJS["Bridge types/registry<br/>src/bridge/types.ts:14 · registry.ts:24"]
    end

    subgraph BridgeLayer ["Capability Bridge — the ONLY door<br/>src/bridge/handler.ts:47 10-step pipeline"]
        Registry["registry.ts:24 CAPABILITIES[6]<br/>net.request storage.kv scanner.scan<br/>location.current crypto.sign notify.subscribe"]
        Handler["handler.ts:47 handleBridgeRequest<br/>1 identity 2 origin 3 G1 4 args 5 G2 6 G3 7 quota 8 exec 9 audit 10 reply"]
        Gates["gates.ts:15 G1 declaration<br/>gates.ts:32 G2 consent<br/>gates.ts:51 G3 OS permission<br/>gates.ts:64 quota bucket"]
        Handlers["handlers/*<br/>netRequest.ts storageKv.ts<br/>scanner.ts locationCurrent.ts<br/>cryptoSign.ts notifySubscribe.ts"]
        Audit["audit.ts — hash-chain, argsDigest"]
    end

    subgraph ContainerLayer ["Container — one WebView per mini-app, one origin each<br/>src/miniapps/container/"]
        Factory["MiniAppContainer.tsx:63 ONLY factory (C1)<br/>incognito + storage off + renderer death"]
        Config["containerConfig.ts:12 CONTAINER_CONFIG<br/>domStorageEnabled=false incognito=true"]
        CSP["csp.ts:25 buildCspHeader<br/>response header, never meta (B2)"]
        NavGuard["navigationGuard.ts:30 decideNavigation<br/>scheme+host+declared-route allowlist"]
        WarmPool["warmPool.ts:43 WarmPool<br/>live 1-2 pooled 0-1 by memoryClass"]
        Signer["signer.ts:63 signPackage / verifyPackage (B5)"]
        Validator["validator.ts:21 validateManifest (C9)"]
        Review["pipeline/review.ts:35 reviewPackage 7 checks"]
    end

    subgraph Policies ["Policy — CI-enforced, single source"]
        Budgets["policy/budgets.md:68 budgets + policy/conformance.md:35 C1-C9 R1-R3 B1-B10"]
        CapsYaml["policy/capabilities.yaml:22 tiers + never_expose"]
    end

    subgraph MiniApps ["Untrusted Tenants — WebView origin-isolated"]
        Catalog["catalog.ts:44 miniAppCatalog[6]<br/>badminton weather transit notes market card"]
        CatalogTenant["catalogTenant.ts — per-tenant featured filter"]
        HomeModel["homeModel.ts:18 — categories + pin model"]
        CardsDomain["cards/* — example domain, daily refresh"]
    end

    Shell --> RNHost
    RNHost --> BridgeLayer
    BridgeLayer --> ContainerLayer
    ContainerLayer --> MiniApps
    Policies -. enforces .-> BridgeLayer
    Policies -. enforces .-> ContainerLayer
    Policies -. enforces .-> RNHost

    classDef shell fill:#0f172a,stroke:#38bdf8,color:#e2e8f0
    classDef host fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    classDef bridge fill:#7c2d12,stroke:#fb923c,color:#fff7ed
    classDef container fill:#14532d,stroke:#4ade80,color:#ecfdf5
    classDef policy fill:#422006,stroke:#facc15,color:#fefce8
    classDef untrusted fill:#4a044e,stroke:#e879f9,color:#fdf4ff
    class Shell,Launch,PermSheets,HostStorageNative shell
    class RNHost,App,NavBroker,Screens,TabBar,TenantHook,TenantCfg,TrackingSvc,NotifSvc,BridgeJS host
    class BridgeLayer,Registry,Handler,Gates,Handlers,Audit bridge
    class ContainerLayer,Factory,Config,CSP,NavGuard,WarmPool,Signer,Validator,Review container
    class Policies,Budgets,CapsYaml policy
    class MiniApps,Catalog,CatalogTenant,HomeModel,CardsDomain untrusted
```

**Invariants mapped:**
1. Thin shell → `nativeShell.ts:19` only chrome + haptics; all thresholds from remote config `appConfig.ts:13` (Invariant 1)
2. Only door → no direct `fetch`/`fs` in mini-app; every `fetch` goes via `handlers/netRequest.ts` host-mediated to exact `egressHosts` (Invariant 2, `conformance.md:36` C2-C4)
3. Budgets in CI → `budgets.ts:1` single source, `budgets.md:14` says CI reads file (Invariant 3)
4. Untrusted until signed → `signer.ts:81 verifyPackage` before first script (B5), `container/MiniAppContainer.tsx:114` refuses to render if not verified (Invariant 4)

Reference devices: `policy/budgets.md:48` — low Galaxy A14, mid A54, high iPhone 14. Trace markers: `policy/budgets.md:58` + `budgets.ts:45`.

---

## 2 — Per-Component Architecture

### 2.1 Module map (src layout)

```mermaid
flowchart LR
    Root["app/src/ 12 top-level modules"]
    Root --> Bridge["bridge/<br/>registry handler gates audit<br/>handlers/* 6 caps"]
    Root --> Miniapps["miniapps/<br/>catalog tenant · container/*<br/>manifest/* · pipeline/*<br/>sample/*"]
    Root --> Nav["navigation/<br/>navigationBroker.ts<br/>pure, no I/O"]
    Root --> Notif["notification/<br/>notificationService.ts<br/>types.ts"]
    Root --> Tracking["tracking/<br/>trackingService.ts<br/>types.ts trace.ts"]
    Root --> Config["config/<br/>palette motion tenants<br/>budgets layout appConfig"]
    Root --> Home["home/<br/>homeModel.ts<br/>categories + prefs"]
    Root --> Cards["cards/<br/>cardStore dataset model<br/>daily-refresh example"]
    Root --> Native["native/<br/>hostStorage nativeShell<br/>deviceAccess notification"]
    Root --> Screens["screens/<br/>HomeScreen MiniAppScreen<br/>PlaceholderScreen"]
    Root --> Components["components/<br/>GlassTabBar HomeCollection<br/>ExploreSheet etc"]
    Root --> Hooks["hooks/<br/>useTenant.ts"]

    classDef core fill:#1e40af,stroke:#93c5fd,color:#eff6ff
    classDef domain fill:#065f46,stroke:#6ee7b7,color:#ecfdf5
    class Root,Bridge,Miniapps,Nav,Notif,Tracking,Config core
    class Home,Cards,Screens,Components,Hooks,Native domain
```

### 2.2 Bridge — 10-step pipeline (bridge-wiring)

```mermaid
flowchart TB
    Req["BridgeRequest<br/>types.ts:27 id/capability/operation/version/args<br/>no identity field (C3)"]
    S["BridgeSession derived<br/>types.ts:34 appId/tenantId/userId/origin<br/>from WebView binding"]
    G1["G1 gate1Declaration gates.ts:15<br/>manifestCapabilities includes cap<br/>+ registry has it (R1) → CAPABILITY_NOT_DECLARED"]
    Args["Step 4 arg validate handler.ts:98<br/>typeof args==object, handler schema<br/>→ INVALID_ARGUMENT"]
    G2["G2 gate2Consent gates.ts:32<br/>consentRecord scope+expiry<br/>→ CONSENT_REQUIRED/DENIED"]
    G3["G3 gate3OsPermission gates.ts:51<br/>osState granted/denied<br/>→ OS_DENIED (never before G2)"]
    Quota["Quota checkQuota gates.ts:64<br/>token bucket refillPerMinute+burst<br/>→ RATE_LIMITED + retryAfterMs"]
    Exec["Step 8 execute handler(session,args)<br/>withTimeout BRIDGE_ROUND_TRIP_P95_MS*4<br/>pure handlers/*, template errors only"]
    Audit["Step 9 appendAudit audit.ts<br/>before reply (B7) hash-chain"]
    Reply["Step 10 terminal reply (B6)<br/>exactly one BridgeResult ok/error"]

    Req --> S --> G1 --> Args --> G2 --> G3 --> Quota --> Exec --> Audit --> Reply

    style G1 fill:#7c2d12,stroke:#fb923c,color:#fff7ed
    style G2 fill:#7c2d12,stroke:#fb923c,color:#fff7ed
    style G3 fill:#7c2d12,stroke:#fb923c,color:#fff7ed
    style Audit fill:#422006,stroke:#facc15,color:#fefce8
    style Reply fill:#14532d,stroke:#4ade80,color:#ecfdf5
```

Registered capabilities `registry.ts:24` / `capabilities.yaml:78`:
`net.request:60/10` · `storage.kv:120/20` · `scanner.scan:10/2 host_scanner once` · `location.current:6/2 once high, coarse only` · `crypto.sign:10/3 biometric once high` · `notify.subscribe:5/2 while_using` — each `owner: platform` `audit: call/call_with_result`.

### 2.3 Container — isolation factory (container-wiring)

```mermaid
flowchart TB
    Verify["B5 verifyPackage signer.ts:81<br/>storeSig+authorSig+manifestHash<br/>blocking before first script"]
    Factory2["MiniAppContainer.tsx:63 ONE factory (C1)<br/>exactly one WebView ctor call site"]
    Cfg["CONTAINER_CONFIG containerConfig.ts:12<br/>domStorage=false thirdPartyCookies=false<br/>allowFileAccess=false allowUniversal=false<br/>incognito=true (pool safety B1)"]
    Scheme["originFor appId platform.ts originFor<br/>iOS mini://appId  Android https://appId.miniapp.platform.local"]
    CSP2["CSP csp.ts:25<br/>connect-src = 'self' + egressHosts exact<br/>header not meta isMetaCsp B2"]
    NavG["navigationGuard.ts:30 decideNavigation<br/>isMainFrame + allowed scheme + host==boundAppId<br/>+ path in declaredRoutes → else cancel (B3)"]
    Splash["Splash MiniAppContainer.tsx:80<br/>native first-paint signal + 4s timeout<br/>miniapp_tap→miniapp_splash_visible 50/100ms"]
    Death["Renderer death MiniAppContainer.tsx:98<br/>onRenderProcessGone on EVERY instance<br/>pooled+hidden too (B4), Android-shared renderer"]
    Pool["WarmPool warmPool.ts:43<br/>generic blank page, no per-app storage<br/>size by memoryClass low:1/0 mid:1/1 high:2/1<br/>LRU evict, memoryPressure drops to 0"]

    Verify --> Factory2 --> Cfg --> Scheme --> CSP2 --> NavG --> Splash --> Death --> Pool
```

Containment: `C6` no Intent parsing, `C7` no RN scroll handler on WebView, `B1` storage asserts off at construction.

### 2.4 Navigation broker — pure state machine

```mermaid
flowchart LR
    State["NavigationState navigationBroker.ts:21<br/>shell: explore|account<br/>miniApps: MiniAppFrame[]<br/>{appId sessionId entrypoint history input}"]
    OpenDock["openDockMiniApp navigationBroker.ts:108<br/>existing→slice, new→push rootRoute"]
    NavInside["navigateInsideMiniApp:148<br/>isDeclaredRoute + routeSegments<br/>push history"]
    OpenCross["openCrossMiniApp:239<br/>linkId→targetAppId→entrypoint<br/>allowedSources + allowedInputKeys≤4096B"]
    OpenNotif["openNotificationMiniApp:191<br/>target + entrypoint + allowedSources host_notification"]
    GoBack["goBack:295<br/>history>1 pop, else pop frame"]
    ShowShell["showShell:313 closeMiniApps:320<br/>clear miniApps → shell"]

    State --> OpenDock --> NavInside --> OpenCross --> OpenNotif --> GoBack --> ShowShell
```

App.tsx commits via `commitNavigation:158` + dedupes `sameVisibleMiniApp:80` and fires tracking `recordMiniAppOpened:92`.

### 2.5 Tracking — priority-ordered durable journal

```mermaid
flowchart TB
    Decl["catalog.ts:11 trackingEvents per mini-app<br/>name/version/priority/allowedDataKeys<br/>+ hostEvents trackingService.ts:26 15 events"]
    Enqueue["enqueue trackingService.ts:419<br/>validData allowedKeys+≤16KB + networkSnapshot<br/>anonymousId per host/per-mini-app<br/>appendTrackingEventLine hostStorage.ts:92"]
    Limit["enforceQueueLimit:483<br/>retention per priority<br/>critical7d operational72h product24h diagnostic1h<br/>+ 8MB journal, drop diagnostic→product→operational first"]
    Sched["schedule:667<br/>min(maxWaitMs) per event<br/>critical1s operational5s product30s diagnostic300s"]
    Batch["createBatch:567 priorityOrder+queue_sequence<br/>byte limit wifi512KB cellular256KB<br/>maxBatchEvents200"]
    Transport["chooseTransport:606<br/>wifi+queue≥20 → gRPC else HTTP<br/>isAvailable(network)"]
    Flush["flushOnce:634 send batch<br/>accepted+permanentlyRejected→removed<br/>on throw: bump attempt_count, persist"]
    Persist["replaceTrackingEventLines hostStorage.ts:97"]

    Decl --> Enqueue --> Limit --> Sched --> Batch --> Transport --> Flush --> Persist
```

Host derives `event_id session_id anonymous_id platform host_app_version trace_id privacy_class consent_version sdk_version network_at_event` — mini-app supplies only `name/version/allowedData` (`app/docs/mini-app-platform-standard.md:357`).

### 2.6 Notification — push → inbox → activation

```mermaid
flowchart TB
    NativeEvt["NativeNotificationEvent<br/>native/notification.ts<br/>pendingEvents + subscribe"]
    Parse["parseRemoteNotification notificationService.ts:147<br/>normalizedEnvelope, boundedString, identifierPattern<br/>title/body/category/notification_id/createdAt<br/>target mini_app_id/entrypoint_id/input≤4096B"]
    Receive["receive:613 [item,...].sort(created_at) slice250<br/>persist saveNotificationsJson"]
    TrackRecv["trackHost notification_received:639<br/>app_state target_app_id provider_message_id"]
    FG["if opened app_state=foreground && !reminder<br/>foregroundListeners App.tsx:213"]
    Activation["activate:665 set opened_at/seen_at<br/>trackHost notification_clicked<br/>activationListeners→App.tsx:224 openNotificationMiniApp"]
    Perm["requestPermission:332 denied→openSettings else request<br/>refreshPermissionStatus on AppState active"]

    NativeEvt --> Parse --> Receive --> TrackRecv --> FG --> Activation --> Perm
```

Config `appConfig.ts:52` `maxInboxItems250 maxSeenIdsPerEvent50 reminderLeadMs1h`.

### 2.7 Tenancy — location-first on one binary

```mermaid
flowchart LR
    Hook["useTenant.ts:12<br/>loadStoredTenant else resolveFromLocation"]
    Loc["requestDeviceAccess weatherLocation<br/>native/deviceAccess.ts — host-only, not via bridge"]
    Haversine["resolveTenantFromCoords tenants.ts:131<br/>haversineKm to 3 centres<br/>vn-hn 21.02/105.85 vn-hcm10.82/106.62 vn-dn16.05/108.20<br/>>350km→vn-fallback"]
    Profile["localTenantProfile tenants.ts:158<br/>TenantProfile tenantId version issuedAt/expiresAt<br/>featuredAppIds paletteOverrides trackingTopicPrefix<br/>MVP local, prod signed fetch"]
    Apply["App.tsx:136 tenantCatalog catalogForTenant<br/>palette createPalette(profile.paletteOverrides)<br/>validDockSelection + GlassTabBar + Home filtering"]
    Storage["tenantStorage.ts save/load<br/>persisted tenantId"]
    Hook --> Loc --> Haversine --> Profile --> Apply --> Storage
```

Tenants `tenants.ts:32` `vn-hn/CHN prim #3B5BDB` `vn-hcm/HCM #E8590C` `vn-dn/ĐN #0B7285`.

### 2.8 Design tokens — single animation language

Palette `palette.ts:57` 24 semantic tokens; mini-app receives 18 via `miniAppPaletteFrom:87` (no glass/scrim/shadow/statusBar). Motion `motion.ts:34` `feedback100 standard200 emphasized300 travel24` reduced-motion zeros all `reduceMotion:158`. Budgets `budgets.ts:10` `FRAME16.67 TAP100 SPLASH50/100 BRIDGE5/16 WARM350/800 COLD700/1500 MAX3`.

---

## 3 — Feature Sequence Diagrams

### 3.1 App launch + tenant resolution

```mermaid
sequenceDiagram
    participant OS as OS
    participant App as App.tsx:132
    participant Tenant as useTenant.ts:12
    participant Store as tenantStorage.ts / hostStorage.ts:36
    participant Loc as deviceAccess.ts
    participant Profile as tenants.ts:131
    participant Tracking as TrackingService.ts:334
    participant Notif as NotificationService.ts:283
    OS->>App: process_start
    App->>Tracking: tracking.start() App.tsx:254
    Tracking->>Store: getOrCreateAnonymousId(host) + loadTrackingEventLines
    Tracking-->>App: session_id ready
    App->>Tracking: trackHost app_started + screen_viewed home App.tsx:258
    par tenant resolve
        App->>Tenant: useTenant mount Tenant:16
        Tenant->>Store: loadStoredTenant
        alt stored exists
            Store-->>Tenant: TenantId
            Tenant-->>App: setTenantId + profile
        else first launch
            Tenant->>Loc: requestDeviceAccess(weatherLocation) Tenant:20
            Loc-->>Tenant: {status, lat?, lon?}
            Tenant->>Profile: resolveTenantFromCoords(coords) tenants.ts:131
            Profile-->>Tenant: TenantId (haversine, >350→fallback)
            Tenant->>Store: saveStoredTenant Tenant:51
            Tenant-->>App: setTenantId
        end
        App->>App: createPalette(profile.paletteOverrides) App.tsx:134
        App->>App: applyShellChrome(palette) App.tsx:174
        App->>App: catalogForTenant tenantCatalog App.tsx:136
        App->>App: validDockSelection App.tsx:63
    and notifications
        App->>Notif: notification.start() + subscribe App.tsx:208
        Notif->>Native: permissionStatus + pendingEvents Notif:289
        Notif-->>App: setNotificationSnapshot
        Notif->>Native: registerForRemoteNotifications Notif:299
        Native-->>Notif: PushRegistrationResult
    end
    App->>App: render HomeScreen vs MiniAppScreen vs loading App.tsx:673
    Note over App,Profile: tenant_resolved marker (trace) — field + lab read same name budgets.md:58
```

### 3.2 Open mini-app from dock / tab bar

```mermaid
sequenceDiagram
    participant User as User
    participant TabBar as GlassTabBar.tsx:20
    participant App as App.tsx:284
    participant Broker as navigationBroker.ts:108
    participant Pool as WarmPool.ts:65
    participant Container as MiniAppContainer.tsx:63
    participant Tracking as tracking.ts
    User->>TabBar: tap shortcut (or long_press/swipe→picker)
    TabBar->>TabBar: signalNavigationSelection nativeShell.ts:32
    TabBar->>App: onOpenMiniApp(appId, slot) App.tsx:352
    App->>App: tracking.trackHost navigation_bar_clicked App.tsx:354
    App->>Broker: openDockMiniApp(current, appId) App.tsx:290
    alt existingIndex >=0
        Broker-->>App: {ok:true, state.slice(0,existingIndex+1)}
    else new
        Broker->>Broker: createMiniAppSessionId appId-Date-random Broker:45
        Broker-->>App: {ok:true, shell:explore, miniApps:[...+{appId,sessionId,entrypoint:root,history:[rootRoute],input:{}}]}
    end
    App->>App: removedMiniApps + commitNavigation App.tsx:302
    App->>Tracking: recordMiniAppOpened + recordMiniAppsClosed App.tsx:92
    App->>Pool: bind(appId) WarmPool:65 (prefer pooled ready, else live if <maxLive)
    Pool-->>App: PooledInstance {id, state:bound}
    App->>Container: mount MiniAppContainer appId declaredRoutes egressHosts packageIndex App.tsx:673
    Container->>Container: verify packageIndex.size>0 else B5 fallback Container:114
    Container->>Container: buildCspHeader appId+egressHosts csp.ts:25
    Container->>Container: wrapWithNoMetaCsp Container:203
    Container->>Container: originWhitelist mini://appId
    Container-->>User: trusted header + splash + WebView App.tsx:673
    Container->>Container: onLoad onFirstPaint Container:80 clear 4s timeout
    Container-->>User: splashVisible=false, first paint visible<br/>budget miniapp_tap→miniapp_first_paint 350/800 warm, 700/1500 cold policy/budgets.md:81
    App->>Tracking: trackHost mini_app_opened + mini_app_route_viewed App.tsx:100
```

Alternative entry via `MiniAppPickerModal.tsx` `selectDockApp:416` → `saveDockSelection:428` → `openMiniApp:446` same flow.

### 3.3 Internal route navigation (declared pages)

```mermaid
sequenceDiagram
    participant MiniApp as MiniAppScreen.tsx:38 / Content
    participant App as App.tsx:492
    participant Broker as navigationBroker.ts:148
    participant Tracking as tracking.ts
    MiniApp->>App: onNavigate(path) e.g. /forecast/tomorrow
    App->>App: tracking.entrypoint_clicked surface mini_app_routes App.tsx:498
    App->>Broker: navigateInsideMiniApp(current, path) App.tsx:506
    Broker->>Broker: find frame at(-1), findManifest frame.appId
    Broker->>Broker: isDeclaredRoute manifest, path Broker:82 routeSegments + param :day match Broker:95
    alt !isDeclaredRoute
        Broker-->>App: {ok:false, error:ROUTE_NOT_DECLARED}
        App->>Tracking: navigation_denied operation internal_route App.tsx:508
    else ok
        Broker-->>App: {ok:true, frames[last].history push path}
        App->>App: commitNavigation App.tsx:516
        App->>Tracking: navigation_opened + mini_app_route_viewed App.tsx:520
        App-->>MiniApp: re-render currentPath=history.at(-1)
    end
```

### 3.4 Cross-app link (approved, input-allowlisted)

```mermaid
sequenceDiagram
    participant Source as weather MiniAppScreen
    participant App as App.tsx:537
    participant Broker as navigationBroker.ts:239
    participant Target as transit manifest
    Source->>App: onOpenCrossApp(linkId) e.g. open_transit
    App->>App: tracking entrypoint_clicked mini_app_cross_links App.tsx:548
    App->>Broker: openCrossMiniApp(current, linkId, input) App.tsx:557
    Broker->>Broker: sourceFrame at(-1), source manifest Broker:244
    Broker->>Broker: link = source.crossAppLinks.find(id) Broker:250 → LINK_NOT_GRANTED if miss
    Broker->>Broker: validLinkInput allowedInputKeys + JSON≤4096 Broker:169
    Broker->>Broker: target=findManifest link.targetAppId Broker:258
    Broker->>Broker: entrypoint=target.publicEntrypoints.find(targetEntrypoint) Broker:262
    Broker->>Broker: allowedSources includes source.id Broker:268 → SOURCE_NOT_ALLOWED
    Broker->>Broker: create targetFrame sessionId entrypoint history[entrypoint.path] input
    Broker->>Broker: existingIndex push or replace slice
    Broker-->>App: {ok:true, state.miniApps:[...+targetFrame]}
    App->>App: removedMiniApps, commitNavigation, recordClosed/recordOpened App.tsx:568
    App->>App: tracking navigation_opened source cross_app
    App-->>Target: mount MiniAppScreen transit / near cross-app stack
    Note over Source,Target: return is stack-based: goBack restores source state navigationBroker.ts:295
```

Catalog example `catalog.ts:155` weather→transit `open_transit` `allowedInputKeys:[area]` and reverse `transit→weather`.

### 3.5 Bridge capability call — full 10 steps (scanner.scan example)

```mermaid
sequenceDiagram
    participant JS as Mini-App JS (untrusted)
    participant WV as WebView binding (origin mini://weather)
    participant Transport as RN WebView bridge transport
    participant Handler as handler.ts:47 handleBridgeRequest
    participant Gates as gates.ts
    participant Impl as handlers/scanner.ts
    participant Audit as audit.ts
    JS->>WV: postMessage {id, capability:scanner.scan, operation:scan, version:1, args:{}}
    WV->>Transport: inject with derived session<br/>appId=weather tenantId=vn-hn userId=anon-per-(app,tenant,user)<br/>origin=mini://weather isMainFrame=true (C3 types.ts:34)
    Transport->>Handler: handleBridgeRequest(req, ctx)
    Note over Handler,Gates: Step 1-2 mainFrame assert Handler:58 else audit fail + CAPABILITY_NOT_DECLARED
    Handler->>Gates: gate1Declaration(session, scanner.scan, manifestCapabilities) Handler:78
    alt G1 fail (not in manifest or not in registry R1)
        Gates-->>Handler: {pass:false, CAPABILITY_NOT_DECLARED}
        Handler->>Audit: appendAudit gate1:fail Handler:61
        Handler-->>JS: {ok:false, error:CAPABILITY_NOT_DECLARED} (B6)
    else G1 pass
        Handler->>Handler: Step 4 args object check Handler:99 → INVALID_ARGUMENT
        Handler->>Gates: gate2Consent scanner.scan once Gates:32
        alt no record or expired
            Gates-->>Handler: CONSENT_REQUIRED
            Handler->>Audit: appendAudit gate2:fail Handler:122
            Handler-->>JS: CONSENT_REQUIRED (host shows ConsentSheet)
        else G2 pass
            Handler->>Gates: gate3OsPermission scanner.scan Handler:141 (osState not_required for this cap)
            alt os denied
                Gates-->>Handler: OS_DENIED
                Handler->>Audit: gate3:fail Handler:143
                Handler-->>JS: OS_DENIED
            else pass
                Handler->>Gates: checkQuota bucket now cost1 10/2 Handler:161
                alt RATE_LIMITED
                    Gates-->>Handler: retryAfterMs
                    Handler->>Audit: RATE_LIMITED Handler:170
                    Handler-->>JS: {ok:false, RATE_LIMITED, retryAfterMs}
                else allowed
                    Handler->>Handler: find handler handlers.get(scanner.scan) Handler:187
                    Handler->>Impl: withTimeout(handler(session,args), BRIDGE_ROUND_TRIP_P95_MS*4) Handler:209
                    alt impl throws/timeout
                        Impl-->>Handler: Error('TIMEOUT' / 'INVALID_ARGUMENT')
                        Handler->>Handler: classifyError → closed enum R3 never leaks platform strings Handler:254
                    else success
                        Impl-->>Handler: data (e.g. decoded string, pixels never cross bridge)
                    end
                    Handler->>Audit: appendAudit gate1:pass gate2:pass gate3:pass error? Handler:219 (B7 before reply)
                    Handler-->>JS: Step10 exactly one terminal reply B6 {ok:true,data} or {ok:false,error,message}
                end
            end
        end
    end
    Note over JS,Audit: broker_ui=host_scanner — pixels never cross bridge capabilities.yaml:125<br/>quota sustained:10 burst:2 audit:call_with_result · bridge p95 16ms budgets.ts:14
```

All six caps share the same pipeline; G2/G3/quota values are per-cap definition. Timeouts always yield `TIMEOUT` terminal reply `handler.test.ts`.

### 3.6 Notification push → inbox → foreground banner → open entrypoint

```mermaid
sequenceDiagram
    participant FCM as FCM/APNs
    participant Native as native/notification.ts
    participant Svc as NotificationService.ts:246
    participant Store as hostStorage.ts:104
    participant Tracking as TrackingService
    participant App as App.tsx:206
    participant Broker as navigationBroker.ts:191
    FCM->>Native: remote push payload
    Native->>Svc: emit NativeNotificationEvent<br/>{native_event_id, type:received/opened, payload, app_state, provider_message_id, occurred_at_ms}
    Svc->>Svc: enqueueNativeEvent nativeEventQueue chain Svc:606
    Svc->>Svc: processNativeEvent dedup processingNativeEvents Svc:559
    Svc->>Svc: parseRemoteNotification rawPayload now Svc:147 normalizedEnvelope+bouncedString+identifierPattern
    alt parse null (invalid/expired)
        Svc->>Native: acknowledge native_event_id Svc:598
    else parse ok
        Svc->>Store: load/insert inbox [item,...].sort(created_at) slice250 Svc:632
        Svc->>Store: persist saveNotificationsJson Svc:723
        Svc->>Svc: emit snapshot listeners Svc:735 unreadCount
        Svc-->>App: notification.subscribe snapshot App.tsx:208
        alt type received && wasInserted && app_state foreground && !reminder
            Svc->>App: foregroundListeners App.tsx:215 → setForegroundNotification
            App-->>User: ForegroundNotificationBanner
        end
        Svc->>App: trackHost notification_received category app_state target_app_id Svc:639
        Svc->>Store: set received_tracked_at_ms
        alt type opened
            Svc->>Svc: activate item,opened source system_notification Svc:665
            Svc->>Store: set opened_at/seen_at
            Svc->>Tracking: trackHost notification_clicked Svc:685
            Svc->>App: activationListeners App.tsx:219
            App->>Broker: openNotificationMiniApp(current, mini_app_id, entrypoint_id, input) App.tsx:224
            Broker->>Broker: findManifest, entrypoint, allowedSources host_notification, allowedInputKeys, isDeclaredRoute Broker:197
            alt error
                Broker-->>App: navigation_denied notification_open App.tsx:244
            else ok
                Broker-->>App: state with targetFrame history[entrypoint.path]
                App->>App: commitNavigation + recordMiniAppOpened source notification App.tsx:236
            end
            Svc->>Native: acknowledge
        else type received
            Svc->>Native: acknowledge
        end
    end

    Note over User,App: Inbox UX: HomeScreen NotificationSheet App.tsx:244<br/>onNotificationPress→activateFromInbox inbox, onForegroundReceived banner press→activateForeground Svc:537
    User->>App: tap bell → setNotificationsOpen + recordInboxOpened + markSeen onSeen Svc:491
```

Permission: `requestPermission:332` `denied→openSettings` `not_determined→request` else emit. `refreshPermissionStatus` on `AppState active` `App.tsx:267`.

### 3.7 Tracking end-to-end (mini-app event example)

```mermaid
sequenceDiagram
    participant MiniApp as MiniAppScreen: card detail viewed
    participant App as App.tsx:692
    participant Tsvc as TrackingService.ts:391
    participant Storage as hostStorage.ts:85
    participant Network as deviceAccess.ts
    participant Backend as endpoint (HTTP/gRPC)
    MiniApp->>App: onTrackEvent(name, version, data) e.g. card_detail_viewed 1 {card_id, source}
    App->>Tsvc: trackMiniApp({appId,appVersion,sessionId}, name, version, data) App.tsx:694
    Tsvc->>Tsvc: manifest lookup miniAppCatalog.find+trackingEvents.find Tsvc:397 → null if not declared
    Tsvc->>Tsvc: validData allowedDataKeys + ≤16KB Tsvc:283
    Tsvc->>Network: networkSnapshot (cached 5s) Tsvc:547
    Tsvc->>Storage: getOrCreateAnonymousId mini-app-appId Tsvc:541
    Tsvc->>Tsvc: build envelope Tsvc:444<br/>event_id session_id mini_app_session_id<br/>host_app_version platform anonymous_id user_id<br/>priority privacy_class consent_version sdk_version network_at_event
    Tsvc->>Storage: appendTrackingEventLine + enforceQueueLimit Tsvc:472
    Note over Tsvc,Storage: retention critical7d operational72h product24h diagnostic1h + 8MB drop order diagnostic→product→operational→critical Tsvc:483
    Tsvc->>Tsvc: schedule min(maxWaitMs) Tsvc:667
    loop flush(reason critical_event / max_wait / app_background)
        Tsvc->>Network: networkSnapshot refresh true
        Tsvc->>Tsvc: chooseTransport wifi+len≥20→gRPC else HTTP Tsvc:606
        Tsvc->>Tsvc: createBatch priorityOrder+queue_sequence, wifi512 cellular256 max200 Tsvc:567
        alt eligible filter
            Tsvc->>Tsvc: eligible reachable && !constrained/roaming rules Tsvc:520
        end
        Tsvc->>Backend: send(batch) POST JSON {batch_id sent_at_ms reason events}
        alt ok
            Backend-->>Tsvc: {accepted_event_ids, permanently_rejected}
            Tsvc->>Storage: queue filter terminal, persist Tsvc:654
        else throw
            Tsvc->>Storage: bump attempt_count, persist Tsvc:658
        end
    end
    Note over Tsvc,Backend: host app_started route_viewed etc same path via trackHost:375
```

Budgets `appConfig.ts:21` `maxQueueBytes 8MB maxBatchBytes512 maxBatchEvents200`.

### 3.8 Home — pin categories & mini-apps

```mermaid
sequenceDiagram
    participant User as User
    participant Home as HomeScreen.tsx:92
    participant App as App.tsx:315
    participant Store as hostStorage.ts:62
    participant Tracking as tracking.ts
    User->>Home: first run → constellation long_press category
    Home->>App: onPinCategory(categoryId, first_run) Home:276
    App->>App: changeHomePreference pinnedCategoryIds / pinnedMiniAppIds App.tsx:315
    App->>App: normalizeHomePreferences hasCustomized true
    App->>Store: saveHomePreferences App.tsx:169 runAsync
    App->>Tracking: home_preference_changed item_type/item_id/action/source
    App-->>Home: preferences state → Your categories list
    User->>Home: tap category card → openCategory App:157
    Home->>Home: setActiveCategoryId + onSurfaceViewed category_mini_apps
    Home->>App: onPinMiniApp(appId, category) via HomeCollectionPickerModal
    App->>App: changeHomePreference mini_app
    Home->>App: onOpenMiniApp(appId, category/home_pinned) Home:304
    App->>App: openMiniApp dock flow (same as 3.2)
    Note over User,Home: prefs persist via hostStorage normalized, knownIds filter homeModel.ts:91
```

### 3.9 Warm pool lifecycle + memory pressure

```mermaid
sequenceDiagram
    participant App as App.tsx / container host
    participant Pool as WarmPool.ts:43
    participant WV as WebView instances
    participant OS as OS memory pressure

    App->>Pool: new WarmPool(memoryClass) classifyMemory totalMB WarmPool:30
    Note over Pool: low≤3500→1/0 mid≤6000→1/1 high→2/1 poolSizeForMemoryClass:19
    App->>Pool: warm() Pool:58 push ready boundAppId=null
    Pool->>WV: create generic WebView blank page CONTAINER_CONFIG
    WV-->>Pool: ready
    User->>App: open mini-app
    App->>Pool: bind(appId) Pool:65 prefer ready→bound else live if <maxLive else null
    Pool-->>App: PooledInstance {id, state:bound}
    App->>WV: bind appId, load verified package, attach onRenderProcessGone (every instance B4)
    User->>App: suspend mini-app (background / showShell)
    App->>Pool: suspend(id) Pool:83 bound→suspended
    loop eviction need >maxLive
        App->>Pool: evictLRU Pool:89 suspended && !hasInflightMoneyOp → evicted
    end
    OS->>Pool: onMemoryPressure Pool:97
    Pool->>Pool: all suspended+ready → evicted, pool→0
    Pool->>Pool: assertWithinBudget MAX_CONCURRENT_WEBVIEWS=3 Pool:116
    Note over Pool,WV: reset = never held: incognito+domStorage false makes generic safe B1<br/>renderer death handler on every instance including pooled B4
```

### 3.10 Package review pipeline (sign → CSP → declared-vs-actual)

```mermaid
sequenceDiagram
    participant Author as Author / CI
    participant Signer as signer.ts:63 / validator.ts:21
    participant Review as pipeline/review.ts:35
    participant Fixture as Adversarial fixtures conformance.md:85
    Author->>Signer: signPackage(manifest, storeKey, authorKey) Signer:63 canonicalize→hash→hmacLike×2
    Signer-->>Author: SignedPackage manifest manifestHash storeSig authorSig signedAt
    Author->>Review: reviewPackage({signedPackage, archiveEntries, bundleSource, previousManifest}) Review:35
    Review->>Review: verifyPackage sig.ok Review:38 blocking
    Review->>Review: validateArchiveEntries Review:45 (traversal, size) blocking archiveSafety.ts
    Review->>Review: validateManifest schema.json C9 Review:55 blocking
    Review->>Review: findCapabilitiesInBundle naive scan Review:124 vs declared Review:68 → declared_vs_actual blocking
    Review->>Review: no_dynamic_code eval/Function/import/fetch + remote script Review:77 blocking
    Review->>Review: egress_no_wildcard Review:88 blocking
    Review->>Review: capability_diff advisory → human review Review:98
    Review->>Review: size_ceiling total≤4096KB files≤500 Review:112 blocking
    Review-->>Author: ReviewReport ok = no blocking failed
    Author->>Fixture: run adversarial suite conformance.md:85 — undeclared cap, remote script, wildcard host, path traversal, missing author sig, version downgrade, meta CSP, forged appId
    Fixture-->>Author: all rejected or CI fail
    Note over Author,Review: on publish: serve verified package over bound origin csp header connect-src 'self'+egressHosts author may tighten only csp.ts:25
```

### 3.11 Back / close navigation

```mermaid
sequenceDiagram
    participant User as User
    participant Header as MiniAppScreen.tsx:54 trustedHeader
    participant App as App.tsx:580
    participant Broker as navigationBroker.ts:295
    participant Tracking as tracking.ts
    User->>Header: tap Back (‹)
    Header->>Header: signalNavigationSelection nativeShell.ts:32
    Header->>App: onBack goBackFromMiniApp App.tsx:580
    App->>Tracking: entrypoint_clicked back mini_app_header
    App->>Broker: goBack(current) Broker:295
    alt frame.history.length>1
        Broker-->>App: history slice(0,-1)
        App->>Tracking: navigation_opened + mini_app_route_viewed source back
    else history len=1 (pop frame)
        Broker-->>App: miniApps slice(0,-1)
        App->>Tracking: recordMiniAppsClosed reason back
        alt nextFrame exists (stack resume)
            App->>Tracking: recordMiniAppOpened back_resume
        else empty
            App->>Tracking: navigation_opened explore source mini_app_back + screen_viewed home
        end
    end
    App->>App: commitNavigation
    User->>Header: tap Close (×)
    Header->>App: onClose closeAllMiniApps App.tsx:633
    App->>Broker: closeMiniApps Broker:320 → {shell:explore, miniApps:[]}
    App->>Tracking: recordMiniAppsClosed close_button + navigation_opened explore
    App->>App: commitNavigation showShell explore
```

---

## File index (where to look)

- Orchestration `app/App.tsx:132` + `app/App.tsx:673` screen switch + `app/src/native/nativeShell.ts:19`
- Navigation pure `app/src/navigation/navigationBroker.ts:21`
- Tenancy `app/src/hooks/useTenant.ts:12` `app/src/config/tenants.ts:32` `app/src/config/tenantStorage.ts`
- Bridge `app/src/bridge/types.ts:14` `app/src/bridge/registry.ts:24` `app/src/bridge/handler.ts:47` `app/src/bridge/gates.ts:15` `app/src/bridge/handlers/*` `app/src/bridge/audit.ts`
- Container `app/src/miniapps/container/MiniAppContainer.tsx:63` `containerConfig.ts:12` `csp.ts:25` `navigationGuard.ts:30` `warmPool.ts:43`
- Manifest/sign/review `app/src/miniapps/manifest/signer.ts:63` `validator.ts:21` `archiveSafety.ts` `app/src/miniapps/pipeline/review.ts:35` `app/docs/mini-app-platform-standard.md:52`
- Catalog `app/src/miniapps/catalog.ts:44` `catalogTenant.ts` `app/src/home/homeModel.ts:18`
- Tracking `app/src/tracking/trackingService.ts:297` `types.ts` `app/src/native/hostStorage.ts:62` `app/src/config/budgets.ts:10`
- Notifications `app/src/notification/notificationService.ts:246` `types.ts` `app/src/native/notification.ts`
- Design tokens `app/src/config/palette.ts:57` `motion.ts:34` `miniAppDesignTokens.ts` `layout.ts` `appConfig.ts:13`
- Policy `policy/budgets.md:68` `policy/capabilities.yaml:22` `policy/conformance.md:35` `.claude/skills/*`

---

*Budgets are provisional until baselined on Galaxy A14 per `policy/budgets.md:34`; ratchet beats absolute per `CLAUDE.md` mechanisms section. Treat any `95ms` claim as derived/perceptual until field p95 is measured.*
