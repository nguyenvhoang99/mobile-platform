---
name: mini-app-runtime
description: Build and review the container that runs one untrusted mini-app per WebView — origin strategy, package signing and verification, storage and network isolation, lifecycle, the warm pool, eviction, navigation containment, and crash containment. Use when someone asks "how do mini-apps get updated", "can two mini-apps see each other's data", "why is opening a mini-app slow", "can a mini-app crash the app", or when wiring a WebView, a package cache, or a kill-switch check. The container is the tenancy boundary; treat mini-apps as tenants, not modules.
---

# Mini-App Runtime

## Why this exists

A leaky container is the failure everyone anticipates: state bleeding from one mini-app into
the next, one badly written app taking the host down, a tampered package running because
verification happened at install and not at open. Each is a headline with our name on it,
not the author's.

The failure people do not anticipate is over-isolation. A container so careful that opening
a mini-app takes three seconds is a container nobody uses, and a mini-app platform with no
mini-apps has failed commercially rather than reputationally — a worse outcome, because it
happens quietly with nothing to point at.

**Two platform facts drive most decisions below, and neither is symmetric across iOS and
Android. Do not smooth them over.**

**iOS custom-scheme origins are not secure contexts.** A page served by a custom scheme
handler reports `isSecureContext === false`, which removes `crypto.subtle`, Service Workers,
and WebAuthn; the only known fix is a private API, so it is not shippable. Android's asset
loader serves a real `https://` origin and *is* a secure context.

**Android WebView has one renderer process per app and no out-of-process iframes.** Every
mini-app WebView shares one renderer, so origin separation between mini-apps is enforced *by
that renderer* and does not survive it being compromised — and if any WebView sharing a
crashed renderer fails to handle the renderer-gone callback, the whole host process dies.
**One mini-app can kill the super-app.** Isolation on Android is weaker than on iOS; say so
in design reviews rather than claiming parity.

## One mini-app, one WebView, one origin

**Origin: `mini://<appId>` on iOS via a custom scheme handler;
`https://<appId>.miniapp.<ourdomain>` on Android via the asset loader with plain
HTTP disallowed.** Use a domain we own, not the library default, or two hosts
collide. Registering a handler for `https` on iOS is not available — WKWebView
handles that scheme natively and throws — so the asymmetry is forced, not chosen.

**`file://` is never acceptable**, and the reasons are worth writing down because it
keeps getting proposed as the simple option: no meaningful per-app origin, a long
CVE history around universal file access, not a secure context either, and it leaks
real filesystem paths to page JS.

**Define the mini-app platform contract at the iOS level — no secure-context-only
web APIs — and provide crypto, auth, and storage as bridge capabilities.** This
turns the iOS limitation into a forcing function we wanted anyway: those are
exactly the surfaces to mediate rather than hand to untrusted code.

## The package, and verifying before executing

**Sign the canonicalized manifest, not the archive**, with the manifest carrying a hash-tree
root over the asset tree. Signing the zip makes the zip parser a trust boundary, which is how
parser-differential attacks get in — the archive is transport, never a trust boundary. **At
install, validate every archive entry**: reject `..`, absolute paths, symlinks, non-regular
files, implausible expansion ratios. Archive traversal is the oldest bug in this shape of
system.

**Require two signatures.** The store signature authorizes, because the store is who reviewed;
the author signature attributes. With only one, a store-key compromise forges attribution and an
author-key compromise bypasses review. **Verify at every open, from the bytes actually being
served** — not "we verified at install", which trusts a cache on a device we do not control.

**`versionCode` never decreases; rollback is a roll-forward with older content.** Defend
downgrade and replay with a server-signed short-TTL channel pointer carrying a monotonic
sequence number, plus a minimum-acceptable-version floor in platform secure storage that only
ever rises. Without the floor, an attacker holding an old signed package can reinstate a fixed
vulnerability forever.

**Do not use Service Workers.** Unavailable on the iOS custom scheme anyway, they add a second
cache to invalidate and put an author-controlled interception layer *inside* the sandbox. The
scheme handler is the service worker: serve `no-store`, let native own caching, and the
stale-mini-app-after-update bug class disappears.

## The isolation checklist

| Control | Setting | If wrong |
|---|---|---|
| Origin | distinct per `appId`, host-served | mini-apps share an origin and can read each other |
| Web storage and cookies | **disabled entirely** | the leak class this table exists to prevent |
| Persistence | bridge-backed KV, keyed by `(user, appId)` | unpartitioned state |
| CSP | served as an HTTP **response header** | a `<meta>` CSP is author-controlled, so not a control |
| Network egress | none direct; native `net.request` only | exfiltration with no log and no allowlist |
| Iframes | `frame-src 'none'` plus static rejection at review | a subframe reaching the bridge |
| Navigation | allowlist of own origin and own declared pages | escape to a real web origin or another app |
| New windows | blocked; host-mediated open only | `target=_blank` outside the sandbox |
| File access | all file-access settings off | filesystem reachable from page JS |
| Debug inspection | off in release, **asserted at startup** | it defaults *on* in debug builds |

**Disabling cookies and web storage is the load-bearing row, and it is what makes the warm
pool possible.** On iOS the data store lives on the WebView configuration, copied at init and
immutable afterwards — so a *generic* pooled WebView can never be handed a per-mini-app
persistent store later, and pooling per-mini-app defeats the pool. Keep per-app data stores
and Android multi-profile as defense-in-depth where cheap, never as the mechanism. **Note
this coupling in the code: it is exactly what a later refactor removes without knowing what
it held up.**

**Honest gap on egress:** request interception does not see WebSocket handshakes, and WebRTC
data channels need no permission. Omit `wss:` from `connect-src`, grant no WebRTC, and treat
an observed attempt as a high-signal abuse event rather than assuming prevention. Because
egress is host-mediated, an attempt is both blocked *and detected* — and the detection is
worth as much as the block.

**Navigation is an allow-list, never a deny-list**: permit only our scheme, the bound `appId`
as host, the main frame, and a declared page. That one default closes `tel:`, `sms:`,
app-store and third-party app schemes, and universal links at once, rather than as a denylist
that grows by incident. On Android use the request-object overload of the navigation callback,
never the deprecated string one — you need main-frame, redirect, and gesture information to
decide at all. **Never pass anything from a WebView to intent parsing:** an `intent://` URL
naming an exported component is a classic host-compromise path. And back is unambiguous —
back within the mini-app, close at its root, never trapped.

## Package trust and updates — atomic and host-owned

Borrowed from the runtime reference — make these mechanical, not aspirational:

- Verify package identity, integrity, signature, schema, compatible host/API range, and declared capabilities *before* activation. Never execute a partially downloaded or unverified package.
- Install is atomic: keep the last known-good version until the new version passes validation *and* a launch health check. The WebView never sees a half-written directory.
- Reject downgrade, replay, path traversal, decompression abuse, oversized files, duplicate entries, unsupported formats — the archive checks in `validateArchiveEntries` are the gate, not a warning.
- Separate immutable package assets (served from the in-memory index) from mutable, scoped mini-app data (bridge `storage.kv` per `(tenant, user, appId)`). The package can be purged without losing user data and vice versa.
- Make rollback and quarantine possible without a host release — the signed channel pointer plus the version floor does this. Do not assume an OTA can introduce a new native capability or change a native contract already shipped.
- Until the host validates, the mini-app is not runnable — first script execution happens *after* verification returns (`policy/conformance.md` B5). The pool being warm does not warm trust.

## Capability broker — what each request carries (runtime view)

The container hands the broker a request that already carries: runtime instance and authenticated mini-app identity (derived from the bound WebView, never from the payload — `native-capability` C3), capability name and negotiated version, request identifier/deadline/cancellation, validated payload, permission/consent state, and trace correlation without secrets. The broker's job is to authenticate, authorize (G1), validate, rate-limit, dispatch, normalize errors, observe, and complete-or-cancel exactly once. If any of those is missing, the request is not dispatchable.

## Permissions — four grants, not three

The three gates (G1 review grant, G2 user consent, G3 OS permission) collapse two of the reference's four into G1. Keep the four distinct in your reasoning even though the code checks three:

1. **Mini-app declaration** — what the manifest says it wants.
2. **Host platform permission** — does the OS grant *the host binary* the capability (e.g. location permission to the host app).
3. **Host policy allowing that mini-app** — does the tier/store record grant *this* mini-app the capability? (part of G1).
4. **Contextual user consent** — does the user grant *this* (tenant, app, capability, scope) right now? (G2).

Possessing the OS permission does not grant every mini-app access. Bind grants to `(tenant, appId, version, user)` and a lifetime, re-check on sensitive ops, and make denial/revocation a normal typed outcome — not an exception.

## Resource isolation — scope and bound before use

Apply backpressure before queues grow; cancel pending work when the runtime terminates, logs out, or loses permission. Scope and bound, in this order:

- storage namespaces and quotas per `(tenant, user, appId)` — already the KV design
- network destinations, redirects, cookies, headers, uploads, response sizes — `egressHosts` allowlist, `no-store`, `connect-src` derivation
- concurrent WebViews (max 3, `policy/budgets.md`), timers, workers, message rate
- memory-intensive media/decompression/caches — size images to display size, decode off main thread, server holds the bytes
- background execution and wakeups — host-scheduled, not mini-app requested

One mini-app's burst, crash, or oversized workload must not corrupt global navigation, auth, or another instance — the container is the blast radius.

## Contract evolution — negotiated, additive, tested

Negotiate a capability version or feature set explicitly via the frozen handshake (`mini-app-contract`), never via host version sniffing. Keep additive changes backward compatible; do not change the meaning of an existing field silently; return a stable `unsupported_version`/`unknown_capability` error instead of crashing. Test the current host against every supported contract version and, when distribution permits, test a new mini-app against the oldest supported host.

Generate schemas and adapters from one source of truth when Codegen supports it — the manifest schema *is* the validator (`C9`), and the handshake is frozen before first script.

## Observability and recovery — measure the right things

Measure package verification/install/rollback, launch phases (`miniapp_tap` → `miniapp_first_paint` on low tier), runtime crashes/renderer deaths, memory pressure, broker latency (p50/p95, not mean), denials, cancellations, timeouts, schema failures, and native adapter failures. Use `appId` and package version as bounded dimensions; avoid unbounded labels. Correlate host/runtime/native with the same trace markers (`policy/budgets.md`) but never log sensitive payloads — audit carries a digest.

Show a recoverable host-owned error surface when a mini-app fails; never let one mini-app's malformed request or stale response corrupt the host.

## Test matrix — what a change must prove

Cover at least the cases relevant to the change (the adversarial fixtures in `policy/conformance.md` are the floor, not the ceiling):

- valid, unsigned/invalid-signature, corrupted, oversized, incompatible, rolled-back packages
- first launch, repeat launch, concurrent instances if supported, background/resume, termination, process restoration
- allow, deny, revoke, OS-deny, expired consent, identity/account change
- malformed fields, unknown capability/version, oversized payload, burst rate, timeout, cancel, duplicate response, completion after teardown
- offline, slow network, redirected request, partial download, storage full, low memory, native SDK failure
- host upgrade/downgrade combos within the supported N−2 window

## Lifecycle

| State | Entered when | Required side effect |
|---|---|---|
| Installed | package fetched and verified | floor version raised |
| Warming | bound to a pooled WebView | origin fixed, SDK injected at document start |
| Foreground | visible and focused | consent prompts allowed; kill-switch check |
| Background | host moved elsewhere in the app | streams throttled |
| Suspended | detached from window | native snapshot shown, timers throttled |
| Terminated | evicted or closed | WebView destroyed, handles invalidated |
| Evicted | uninstalled, over quota, long unused | host-side storage purged |

**In-flight native operations across background and kill** split three ways: pure reads
cancel freely; idempotent side-effecting operations continue natively and are reconciled by
querying an operation ID; money is host- and server-owned end to end. **Any operation whose
loss costs money must be resumable by ID, not by callback** — a mini-app learns a payment
outcome by asking, never by being alive to receive it.

## The warm pool

Pre-create WebViews on a blank page with a *generic* configuration, and bind one to a
mini-app on touch-down or when its entry point scrolls into view.

**Be honest about what this buys:** framework init, renderer spawn, and compositor setup —
often the largest single chunk of cold open. It does **not** pre-execute the mini-app's own
JS, because the origin is fixed by the first navigation. Anyone claiming to pre-warm a
*specific* mini-app is pre-rendering one pinned app, or is mistaken.

**Size the pool from device memory, never a constant** — roughly one live and no spare on
low-memory devices, one and one mid-range, two and one high-end. Thresholds go in
`policy/budgets.md` after measuring per-WebView resident cost on the low tier.

**Never carry per-app state into a pooled container.** A warm WebView holding residue from
the previous mini-app is a cross-tenant data leak wearing a performance optimization's
clothes. Correct reset is not "clear what we remember to clear" — it is "the pooled WebView
never held anything".

Eviction is LRU over suspended instances, with three hard rules: never evict an instance with
an in-flight money or high-tier operation, drive it to a terminal state first; on memory
pressure evict all suspended instances and drop the pool to zero; and prefer terminating over
suspending high-tier mini-apps, because on Android a suspended privileged WebView is blast
radius in a shared renderer for no benefit.

## Crash and hang containment

**Handle renderer death on every WebView, including pooled and hidden ones.** On Android this
is not bookkeeping — an unhandled renderer-gone callback on *any* WebView sharing the crashed
renderer takes down the host process, and the pooled WebView nobody is looking at is the one
that will do it. On iOS, reload from the verified local package plus a host-held snapshot.
Detect unresponsive renderers and give the user a native way out — the decision to kill must be
native, because the thing that is hung is what you would otherwise be asking.

## Smoothness inside the constraint

WebView is the weakest-performing option for the mini-app tier, so the way to live with it is
**to make the native part unconditionally fast rather than the WebView faster than it can be.**

- **Native chrome and native splash**, on a native stack, so a transition never waits on JS.
  Render the skeleton natively from the manifest hint — an HTML skeleton still needs the
  renderer up, which is the latency you are hiding. **Splash removal is driven by a native
  first-paint signal with a native timeout**, never a JS callback, or one broken mini-app
  hangs the shell forever.
- **Keep the RN JS thread off the critical path.** Own the WebView from a native component
  that terminates the bridge in native code. Never attach RN scroll handlers to it; dismiss
  gestures are native or UI-thread worklets. Kill-switch checks, splash timeout, permission
  sheets, and eviction are all native-driven, because RN JS can be blocked by unrelated host
  work and nothing in a mini-app's frame lifecycle may depend on a JS tick.
- **One scroll container, and serve the package from an in-memory index.** Never nest the
  WebView in an RN scroll view. Each scheme-handler request is an IPC round trip, so reduce
  *request count*: one bundled script, inline critical CSS.

## Worked examples

**A mini-app wants to send the user to its own login domain for a token.** Allowing it breaks
the origin model — the page would run on a real web origin with our bridge reachable. → refuse;
do the OAuth hop in a host-presented browser view and return a scoped token.

**A pooled WebView is rebound after the user logs out of the previous mini-app.** → safe only
because web storage is disabled. If anyone re-enabled it, this is a cross-tenant leak and the
pool must be torn down rather than rebound.

**A mini-app opens a second window for a payment flow.** → refuse `target=_blank`, route
through a host-mediated open. A second window is a surface with no chrome — how a mini-app
spoofs our payment sheet.

## The container conformance checklist

Any new container, or change to WebView configuration, produces this.

```markdown
## Container conformance — <change>

**Origin:** <scheme, host, where the appId binding is enforced in native code>

**Isolation rows re-verified:** <Which rows this change could affect, with evidence.
"Unchanged" must be true, not assumed — a config object copied from elsewhere changes rows
silently.>

**Verification path:** <Where signature and hash checks sit relative to first script
execution. If any code runs before verification completes, say so.>

**Renderer death handling:** <Every instance, pooled and hidden included.>

**Pooled-state reset:** <What a rebound WebView could hold. Should be "nothing"; anything
else is a cross-tenant leak.>

**Budgets and accepted weaknesses:** <From policy/budgets.md on the low tier, plus the
weaknesses that apply — a reviewer will not recall them from another document.>
```

## What does not belong here

- **Capability signatures, consent, quotas, the bridge protocol.** `native-capability`. This
  skill builds the box; that one builds the door.
- **Signing keys, trust tiers, review, who may publish.** `mini-app-governance`. This skill
  *enforces* a signature; it does not decide whose key is trusted.
- **The kill switch decision.** Governance decides and broadcasts; the runtime obeys, gates at
  open, and tears down. Neither half is the other's.
- **Host navigation architecture and layer decisions**, which are `mobile-architecture`, and
  **the cold-open number** — `mobile-smoothness` owns budgets; this skill owns hitting them.

## Hand off

`container-wiring` to build it — this skill sets the isolation rules, that one implements
them in one factory. `native-capability` for what the contained app may call.
`mini-app-governance` for how it was admitted and revoked. `mobile-smoothness` to prove the
open budget on the low tier; a correct-but-slow container does not survive the product.
