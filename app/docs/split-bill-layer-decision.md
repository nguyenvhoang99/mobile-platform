# Split Bill — layer decision

**Layer:** mini-app plane (`app/src/splitBill/*` + `app/src/components/SplitBillBody.tsx:1`, WebView origin `mini://split-bill` / `https://split-bill.miniapp.platform.local`, catalog `app/src/miniapps/catalog.ts:275`)

**Why this layer:** Third-party schedule + untrusted code + changes weekly; remotely updatable beats store review. Per `mobile-spine` invariants: mini-app is untrusted until signature+tier (`policy/capabilities.yaml:28` tier `self_serve`), bridge is the only door. No new OS permission; all capabilities (`storage.kv`, `scanner.scan`, `net.request`) already `self_serve`+`sandbox` via `policy/capabilities.yaml:78` / `src/bridge/registry.ts:24` (R1). Putting this in RN host would make first-party product depend on least-trusted tenancy boundary.

**Budget it must respect:** `policy/budgets.md:80` `miniapp_tap→miniapp_splash_visible 50/100ms` (native chrome), `miniapp_tap→miniapp_first_paint 350/800ms warm` (pool + cached package), `bridge_request→bridge_response 5ms p50 /16ms p95 one frame`, counter ratchet `+2%/release` (`policy/budgets.md:133`). Measured headroom: single bundled script, inline critical CSS, in-memory package index → one IPC per scheme request.

**What ships remotely vs in the binary:** Mechanism in binary: `src/miniapps/container/MiniAppContainer.tsx:63` (one factory C1), `src/bridge/*` handler pipeline 10 steps, native share sheet. Everything else ships remotely: SplitBill model/settlement/VietQR (`src/splitBill/model.ts:1` `vietqr.ts:1` `banks.ts:1`), host-provided strings `src/splitBill/i18n.ts:1`, trust grant and bank BIN allowlist via `egressHosts: ['vietqr.net']` + remote config. No literal budget/capability constants inlined (S2).

**Rollback story:** Mini-app revoked via `mini-app-governance` broadcast → runtime tears down (governance decides, runtime obeys) + server-side authority expiry on channel pointer `versionCode`; stale mini-app runs out of authority, not out of reach. Remote JS/kill-switch rollback minutes; native binary rollback would be store review — avoided.

**Skew tolerance:** N-2 shells live. Feature-detect `scanner.scan` broker vs paste/upload fallback; paste VietQR (wide view, higher priority) + upload decode always works offline. If `storage.kv` unavailable, in-memory fallback keeps bill usable for session, persisted on next launch.

**One-way doors:** Catalog addition with `capabilities` + `egressHosts` + `trackingEvents` is additive-only and gated (human gate). Once authors depend on `bill_settled`/`vietqr_parsed` events or VietQR `38:A000000727` payload shape, removal needs deprecation calendar (`policy/capabilities.yaml:248` compat_grants metric). `never_expose` boundary unchanged.
