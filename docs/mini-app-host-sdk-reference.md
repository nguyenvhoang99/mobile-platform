# Mini-App Host SDK Reference

**Purpose:** portable implementation brief for an SDK that lets a mini-app call host-provided features. This file summarizes the current Mobile Platform repository as inspected on 2026-09-27. It is an implementation reference, not proof that every behavior is live or production-enforced.

**Status vocabulary**

- **Registered contract** — declared in `policy/capabilities.yaml` and mirrored by the bridge registry.
- **PoC implementation** — a TypeScript handler/model exists, but it may return fixtures, use in-memory state, or lack the final native/container enforcement.
- **Host-only** — the host app has the feature, but mini-apps do not have a direct SDK method for it.
- **Planned/unenforced** — described as a target contract, but the current runtime does not prove that it is enforced end to end.

The repository is a React Native PoC vertical slice. Do not market this reference as external mini-app production readiness. Re-check the capability registry, schema, handlers, and conformance evidence before publishing an SDK release.

## 1. What the SDK exposes

The SDK should be a small typed wrapper around **one host bridge**. It must not expose React Native modules, native module names, device APIs, host credentials, or a second RPC channel.

The current registered capability set is listed below. `ai.extract_bill` is a product-specific first-party pilot, not part of the shared mini-app SDK surface; it is listed for visibility and requires a separate product/platform decision before another project standardizes it.

| Capability | Purpose | Minimum publisher tier | Consent / host UI | Current implementation status |
|---|---|---|---|---|
| `net.request` v1 | HTTPS request to an exact manifest-declared host | `sandbox` | None | Fail-closed `UNAVAILABLE`; no native egress adapter is wired |
| `storage.kv` v1 | Mini-app-private key/value data | `sandbox` | None | Host PoC in-memory map; session-scoped client quota; durability is not established |
| `scanner.scan` v1 | Scan a QR code or barcode and return decoded text | `self_serve` | Once; intended host scanner UI | Fail-closed `UNAVAILABLE`; no scanner UI adapter is wired |
| `location.current` v1 | One-shot current location, coarse by default | `partner_verified` | Once | Fail-closed `UNAVAILABLE`; no capability adapter satisfies current policy |
| `crypto.sign` v1 | Request a host-backed assertion over a challenge | `partner_verified` | Once; biometric prompt in registry | Fail-closed `UNAVAILABLE`; no hardware-backed signing adapter is wired |
| `notify.subscribe` v1 | Subscribe/unsubscribe/check notification subscription state | `self_serve` | While using | Fail-closed `UNAVAILABLE`; no backend subscription adapter is wired |
| `ai.extract_bill` v1 | Split-bill receipt image → VND bill draft | `first_party` | Once; intended host image picker | Product-shaped pilot; fail-closed `UNAVAILABLE`. Neither picker nor local inference is implemented |

Tier indicates who may request a capability, not automatic access. The manifest declaration, reviewer grant, user consent where required, quota, and runtime availability are separate checks. The host derives mini-app/user/origin identity from the bound runtime session; callers must never send identity fields.

## 2. Bridge contract

### Request and reply

The request envelope is intentionally small and contains no authority-bearing identity:

```ts
type BridgeRequest = {
  id: string;                    // unique per call
  capability: string;            // e.g. "storage.kv"
  operation: string;             // e.g. "get"
  version: number;               // capability contract version
  args: Record<string, unknown>;
};

type BridgeResult<T> =
  | { ok: true; data: T; error: null }
  | {
      ok: false;
      data: null;
      error: BridgeErrorCode | string; // SDK must tolerate unknown future codes
      message: string;
      retryAfterMs?: number;
    };
```

Do not add `appId`, publisher, tenant, user, origin, permission, consent, token, or tier fields to requests. Do not let SDK JavaScript make an authorization decision. Feature detection is by a host-provided, immutable capability handshake **when the runtime implements it**; the current repository describes `window.__MINIAPP_CAPS__`, but a functioning injection/enforcement path is not yet evidenced. Never infer availability from host version or operating system.

The target handler order is: derive session and validate main-frame/origin → declaration/review grant → strict argument validation → user consent → OS permission if required → per-app quota → execute off the UI thread → append audit record → return exactly one terminal reply. Transport must time out and drop late replies after frame teardown. Audit stores an argument digest, not raw argument values.

### Errors

The bridge's closed error vocabulary currently includes:

`SUCCESS`, `CAPABILITY_NOT_DECLARED`, `CAPABILITY_NOT_GRANTED`, `CONSENT_REQUIRED`, `CONSENT_DENIED`, `CONSENT_DENIED_PERMANENTLY`, `OS_DENIED`, `OS_DENIED_PERMANENTLY`, `RATE_LIMITED`, `INVALID_ARGUMENT`, `NOT_FOUND`, `TIMEOUT`, `REVOKED`, `UNCERTAIN`, `UNAVAILABLE`, and `INTERNAL`.

The SDK should map unknown codes to a generic failure, not throw while decoding. Keep temporary and permanent consent denial distinct, and temporary and permanent OS denial distinct. Respect `retryAfterMs`; do not automatically loop on consent, permissions, `TIMEOUT`, or `UNCERTAIN`. `UNCERTAIN` means the caller must reconcile using the relevant operation identity instead of assuming either success or failure. For pure image extraction, cancellation does not create a business mutation.

The registry and policy error lists were updated to include handler-level codes such as `CAPABILITY_NOT_GRANTED`, `INVALID_ARGUMENT`, and `UNAVAILABLE`. Continue checking the policy, typed registry, and actual handler outcomes together before freezing a generated SDK enum.

## 3. Capability operation reference

These argument and result shapes are inferred from the checked-in handlers. They are a starting point for SDK types and must be reconciled with the signed manifest/schema and the native boundary before release.

### `storage.kv` v1

`operation: "get" | "set" | "delete" | "keys"`; the handler currently reads `args.op`.

```ts
// get
{ op: "get", key: string }       // { value: string | null }
// set
{ op: "set", key: string, value: string } // { ok: true }
// delete
{ op: "delete", key: string }   // { ok: true }
// keys
{ op: "keys" }                  // { keys: string[] }
```

Keys are 1–128 characters and may not contain `:`. Values are strings, limited to 64 KiB encoded. The handler caps each namespace at 200 keys. Namespace identity is `(tenantId, appId, userId)`; apps must not be able to read another app's or tenant's data. Current handler storage is process-memory only, so SDK consumers must treat persistence across restart as **unverified** until a durable adapter is connected and tested.

### `net.request` v1

Arguments: `{ url: string, method?: "GET" | "POST" | "PUT" | "DELETE" }`; method defaults to `GET`. Hostname must exactly match one of the manifest's `egressHosts`; HTTPS is required. Wildcards, arbitrary hosts, cookies, credentials, referrer, and raw sockets are not part of the contract.

The intended response shape is `{ status: number, body?: string, bodyHandle?: string, truncated?: boolean, headers: Record<string,string> }`, but the current handler always returns `UNAVAILABLE` after validating URL and method. The PoC does not define a complete request/response DTO (for example, request body semantics and allowed response headers). Do not ship those fields as stable SDK API until the contract and native egress adapter are completed. Bodies are bounded; large body handles need owner, expiry, read, and release semantics before SDK exposure.

### `scanner.scan` v1

Arguments: `{ mode?: "barcode" | "qr" }` (defaults to `barcode`). Intended result: `{ value: string, format: string }`. Only decoded text crosses the bridge; camera frames and image bytes do not. The current handler returns `UNAVAILABLE`; no scanner sheet is connected.

### `location.current` v1

Intended call returns a one-shot coarse result such as `{ lat, lon, accuracyM, precision: "coarse", at }`. No continuous updates, background tracking, or bulk location history. Do not request `precision: "precise"` through v1: policy says precise access requires a distinct capability and review. The current handler accepts only omitted/`coarse` precision and returns `UNAVAILABLE`; it returns no fixture coordinates.

### `crypto.sign` v1

Expected argument is a host-minted challenge; the handler accepts `{ challenge: string }` with 8–1024 characters. Intended result is a hardware-backed signature/assertion bound to the mini-app and host-minted challenge, following host biometric UI. Never return biometric material, private keys, or a boolean “biometric passed” as authority. The current handler returns `UNAVAILABLE`; it no longer fabricates a mock signature.

### `notify.subscribe` v1

Arguments: `{ action?: "subscribe" | "unsubscribe" | "status" }` (defaults to `subscribe`). Intended result: `{ subscribed: boolean }`. The host owns push registration and tokens. Mini-apps receive subscription state only, not device tokens, provider payloads, or a general notification sender. The current handler returns `UNAVAILABLE`; no subscription state is fabricated.

### `ai.extract_bill` v1 — product-specific pilot (not a shared SDK method)

Arguments: `{ locale: "vi" | "en", idempotencyKey: string, hint?: string }`. The key matches `[A-Za-z0-9_-]{1,64}`; hint is at most 280 characters. Image bytes, base64, paths, file URIs, and URLs are rejected. The policy intends the host to own image selection and inference; the current build has neither an image picker adapter nor local inference.

Successful result:

```ts
type BillExtraction = {
  totalVnd: number | null; // non-negative integer VND
  currency: "VND";
  paidAt: string | null;   // parseable ISO-8601 timestamp
  recipient: { name: string | null; accountMasked: string | null };
  items: Array<{ label: string; amountVnd: number | null }>; // max 20
  confidence: "high" | "medium" | "low";
  needsReview: string[];
  model: string;
};
```

Treat every field as an untrusted draft. Present an editable review step; never create a bill, transfer, or other financial side effect solely from extraction. `UNAVAILABLE` is a normal fallback state. This pilot is first-party only and has a re-review horizon in 2026-12. The runtime fails closed with `UNAVAILABLE`; deterministic extraction fixtures are test-only. Current native iOS/Android module stubs also return unavailable. Device inference, image picker integration, and production accuracy are not verified. This contract remains product-shaped leakage (VND fields) and needs a separate standardization decision before it can become a common SDK capability.

## 4. Other host integration surfaces

These are host features with useful mini-app integration points, but they are not all callable bridge capabilities today.

### Navigation, entrypoints, and cross-app links

- The host owns global chrome, back/close behavior, and the mini-app stack.
- Package routes must be declared in the manifest; foreign origins, arbitrary URLs/schemes, new windows, and undeclared routes are intended to be blocked.
- A mini-app can be opened by a named public entrypoint only when the source and input keys are allowlisted. Input is a small JSON object (current broker limit 4 KiB) and must be validated again by the destination.
- Cross-app links use a reviewed target app + entrypoint + allowed input keys. They are not arbitrary navigation calls.
- Push activation may route to an app through `host_notification` entrypoints. Mini-apps do not receive push tokens or raw provider payloads.

The repository's navigation broker has these models and checks. A published bridge method for opening arbitrary mini-apps from WebView JavaScript is not established; the target SDK should only implement approved broker operations.

### Tracking / telemetry

Mini-app event names, versions, priority, and allowed data keys are declared in the manifest/catalog. The host validates event declaration and data keys, adds host-owned envelope fields, and queues telemetry through host storage/transport. Do not let mini-apps supply identity, session IDs, priority outside its declaration, or host context fields. No direct `tracking` bridge capability is registered in the current capability set, so an SDK event method should be treated as planned until the runtime transport is wired and tested. Never send secrets, raw images, precise location, full account values, or financial extraction fields as telemetry.

### Theme, layout, motion, and accessibility

The host maintains palette/layout/motion tokens and has a mini-app token model. The platform standard describes a frozen, versioned, content-safe token snapshot as the direction, while host-only chrome tokens remain private. The public injection names and live delivery are not yet evidenced. Do not couple an SDK to internal React Native token paths; define a versioned serializable snapshot and feature-detect it once the host contract ships.

### Host-owned capabilities without mini-app bridge access

The host also contains tenant/province selection, notification inbox and foreground banners, push registration, reminders/Live Activities (iOS) or notification-based live updates (Android), calendar editor launch, haptics, device/network access, home/catalog personalization, and account/trusted chrome. Most of these are host-only. The current bridge does **not** expose raw push operations, calendar, reminders, haptics, account, tenant mutation, arbitrary device access, contact/media enumeration, clipboard reads, camera frames, filesystem access, or generic native invocation.

### Bundled `sample` mini-app preview

The catalog now includes `sample` as an internal first-party demo. Its React Native
preview is mounted by the host and receives a narrow `BridgeClient` with only
`storageGet/Set/Delete` and `extractBill`. It demonstrates the in-memory KV flow and
the bill-extraction request/review fallback; booking data remains a local fixture.
The preview uses a synthetic local identity and `host://sample-preview`, so it is
**not an isolated WebView mini-app and is not evidence of origin-bound security**.
The current host has no consent sheet callback connected to that preview, so an
AI request returns `CONSENT_REQUIRED`; after consent is connected, inference must
still return `UNAVAILABLE` until an actual local model exists. The sample does not
claim that image selection or inference works today.

The sample intentionally calls the existing first-party `ai.extract_bill` pilot,
which is VND-specific. This preserves the requested use case while surfacing the
standardization decision in `docs/bridge-enforcement-gaps.md`; no generic extraction
capability was added without the required policy/security gate. Live Activity,
calendar and reminders remain host-only until they have approved bridge contracts.

## 5. Manifest and package integration

The checked-in JSON Schema is `app/src/miniapps/manifest/schema.json`. Important fields include:

- stable host-minted `id`, display names, monotonic integer `version` and optional human `versionName`;
- declared `routes` and `rootRoute`;
- `capabilities[]` with `name`, `version`, reviewed `purposeKey`, and optional requested `scope`;
- exact `egressHosts` (no wildcard);
- `publicEntrypoints[]` (`name`, `path`, `allowedSources`, `allowedInputKeys`);
- `crossAppLinks[]` with reviewed target and allowed input keys;
- declared `trackingEvents[]` with name, version, priority, and allowed data keys;
- minimum WebView and locale metadata.

The schema in this repository currently marks some fields required that are optional or absent in some TypeScript catalog models. Generate SDK types from the canonical schema (or establish one canonical source in the new project) rather than copying this list into multiple divergent validators. Package signing, review, and pre-execution verification are target requirements, but production enforcement is not established by the PoC alone.

## 6. Mini-app web platform restrictions

The platform contract intentionally offers a constrained WebView surface. The SDK and app should not assume browser facilities that can persist or escape the host boundary:

- No Web Crypto, WebAuthn, or Service Workers; use a specifically approved bridge capability where one exists.
- No cookies, `localStorage`, or IndexedDB; use `storage.kv` for app-scoped state when available.
- No direct foreign-origin network; use declared exact HTTPS hosts through `net.request`.
- No iframes, new windows, undeclared navigation, or arbitrary external schemes.
- No dynamic code evaluation/loading, remote scripts, raw filesystem paths, host credentials, cross-app persistent identifiers, bulk personal data, silent clipboard reads, screen capture, raw biometrics, key export, or generic native invocation.

These are the target platform statement. The repository's own memory records real-container enforcement gaps (including WebView dependency/container and CSP header verification); do not claim these restrictions are device-enforced until those checks pass against a real container.

## 7. SDK shape recommended for the importing project

Keep the portable SDK independent from React Native and the host's private implementation. A small web-facing facade can look like:

```ts
interface MiniAppHostSdk {
  capabilities(): Readonly<Record<string, { version: number; operations: readonly string[] }>>;
  request<T = unknown>(request: BridgeRequest): Promise<BridgeResult<T>>;
  // Add tracking, theme, entrypoint input, or cross-app APIs only when their
  // host transport and versioned public contracts are actually implemented.
}
```

Implementation requirements:

1. Bind calls to the current main-frame runtime session at the host transport; do not trust IDs from JS.
2. Freeze capability availability before mini-app author code runs; absent capability means normal fallback.
3. Use bounded, strict schemas per capability operation; reject unknown fields and malformed replies.
4. Return exactly one terminal response; support timeout, cancellation, teardown, and late-response dropping.
5. Make async host UI calls gesture-bound. SDK convenience methods cannot suppress or fabricate host consent.
6. Branch on known errors and include a default unknown-error path. Honor `retryAfterMs`; no prompt loops.
7. Ensure each instance's storage, quotas, handles, and subscriptions are isolated by host-bound `(tenant, app, user)` identity.
8. Keep raw media, secrets, host tokens, and filesystem paths out of the bridge. Use host-minted, scoped, expiring handles if a future contract needs large content.
9. Keep the SDK ergonomic only; native/host code owns every trust, permission, quota, and audit decision.
10. Version capability contracts additively. Never silently change field types, meanings, units, nullability, or authorization semantics.

Illustrative call (transport name is not part of the frozen public API):

```ts
const available = sdk.capabilities()["storage.kv"]?.version === 1;
if (available) {
  const result = await sdk.request<{ value: string | null }>({
    id: crypto.randomUUID(),
    capability: "storage.kv",
    operation: "get",
    version: 1,
    args: { op: "get", key: "draft" },
  });
  if (result.ok) {
    // result.data.value may be null
  } else {
    switch (result.error) {
      case "RATE_LIMITED":
        // wait at least result.retryAfterMs, with bounded retry policy
        break;
      case "REVOKED":
      case "CAPABILITY_NOT_DECLARED":
        // disable this path and use a local/non-capability fallback
        break;
      default:
        // generic recoverable error; unknown codes must not crash the app
        break;
    }
  }
}
```

The example uses `crypto.randomUUID()` only to create a call correlation ID; it is not host identity or authorization. The host should supply a compatible UUID utility if the target WebView baseline lacks it.

## 8. Implement-before-publish checklist

The importing project should close these gaps before an external SDK release:

- Select and document a real origin-bound, main-frame-only, single-door transport. Verify native derives identity and rejects forged app IDs and subframe requests.
- Make the manifest schema the actual validator and align schema, typed catalog, policy registry, SDK types, errors, and handlers mechanically.
- Implement frozen handshake before any mini-app script runs, and test all unavailable features inside a real container.
- Replace mocks for scanner, location, signing, and AI with owned native adapters; fail closed where unavailable. Keep test fixtures out of release builds.
- Give `storage.kv` durable, versioned storage semantics or explicitly specify volatile storage; test tenant/app/user isolation and quota behavior.
- Complete `net.request` request-body, header, redirect, response-header, body-size, body-handle expiry/release, cancellation, and timeout semantics. Ensure no cookie/credential leakage and native egress allowlisting.
- Define cancellation and lifecycle for subscriptions and native UI: background, close, account/tenant switch, revoke, timeout, and process death.
- Publish the exact error enum and default branch. Verify every returned handler code is documented and every documented code is producible.
- Complete public contracts for tracking, design tokens, notification activation/input, and cross-app navigation before exposing those through SDK methods.
- Verify signed package checks before first script, CSP as response headers, foreign navigation rejection, storage/cookie/file access disabled, pooled renderer death, accessibility, and measured device budgets.

## 9. Source map and precedence

This document was assembled from the following repository sources, inspected 2026-09-27:

- `policy/capabilities.yaml` and `app/src/bridge/registry.ts` — capability existence, tiers, consent classes, quotas, audit policy, support horizon, errors.
- `app/src/bridge/types.ts`, `handler.ts`, `gates.ts`, `register.ts`, and `handlers/*` — current request/result models and PoC operation shapes.
- `app/src/miniapps/manifest/schema.json`, `app/src/miniapps/container/*`, and `app/src/navigation/navigationBroker.ts` — manifest, container, routes, entrypoints, and links.
- `docs/features/capability-bridge.md`, `docs/features/ai-extract-bill.md`, `app/docs/features/notification.md`, `app/docs/features/tracking.md`, and `app/docs/features/live-activity.md` — feature intent and current implementation notes.
- `app/docs/mini-app-platform-standard.md`, `policy/conformance.md`, and `app/docs/ai-foundation/MEMORY.md` — platform restrictions, enforcement requirements, and production gaps.

When this summary differs from `policy/capabilities.yaml`, `policy/budgets.md`, `policy/conformance.md`, the canonical manifest schema, an approved feature contract, or current native enforcement, those narrower sources win. Update this imported copy when the SDK project adopts a new verified contract; do not treat this snapshot as live configuration.
