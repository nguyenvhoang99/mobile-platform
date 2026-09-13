# Feature Graph — dependency trees (3 scopes)

> Generated 2026-09-02T09:13:19.816Z · sources: policy/capabilities.yaml · src/bridge/registry.ts · import scan
> Scope: ONLY feature→feature, feature→components, feature→permissions. Nothing else belongs here.
> Refresh: `npm run feature:graph` after every feature/component/permission change.

Render mermaid with GitHub/VS Code or open `feature-graph.html`.

---

## §1 Feature → Feature

What calls what. Edges are directed; reason + evidence are load-bearing.

```mermaid
flowchart LR
  %% features grouped by layer — edit FEATURES[].layer to regroup
  app["App Orchestration"]
  home["Home & Personalization"]
  navigation["Navigation & Dock"]
  explore["Explore & Catalog"]
  tenant["Tenant & Localization"]
  container["Mini-App Container"]
  pipeline["Pipeline & Review"]
  bridge["Bridge & Handlers"]
  tracking["Tracking & Telemetry"]
  notifications["Notifications"]
  deviceAccess["Device Access"]
  storage["Host Storage"]
  cards["Cards Domain"]
  splitBill["Split Bill Domain"]
  designSystem["Design System"]
  haptics["Haptics & Motion"]

  app --> home
  app --> navigation
  app --> explore
  app --> tenant
  app --> notifications
  app --> tracking
  app --> haptics
  home --> explore
  home --> navigation
  home --> tracking
  home --> tenant
  home --> designSystem
  home --> storage
  navigation --> explore
  navigation --> container
  navigation --> tracking
  navigation --> haptics
  navigation --> storage
  explore --> tenant
  explore --> navigation
  tenant --> storage
  tenant --> deviceAccess
  tenant --> designSystem
  container --> pipeline
  container --> storage
  container --> tracking
  container --> haptics
  container --> bridge
  pipeline --> container
  bridge --> container
  bridge --> storage
  bridge --> tracking
  bridge --> notifications
  bridge --> deviceAccess
  tracking --> storage
  tracking --> container
  notifications --> navigation
  notifications --> tracking
  notifications --> storage
  notifications --> tenant
  cards --> container
  cards --> tracking
  cards --> explore
  splitBill --> container
  splitBill --> tracking
  splitBill --> explore
  splitBill --> storage
  splitBill --> designSystem
  splitBill --> bridge
  designSystem --> haptics
  haptics --> deviceAccess
  cards --> storage
  cards --> designSystem
  explore --> designSystem
  explore --> tracking
  notifications --> designSystem
  haptics --> designSystem
  haptics --> explore
  haptics --> navigation
  home --> haptics
  home --> notifications
  app --> designSystem
  storage --> tenant
  storage --> home
  storage --> navigation
  container --> designSystem
  navigation --> designSystem
  navigation --> cards
  navigation --> splitBill
  navigation --> deviceAccess
  tracking --> explore
  tracking --> deviceAccess

  classDef host fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  classDef container fill:#14532d,stroke:#4ade80,color:#ecfdf5
  classDef bridge fill:#7c2d12,stroke:#fb923c,color:#fff7ed
  classDef native fill:#0f172a,stroke:#38bdf8,color:#e2e8f0
  classDef governance fill:#422006,stroke:#facc15,color:#fefce8
  classDef domain fill:#4a044e,stroke:#e879f9,color:#fdf4ff
  class app host
  class home host
  class navigation host
  class explore host
  class tenant host
  class container container
  class pipeline governance
  class bridge bridge
  class tracking host
  class notifications host
  class deviceAccess native
  class storage native
  class cards domain
  class splitBill domain
  class designSystem host
  class haptics native

```

| From | To | Reason | Evidence |
|------|----|--------|----------|
| `app` | `home` | App renders HomeScreen, persists home prefs | `App.tsx:HomeScreen` |
| `app` | `navigation` | App owns navigation state + GlassTabBar | `App.tsx:navigationBroker` |
| `app` | `explore` | Explore sheet + picker modals | `App.tsx:ExploreSheet MiniAppPickerModal` |
| `app` | `tenant` | useTenant() tenant resolution + picker | `App.tsx:useTenant tenantPickerOpen` |
| `app` | `notifications` | Inbox + foreground banner + activation | `App.tsx:notification.subscribe onForegroundReceived` |
| `app` | `tracking` | trackHost on every nav/home/close | `App.tsx:tracking.trackHost` |
| `app` | `haptics` | applyShellChrome + selection signals | `App.tsx:applyShellChrome signalNavigationSelection` |
| `home` | `explore` | Category/mini-app catalog + tenant-filtered picks | `src/screens/HomeScreen.tsx:catalogForTenant findMiniApp` |
| `home` | `navigation` | Open/pin triggers dock/nav actions | `src/screens/HomeScreen.tsx:onOpenMiniApp onPin` |
| `home` | `tracking` | Scroll depth + surface viewed + preference changed | `src/screens/HomeScreen.tsx:onScrollDepth onSurfaceViewed` |
| `home` | `tenant` | orders suggestions by viewerProfile + tenant | `src/home/homeModel.ts:orderHomeCategorySuggestions` |
| `home` | `designSystem` | HomeCollection palette/motion, GlassTabBar excluded | `src/components/HomeCollection.tsx:palette` |
| `home` | `storage` | home prefs persisted via hostStorage | `src/native/hostStorage.ts:saveHomePreferences` |
| `navigation` | `explore` | Dock selection validated against catalog | `src/navigation/navigationBroker.ts:openDockMiniApp findMiniApp` |
| `navigation` | `container` | Cross-app link source validation | `src/navigation/navigationBroker.ts:openCrossMiniApp` |
| `navigation` | `tracking` | Route viewed + nav denied | `src/screens/MiniAppScreen.tsx:onTrackEvent` |
| `navigation` | `haptics` | Tab selection haptics | `src/components/GlassTabBar.tsx:signalNavigationSelection` |
| `navigation` | `storage` | Dock selection persisted | `src/native/hostStorage.ts:saveDockSelection` |
| `explore` | `tenant` | Tenant-filtered featured set | `src/miniapps/catalogTenant.ts:catalogForTenant` |
| `explore` | `navigation` | Explore open triggers navigation | `src/components/ExploreSheet.tsx:onOpenMiniApp` |
| `tenant` | `storage` | Tenant persisted | `src/config/tenantStorage.ts:saveStoredTenant` |
| `tenant` | `deviceAccess` | Location-first resolve (host-only weatherLocation) | `src/hooks/useTenant.ts:requestDeviceAccess weatherLocation` |
| `tenant` | `designSystem` | Palette overrides per tenant profile | `src/config/tenants.ts:paletteOverrides` |
| `container` | `pipeline` | Only renders after verifyPackage before first paint | `src/miniapps/container/MiniAppContainer.tsx:verifyPackage` |
| `container` | `storage` | domStorageEnabled=false incognito pool safety | `src/miniapps/container/containerConfig.ts:domStorageEnabled false` |
| `container` | `tracking` | Trace markers for container timing | `src/miniapps/container/MiniAppContainer.tsx:budgets TRACE_MARKERS` |
| `container` | `haptics` | Reduced motion inside container | `src/miniapps/container/MiniAppContainer.tsx:useReducedMotion` |
| `container` | `bridge` | Bridge injected via native reply channel, not RN JS | `src/bridge/handler.ts:handleBridgeRequest` |
| `pipeline` | `container` | Validator/signer shared with container B5 | `src/miniapps/pipeline/review.ts:validateManifest verifyPackage` |
| `bridge` | `container` | Session identity derived from WebView binding | `src/bridge/handler.ts:BridgeSession` |
| `bridge` | `storage` | storage.kv is per-(tenant,appId,user) scoped | `src/bridge/handlers/storageKv.ts` |
| `bridge` | `tracking` | Every handler emits audit before reply | `src/bridge/audit.ts` |
| `bridge` | `notifications` | notify.subscribe handler | `src/bridge/handlers/notifySubscribe.ts` |
| `bridge` | `deviceAccess` | location.current derived, scanner host UI | `src/bridge/handlers/locationCurrent.ts scanner.ts` |
| `tracking` | `storage` | Durable journal 8 MB on disk | `src/tracking/trackingService.ts:retentionMs durableJournal` |
| `tracking` | `container` | mini_app_opened / route_viewed emitted by container nav | `src/tracking/types.ts` |
| `notifications` | `navigation` | Tap notification activates target mini-app entrypoint | `src/notification/notificationService.ts:onActivated target.mini_app_id` |
| `notifications` | `tracking` | notification_opened / permission status | `src/notification/notificationService.ts:tracking` |
| `notifications` | `storage` | Inbox persisted, seen ids | `src/notification/notificationService.ts` |
| `notifications` | `tenant` | Per-tenant featured may affect notification targets | `App.tsx:tenantCatalog` |
| `cards` | `container` | Card mini-app uses container CSP + signing | `src/cards/model.ts` |
| `cards` | `tracking` | Card tracking events (budget view) | `src/cards/model.test.ts` |
| `cards` | `explore` | Card appears in catalogTenant featured | `src/miniapps/catalog.ts:card` |
| `splitBill` | `container` | Split Bill mini-app uses container CSP + signing | `src/splitBill/model.ts` |
| `splitBill` | `tracking` | Split Bill tracking events (bill_created/settled) | `src/splitBill/model.test.ts` |
| `splitBill` | `explore` | Split Bill appears in catalogTenant featured | `src/miniapps/catalog.ts:split-bill` |
| `splitBill` | `storage` | Bill draft persisted via storage.kv | `src/splitBill/storage.ts` |
| `splitBill` | `designSystem` | SplitBillBody uses palette tokens | `src/components/SplitBillBody.tsx:palette` |
| `splitBill` | `bridge` | VietQR paste/scan via net.request + scanner.scan | `src/splitBill/vietqr.ts` |
| `designSystem` | `haptics` | Tokens include motion → reduceMotion controls surfaces | `src/config/motion.ts:reduceMotion` |
| `haptics` | `deviceAccess` | Haptics via nativeShell, not WebView | `src/native/nativeShell.ts:signalNavigationSelection` |
| `cards` | `storage` | import scan | `auto: cards imports storage` |
| `cards` | `designSystem` | import scan | `auto: cards imports designSystem` |
| `explore` | `designSystem` | import scan | `auto: explore imports designSystem` |
| `explore` | `tracking` | import scan | `auto: explore imports tracking` |
| `notifications` | `designSystem` | import scan | `auto: notifications imports designSystem` |
| `haptics` | `designSystem` | import scan | `auto: haptics imports designSystem` |
| `haptics` | `explore` | import scan | `auto: haptics imports explore` |
| `haptics` | `navigation` | import scan | `auto: haptics imports navigation` |
| `home` | `haptics` | import scan | `auto: home imports haptics` |
| `home` | `notifications` | import scan | `auto: home imports notifications` |
| `app` | `designSystem` | import scan | `auto: app imports designSystem` |
| `storage` | `tenant` | import scan | `auto: storage imports tenant` |
| `storage` | `home` | import scan | `auto: storage imports home` |
| `storage` | `navigation` | import scan | `auto: storage imports navigation` |
| `container` | `designSystem` | import scan | `auto: container imports designSystem` |
| `navigation` | `designSystem` | import scan | `auto: navigation imports designSystem` |
| `navigation` | `cards` | import scan | `auto: navigation imports cards` |
| `navigation` | `splitBill` | import scan | `auto: navigation imports splitBill` |
| `navigation` | `deviceAccess` | import scan | `auto: navigation imports deviceAccess` |
| `tracking` | `explore` | import scan | `auto: tracking imports explore` |
| `tracking` | `deviceAccess` | import scan | `auto: tracking imports deviceAccess` |

All 72 edges include 51 hand-maintained + 21 auto-detected via import scan.

---

## §2 Feature → Components

What renders or owns what — screens, components, hooks, services, native modules, scripts.

```mermaid
flowchart TB
  subgraph app["App Orchestration — host"]
    app_App_tsx["App.tsx"]
    app_src_hooks_useTenant_ts["src/hooks/useTenant.ts"]
    app_src_config_appConfig_ts["src/config/appConfig.ts"]
  end
  subgraph home["Home & Personalization — host"]
    home_src_screens_HomeScreen_t["src/screens/HomeScreen.tsx"]
    home_src_home_homeModel_ts["src/home/homeModel.ts"]
    home_src_components_HomeColle["src/components/HomeCollection.tsx"]
    home_src_components_HomeColle["src/components/HomeCollectionPickerModal.tsx"]
    home_src_components_CardCatal["src/components/CardCatalogBody.tsx"]
    home_src_components_TrackedSc["src/components/TrackedScrollView.tsx"]
  end
  subgraph navigation["Navigation & Dock — host"]
    navigation_src_navigation_navigatio["src/navigation/navigationBroker.ts"]
    navigation_src_components_GlassTabB["src/components/GlassTabBar.tsx"]
    navigation_src_screens_MiniAppScree["src/screens/MiniAppScreen.tsx"]
    navigation_src_screens_PlaceholderS["src/screens/PlaceholderScreen.tsx"]
    navigation_src_native_nativeShell_t["src/native/nativeShell.ts"]
  end
  subgraph explore["Explore & Catalog — host"]
    explore_src_components_ExploreSh["src/components/ExploreSheet.tsx"]
    explore_src_components_MiniAppPi["src/components/MiniAppPickerModal.tsx"]
    explore_src_components_TenantPic["src/components/TenantPickerSheet.tsx"]
    explore_src_miniapps_catalog_ts["src/miniapps/catalog.ts"]
    explore_src_miniapps_catalogTena["src/miniapps/catalogTenant.ts"]
    explore_src_miniapps_sample_Samp["src/miniapps/sample/SampleMiniApp.tsx"]
  end
  subgraph tenant["Tenant & Localization — host"]
    tenant_src_config_tenants_ts["src/config/tenants.ts"]
    tenant_src_config_tenantStorage["src/config/tenantStorage.ts"]
    tenant_src_hooks_useTenant_ts["src/hooks/useTenant.ts"]
    tenant_src_components_TenantPic["src/components/TenantPickerSheet.tsx"]
  end
  subgraph container["Mini-App Container — container"]
    container_src_miniapps_container_M["src/miniapps/container/MiniAppContainer.tsx"]
    container_src_miniapps_container_c["src/miniapps/container/containerConfig.ts"]
    container_src_miniapps_container_c["src/miniapps/container/csp.ts"]
    container_src_miniapps_container_n["src/miniapps/container/navigationGuard.ts"]
    container_src_miniapps_container_w["src/miniapps/container/warmPool.ts"]
    container_src_miniapps_manifest_si["src/miniapps/manifest/signer.ts"]
    container_src_miniapps_manifest_va["src/miniapps/manifest/validator.ts"]
    container_src_miniapps_manifest_ar["src/miniapps/manifest/archiveSafety.ts"]
    container_more["… +1 more"]
  end
  subgraph pipeline["Pipeline & Review — governance"]
    pipeline_src_miniapps_pipeline_re["src/miniapps/pipeline/review.ts"]
    pipeline_src_miniapps_manifest_va["src/miniapps/manifest/validator.ts"]
    pipeline_src_miniapps_manifest_si["src/miniapps/manifest/signer.ts"]
    pipeline_app_scripts_miniapp_sign["app/scripts/miniapp-sign.mjs"]
    pipeline_app_scripts_verify_sh["app/scripts/verify.sh"]
  end
  subgraph bridge["Bridge & Handlers — bridge"]
    bridge_src_bridge_registry_ts["src/bridge/registry.ts"]
    bridge_src_bridge_handler_ts["src/bridge/handler.ts"]
    bridge_src_bridge_gates_ts["src/bridge/gates.ts"]
    bridge_src_bridge_register_ts["src/bridge/register.ts"]
    bridge_src_bridge_audit_ts["src/bridge/audit.ts"]
    bridge_src_bridge_types_ts["src/bridge/types.ts"]
    bridge_src_bridge_handlers_netR["src/bridge/handlers/netRequest.ts"]
    bridge_src_bridge_handlers_stor["src/bridge/handlers/storageKv.ts"]
    bridge_more["… +4 more"]
  end
  subgraph tracking["Tracking & Telemetry — host"]
    tracking_src_tracking_trackingSer["src/tracking/trackingService.ts"]
    tracking_src_tracking_trace_ts["src/tracking/trace.ts"]
    tracking_src_tracking_types_ts["src/tracking/types.ts"]
    tracking_src_components_TrackedSc["src/components/TrackedScrollView.tsx"]
    tracking_src_config_budgets_ts["src/config/budgets.ts"]
  end
  subgraph notifications["Notifications — host"]
    notifications_src_notification_notific["src/notification/notificationService.ts"]
    notifications_src_notification_index_t["src/notification/index.ts"]
    notifications_src_notification_types_t["src/notification/types.ts"]
    notifications_src_components_Notificat["src/components/NotificationSheet.tsx"]
    notifications_src_components_Foregroun["src/components/ForegroundNotificationBanner.tsx"]
    notifications_src_native_notification_["src/native/notification.ts"]
    notifications_src_config_remotePush_ts["src/config/remotePush.ts"]
  end
  subgraph deviceAccess["Device Access — native"]
    deviceAccess_src_native_deviceAccess_["src/native/deviceAccess.ts"]
    deviceAccess_src_utils_withTimeout_ts["src/utils/withTimeout.ts"]
  end
  subgraph storage["Host Storage — native"]
    storage_src_native_hostStorage_t["src/native/hostStorage.ts"]
    storage_src_config_tenantStorage["src/config/tenantStorage.ts"]
    storage_src_miniapps_container_c["src/miniapps/container/containerConfig.ts"]
  end
  subgraph cards["Cards Domain — domain"]
    cards_src_cards_model_ts["src/cards/model.ts"]
    cards_src_cards_cardStore_ts["src/cards/cardStore.ts"]
    cards_src_cards_dataset_ts["src/cards/dataset.ts"]
    cards_src_components_CardCatal["src/components/CardCatalogBody.tsx"]
  end
  subgraph splitBill["Split Bill Domain — domain"]
    splitBill_src_splitBill_model_ts["src/splitBill/model.ts"]
    splitBill_src_splitBill_vietqr_ts["src/splitBill/vietqr.ts"]
    splitBill_src_splitBill_banks_ts["src/splitBill/banks.ts"]
    splitBill_src_splitBill_i18n_ts["src/splitBill/i18n.ts"]
    splitBill_src_splitBill_storage_ts["src/splitBill/storage.ts"]
    splitBill_src_components_SplitBill["src/components/SplitBillBody.tsx"]
  end
  subgraph designSystem["Design System — host"]
    designSystem_src_ui_foundations_token["src/ui/foundations/tokens.ts"]
    designSystem_src_ui_primitives_Box_ts["src/ui/primitives/Box.tsx"]
    designSystem_src_ui_primitives_Text_t["src/ui/primitives/Text.tsx"]
    designSystem_src_ui_primitives_Pressa["src/ui/primitives/Pressable.tsx"]
    designSystem_src_ui_primitives_Divide["src/ui/primitives/Divider.tsx"]
    designSystem_src_ui_actions_Button_ts["src/ui/actions/Button.tsx"]
    designSystem_src_ui_actions_IconButto["src/ui/actions/IconButton.tsx"]
    designSystem_src_config_palette_ts["src/config/palette.ts"]
    designSystem_more["… +4 more"]
  end
  subgraph haptics["Haptics & Motion — native"]
    haptics_src_native_nativeShell_t["src/native/nativeShell.ts"]
    haptics_src_native_haptics_ts["src/native/haptics.ts"]
    haptics_src_config_motion_ts["src/config/motion.ts"]
    haptics_src_config_useReducedMot["src/config/useReducedMotion.ts"]
    haptics_src_components_GlassTabB["src/components/GlassTabBar.tsx"]
  end

```

| Feature | Label | Components |
|---------|-------|------------|
| `app` | App Orchestration | `App.tsx`<br/>`src/hooks/useTenant.ts`<br/>`src/config/appConfig.ts` |
| `home` | Home & Personalization | `src/screens/HomeScreen.tsx`<br/>`src/home/homeModel.ts`<br/>`src/components/HomeCollection.tsx`<br/>`src/components/HomeCollectionPickerModal.tsx`<br/>`src/components/CardCatalogBody.tsx`<br/>`src/components/TrackedScrollView.tsx` |
| `navigation` | Navigation & Dock | `src/navigation/navigationBroker.ts`<br/>`src/components/GlassTabBar.tsx`<br/>`src/screens/MiniAppScreen.tsx`<br/>`src/screens/PlaceholderScreen.tsx`<br/>`src/native/nativeShell.ts` |
| `explore` | Explore & Catalog | `src/components/ExploreSheet.tsx`<br/>`src/components/MiniAppPickerModal.tsx`<br/>`src/components/TenantPickerSheet.tsx`<br/>`src/miniapps/catalog.ts`<br/>`src/miniapps/catalogTenant.ts`<br/>`src/miniapps/sample/SampleMiniApp.tsx` |
| `tenant` | Tenant & Localization | `src/config/tenants.ts`<br/>`src/config/tenantStorage.ts`<br/>`src/hooks/useTenant.ts`<br/>`src/components/TenantPickerSheet.tsx` |
| `container` | Mini-App Container | `src/miniapps/container/MiniAppContainer.tsx`<br/>`src/miniapps/container/containerConfig.ts`<br/>`src/miniapps/container/csp.ts`<br/>`src/miniapps/container/navigationGuard.ts`<br/>`src/miniapps/container/warmPool.ts`<br/>`src/miniapps/manifest/signer.ts`<br/>`src/miniapps/manifest/validator.ts`<br/>`src/miniapps/manifest/archiveSafety.ts`<br/>`src/miniapps/manifest/schema.json` |
| `pipeline` | Pipeline & Review | `src/miniapps/pipeline/review.ts`<br/>`src/miniapps/manifest/validator.ts`<br/>`src/miniapps/manifest/signer.ts`<br/>`app/scripts/miniapp-sign.mjs`<br/>`app/scripts/verify.sh` |
| `bridge` | Bridge & Handlers | `src/bridge/registry.ts`<br/>`src/bridge/handler.ts`<br/>`src/bridge/gates.ts`<br/>`src/bridge/register.ts`<br/>`src/bridge/audit.ts`<br/>`src/bridge/types.ts`<br/>`src/bridge/handlers/netRequest.ts`<br/>`src/bridge/handlers/storageKv.ts`<br/>`src/bridge/handlers/scanner.ts`<br/>`src/bridge/handlers/locationCurrent.ts`<br/>`src/bridge/handlers/cryptoSign.ts`<br/>`src/bridge/handlers/notifySubscribe.ts` |
| `tracking` | Tracking & Telemetry | `src/tracking/trackingService.ts`<br/>`src/tracking/trace.ts`<br/>`src/tracking/types.ts`<br/>`src/components/TrackedScrollView.tsx`<br/>`src/config/budgets.ts` |
| `notifications` | Notifications | `src/notification/notificationService.ts`<br/>`src/notification/index.ts`<br/>`src/notification/types.ts`<br/>`src/components/NotificationSheet.tsx`<br/>`src/components/ForegroundNotificationBanner.tsx`<br/>`src/native/notification.ts`<br/>`src/config/remotePush.ts` |
| `deviceAccess` | Device Access | `src/native/deviceAccess.ts`<br/>`src/utils/withTimeout.ts` |
| `storage` | Host Storage | `src/native/hostStorage.ts`<br/>`src/config/tenantStorage.ts`<br/>`src/miniapps/container/containerConfig.ts` |
| `cards` | Cards Domain | `src/cards/model.ts`<br/>`src/cards/cardStore.ts`<br/>`src/cards/dataset.ts`<br/>`src/components/CardCatalogBody.tsx` |
| `splitBill` | Split Bill Domain | `src/splitBill/model.ts`<br/>`src/splitBill/vietqr.ts`<br/>`src/splitBill/banks.ts`<br/>`src/splitBill/i18n.ts`<br/>`src/splitBill/storage.ts`<br/>`src/components/SplitBillBody.tsx` |
| `designSystem` | Design System | `src/ui/foundations/tokens.ts`<br/>`src/ui/primitives/Box.tsx`<br/>`src/ui/primitives/Text.tsx`<br/>`src/ui/primitives/Pressable.tsx`<br/>`src/ui/primitives/Divider.tsx`<br/>`src/ui/actions/Button.tsx`<br/>`src/ui/actions/IconButton.tsx`<br/>`src/config/palette.ts`<br/>`src/config/layout.ts`<br/>`src/config/motion.ts`<br/>`src/config/miniAppDesignTokens.ts`<br/>`src/config/useReducedMotion.ts` |
| `haptics` | Haptics & Motion | `src/native/nativeShell.ts`<br/>`src/native/haptics.ts`<br/>`src/config/motion.ts`<br/>`src/config/useReducedMotion.ts`<br/>`src/components/GlassTabBar.tsx` |

Total features: 16. Narrow to the files above when reviewing.

---

## §3 Feature → Permissions

What authority a feature needs — bridge capabilities, OS permission, or host-only deviceAccess. A feature with no row needs no permission.

Capabilities registry (`policy/capabilities.yaml:6`  `src/bridge/registry.ts:6` — R1): `net.request`, `storage.kv`, `scanner.scan`, `location.current`, `crypto.sign`, `notify.subscribe`

```mermaid
flowchart LR
  subgraph Perms["Permissions"]
    caps["Capabilities<br/>net.request storage.kv scanner.scan<br/>location.current crypto.sign notify.subscribe"]
    dev["DeviceAccess<br/>network biometric weatherLocation voiceCommand<br/>host-only"]
    os["OS Push<br/>APNs/FCM"]
    never["never_expose<br/>dynamic code, paths, generic invoke…"]
  end
  tenant["Tenant & Localization"] --> tenant_weatherLocation["weatherLocation"]
  tenant_weatherLocation -.-> dev
  bridge["Bridge & Handlers"] --> bridge_net.request["net.request"]
  bridge_net.request -.-> caps
  bridge["Bridge & Handlers"] --> bridge_storage.kv["storage.kv"]
  bridge_storage.kv -.-> caps
  bridge["Bridge & Handlers"] --> bridge_scanner.scan["scanner.scan"]
  bridge_scanner.scan -.-> caps
  bridge["Bridge & Handlers"] --> bridge_location.current["location.current"]
  bridge_location.current -.-> caps
  bridge["Bridge & Handlers"] --> bridge_crypto.sign["crypto.sign"]
  bridge_crypto.sign -.-> caps
  bridge["Bridge & Handlers"] --> bridge_notify.subscribe["notify.subscribe"]
  bridge_notify.subscribe -.-> caps
  notifications["Notifications"] --> notifications_notify.subscribe["notify.subscribe"]
  notifications_notify.subscribe -.-> caps
  notifications["Notifications"] --> notifications_push["push"]
  notifications_push -.-> os
  deviceAccess["Device Access"] --> deviceAccess_network["network"]
  deviceAccess_network -.-> dev
  deviceAccess["Device Access"] --> deviceAccess_biometric["biometric"]
  deviceAccess_biometric -.-> dev
  deviceAccess["Device Access"] --> deviceAccess_weatherLocation["weatherLocation"]
  deviceAccess_weatherLocation -.-> dev
  deviceAccess["Device Access"] --> deviceAccess_voiceCommand["voiceCommand"]
  deviceAccess_voiceCommand -.-> dev

```

| Feature | Label | Permission (kind) | Consent | Broker UI | Min tier / via |
|---------|-------|-------------------|---------|-----------|----------------|
| `app` | App Orchestration | — | — | — | — |
| `home` | Home & Personalization | — | — | — | — |
| `navigation` | Navigation & Dock | — | — | — | — |
| `explore` | Explore & Catalog | — | — | — | — |
| `tenant` | Tenant & Localization | `weatherLocation` (deviceAccess) | `—` | `—` | `—` `native/deviceAccess.ts` |
| `container` | Mini-App Container | — | — | — | — |
| `pipeline` | Pipeline & Review | — | — | — | — |
| `bridge` | Bridge & Handlers | `net.request` (capability) | `none` | `false` | `sandbox` `capability` |
| `bridge` | Bridge & Handlers | `storage.kv` (capability) | `none` | `false` | `sandbox` `capability` |
| `bridge` | Bridge & Handlers | `scanner.scan` (capability) | `once` | `host_scanner` | `self_serve` `capability` |
| `bridge` | Bridge & Handlers | `location.current` (capability) | `once` | `false` | `partner_verified` `capability` |
| `bridge` | Bridge & Handlers | `crypto.sign` (capability) | `once` | `biometric_prompt` | `partner_verified` `capability` |
| `bridge` | Bridge & Handlers | `notify.subscribe` (capability) | `while_using` | `false` | `self_serve` `capability` |
| `tracking` | Tracking & Telemetry | — | — | — | — |
| `notifications` | Notifications | `notify.subscribe` (capability) | `while_using` | `false` | `self_serve` `bridge handler notify.subscribe` |
| `notifications` | Notifications | `push` (os) | `—` | `—` | `—` `native/notification.ts` |
| `deviceAccess` | Device Access | `network` (deviceAccess) | `—` | `—` | `—` `native/deviceAccess.ts` |
| `deviceAccess` | Device Access | `biometric` (deviceAccess) | `—` | `—` | `—` `native/deviceAccess.ts` |
| `deviceAccess` | Device Access | `weatherLocation` (deviceAccess) | `—` | `—` | `—` `native/deviceAccess.ts` |
| `deviceAccess` | Device Access | `voiceCommand` (deviceAccess) | `—` | `—` | `—` `native/deviceAccess.ts` |
| `storage` | Host Storage | — | — | — | — |
| `cards` | Cards Domain | — | — | — | — |
| `splitBill` | Split Bill Domain | — | — | — | — |
| `designSystem` | Design System | — | — | — | — |
| `haptics` | Haptics & Motion | — | — | — | — |

### never_expose (not permissions — refusals)

These never become grantable at a higher tier, flag, or deadline:

- dynamic code execution or loading, in any form
- raw filesystem paths, in either direction
- generic or reflective invocation
- host credentials
- persistent cross-app identifiers
- bulk personal data
- clipboard read without an explicit paste gesture
- screen capture, screen recording, accessibility services, overlay windows,
- arbitrary URL or intent launch
- raw biometric material — and "biometry succeeded" as a boolean
- key export
- installing, downloading-and-executing, or side-loading anything
- raw sockets, and generic background-execution primitives
- any host-internal debug or admin capability, even behind a flag

### Mini-app instances (catalog)

`src/miniapps/catalog.ts:6` — `badminton` (Cầu lông), `weather`, `transit`, `notes`, `market`, `card`. Each carries `publicEntrypoints` / `crossAppLinks` / `trackingEvents.allowedDataKeys` — see §1 edges via `catalogTenant` and §2 via `explore` / `container`.

---

## How to maintain

1. Edit feature code.
2. Run `npm run feature:graph` (overwrites json/md/html).
3. Review the diff in this file — added/removed edges are the impact.
4. Commit code + `feature-graph.*` together.

If auto scan misses an edge, add it to `EDGES` in `scripts/feature-graph.mjs`. If it falsely reports one, add to overrides in `feature-graph.config.json` (not yet needed).
