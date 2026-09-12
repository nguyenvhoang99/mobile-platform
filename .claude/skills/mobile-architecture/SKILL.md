---
name: mobile-architecture
description: Decide where a mobile feature lives across the native shell, the React Native host, and the mini-app plane — the layer rule, the native-or-JS call, release topology and version skew, and the upgrade path — then record the decision. Use when someone asks "should this be native", "where does this feature go", "how do we ship a fix without waiting for store review", "which RN version are we on", or when a change adds a native module, a new screen, or a whole surface. Read `mobile-simplicity` before admitting anything new.
---

# Mobile Architecture

## Why this exists

Two failures, and every mobile codebase drifts toward one of them.

The first pushes everything native for performance and control, then discovers
that a one-line copy fix takes three weeks: build, submit, review, phased
rollout. The team stops shipping small improvements because the overhead exceeds
the value, and the product calcifies. Worse, the release that broke something
cannot be pulled back — you can halt a rollout, but every device already on the
bad build stays there until they take another one.

The second pushes everything into JavaScript for velocity, then cannot hit its
frame budget on the mid-tier Android that most users actually hold. Every
gesture waits on a JS tick, and the fix is a rewrite of the thing that was
supposed to be cheap to change.

The resolution is not a compromise between them. It is a rule derived from one
asymmetry: **a native release cannot be rolled back, and a remote one can.**
Everything else here follows from that.

## The layer rule: thin shell, fat remote

Push capability as far up the stack — as far toward remotely-updatable — as the
performance budget allows. Not as far as is *possible*: as far as the budget
allows. `mobile-smoothness` owns that budget, and it is the only legitimate
argument for moving something down into native.

The corollary people skip: **if something must live in the shell, it must also
be something you are willing to be stuck with for a week.** Anything with a
policy, a threshold, a piece of copy, or a list in it gets that part hoisted
out and fetched, even when the mechanism stays native.

## Layer 1: the native shell

Ships through the store. Un-rollbackable. Keep it to mechanisms that cannot
live anywhere else:

- Launch and process setup, and the RN host's own bootstrap
- The mini-app frame — splash, chrome, transitions, the close control — because
  it must not wait on any JS thread to stay smooth (`mini-app-runtime`)
- The capability bridge and every capability implementation
  (`native-capability`)
- Anything unspoofable: the permission sheet, the payment sheet, biometric
  prompts. A security surface rendered by remotely-updatable code has a
  remotely-updatable security surface.
- Anything on a gesture's critical path at 60 fps or above

Everything in this list is a *mechanism*. Every threshold, allowlist, string,
and rollout percentage those mechanisms consume comes from remote config or the
signed manifest, never a constant in the binary.

## Layer 2: the React Native host

First-party product surfaces, host navigation, host state, the mini-app
directory. This is where most features belong and the default answer to "where
does this go".

- Use the New Architecture throughout — Fabric for rendering, TurboModules with
  Codegen for native access. Do not keep a legacy path alive alongside it;
  `mobile-simplicity` covers why two render paths cost more than either.
- Native modules are declared through Codegen so the type boundary is generated
  rather than hand-maintained. A hand-written bridge signature drifts from its
  native implementation and the drift shows up as a runtime crash.
- Animations and gestures that must not drop frames run off the JS thread —
  worklets on the UI thread, or native. `PanResponder` on anything
  gesture-critical is a frame-budget bug waiting for a slow device.

## Layer 3: the mini-app plane

Third-party code in WebViews, one origin each, reaching the device only through
the bridge. Architecturally this is a *tenancy boundary*, not a module boundary:
treat mini-apps the way you would treat customers sharing a server, because
that is what they are.

The host must be able to run zero mini-apps and still be a working app. If a
first-party feature is implemented as a mini-app for convenience, you have made
your own product depend on the least-trusted layer, and every capability
restriction you later add breaks yourself.

`mini-app-runtime` owns the container, `native-capability` the door,
`mini-app-governance` who gets in.

## Start from repository evidence

Before deciding a layer, inspect and state the relevant facts — do not assume:

- React Native version, Hermes config, New Architecture (Fabric + TurboModules + Codegen) status — this repo is RN 0.85.x, New Arch, Hermes, bare CLI
- Bare vs Expo prebuild, brownfield vs greenfield, monorepo or single app
- iOS/Android deployment targets, Swift/Kotlin/C++ usage, build system (Gradle/Xcode)
- Current mini-app runtime model: one WebView per mini-app, one origin each, shared renderer on Android — no separate JS VM, no shared RN runtime
- Navigation ownership, DI, state, Codegen, lint, tests, CI, performance tooling
- Existing host→mini-app contract, trust model, version negotiation, update/rollback flow

Do not silently change the runtime model, RN version, architecture mode, navigation foundation, package manager, or public mini-app contract. If the feature requires one of those changes, explain and obtain direction first. When RN behavior matters, check docs for *this* installed version, not latest.

## Choose the narrowest effective implementation layer

The table above is the 80% answer. Use this 6-tier order as the full decision process when the feature touches platform capability, native UI, or latency-sensitive work — not as a mandate to keep everything in JS:

| Need | Preferred boundary | Why |
|---|---|---|
| Stateless or ordinary platform service | **TurboModule** with Codegen | Typed, async by default, lazy init stays lazy |
| Native view, view controller, fragment, or UI SDK | **Fabric component** | Props/events/commands, proper teardown, multiple instances |
| Cross-platform compute or binary processing | **Pure/shared C++ TurboModule** | Keep Swift/Kotlin for OS services, share only the compute |
| Rare platform-only host flow | **Native screen behind a host port** | Avoid recreating a strong native flow without benefit |
| High-volume data path | **Native/C++ with coarse results** | Avoid per-sample JSON and chatty JS crossings |
| Simple shared host behavior | **TypeScript / RN host** | Do not introduce native maintenance without measured value |

Generate native interfaces with Codegen, keep one source of truth for schemas/error codes, avoid scattered `Platform.select` — isolate behind ports or `*.ios`/`*.android` files.

## Preserve the host architecture — one-way dependencies

Keep this direction — reverse it and the mini-app plane inherits host internals, or policy leaks into the adapter:

```text
host UI -> host application/domain -> host ports -> native/runtime adapters
mini-app -> versioned capability broker -> host application/domain
```

| Layer | Owns | Must not own |
|---|---|---|
| Host UI | shell screens, presentation state | raw mini-app protocol or SDK lifecycle |
| Application/domain | use cases, policy, capability authorization | React component or SDK types |
| Host ports | stable interfaces for runtime, storage, identity, network, telemetry | concrete vendor behavior |
| Native adapters | Swift/Kotlin SDK integration, OS lifecycle | mini-app authorization policy |
| Runtime adapter | package loading, lifecycle, transport, accounting | unrestricted host access |
| Capability broker | typed versioned API, validation, permission, error mapping | arbitrary native-module exposure |

The runtime must not import arbitrary host internals or call TurboModules directly. Authorization, validation, lifecycle, observability live at the broker — keep React components free of SDK lifecycle rules and raw bridge handling.

## State and lifecycle — make transitions explicit

Every mini-app and host flow that crosses layers must model its states: install/update, prepare, launch, foreground, background, suspend, resume, terminate, failure, eviction.

- Every transition is legal from a defined set of prior states; illegal transitions are rejected.
- Duplicate callbacks and retries are safe (idempotent).
- Listeners, native views, runtime refs, timers, files, SDK sessions are released on teardown.
- Async results are tied to the requesting runtime instance; stale completions after teardown are discarded.
- Only versioned state needed for recovery is persisted.
- Do not use a process-global event bus as the contract — scope subscriptions by runtime instance and remove deterministically (ties directly to `mini-app-runtime` warm pool and crash containment).

## Navigation — host owns the shell

The host owns global navigation, auth gates, deep links, system back, and OS permission prompts. A mini-app owns only navigation *within* its container unless the contract explicitly delegates a host action. Normalize and validate incoming routes (identity, route, params, auth) — no arbitrary URL→native-screen mapping. Use native screens for lifecycle-heavy vendor SDKs, but keep the result behind the same port React UI uses.

## Data and errors — keep the boundary typed

- Transport DTOs are separate from domain models; reject unknown fields when ambiguity is dangerous.
- Map platform exceptions to a small stable host error taxonomy; keep a non-sensitive diagnostic cause internally but never expose implementation details to mini-apps.
- Bound collection size, nesting, string length, binary payloads *before* allocation/decoding (applies to capability args, package entries, tracking payloads).

## Rollout for risky changes

For a new native contract or runtime change, prefer a compatibility window: ship host accepting old+new, observe, move mini-apps, remove old only after the N−2 population permits it. Flags for sensitive capabilities must fail closed and must not create a second untested implementation indefinitely.

## The native-or-JS decision

| The feature | Verdict |
|---|---|
| Needs a device API with no existing capability or TurboModule | native, plus a TurboModule |
| Must hold 60 fps while a finger is down | native or a UI-thread worklet |
| Renders an unspoofable security or payment surface | native |
| Changes weekly, or is A/B tested | RN host |
| Is a product screen with ordinary interactions | RN host |
| Is legal copy, a threshold, or an allowlist | remote config — not code at all |
| Is third-party, or shipped on someone else's schedule | mini-app |
| Is first-party and load-bearing | never a mini-app |

When two rows conflict, the higher row wins — a payment sheet that also changes
weekly is native with remote copy, not RN.

## Release topology and version skew

The native binary and the JS it runs are versioned independently, and that is
the point. Design for the skew rather than hoping it is small.

- **Assume N−2 native versions are live.** Users update slowly and some never
  will. Any contract between the shell and the host must tolerate an older
  shell — which means the shell exposes capabilities and the host feature-detects
  them, never the reverse.
- **A remote JS update must never require a shell that is not out yet.** If it
  does, the update bricks every device on the older shell. Ship the shell
  support first, wait for adoption, then ship the JS that uses it.
- **Forced upgrade is a real mechanism and a last resort.** Have it — a
  server-driven minimum version with a blocking screen — because you will need
  it for a security fix. Using it for anything else spends user goodwill on your
  own convenience.
- **Store review latency belongs in the plan, not in the postmortem.** If a
  feature's rollback story is "submit a new build", it is not a rollback story.

## The upgrade path

React Native upgrades are the tax that determines whether this codebase is
alive in three years. Two rules keep the tax payable:

- **Upgrade on a cadence, not on a need.** A team that upgrades when it wants a
  feature upgrades across many versions at once, which is where the multi-quarter
  migrations come from. `mobile-simplicity` owns the version-lag counter.
- **Every native dependency is a veto on the next upgrade.** This is the real
  cost of a native module and the reason `mobile-simplicity` treats native and
  JS dependencies as different categories rather than different sizes.

Do not write specific RN version numbers into designs or docs. Name the
capability and feature-detect it; version numbers in prose are wrong within two
releases and nobody goes back to fix them.

## Choosing where a feature lives — worked examples

**Biometric login.** Needs a device API, renders a security surface, and the
result must be unforgeable. → native shell, exposed as a capability that returns
a signed assertion rather than a boolean.

**A chart-heavy analytics screen.** Ordinary interactions, changes often, no
gesture-critical animation. → RN host. If it later drops frames, that is a
`mobile-smoothness` attribution problem, not a reason to rewrite it native.

**A payment flow.** Unspoofable surface plus money. → native sheet, with amount
and payee bound server-side. Copy comes from remote config.

**A seasonal promo surface run by the marketing team.** Someone else's
schedule, no first-party dependency on it. → mini-app.

**A pull-to-dismiss gesture on the mini-app frame.** Gesture-critical and must
not wait on JS. → native, in the shell, per `mini-app-runtime`.

## Record the decision

A layer decision that is not written down gets re-argued, and the re-argument
usually loses the constraint that drove it. Publish through `design` rather than
as a separate artifact, using this shape:

```markdown
## <Feature> — layer decision

**Layer:** <native shell | RN host | mini-app | remote config>

**Why this layer:** <The one constraint that forced it. If the only reason is
preference, it belongs in the RN host by default.>

**Budget it must respect:** <Which budget from policy/budgets.md, and the
measured or expected headroom. "Should be fine" is not an entry.>

**What ships remotely vs in the binary:** <Name the parts explicitly. Every
threshold and string should be on the remote side.>

**Rollback story:** <How this is undone in under an hour. If the answer is
"submit a new build", say so plainly — that is a real cost, and a reviewer
should see it.>

**Skew tolerance:** <What happens on an N−2 shell.>

**One-way doors:** <Anything hard to undo once code depends on it. These are
what the design gate is actually for.>
```

Gate a layer decision when it puts something new in the shell, sets a contract
the mini-app plane depends on, or is hard to undo once code depends on it. Per
`autonomy-triage`, the rest is `auto` — moving a screen between RN files is not
an architecture decision.

## What does not belong here

- **Performance tuning and budgets.** `mobile-smoothness`. This skill decides
  layers; it does not profile.
- **Dependency or abstraction admission.** `mobile-simplicity`. "Where does it
  go" and "should it exist at all" are different questions, and answering the
  second here means it never gets asked properly.
- **Capability signatures, consent, or bridge protocol.** `native-capability`.
- **WebView lifecycle, packaging, isolation.** `mini-app-runtime`.
- **Generic technical design — sequence diagrams, data model, migrations, API
  contracts.** `design` covers those, and duplicating them means two documents
  eventually disagree about the same schema. This skill adds only what is
  specific to the mobile layer split.
- **Product flow.** Never. That is a human decision in `design`.

## Hand off

`mobile-simplicity` before admitting a new dependency, abstraction, or native
module. `mobile-smoothness` for the budget the chosen layer must respect.
`design` to publish the decision and gate the one-way doors.
