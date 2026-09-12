---
name: container-wiring
description: Build the WebView container that `mini-app-runtime` specified — one factory and one configuration, serving the verified package over our own scheme, the CSP response header, navigation containment, mounting from React Native without putting the JS thread on the path, splash and lifecycle, pool reset, and renderer-death handling. Use when someone says "mount the WebView", "add the scheme handler", "the mini-app shows a blank screen", "the splash is stuck", or "opening a mini-app is slow". Enabling web storage to fix something means you have drifted.
---

# Container Wiring

## Why this exists

The container is the tenancy boundary, and it is built from perhaps twenty configuration
flags spread across two platforms. Nineteen correct flags and one wrong one is not
nineteen twentieths of a sandbox — it is no sandbox, and it looks identical from the
outside. Nothing fails. The mini-app loads, scrolls, and works.

So the risk here is not that an agent cannot build a WebView. It is that an agent builds a
*second* one. Someone needs a WebView for an in-app help article, or a debug view, or a
partner integration that is "not really a mini-app", and constructs one inline with
sensible-looking defaults. That instance has cookies, universal file access, and no CSP,
and it is one line of code away from the same bridge.

The opposite failure is a container so defensive that opening a mini-app takes three
seconds, at which point the product stops using mini-apps and the whole architecture was
overhead. `mini-app-runtime` set both the isolation rules and the open budget. Build to
both; neither is negotiable against the other.

## Before you write anything

- **Read the isolation checklist in `mini-app-runtime`.** Every row is a control plus the
  consequence of getting it wrong, and this skill assumes you are implementing that table
  rather than deciding it.
- **Know the open budget** from `policy/budgets.md`, on the low-tier device. You will make
  a dozen small decisions that each cost 30 ms.
- **Find the existing factory.** If one exists, you are extending it, not adding a peer.

## The drift signal

**If you are enabling web storage, cookies, or file access to make something work, stop.**
That is not a workaround, it is the removal of the control that makes the warm pool safe.
The pool works *because* a pooled WebView never held anything; re-enable persistence and
every rebound instance becomes a cross-tenant leak, and the leak arrives disguised as a
performance optimization that already shipped.

Two other disguises of the same drift: adding an origin to the CSP `connect-src` so a
mini-app can reach its backend directly, when it should go through the host request
capability; and relaxing the navigation allowlist so an OAuth hop works, when the hop
belongs in a host-presented browser view.

## The container is a Fabric component — treat it as one

The mini-app container is a native view that owns lifecycle, not a service that happens to render. When you touch this file, read `references/native-boundaries.md`:

- Model props (bound `appId`, verified package handle), events (first-paint, renderer-gone), and commands (suspend, evict, warm) separately — do not recreate the view for ordinary prop changes.
- Define layout/measurement on both platforms; cover attach/detach, background/foreground, recycling, orientation, accessibility, and multiple instances (warm pool).
- Keep large frames or media buffers native; emit metadata or coarse results to JS — the container never ships a decoded image or raw frame over the bridge.
- Prevent listeners retaining an activity, view controller, or WebView after destruction — the pool's `renderer-gone` handler must be attached to *every* instance including the pooled ones that are not visible.

A container that is a service module with a `createWebView()` helper instead of a Fabric component will miss teardown and will kill the host on Android when the shared renderer dies.

## Step 1: one factory, one configuration

**Every mini-app WebView is constructed by exactly one factory, and nothing else in the
codebase constructs a WebView at all.** This is the single most valuable line in this
skill, because it is the only one a CI check can enforce cheaply, and it is what stops the
second-container failure above.

The factory takes a bound `appId` and a verified package handle. It returns a configured
instance. It does not take an options bag — an options bag is how the nineteenth flag gets
overridden at one call site. If a legitimate need for a different configuration appears,
that is a second tenancy model and it gates.

Non-mini-app web content — help articles, marketing pages, OAuth — does not get a
relaxed mini-app container. It gets the platform's own browser view, which shares nothing
with our bridge.

## Step 2: serve the verified package

- **Verify before the first script executes**, from the bytes you are about to serve, not
  from a flag set at install. Signature over the canonicalized manifest, then the hash
  tree, then serve.
- **Register the scheme handler or asset loader against the bound origin** — our scheme
  and the `appId` as host on iOS, our own domain on Android with plain HTTP disallowed.
  Reject any path not in the manifest's declared pages with a 404 at the handler.
- **Serve from an in-memory index over the verified package.** Each request is an IPC round
  trip to the app process, so a disk read per subresource is the slow path twice over.
- **Set the CSP as an HTTP response header on the main document.** Never a `<meta>` tag: the
  author writes that HTML, so an author-controlled CSP is not a control. Derive
  `connect-src` from the manifest's declared hosts and intersect the author's requested
  policy rather than unioning it — they may tighten, never loosen.
- **Serve `no-store` and let native own caching.** Do not register a Service Worker; it is
  a second cache to invalidate and an author-controlled interception layer inside the
  sandbox. The handler is the service worker.

## Step 3: contain navigation

Allow a navigation only when all four hold: our scheme, host equals the bound `appId`,
target is the main frame, path is a declared page. Cancel everything else. One allow-list
closes `tel:`, `sms:`, app-store schemes, third-party app schemes, and universal links at
once, where a denylist grows by incident forever.

Then: return nothing from the new-window handler, so `target=_blank` dies rather than
opening an un-chromed surface a mini-app can dress as our payment sheet. On Android use
the request-object overload so you actually have main-frame, redirect, and gesture
information to decide with. **Never hand anything from a WebView to intent parsing.**

## Step 4: mount from React Native without putting JS on the path

The container is a native component in the RN tree, and the bridge terminates in native
code inside it. RN JS mounts it and is then not involved.

- **Never attach RN scroll handlers to the WebView.** If host chrome must react to scroll,
  read it from the native scroll callback inside the component.
- **Dismiss and back gestures are native or UI-thread worklets.** Not `PanResponder`.
- **Splash removal, the kill-switch launch check, permission sheets, and eviction are all
  native-driven.** RN JS can be blocked by unrelated host work, and nothing in a mini-app's
  frame lifecycle may wait on a JS tick.
- **One scroll container.** A WebView nested in an RN scroll view arbitrates gestures across
  threads, which the user sees as stutter.

## Step 5: splash, lifecycle, and renderer death

**Splash is native and removed by a native first-paint signal with a native timeout.** A
JS callback means one broken mini-app hangs the shell forever. Render the skeleton natively
from the manifest hint — an HTML skeleton still needs the renderer up, which is precisely
the latency you are hiding.

**Handle renderer death on every instance, including pooled and hidden ones.** On Android
an unhandled callback on *any* WebView sharing the crashed renderer takes down the host
process, and the pooled instance nobody is looking at is the one that will do it. This is
the row most often missed, because the pooled instance is invisible in every manual test.

**Reset means the instance never held anything.** When you rebind a pooled WebView, do not
enumerate state to clear — if there is state to clear, the isolation rows are wrong. Drive
in-flight money or high-tier operations to a terminal state before eviction, and drop the
pool to zero on memory pressure.

## Swift, Kotlin, and C++ — where the container lives

The container is Swift/Kotlin for OS integration (scheme handler, asset loader, lifecycle). Keep platform implementations behaviorally compatible, not identical — iOS custom-scheme vs Android asset loader is intentional, not a bug to abstract. Use shared C++ only when code sharing or performance repays the cost (e.g. hash-tree verification, CSP intersection) — define ownership/thread affinity, avoid copies across JNI/Objective-C++/JSI, use bounded buffers and sanitizers. Keep OS permissions, UI, and platform SDK objects outside any shared core (the scheme handler *is* the platform).

## Native dependency review — before adding a WebView-adjacent library

Before accepting a native dependency that touches the container (WebView enhancement, codec, security lib), check: New Arch support, iOS/Android targets and build-tool compatibility, threading/lifecycle/privacy manifest, binary size/transitive deps/startup work, maintenance/license/security history, tests with multiple instances, and ability to patch or replace. Wrap it behind the host port so the container contract does not inherit its types. Every new native dependency is a veto on the next RN upgrade — record why in `policy/dependency-decisions.md` (the host reference's dependency policy).

## Stop and gate when

- A configuration flag has to be relaxed for any reason. Every row in the isolation
  checklist has a consequence attached; changing one is a change to the tenancy model.
- A **second container configuration** is genuinely needed. That is a second tenancy model,
  and two tenancy models means one of them is unreviewed.
- The open budget **cannot be met** with the isolation rows intact. Say that plainly rather
  than trading a row for milliseconds — `mobile-architecture` owns that trade and it gates.
- You need per-mini-app configuration in the container. Container config is generic by
  design; per-app variation belongs in the manifest and the store record.

## Conformance

In `policy/conformance.md` and in CI:

- Exactly one call site constructs a mini-app WebView. Any other construction fails the
  build.
- The container configuration sets storage, cookies, and file access to off, and a test
  asserts each rather than trusting the constructor.
- CSP is asserted present as a response header, and absent as a `<meta>` tag, in a test
  that serves a real package.
- A test navigates to a foreign origin, a foreign scheme, and an undeclared path, and
  asserts all three are cancelled.
- A test asserts the renderer-death handler is attached to pooled and hidden instances,
  not only visible ones.
- A test asserts first script execution happens after signature verification returns.
- No `Intent` parsing, and no RN scroll handler, appears anywhere in the container path.

## Worked examples

**"The mini-app shows a blank screen after the update."** → almost always the manifest's
declared pages and the actual entry path disagree, and the handler is correctly returning
404. Check the declaration before touching the handler.

**"A partner integration needs cookies for their session."** → not a container change. The
session belongs in a host-mediated scoped token, and the partner tier does not change the
tenancy model. → refuse; wire the token.

**"Opening from the home tab is fast but from search it is slow."** → the search path is
not hitting the warm pool because binding happens too late. Bind on touch-down, not on
navigation commit.

**"We need a WebView for the help centre articles."** → not this factory. Platform browser
view, no bridge, no shared configuration.

## What does not belong here

- **The isolation rules themselves, the lifecycle states, the pool policy.**
  `mini-app-runtime` decides; this skill implements.
- **Capability handlers, gates, the wire protocol.** `bridge-wiring`.
- **The open budget and its measurement.** `mobile-smoothness`.
- **The manifest schema authors write against.** `mini-app-contract`.
- **Signature keys and what is admitted.** `mini-app-pipeline` and `mini-app-governance`.
  You enforce a signature here; you do not decide whose key is trusted.
- **Host navigation and screen architecture.** `mobile-architecture`.

## Hand off

`mobile-smoothness` to prove the open budget on the low tier, with markers rather than a
stopwatch — a container that is correct and slow does not survive contact with the product.
`mini-app-runtime` for the conformance checklist that records what you verified.
`human-gate` the moment an isolation row has to move.
