# Feature — Capability Bridge (The Only Door)

> Mini-app JS never calls `NativeModules` directly. `native-capability:1` shapes the contract, `bridge-wiring:1` builds the handler in the 10-step order — every check in native, because JS checks are bypassable.

## Request — `bridge/types.ts:30`

`BridgeRequest {id, capability, operation, version, args}` — **no** `appId/origin/user` (C3 `conformance.sh:37`). `BridgeSession` is derived from WebView binding: `appId/tenantId/userId(per mini-app pseudonymous, not vendor ID)/origin/isMainFrame` `types.ts:34`. `BridgeErrorCode` closed enum `types.ts:9` — `CONSENT_DENIED` vs `CONSENT_DENIED_PERMANENTLY`, `OS_DENIED` vs `OS_DENIED_PERMANENTLY` are never collapsed (authors need the branch).

## 10-step handler — `bridge/handler.ts:47` (reorder breaks a specific thing, not an abstract one)

| Step | Call | Mismatch → drop/SEC_* |
|---|---|---|
| 1-2 | `session.isMainFrame` assert `handler.ts:58` | not main frame → audit fail, no error oracle (probing maps surface) |
| 3 | `G1 gate1Declaration` `gates.ts:15` `manifestCapabilities.includes(cap)` + `findCapability` `R1` | `CAPABILITY_NOT_DECLARED` |
| 4 | arg validate `handler.ts:98` `typeof args==object`, handler schema, reject unknown fields | `INVALID_ARGUMENT` |
| 5 | `G2 gate2Consent` `gates.ts:32` `consentRecord` scope+expiry, `persistent` needs reviewer grant | `CONSENT_REQUIRED/DENIED` (host-native sheet, gesture-bound) |
| 6 | `G3 gate3OsPermission` `gates.ts:51` only *after* G2 (never spend host's one-shot permission for a mini-app the user didn't consent to) | `OS_DENIED` |
| 7 | `checkQuota` `gates.ts:64` token bucket per mini-app per cap + global | `RATE_LIMITED` + `retryAfterMs` |
| 8 | `handlers.get(cap)` `register.ts:1` enumerated explicitly (never generic `invoke(name)`) + `withTimeout BRIDGE_ROUND_TRIP_P95_MS*4` on bg queue | `NOT_FOUND`/`TIMEOUT` → template `classifyError:254` never leaks platform strings |
| 9 | `appendAudit` `audit.ts:41` *before* reply `B7` hash-chain `prevHash` + `argsDigest` not args | — |
| 10 | exactly one terminal reply `B6` frame-scoped, `classifyError` maps to closed enum `R3`, cancellation → `UNCERTAIN` not success | — |

Streams coalesce+drop, never queue; large payloads return expiring handle.

## Boundary selection — `bridge-wiring:41` (from `native-boundaries.md:7`)

Stateless service → **TurboModule** (Codegen, lazy init) | Native view/sheet → **Fabric** (permission/biometric/scanner sheets) | Compute/binary → **C++ TurboModule** | High-volume data → native with coarse results (pixels never cross for scanner). Host policy stays outside the module — the module adapts the platform, not decide it. Avoid `addJavascriptInterface` (every frame, no origin) and URL-scheme RPC (`myapp://call?json=` leaks in history/Referer).

## Capabilities — `policy/capabilities.yaml:78` = `bridge/registry.ts:24` (`R1`)

| Cap | risk/consent/broker | quota sustained/burst | notes |
|---|---|---|---|
| `net.request` medium/none/false | 60/10 | host `fetch` to exact `egressHosts`, no cookie/referrer/wildcard |
| `storage.kv` low/none/false | 120/20 | per `(tenant,user,appId)` |
| `scanner.scan` medium/once `host_scanner` | 10/2 | host scanner UI, no pixels |
| `location.current` high/once false (coarse) | 6/2 | coarse one-shot; precise is separate high-risk cap |
| `crypto.sign` high/once `biometric_prompt` | 10/3 | assertion over host challenge, never boolean |
| `notify.subscribe` low/while_using | 5/2 | host owns token, mini-app gets state |

`never_expose` `capabilities.yaml:84` is the wall: dynamic code, raw paths, reflective invoke, host creds, cross-app IDs, bulk data, clipboard without gesture, screen capture, arbitrary Intent, raw biometrics, key export, side-loading, raw sockets, debug caps.

## Versioning — additive only, handshake not host version

New optional fields only; new required = new operation; never change type/units/nullability; widening enum is breaking unless `default` branch was mandated day one (we do). Keep previous 2 versions shimmed, tested against recorded real traffic, never branch on `appId`. Per-app compat grant lives in `compat_grants` store record, capped, metric — if it grows, versioning has failed.

## Testing

- `bridge/__tests__/handler.test.ts:1` G1 undeclared, `B7` audit before reply, `B6` terminal reply even on timeout, KV per-tenant isolation, `net.request` host not in `egressHosts` → `INVALID_ARGUMENT`, quota `RATE_LIMITED`, `G2` `CONSENT_REQUIRED`, timeout → terminal not hang
- `conformance.sh:30` C2 (no consent check in SDK/JS), C3 (no identity from envelope), C4 (no paths), `audit.test` chain, `B8` token revoke fail-closed, `B9` seq downgrade

*One mini-app's burst/timers/message rate must not corrupt another instance — backpressure + cancel on terminate/logout/revoke (`mini-app-runtime:80`).*
