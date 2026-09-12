# Feature — Tenancy (4 tenants on one binary, location-first)

> Mechanisms in native, tenant variation in signed remote config — never in the binary. One store binary serves `vn-hn`/`vn-hcm`/`vn-dn`/`vn-fallback`.

## Why per-tenant binary is wrong

Store review blocks a per-province binary in the week a palette or catalog must change. Tenant variation is policy (featured apps, copy, thresholds) → remote config. Native owns only the mechanism (WebView origin, scheme handler, permission sheet).

## Data — `config/tenants.ts:32`

```ts
TENANT_IDS = ['vn-hn','vn-hcm','vn-dn','vn-fallback']
TenantMeta { id, label, shortLabel, provinceName, centre: {lat, lon}, paletteOverrides: Partial<ShellPalette>, featuredAppIds: string[], description }
TENANTS: {
  'vn-hn': { label: 'Hà Nội', centre: 21.02/105.85, primary: '#3B5BDB', featured: [weather,transit,badminton,notes,market] },
  'vn-hcm': { label: 'TP. Hồ Chí Minh', centre: 10.82/106.62, primary: '#E8590C', featured: [badminton,market,weather,transit,notes] },
  'vn-dn': { label: 'Đà Nẵng', centre: 16.05/108.20, primary: '#0B7285', featured: [weather,transit,market,notes] },
  'vn-fallback': { label: 'Toàn quốc', centre: 16.0/108.0, featured: [weather,transit,notes,market,badminton] }
}
DEFAULT_TENANT = 'vn-fallback'
TenantProfile { tenantId, version, issuedAt, expiresAt, catalog: {featuredAppIds}, paletteOverrides, trackingTopicPrefix }
```

`featuredAppIds` is the catalog order — `catalogTenant.ts` `catalogForTenant(tenantId)` filters `miniAppCatalog.ts:44` by this order, preserving it.

## Resolve — `tenants.ts:131` `resolveTenantFromCoords`

```ts
haversineKm(a,b) → nearest centre among ['vn-hn','vn-hcm','vn-dn'] → if bestKm > 350 → vn-fallback
```

Pure, no I/O, no permission — easy to test (`config/__tests__/tenants.test.ts:1` 7 cases: exact centres, null, far Vientiane → fallback, Hue → ĐN). `localTenantProfile:158` mints a 24h TTL profile locally (MVP); prod will fetch a signed profile — same shape, additive.

## Persist — `config/tenantStorage.ts:29`

`loadStoredTenant / saveStoredTenant` via `NativeModules.HostStorage.loadTenant/saveTenant` (host-secure where available) with in-memory `fallbackTenant` for JS-only/tests, 1500ms `withTimeout` (`utils/withTimeout.ts:8`) so native never hangs the host. Never store tenant in WebView storage — pooled WebViews must never carry residue `B1` (`containerConfig.ts:12` `incognito=true`).

## Hook — `hooks/useTenant.ts:12`

`useTenant()`:

- `loadStoredTenant` (2000ms timeout) → if stored, `setTenantId(stored)` and done.
- Else `resolveFromLocation` → `requestDeviceAccess('weatherLocation')` `native/deviceAccess.ts:52` (host-only, 4000ms timeout, 4s native deadline `DeviceAccessModule.m:72` iOS / `DeviceAccessModule.kt:91` Android) → `resolveTenantFromCoords` → `saveStoredTenant` (1500ms) → `setTenantId`.
- **Hard deadline 4500ms** `useTenant.ts:39` — even if bridge is dead, `setTenantId(prev ?? DEFAULT_TENANT)` and `setLoading(false)`. `isExiting`-style functional updates prevent overwriting a manual pick.
- `switchTenant(next)` `61` saves and clears loading — tapping `TenantPickerSheet` while loading wins (functional `prev ?? next`).

`profile = tenantId ? localTenantProfile(tenantId) : null` → `App.tsx:136` `createPalette(profile.paletteOverrides)` and `tenantCatalog`.

## App wiring — `App.tsx:136`

```ts
const { tenantId, profile, loading: tenantLoading, switchTenant } = useTenant()
const palette = profile ? createPalette(profile.paletteOverrides) : appConfig.palette
const tenantCatalog = useMemo(() => tenantId ? catalogForTenant(tenantId) : miniAppCatalog, [tenantId])
// validDockSelection re-validated on tenant change, GlassTabBar + ExploreSheet + Home filtering use tenantCatalog
if (tenantLoading || !tenantId) → loading + "Chọn thủ công" button → TenantPickerSheet (also rendered while loading)
```

Tracking `trackingService.ts:246` topic prefix is `tenantId`; storage `bridge/handlers/storageKv.ts:11` namespaces by `tenantId:userId:appId`.

## Adding a tenant (63 provinces)

Add one entry to `TENANTS` — no code change. Migration is the signed profile version: ship host accepting old+new catalog, observe, then serve the new `featuredAppIds`. Flags must fail closed.

## Testing

- `tenants.test.ts` haversine + fallback.
- `useTenant` manually: first launch with location denied → fallback, with Hanoi coords → `vn-hn`, kill and relaunch → stored, switch while loading → manual wins, native timeout → fallback in <4.5s.
- No `localStorage`/`IndexedDB` inside WebView — `B1` asserts `domStorageEnabled false` at construction (`warmPool.test.ts:1`).
