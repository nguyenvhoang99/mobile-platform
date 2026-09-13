#!/usr/bin/env node
/**
 * feature-graph.mjs — generates app/docs/feature-graph.{json,md,html}
 * Scope: ONLY feature→feature, feature→components, feature→permissions.
 *
 * Sources: inline registry + import scan + policy/capabilities.yaml + src/bridge/registry.ts
 * Run: npm run feature:graph  or  node ./scripts/feature-graph.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const REPO_ROOT = join(APP_ROOT, '..');
const DOCS_DIR = join(APP_ROOT, 'docs');
const CAP_YAML = join(REPO_ROOT, 'policy', 'capabilities.yaml');
const REGISTRY_TS = join(APP_ROOT, 'src', 'bridge', 'registry.ts');
const DEVICE_ACCESS_TS = join(APP_ROOT, 'src', 'native', 'deviceAccess.ts');

// ── Feature registry (canonical) ──────────────────────────────────────────
// Changing a feature must happen here. Config patch at feature-graph.config.json
// can only add overrides, not replace this table silently.

const FEATURES = [
  {
    id: 'app',
    label: 'App Orchestration',
    layer: 'host',
    description: 'App.tsx hub — state, refs, dock, explore sheet, tenant, tracking, notifications, haptics',
    globs: ['App.tsx', 'src/hooks/useTenant.ts'],
    components: [
      'App.tsx',
      'src/hooks/useTenant.ts',
      'src/config/appConfig.ts',
    ],
    permissions: [],
  },
  {
    id: 'home',
    label: 'Home & Personalization',
    layer: 'host',
    description: 'Home screen, pinned categories/apps, suggestions, first-run constellation',
    globs: ['src/screens/HomeScreen.tsx', 'src/home/*', 'src/components/HomeCollection*', 'src/components/CardCatalogBody.tsx'],
    components: [
      'src/screens/HomeScreen.tsx',
      'src/home/homeModel.ts',
      'src/components/HomeCollection.tsx',
      'src/components/HomeCollectionPickerModal.tsx',
      'src/components/CardCatalogBody.tsx',
      'src/components/TrackedScrollView.tsx',
    ],
    permissions: [],
  },
  {
    id: 'navigation',
    label: 'Navigation & Dock',
    layer: 'host',
    description: 'navigationBroker state machine, GlassTabBar dock L/R + Explore, MiniAppScreen trusted header',
    globs: ['src/navigation/*', 'src/components/GlassTabBar.tsx', 'src/screens/MiniAppScreen.tsx', 'src/screens/PlaceholderScreen.tsx'],
    components: [
      'src/navigation/navigationBroker.ts',
      'src/components/GlassTabBar.tsx',
      'src/screens/MiniAppScreen.tsx',
      'src/screens/PlaceholderScreen.tsx',
      'src/native/nativeShell.ts',
    ],
    permissions: [],
  },
  {
    id: 'explore',
    label: 'Explore & Catalog',
    layer: 'host',
    description: 'Explore sheet, pickers, mini-app directory filtered by tenant',
    globs: ['src/components/ExploreSheet.tsx', 'src/components/MiniAppPickerModal.tsx', 'src/components/TenantPickerSheet.tsx', 'src/miniapps/catalog*'],
    components: [
      'src/components/ExploreSheet.tsx',
      'src/components/MiniAppPickerModal.tsx',
      'src/components/TenantPickerSheet.tsx',
      'src/miniapps/catalog.ts',
      'src/miniapps/catalogTenant.ts',
      'src/miniapps/sample/SampleMiniApp.tsx',
    ],
    permissions: [],
  },
  {
    id: 'tenant',
    label: 'Tenant & Localization',
    layer: 'host',
    description: 'Location-first tenant resolve, 4 tenants haversine, persisted selection',
    globs: ['src/config/tenants.ts', 'src/config/tenantStorage.ts', 'src/hooks/useTenant.ts'],
    components: [
      'src/config/tenants.ts',
      'src/config/tenantStorage.ts',
      'src/hooks/useTenant.ts',
      'src/components/TenantPickerSheet.tsx',
    ],
    permissions: [
      // host-only device access, not bridge
      { kind: 'deviceAccess', name: 'weatherLocation', via: 'native/deviceAccess.ts', hostOnly: true, notes: '4s timeout, location-first tenant resolve' },
    ],
  },
  {
    id: 'container',
    label: 'Mini-App Container',
    layer: 'container',
    description: 'Only WebView factory, CSP, nav guard, warm pool, signing',
    globs: ['src/miniapps/container/*', 'src/miniapps/manifest/*'],
    components: [
      'src/miniapps/container/MiniAppContainer.tsx',
      'src/miniapps/container/containerConfig.ts',
      'src/miniapps/container/csp.ts',
      'src/miniapps/container/navigationGuard.ts',
      'src/miniapps/container/warmPool.ts',
      'src/miniapps/manifest/signer.ts',
      'src/miniapps/manifest/validator.ts',
      'src/miniapps/manifest/archiveSafety.ts',
      'src/miniapps/manifest/schema.json',
    ],
    permissions: [],
  },
  {
    id: 'pipeline',
    label: 'Pipeline & Review',
    layer: 'governance',
    description: '7 review checks, declared-vs-actual, store signing, rollout, revocation (server-expiry)',
    globs: ['src/miniapps/pipeline/*'],
    components: [
      'src/miniapps/pipeline/review.ts',
      'src/miniapps/manifest/validator.ts',
      'src/miniapps/manifest/signer.ts',
      'app/scripts/miniapp-sign.mjs',
      'app/scripts/verify.sh',
    ],
    permissions: [],
  },
  {
    id: 'bridge',
    label: 'Bridge & Handlers',
    layer: 'bridge',
    description: 'Only door — 10-step pipeline G1 declaration G2 consent G3 OS quota audit reply',
    globs: ['src/bridge/*', 'src/bridge/handlers/*'],
    components: [
      'src/bridge/registry.ts',
      'src/bridge/handler.ts',
      'src/bridge/gates.ts',
      'src/bridge/register.ts',
      'src/bridge/audit.ts',
      'src/bridge/types.ts',
      'src/bridge/handlers/netRequest.ts',
      'src/bridge/handlers/storageKv.ts',
      'src/bridge/handlers/scanner.ts',
      'src/bridge/handlers/locationCurrent.ts',
      'src/bridge/handlers/cryptoSign.ts',
      'src/bridge/handlers/notifySubscribe.ts',
    ],
    // bridge owns all capabilities; per-handler detail below in permission table
    permissions: [
      { kind: 'capability', name: 'net.request', consent: 'none', osPermission: 'none', brokerUi: 'false', risk: 'medium', minTier: 'sandbox' },
      { kind: 'capability', name: 'storage.kv', consent: 'none', osPermission: 'none', brokerUi: 'false', risk: 'low', minTier: 'sandbox' },
      { kind: 'capability', name: 'scanner.scan', consent: 'once', osPermission: 'none', brokerUi: 'host_scanner', risk: 'medium', minTier: 'self_serve' },
      { kind: 'capability', name: 'location.current', consent: 'once', osPermission: 'none', brokerUi: 'false', risk: 'high', minTier: 'partner_verified' },
      { kind: 'capability', name: 'crypto.sign', consent: 'once', osPermission: 'none', brokerUi: 'biometric_prompt', risk: 'high', minTier: 'partner_verified' },
      { kind: 'capability', name: 'notify.subscribe', consent: 'while_using', osPermission: 'none', brokerUi: 'false', risk: 'low', minTier: 'self_serve' },
    ],
  },
  {
    id: 'tracking',
    label: 'Tracking & Telemetry',
    layer: 'host',
    description: 'Journal→batch→transport, durable journal 8 MB, budgets per priority',
    globs: ['src/tracking/*', 'src/components/TrackedScrollView.tsx'],
    components: [
      'src/tracking/trackingService.ts',
      'src/tracking/trace.ts',
      'src/tracking/types.ts',
      'src/components/TrackedScrollView.tsx',
      'src/config/budgets.ts',
    ],
    permissions: [],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    layer: 'host',
    description: 'Inbox, permission, foreground banner, APNs/FCM via signed remote config',
    globs: ['src/notification/*', 'src/components/NotificationSheet.tsx', 'src/components/ForegroundNotificationBanner.tsx', 'src/native/notification.ts'],
    components: [
      'src/notification/notificationService.ts',
      'src/notification/index.ts',
      'src/notification/types.ts',
      'src/components/NotificationSheet.tsx',
      'src/components/ForegroundNotificationBanner.tsx',
      'src/native/notification.ts',
      'src/config/remotePush.ts',
    ],
    permissions: [
      { kind: 'capability', name: 'notify.subscribe', consent: 'while_using', osPermission: 'none', brokerUi: 'false', risk: 'low', minTier: 'self_serve', via: 'bridge handler notify.subscribe' },
      { kind: 'os', name: 'push', via: 'native/notification.ts', hostOnly: true, notes: 'OS push permission, per-host-app one-shot, host owns tokens' },
    ],
  },
  {
    id: 'deviceAccess',
    label: 'Device Access',
    layer: 'native',
    description: 'Host-only native access — network/biometric/weatherLocation/voiceCommand (no WebView path)',
    globs: ['src/native/deviceAccess.ts'],
    components: [
      'src/native/deviceAccess.ts',
      'src/utils/withTimeout.ts',
    ],
    permissions: [
      { kind: 'deviceAccess', name: 'network', via: 'native/deviceAccess.ts', hostOnly: true },
      { kind: 'deviceAccess', name: 'biometric', via: 'native/deviceAccess.ts', hostOnly: true },
      { kind: 'deviceAccess', name: 'weatherLocation', via: 'native/deviceAccess.ts', hostOnly: true },
      { kind: 'deviceAccess', name: 'voiceCommand', via: 'native/deviceAccess.ts', hostOnly: true },
    ],
  },
  {
    id: 'storage',
    label: 'Host Storage',
    layer: 'native',
    description: 'Host persistence (dock, home prefs, tenant) via NativeModule — WebView storage disabled for pool safety',
    globs: ['src/native/hostStorage.ts', 'src/config/tenantStorage.ts'],
    components: [
      'src/native/hostStorage.ts',
      'src/config/tenantStorage.ts',
      'src/miniapps/container/containerConfig.ts',
    ],
    permissions: [],
  },
  {
    id: 'cards',
    label: 'Cards Domain',
    layer: 'domain',
    description: 'Example domain reusing container+bridge+tracking+tenant',
    globs: ['src/cards/*'],
    components: [
      'src/cards/model.ts',
      'src/cards/cardStore.ts',
      'src/cards/dataset.ts',
      'src/components/CardCatalogBody.tsx',
    ],
    permissions: [],
  },
  {
    id: 'splitBill',
    label: 'Split Bill Domain',
    layer: 'domain',
    description: 'Chia tiền — bill items, min-cash-flow settlement, VietQR 38/A000000727 builder/parser, masked payout accounts',
    globs: ['src/splitBill/*', 'src/components/SplitBillBody.tsx'],
    components: [
      'src/splitBill/model.ts',
      'src/splitBill/vietqr.ts',
      'src/splitBill/banks.ts',
      'src/splitBill/i18n.ts',
      'src/splitBill/storage.ts',
      'src/components/SplitBillBody.tsx',
    ],
    permissions: [],
  },
  {
    id: 'designSystem',
    label: 'Design System',
    layer: 'host',
    description: 'UI foundations/tokens, primitives, actions — replaces per-screen inlines',
    globs: ['src/ui/*', 'src/config/palette.ts', 'src/config/layout.ts', 'src/config/motion.ts', 'src/config/miniAppDesignTokens.ts'],
    components: [
      'src/ui/foundations/tokens.ts',
      'src/ui/primitives/Box.tsx',
      'src/ui/primitives/Text.tsx',
      'src/ui/primitives/Pressable.tsx',
      'src/ui/primitives/Divider.tsx',
      'src/ui/actions/Button.tsx',
      'src/ui/actions/IconButton.tsx',
      'src/config/palette.ts',
      'src/config/layout.ts',
      'src/config/motion.ts',
      'src/config/miniAppDesignTokens.ts',
      'src/config/useReducedMotion.ts',
    ],
    permissions: [],
  },
  {
    id: 'haptics',
    label: 'Haptics & Motion',
    layer: 'native',
    description: 'Haptics + motion vocab (feedback/standard/emphasized, reduceMotion)',
    globs: ['src/native/nativeShell.ts', 'src/native/haptics.ts', 'src/config/motion.ts'],
    components: [
      'src/native/nativeShell.ts',
      'src/native/haptics.ts',
      'src/config/motion.ts',
      'src/config/useReducedMotion.ts',
      'src/components/GlassTabBar.tsx',
    ],
    permissions: [],
  },
];

// ── Feature→Feature edges (manual + verified by import scan) ──────────────
// Each edge must have a reason and an evidence file. Edges are directed.

const EDGES = [
  // app hub
  { from: 'app', to: 'home', reason: 'App renders HomeScreen, persists home prefs', evidence: 'App.tsx:HomeScreen' },
  { from: 'app', to: 'navigation', reason: 'App owns navigation state + GlassTabBar', evidence: 'App.tsx:navigationBroker' },
  { from: 'app', to: 'explore', reason: 'Explore sheet + picker modals', evidence: 'App.tsx:ExploreSheet MiniAppPickerModal' },
  { from: 'app', to: 'tenant', reason: 'useTenant() tenant resolution + picker', evidence: 'App.tsx:useTenant tenantPickerOpen' },
  { from: 'app', to: 'notifications', reason: 'Inbox + foreground banner + activation', evidence: 'App.tsx:notification.subscribe onForegroundReceived' },
  { from: 'app', to: 'tracking', reason: 'trackHost on every nav/home/close', evidence: 'App.tsx:tracking.trackHost' },
  { from: 'app', to: 'haptics', reason: 'applyShellChrome + selection signals', evidence: 'App.tsx:applyShellChrome signalNavigationSelection' },

  // home
  { from: 'home', to: 'explore', reason: 'Category/mini-app catalog + tenant-filtered picks', evidence: 'src/screens/HomeScreen.tsx:catalogForTenant findMiniApp' },
  { from: 'home', to: 'navigation', reason: 'Open/pin triggers dock/nav actions', evidence: 'src/screens/HomeScreen.tsx:onOpenMiniApp onPin' },
  { from: 'home', to: 'tracking', reason: 'Scroll depth + surface viewed + preference changed', evidence: 'src/screens/HomeScreen.tsx:onScrollDepth onSurfaceViewed' },
  { from: 'home', to: 'tenant', reason: 'orders suggestions by viewerProfile + tenant', evidence: 'src/home/homeModel.ts:orderHomeCategorySuggestions' },
  { from: 'home', to: 'designSystem', reason: 'HomeCollection palette/motion, GlassTabBar excluded', evidence: 'src/components/HomeCollection.tsx:palette' },
  { from: 'home', to: 'storage', reason: 'home prefs persisted via hostStorage', evidence: 'src/native/hostStorage.ts:saveHomePreferences' },

  // navigation
  { from: 'navigation', to: 'explore', reason: 'Dock selection validated against catalog', evidence: 'src/navigation/navigationBroker.ts:openDockMiniApp findMiniApp' },
  { from: 'navigation', to: 'container', reason: 'Cross-app link source validation', evidence: 'src/navigation/navigationBroker.ts:openCrossMiniApp' },
  { from: 'navigation', to: 'tracking', reason: 'Route viewed + nav denied', evidence: 'src/screens/MiniAppScreen.tsx:onTrackEvent' },
  { from: 'navigation', to: 'haptics', reason: 'Tab selection haptics', evidence: 'src/components/GlassTabBar.tsx:signalNavigationSelection' },
  { from: 'navigation', to: 'storage', reason: 'Dock selection persisted', evidence: 'src/native/hostStorage.ts:saveDockSelection' },

  // explore
  { from: 'explore', to: 'tenant', reason: 'Tenant-filtered featured set', evidence: 'src/miniapps/catalogTenant.ts:catalogForTenant' },
  { from: 'explore', to: 'navigation', reason: 'Explore open triggers navigation', evidence: 'src/components/ExploreSheet.tsx:onOpenMiniApp' },

  // tenant
  { from: 'tenant', to: 'storage', reason: 'Tenant persisted', evidence: 'src/config/tenantStorage.ts:saveStoredTenant' },
  { from: 'tenant', to: 'deviceAccess', reason: 'Location-first resolve (host-only weatherLocation)', evidence: 'src/hooks/useTenant.ts:requestDeviceAccess weatherLocation' },
  { from: 'tenant', to: 'designSystem', reason: 'Palette overrides per tenant profile', evidence: 'src/config/tenants.ts:paletteOverrides' },

  // container
  { from: 'container', to: 'pipeline', reason: 'Only renders after verifyPackage before first paint', evidence: 'src/miniapps/container/MiniAppContainer.tsx:verifyPackage' },
  { from: 'container', to: 'storage', reason: 'domStorageEnabled=false incognito pool safety', evidence: 'src/miniapps/container/containerConfig.ts:domStorageEnabled false' },
  { from: 'container', to: 'tracking', reason: 'Trace markers for container timing', evidence: 'src/miniapps/container/MiniAppContainer.tsx:budgets TRACE_MARKERS' },
  { from: 'container', to: 'haptics', reason: 'Reduced motion inside container', evidence: 'src/miniapps/container/MiniAppContainer.tsx:useReducedMotion' },
  { from: 'container', to: 'bridge', reason: 'Bridge injected via native reply channel, not RN JS', evidence: 'src/bridge/handler.ts:handleBridgeRequest' },

  // pipeline
  { from: 'pipeline', to: 'container', reason: 'Validator/signer shared with container B5', evidence: 'src/miniapps/pipeline/review.ts:validateManifest verifyPackage' },

  // bridge
  { from: 'bridge', to: 'container', reason: 'Session identity derived from WebView binding', evidence: 'src/bridge/handler.ts:BridgeSession' },
  { from: 'bridge', to: 'storage', reason: 'storage.kv is per-(tenant,appId,user) scoped', evidence: 'src/bridge/handlers/storageKv.ts' },
  { from: 'bridge', to: 'tracking', reason: 'Every handler emits audit before reply', evidence: 'src/bridge/audit.ts' },
  { from: 'bridge', to: 'notifications', reason: 'notify.subscribe handler', evidence: 'src/bridge/handlers/notifySubscribe.ts' },
  { from: 'bridge', to: 'deviceAccess', reason: 'location.current derived, scanner host UI', evidence: 'src/bridge/handlers/locationCurrent.ts scanner.ts' },

  // tracking
  { from: 'tracking', to: 'storage', reason: 'Durable journal 8 MB on disk', evidence: 'src/tracking/trackingService.ts:retentionMs durableJournal' },
  { from: 'tracking', to: 'container', reason: 'mini_app_opened / route_viewed emitted by container nav', evidence: 'src/tracking/types.ts' },

  // notifications
  { from: 'notifications', to: 'navigation', reason: 'Tap notification activates target mini-app entrypoint', evidence: 'src/notification/notificationService.ts:onActivated target.mini_app_id' },
  { from: 'notifications', to: 'tracking', reason: 'notification_opened / permission status', evidence: 'src/notification/notificationService.ts:tracking' },
  { from: 'notifications', to: 'storage', reason: 'Inbox persisted, seen ids', evidence: 'src/notification/notificationService.ts' },
  { from: 'notifications', to: 'tenant', reason: 'Per-tenant featured may affect notification targets', evidence: 'App.tsx:tenantCatalog' },

  // cards
  { from: 'cards', to: 'container', reason: 'Card mini-app uses container CSP + signing', evidence: 'src/cards/model.ts' },
  { from: 'cards', to: 'tracking', reason: 'Card tracking events (budget view)', evidence: 'src/cards/model.test.ts' },
  { from: 'cards', to: 'explore', reason: 'Card appears in catalogTenant featured', evidence: 'src/miniapps/catalog.ts:card' },

  // splitBill
  { from: 'splitBill', to: 'container', reason: 'Split Bill mini-app uses container CSP + signing', evidence: 'src/splitBill/model.ts' },
  { from: 'splitBill', to: 'tracking', reason: 'Split Bill tracking events (bill_created/settled)', evidence: 'src/splitBill/model.test.ts' },
  { from: 'splitBill', to: 'explore', reason: 'Split Bill appears in catalogTenant featured', evidence: 'src/miniapps/catalog.ts:split-bill' },
  { from: 'splitBill', to: 'storage', reason: 'Bill draft persisted via storage.kv', evidence: 'src/splitBill/storage.ts' },
  { from: 'splitBill', to: 'designSystem', reason: 'SplitBillBody uses palette tokens', evidence: 'src/components/SplitBillBody.tsx:palette' },
  { from: 'splitBill', to: 'bridge', reason: 'VietQR paste/scan via net.request + scanner.scan', evidence: 'src/splitBill/vietqr.ts' },

  // design system
  { from: 'designSystem', to: 'haptics', reason: 'Tokens include motion → reduceMotion controls surfaces', evidence: 'src/config/motion.ts:reduceMotion' },

  // haptics
  { from: 'haptics', to: 'deviceAccess', reason: 'Haptics via nativeShell, not WebView', evidence: 'src/native/nativeShell.ts:signalNavigationSelection' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function readCapabilities() {
  if (!existsSync(CAP_YAML)) return { caps: [], neverExpose: [] };
  const raw = readFileSync(CAP_YAML, 'utf8');
  // Minimal yaml parse: extract names + never_expose whats
  const caps = [];
  const capBlock = raw.split('capabilities:')[1]?.split('never_expose:')[0] ?? '';
  const capNames = [...capBlock.matchAll(/-\s*name:\s*(\S+)/g)].map(m => m[1]);
  const capRisk = [...capBlock.matchAll(/risk:\s*(\S+)/g)].map(m => m[1]);
  const capConsent = [...capBlock.matchAll(/consent:\s*(\S+)/g)].map(m => m[1]);
  const capBroker = [...capBlock.matchAll(/broker_ui:\s*(\S+)/g)].map(m => m[1]);
  capNames.forEach((name, i) => caps.push({ name, risk: capRisk[i], consent: capConsent[i], brokerUi: capBroker[i] }));
  const neverExpose = [...raw.matchAll(/-\s*what:\s*(.+)/g)].map(m => m[1].trim());
  return { caps, neverExpose };
}

function scanImports() {
  // Grep-like scan for 'from ' imports to augment edge evidence.
  // Returns map feature → Set(imported feature)
  const map = new Map();
  const srcRoot = join(APP_ROOT, 'src');
  if (!existsSync(srcRoot)) return map;
  const files = walk(srcRoot, f => f.endsWith('.ts') || f.endsWith('.tsx'));
  const fileToFeature = buildFileToFeature();
  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    const imports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    const rel = relative(APP_ROOT, f).replace(/\\/g, '/');
    const fromFeat = fileToFeature.get(rel) ?? fileToFeature.get(rel.replace(/^src\//, '')) ?? guessFeatureForFile(rel);
    if (!fromFeat) continue;
    for (const imp of imports) {
      const resolved = resolveImportToRel(f, imp);
      if (!resolved) continue;
      const toFeat = guessFeatureForFile(resolved);
      if (toFeat && toFeat !== fromFeat) {
        if (!map.has(fromFeat)) map.set(fromFeat, new Set());
        map.get(fromFeat).add(toFeat);
      }
    }
  }
  return map;
}

function walk(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function buildFileToFeature() {
  const m = new Map();
  for (const feat of FEATURES) {
    for (const comp of feat.components) {
      // comp may include App.tsx at root vs src/...
      const rel = comp.includes('/') ? comp : `src/${comp}`;
      m.set(rel, feat.id);
      m.set(comp, feat.id);
    }
  }
  return m;
}

function guessFeatureForFile(relPath) {
  const p = relPath.replace(/^app\//, '').replace(/^\//, '');
  const checks = [
    ['App.tsx', 'app'],
    ['src/screens/HomeScreen', 'home'],
    ['src/home/', 'home'],
    ['src/components/HomeCollection', 'home'],
    ['src/components/CardCatalog', 'cards'],
    ['src/navigation/', 'navigation'],
    ['src/components/GlassTabBar', 'navigation'],
    ['src/screens/MiniAppScreen', 'navigation'],
    ['src/components/ExploreSheet', 'explore'],
    ['src/components/MiniAppPickerModal', 'explore'],
    ['src/components/HomeCollectionPickerModal', 'explore'],
    ['src/miniapps/catalog', 'explore'],
    ['src/config/tenants', 'tenant'],
    ['src/config/tenantStorage', 'tenant'],
    ['src/hooks/useTenant', 'tenant'],
    ['src/components/TenantPickerSheet', 'tenant'],
    ['src/miniapps/container/', 'container'],
    ['src/miniapps/manifest/', 'container'],
    ['src/miniapps/pipeline/', 'pipeline'],
    ['src/bridge/', 'bridge'],
    ['src/tracking/', 'tracking'],
    ['src/components/TrackedScrollView', 'tracking'],
    ['src/notification/', 'notifications'],
    ['src/components/NotificationSheet', 'notifications'],
    ['src/components/ForegroundNotification', 'notifications'],
    ['src/native/notification', 'notifications'],
    ['src/native/deviceAccess', 'deviceAccess'],
    ['src/native/hostStorage', 'storage'],
    ['src/cards/', 'cards'],
    ['src/splitBill/', 'splitBill'],
    ['src/components/SplitBillBody', 'splitBill'],
    ['src/ui/', 'designSystem'],
    ['src/config/palette', 'designSystem'],
    ['src/config/layout', 'designSystem'],
    ['src/config/motion', 'designSystem'],
    ['src/native/nativeShell', 'haptics'],
    ['src/native/haptics', 'haptics'],
  ];
  for (const [prefix, feat] of checks) {
    if (p.includes(prefix)) return feat;
  }
  return null;
}

function resolveImportToRel(fromFile, imp) {
  if (!imp.startsWith('.')) return null;
  const base = dirname(fromFile);
  // try .ts/.tsx blindly
  const candidates = [imp + '.ts', imp + '.tsx', join(imp, 'index.ts'), imp];
  for (const c of candidates) {
    const full = join(base, c);
    if (existsSync(full)) return relative(APP_ROOT, full).replace(/\\/g, '/');
    // try without extension as folder
    const asIs = join(base, imp);
    if (existsSync(asIs) && statSync(asIs).isFile()) return relative(APP_ROOT, asIs).replace(/\\/g, '/');
  }
  // best-effort: map prefix
  const joined = join(base, imp).replace(/\\/g, '/');
  return relative(APP_ROOT, joined).replace(/\\/g, '/');
}

// ── Build outputs ─────────────────────────────────────────────────────────

function buildJson() {
  const { caps, neverExpose } = readCapabilities();
  const autoMap = scanImports();
  // Merge auto-detected edges not already in EDGES
  const existing = new Set(EDGES.map(e => `${e.from}->${e.to}`));
  const autoEdges = [];
  for (const [from, tos] of autoMap.entries()) {
    for (const to of tos) {
      const key = `${from}->${to}`;
      if (!existing.has(key)) {
        autoEdges.push({ from, to, reason: 'import scan', evidence: `auto: ${from} imports ${to}` });
        existing.add(key);
      }
    }
  }
  const allEdges = [...EDGES, ...autoEdges];

  const featureComponents = Object.fromEntries(FEATURES.map(f => [f.id, f.components]));
  const featurePermissions = Object.fromEntries(FEATURES.map(f => [f.id, f.permissions]));

  const json = {
    generatedAt: new Date().toISOString(),
    sources: {
      capabilitiesYaml: 'policy/capabilities.yaml',
      registry: 'src/bridge/registry.ts',
      deviceAccess: 'src/native/deviceAccess.ts',
      catalog: 'src/miniapps/catalog.ts (6 mini-apps)',
    },
    features: FEATURES.map(f => ({
      id: f.id,
      label: f.label,
      layer: f.layer,
      description: f.description,
      globs: f.globs,
      components: f.components,
      permissions: f.permissions,
    })),
    edges: allEdges,
    featureComponents,
    featurePermissions,
    capabilityRegistry: caps.map(c => c.name),
    capabilities: caps,
    neverExpose,
    warnings: buildWarnings(),
  };
  return json;
}

function buildWarnings() {
  const warnings = [];
  // Check R1: registry vs yaml count
  try {
    const reg = readFileSync(REGISTRY_TS, 'utf8');
    const regNames = [...reg.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
    const { caps } = readCapabilities();
    if (regNames.length !== caps.length) {
      warnings.push(`R1: registry has ${regNames.length} entries but capabilities.yaml has ${caps.length}`);
    }
  } catch {}
  // Check palette glass not in miniApp palette (designSystem permission hygiene)
  warnings.push('scope: this graph covers only feature→feature, feature→components, feature→permissions');
  return warnings;
}

function buildMermaidFeatureFeature(edges) {
  const byFrom = new Map();
  for (const e of edges) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, []);
    byFrom.get(e.from).push(e);
  }
  let s = 'flowchart LR\n';
  // group by layer for styling
  const layerOrder = ['host', 'container', 'bridge', 'native', 'governance', 'domain'];
  s += '  %% features grouped by layer — edit FEATURES[].layer to regroup\n';
  for (const f of FEATURES) {
    s += `  ${f.id}["${f.label}"]\n`;
  }
  s += '\n';
  for (const e of edges) {
    const safeReason = e.reason.replace(/"/g, "'").slice(0, 48);
    s += `  ${e.from} --> ${e.to}\n`;
  }
  s += '\n';
  // layer styles
  s += '  classDef host fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0\n';
  s += '  classDef container fill:#14532d,stroke:#4ade80,color:#ecfdf5\n';
  s += '  classDef bridge fill:#7c2d12,stroke:#fb923c,color:#fff7ed\n';
  s += '  classDef native fill:#0f172a,stroke:#38bdf8,color:#e2e8f0\n';
  s += '  classDef governance fill:#422006,stroke:#facc15,color:#fefce8\n';
  s += '  classDef domain fill:#4a044e,stroke:#e879f9,color:#fdf4ff\n';
  for (const f of FEATURES) {
    s += `  class ${f.id} ${f.layer}\n`;
  }
  return s;
}

function buildMermaidFeatureComponents() {
  let s = 'flowchart TB\n';
  for (const f of FEATURES) {
    s += `  subgraph ${f.id}["${f.label} — ${f.layer}"]\n`;
    for (const c of f.components.slice(0, 8)) {
      const safe = c.replace(/"/g, '');
      const nodeId = `${f.id}_${c.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24)}`;
      s += `    ${nodeId}["${safe}"]\n`;
    }
    if (f.components.length > 8) s += `    ${f.id}_more["… +${f.components.length - 8} more"]\n`;
    s += '  end\n';
  }
  return s;
}

function buildMermaidFeaturePermissions() {
  let s = 'flowchart LR\n';
  s += '  subgraph Perms["Permissions"]\n';
  s += '    caps["Capabilities<br/>net.request storage.kv scanner.scan<br/>location.current crypto.sign notify.subscribe"]\n';
  s += '    dev["DeviceAccess<br/>network biometric weatherLocation voiceCommand<br/>host-only"]\n';
  s += '    os["OS Push<br/>APNs/FCM"]\n';
  s += '    never["never_expose<br/>dynamic code, paths, generic invoke…"]\n';
  s += '  end\n';
  for (const f of FEATURES) {
    if (!f.permissions.length) continue;
    for (const p of f.permissions) {
      const name = p.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const node = `${f.id}_${name}`;
      s += `  ${f.id}["${f.label}"] --> ${node}["${p.name}"]\n`;
      if (p.kind === 'capability') s += `  ${node} -.-> caps\n`;
      else if (p.kind === 'deviceAccess') s += `  ${node} -.-> dev\n`;
      else if (p.kind === 'os') s += `  ${node} -.-> os\n`;
    }
  }
  return s;
}

function buildMarkdown(json) {
  const { features, edges, capabilityRegistry, capabilities, neverExpose, generatedAt } = json;
  const featById = Object.fromEntries(features.map(f => [f.id, f]));

  const edgeRows = edges.map(e => `| \`${e.from}\` | \`${e.to}\` | ${e.reason} | \`${e.evidence}\` |`).join('\n');
  const componentRows = features
    .map(f => `| \`${f.id}\` | ${f.label} | ${f.components.map(c => `\`${c}\``).join('<br/>')} |`)
    .join('\n');

  const permRows = features
    .map(f => {
      if (!f.permissions.length) return `| \`${f.id}\` | ${f.label} | — | — | — | — |`;
      return f.permissions
        .map(p => {
          const cap = p.kind === 'capability' ? capabilities.find(c => c.name === p.name) : null;
          const consent = p.consent ?? cap?.consent ?? '—';
          const broker = p.brokerUi ?? cap?.brokerUi ?? '—';
          const tier = p.minTier ?? cap?.minTier ?? '—';
          const via = p.via ?? p.kind;
          return `| \`${f.id}\` | ${f.label} | \`${p.name}\` (${p.kind}) | \`${consent}\` | \`${broker}\` | \`${tier}\` \`${via}\` |`;
        })
        .join('\n');
    })
    .join('\n');

  return `# Feature Graph — dependency trees (3 scopes)

> Generated ${generatedAt} · sources: policy/capabilities.yaml · src/bridge/registry.ts · import scan
> Scope: ONLY feature→feature, feature→components, feature→permissions. Nothing else belongs here.
> Refresh: \`npm run feature:graph\` after every feature/component/permission change.

Render mermaid with GitHub/VS Code or open \`feature-graph.html\`.

---

## §1 Feature → Feature

What calls what. Edges are directed; reason + evidence are load-bearing.

\`\`\`mermaid
${buildMermaidFeatureFeature(edges)}
\`\`\`

| From | To | Reason | Evidence |
|------|----|--------|----------|
${edgeRows}

All ${edges.length} edges include ${EDGES.length} hand-maintained + ${edges.length - EDGES.length} auto-detected via import scan.

---

## §2 Feature → Components

What renders or owns what — screens, components, hooks, services, native modules, scripts.

\`\`\`mermaid
${buildMermaidFeatureComponents()}
\`\`\`

| Feature | Label | Components |
|---------|-------|------------|
${componentRows}

Total features: ${features.length}. Narrow to the files above when reviewing.

---

## §3 Feature → Permissions

What authority a feature needs — bridge capabilities, OS permission, or host-only deviceAccess. A feature with no row needs no permission.

Capabilities registry (\`policy/capabilities.yaml:${capabilityRegistry.length}\`  \`src/bridge/registry.ts:${capabilityRegistry.length}\` — R1): \`${capabilityRegistry.join('`, `')}\`

\`\`\`mermaid
${buildMermaidFeaturePermissions()}
\`\`\`

| Feature | Label | Permission (kind) | Consent | Broker UI | Min tier / via |
|---------|-------|-------------------|---------|-----------|----------------|
${permRows}

### never_expose (not permissions — refusals)

These never become grantable at a higher tier, flag, or deadline:

${neverExpose.map(n => `- ${n}`).join('\n')}

### Mini-app instances (catalog)

\`src/miniapps/catalog.ts:6\` — \`badminton\` (Cầu lông), \`weather\`, \`transit\`, \`notes\`, \`market\`, \`card\`. Each carries \`publicEntrypoints\` / \`crossAppLinks\` / \`trackingEvents.allowedDataKeys\` — see §1 edges via \`catalogTenant\` and §2 via \`explore\` / \`container\`.

---

## How to maintain

1. Edit feature code.
2. Run \`npm run feature:graph\` (overwrites json/md/html).
3. Review the diff in this file — added/removed edges are the impact.
4. Commit code + \`feature-graph.*\` together.

If auto scan misses an edge, add it to \`EDGES\` in \`scripts/feature-graph.mjs\`. If it falsely reports one, add to overrides in \`feature-graph.config.json\` (not yet needed).
`;
}

function buildHtml(json) {
  const md = buildMarkdown(json);
  // Reuse architecture-visual.html shell but focused on 3 scopes.
  const featureFeatureMermaid = buildMermaidFeatureFeature(json.edges);
  const featureComponentsMermaid = buildMermaidFeatureComponents();
  const featurePermissionsMermaid = buildMermaidFeaturePermissions();

  const rowsFF = json.edges.map(e => `<tr><td><code>${e.from}</code></td><td><code>${e.to}</code></td><td>${e.reason}</td><td><code>${e.evidence}</code></td></tr>`).join('');
  const rowsFC = json.features.map(f => `<tr><td><code>${f.id}</code></td><td>${f.label}</td><td style="text-align:left">${f.components.map(c => `<code>${c}</code>`).join(' ')} </td></tr>`).join('');
  const rowsFP = json.features.flatMap(f => f.permissions.length
    ? f.permissions.map(p => `<tr><td><code>${f.id}</code></td><td>${f.label}</td><td><code>${p.name}</code> <span class="pill">${p.kind}</span></td><td><code>${p.consent ?? '—'}</code></td><td><code>${p.brokerUi ?? p.via ?? '—'}</code></td></tr>`)
    : []).join('') || `<tr><td colspan="5">No permission-mapped features — add to registry to track.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Feature Graph — feature→feature, feature→components, feature→permissions</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  :root{--bg:#0b1220;--card:#111c33;--ink:#e6edf8;--muted:#8aa0c2;--line:#1f2f52;--accent:#60a5fa}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;background:var(--bg);color:var(--ink)}
  header{position:sticky;top:0;z-index:10;background:rgba(11,18,32,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:14px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  header h1{margin:0;font-size:16px;letter-spacing:-.02em}
  header p{margin:0;color:var(--muted);max-width:720px}
  nav{display:flex;gap:8px;flex-wrap:wrap}
  nav a{color:var(--ink);text-decoration:none;border:1px solid var(--line);padding:6px 10px;border-radius:999px;font-size:12px}
  nav a:hover{border-color:var(--accent)}
  main{max-width:1200px;margin:0 auto;padding:22px}
  section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin:16px 0}
  h2{margin:0 0 8px;font-size:18px;letter-spacing:-.02em}
  h3{margin:18px 0 8px;font-size:14px;color:#cfe0ff}
  p{color:var(--muted);margin:6px 0}
  .mermaid{background:#0e1a33;border:1px solid #1e335f;border-radius:14px;padding:12px;overflow:auto}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{border:1px solid #1e335f;padding:6px 8px;text-align:left;font-size:12px;vertical-align:top}
  th{background:#0e1a33;color:#cfe0ff}
  code{font:12px ui-monospace,Menlo,Consolas,monospace;background:#0e1a33;border:1px solid #1e335f;padding:1px 6px;border-radius:6px;color:#cfe0ff}
  .pill{display:inline-block;border:1px solid #1e335f;border-radius:999px;padding:2px 8px;font-size:11px;color:var(--muted)}
  .controls{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
  .controls input{flex:1;min-width:180px;background:#0e1a33;border:1px solid #1e335f;border-radius:10px;padding:8px 10px;color:var(--ink)}
  footer{max-width:1200px;margin:0 auto;padding:10px 22px 30px;color:var(--muted)}
  .warn{color:#facc15}
</style>
<script>mermaid.initialize({startOnLoad:true,theme:'dark',securityLevel:'loose',flowchart:{htmlLabels:true}})</script>
</head>
<body>
<header>
  <h1>Feature Graph</h1>
  <p>feature→feature · feature→components · feature→permissions — auto-generated after every change. Generated ${json.generatedAt}.</p>
  <nav><a href="#ff">Feature→Feature</a><a href="#fc">Feature→Components</a><a href="#fp">Feature→Permissions</a><a href="#raw">JSON</a></nav>
</header>
<main>
  <section id="ff">
    <h2>§1 Feature → Feature</h2>
    <p>What calls what. Direct import or runtime activation; evidence is a file:line hint.</p>
    <div class="mermaid">${featureFeatureMermaid}</div>
    <div class="controls"><input id="ffFilter" placeholder="Filter edges… (e.g. home, bridge)" oninput="filterTable('ffTable', this.value)"/></div>
    <table id="ffTable"><thead><tr><th>From</th><th>To</th><th>Reason</th><th>Evidence</th></tr></thead><tbody>${rowsFF}</tbody></table>
  </section>
  <section id="fc">
    <h2>§2 Feature → Components</h2>
    <p>What renders or owns what. When you touch a file, you touch its feature.</p>
    <div class="mermaid">${featureComponentsMermaid}</div>
    <div class="controls"><input id="fcFilter" placeholder="Filter components… (e.g. HomeScreen, tenant)" oninput="filterTable('fcTable', this.value)"/></div>
    <table id="fcTable"><thead><tr><th>Feature</th><th>Label</th><th>Components</th></tr></thead><tbody>${rowsFC}</tbody></table>
  </section>
  <section id="fp">
    <h2>§3 Feature → Permissions</h2>
    <p>What authority a feature needs. Bridge capabilities show consent + broker + tier; host-only shows via. Empty = no permission.</p>
    <div class="mermaid">${featurePermissionsMermaid}</div>
    <div class="controls"><input id="fpFilter" placeholder="Filter permissions… (e.g. storage.kv, weatherLocation)" oninput="filterTable('fpTable', this.value)"/></div>
    <table id="fpTable"><thead><tr><th>Feature</th><th>Label</th><th>Permission</th><th>Consent</th><th>Broker/Via</th></tr></thead><tbody>${rowsFP}</tbody></table>
    <h3>never_expose</h3>
    <p>${json.neverExpose.map(n => `<span class="pill">${n}</span>`).join(' ')}</p>
    <h3>Capability registry</h3>
    <p><code>${json.capabilityRegistry.join('</code> <code>')}</code></p>
  </section>
  <section id="raw">
    <h2>Raw</h2>
    <p>Machine-readable: <a href="./feature-graph.json"><code>feature-graph.json</code></a> · Markdown: <a href="./feature-graph.md"><code>feature-graph.md</code></a>. Commit all three with the code.</p>
    <p class="warn">Refresh: <code>npm run feature:graph</code> after every feature/component/permission change.</p>
  </section>
</main>
<footer>
  Scope is strictly the 3 relationships. For budgets/sequences/tenancy depth see <code>architecture-visual.*</code> and <code>CLAUDE.md</code>.
</footer>
<script>
function filterTable(id, q){
  q = q.toLowerCase();
  const tbody = document.querySelector('#'+id+' tbody');
  for(const tr of tbody.children){
    tr.style.display = tr.innerText.toLowerCase().includes(q) ? '' : 'none';
  }
}
</script>
</body>
</html>`;
}

function main() {
  const json = buildJson();
  const md = buildMarkdown(json);
  const html = buildHtml(json);
  writeFileSync(join(DOCS_DIR, 'feature-graph.json'), JSON.stringify(json, null, 2) + '\n');
  writeFileSync(join(DOCS_DIR, 'feature-graph.md'), md);
  writeFileSync(join(DOCS_DIR, 'feature-graph.html'), html);
  console.log(`feature-graph: wrote ${json.features.length} features, ${json.edges.length} edges → docs/feature-graph.{json,md,html}`);
  if (json.warnings.length) for (const w of json.warnings) console.warn('warn:', w);
}

main();
