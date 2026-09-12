# Feature — Mini-App Container (WebView Factory + Isolation)

> One WebView per mini-app, one origin each, pooled generic. The container is the tenancy boundary — `mini-app-runtime:1` decides, `container-wiring:1` builds.

## Factory — `miniapps/container/MiniAppContainer.tsx:63` (ONE site, `C1`)

`MiniAppContainer({appId, manifestVersion, declaredRoutes, egressHosts, packageIndex})` is the **only** place that may call `new WebView` / `<WebView` (`conformance.sh:22` `C1` fails second site). No options bag — per-app variation lives in the signed manifest, not container config (second config = second tenancy model = gate).

- **Verify before first script `B5`**: `packageIndex.size===0` → host-owned fallback `Container:114` refusing to render; production verifies `signer.ts:63` `verifyPackage` (store+author) on the bytes actually being served, not a flag at install.
- **Origin**: `originFor` — `mini://appId` iOS (custom scheme handler) / `https://appId.miniapp.platform.local` Android (asset loader, plain HTTP disallowed). `host==appId` is the binding.
- **CSP header, never meta `B2`**: `csp.ts:25` `buildCspHeader({appId, egressHosts})` → `connect-src 'self' + https://egressHost` exact, `frame-src 'none'`, `isMetaCsp` asserts no `<meta http-equiv>` (author could loosen). Author may tighten only (intersect).
- **Navigation allowlist `B3`**: `navigationGuard.ts:30` `decideNavigation({url,isMainFrame}, {appId, declaredRoutes})` → allow only `isMainFrame && allowed scheme && host==appId && path in declaredRoutes (param :day match)` → else `cancel` (closes `tel:`, `sms:`, `intent:`, universal links in one default). Uses request-object overload on Android for main-frame/redirect/gesture. **Never** pass WebView URL to `Intent` parsing — `C6` (`assertNoPlatformUrlParsing` is the block, not a parse).
- **No RN scroll handler `C7`**: host chrome reads native scroll callback inside the component, not an RN `onScroll` on the WebView.
- **Splash**: native first-paint signal `MiniAppContainer:80` + 4s native timeout (JS callback would hang shell forever). `miniapp_tap→miniapp_splash_visible 50/100ms` `policy/budgets.md:80`.
- **Renderer death `B4`**: `onRenderProcessGone` attached to *every* instance including pooled+hidden (Android shared renderer — one unhandled pooled instance kills the host).
- **Pool safety `B1`**: `containerConfig.ts:12` `domStorage false`, `thirdPartyCookies false`, `allowFileAccess false`, `incognito true` — pooled WebView never held per-app state; `assertContainerConfigShape` asserts, not assumes; `warmPool.test.ts:1` storage off, `warmPool.ts:43` `WarmPool` generic blank page, size by `memoryClass` low 1/0 mid 1/1 high 2/1, LRU evict, `onMemoryPressure` drops to 0.

## Isolation checklist (runtime implementation of `mini-app-runtime:80` table)

`storage/cookies` off → no cross-tenant leak via pool | `incognito true` → generic pooled | `CSP header` → author cannot set policy | `no file access` → FS not reachable | `frame-src 'none'` → no subframe bridge | `navigation allowlist` → no foreign origin | `new window blocked` → no spoofed payment sheet | `debug off in release` → asserted at startup.

## Testing

- `navigationGuard.test.ts` (allow own/param, block foreign origin/scheme/undeclared/new window, Android origin)
- `csp.test.ts` (header from `egressHosts`, intersect not union, meta detection)
- `warmPool.test.ts` (storage off, memoryClass sizing, incognito, budget `MAX 3`, memory pressure eviction, `B4` contract)
- Adversarial: `<meta CSP>` loosen, foreign navigation, `intent://` with exported component, pooled renderer death (manual, invisible in normal test).

## Adding isolation

Changing any row in the table is a tenancy-model change — gate via `mobile-architecture`. A second container config is a second tenancy model. Container config is generic by design.
