---
name: bridge-wiring
description: Implement a capability end to end after `native-capability` has settled its shape — the broker-or-permission decision, the native handler with its gates in order, quotas, audit, the terminal reply, and the SDK surface authors see. Use when someone says "wire up the camera", "implement the geolocation capability", "the bridge call hangs", "add a handler for this", or when a capability moves from approved design into code. Every check belongs in native code: if you are writing one in JavaScript, you have already drifted.
---

# Bridge Wiring

## Why this exists

One capability crosses four bands of the stack — the OS, the native shell, the bridge,
and the mini-app's page — and each band has different rules. An agent handed "wire up the
scanner" will naturally work in whichever band it opened first, and the result passes its
own test: the scanner scans. What it also does is skip a gate, cache a consent inside the
WebView, or return a raw platform error carrying a filesystem path.

That is the failure this skill exists to prevent, and note its shape: **it is never a
crash.** A miswired capability works. It ships, it gets used, and the defect is found by
someone outside the company. There is no failing test to catch it because the thing it
does wrong is not a malfunction — it is an authority leak wearing a working feature's
clothes.

The opposite failure is real too: an agent so worried about the security surface that it
gates its own internal helper, wraps every value in a handle, and produces a capability
nobody can call. `native-capability` already decided what may exist. Your job is to build
that, exactly, without adding authority and without adding ceremony.

## Before you write anything

Three preconditions. If any is missing, you are not ready to write code, and starting
anyway is how an unapproved capability acquires an implementation that then argues for
itself.

1. **It is in `policy/capabilities.yaml`** with a consent class, a tier, a quota, an audit
   level, an owner, and a support horizon. Not a draft in a ticket — the registry.
2. **The addition gated.** A new capability is a security-posture and public-contract
   change, so it is in the always-gate list of `autonomy-triage`. Check that the gate was
   answered, not merely raised.
3. **The permission question is settled** — see step 1. It changes what you build, not
   just how you configure it, so discovering it late means rewriting.

## The drift signal

**If you find yourself writing a check in JavaScript, stop.** Not "move it later" — stop
and move it now, because the JS version will be the one that gets trusted. Anything
checkable inside the sandbox is bypassable inside the sandbox: the author writes that
page, and can delete our stub and post to the raw handler.

The same signal in its other common disguises: adding a field to the request envelope
that native then trusts; caching a consent result in the page so the sheet stops
appearing; letting the SDK decide whether a capability is available. Each is the same
mistake, which is putting authority somewhere the author controls.

## Boundary selection — narrowest effective (from native-boundaries)

Not every capability is a TurboModule. Choose the narrowest that covers the need:

| Need | Preferred boundary | Notes |
|---|---|---|
| Stateless or ordinary native service (network, KV, crypto) | **TurboModule** with Codegen | Typed, async by default, lazy init |
| Native view, controller, or UI SDK (scanner, biometric sheet, permission sheet) | **Fabric component** | Props/events/commands, proper teardown, multiple instances |
| Cross-platform compute or binary processing (image decode, hash) | **Pure/shared C++ TurboModule** | Keep Swift/Kotlin for OS services |
| High-volume data path (camera frames, sensor) | **Native/C++ with coarse results** | Avoid per-sample JSON and chatty crossings |
| Simple host behavior | **TypeScript** | Do not introduce native maintenance without measured value |

Keep host policy *outside* the module — the module adapts the platform capability, it does not decide it. Lazy initialization stays lazy; do not start SDKs, register listeners, or do I/O in the module constructor.

## Contract design — small, stable, cancellable

Keep the TypeScript spec small and stable; it is the source of truth Codegen reads:

- Explicit nullable/optional semantics and bounded DTOs — bound collection size, nesting, string length, binary payloads *before* allocation.
- Structured error codes, not platform exception strings — the closed enum in `registry.ts` is the contract.
- Include cancellation — every operation that can outlive its caller (location, scanner, network) must be cancellable and idempotent on retry.
- Document which thread invokes native and which emits callbacks; avoid synchronous methods unless the value is immediately available and bounded.
- Do not expose native object handles to mini-apps; if React Native owns an opaque handle (e.g. image handle), validate type, runtime ownership, lifetime, and reuse.
- For events, define subscription/teardown — prevent listeners retaining an activity, view controller, or WebView after destruction.

Read `references/native-boundaries.md` in the reference skill when the capability creates or changes a native boundary.

## Step 1: settle the permission question first

The order here is not a preference. It determines the implementation.

1. **Can a broker picker do this with no OS permission at all?** Photos, documents, and
   contacts can. The picker *is* the consent gesture, so you get gate 2 and gate 3 for
   free and spend none of the host's one-shot permission. **This is the whole ballgame** —
   a capability built on a picker is a different, smaller, safer piece of code than one
   built on a raw permission, and reaching for the picker is the highest-leverage decision
   you will make in this file.
2. **If not, does a host-owned native capture UI return only the extracted result?** A
   scanner returns a string; a document capture returns a handle. Pixels and raw sensor
   data never enter the mini-app, which removes the exfiltration channel rather than
   policing it.
3. **Only then, an OS permission** — with a host-owned pre-prompt before it, and the
   rationing rule from `native-capability` about which tiers may spend it.

Write down which of the three you chose in the capability's registry entry. A reviewer
seeing option 3 where option 1 was available should send it back.

## Step 2: the handler, in this order

The order is the contract. Each step assumes the previous one ran.

```
1  identity      derive from the WebView instance's bound session
                 ∩ message security origin ∩ main-frame assertion
2  origin match  mismatch → drop, log SEC_*, terminate the instance.
                 Return nothing. An error is an oracle.
3  gate 1        is this capability declared in the signed manifest AND
                 granted in the store record for this publisher's tier?
4  arg validate  against the operation's schema. Reject unknown fields.
5  gate 2        consent record for (user, appId, capability, scope).
                 Missing → host-native sheet, gesture-bound.
6  gate 3        OS permission, and only now. Never before gate 2.
7  quota         token bucket. Exceeded → RATE_LIMITED + retryAfterMs.
8  execute       on a background queue. Never block the UI thread.
9  audit         capability, op, version, gate outcomes, argsDigest.
10 reply         exactly one terminal reply on the frame-scoped channel.
```

**Reordering breaks specific things, not abstract ones:**

| If you… | What actually happens |
|---|---|
| validate args before checking origin | you have parsed attacker input on behalf of an unidentified caller |
| ask the OS before gate 2 | you spend the host's one-shot permission for a mini-app the user never agreed to |
| check the quota before the gates | rate-limit responses become a probe for which capabilities exist |
| audit after the reply | a crash between the two loses the record of the call that caused it |
| execute on the UI thread | one slow capability is a host-wide freeze, not a slow mini-app |

## Step 3: the reply, and the errors

**Exactly one terminal reply per call**, on the frame-scoped reply channel so it is
dropped automatically if the frame navigated away. Arm a host-side timeout that produces
a terminal error rather than silence — a lost reply is the largest single source of
mini-app hangs, and the page cannot tell "slow" from "never".

**Errors come from the closed enum, never a string.** Two distinctions authors genuinely
branch on and which you must not collapse: consent-denied versus
consent-denied-permanently, and OS-denied versus OS-denied-permanently. Collapse them and
the author's only sane strategy is to prompt again, which costs us the permission for
everybody.

**Never pass a platform error through.** Template the message. Raw native errors carry
filesystem paths, tokens, and sometimes user data, and they end up in the author's own
logging where we cannot reach them.

**Cancellation that may already have landed returns the uncertain result**, not success
and not failure. An author who trusts a clean cancellation double-charges someone.

## Step 4: the SDK surface and the handshake

Inject the stub at document start, from the host. Mini-apps must not ship their own copy
or we cannot patch it. Then hold two lines:

**The stub is ergonomics, not a boundary.** Write it as if the author has deleted it,
because some will. It may shape calls and surface types. It may not decide whether
something is permitted, and it may not hold state that native then reads back.

**Authors feature-detect against the frozen handshake, never a version number.** Add the
capability and its operation list to the handshake object, freeze it before any author
script runs, and let `caps.payment?.ops.includes('confirm')` be the supported idiom.
Version sniffing breaks on every platform that back-ports, and it breaks silently.

Adding to the handshake is additive. Changing anything already in it is not — that is
`native-capability`'s versioning rules, and it gates.

## Stop and gate when

You will hit these mid-implementation. They are not blockers to work around:

- The capability turns out to need **more authority than the registry entry says** — a
  broader scope, a second OS permission, a wider egress host. That is a new surface, and
  it gates before the code exists, not after.
- A **new error code or a new consent class** is needed. Both are contract changes.
- The one-frame round trip **cannot be met** without holding data the capability should not
  hold. `mobile-smoothness` owns that budget and `native-capability` owns the contract; the
  answer is usually an async operation with a durable result, not a faster synchronous one.
- You need a **per-mini-app exception** to make a real app work. That is a compatibility
  grant in the store record with an owner and an expiry, per `mini-app-governance`, never
  a branch in capability code.

## Conformance

Checkable, so it holds on a change nobody reviews carefully. These belong in
`policy/conformance.md` and in CI:

- Every registered bridge handler has a matching entry in `policy/capabilities.yaml`, and
  every entry has a handler. A handler with no entry is an undeclared capability.
- No handler reads an identity, origin, or user field out of the request envelope.
- No consent, permission, or tier check appears in the injected SDK or any mini-app-facing
  JavaScript.
- Every handler has a test proving it returns a terminal reply on the timeout path.
- No handler returns a string that was produced by a platform error type.
- No handler accepts a filesystem path, and none returns an absolute path.
- Every handler emits an audit record before its reply.

## Worked examples

**"Wire up contact access so the mini-app can find friends."** → step 1 answers it: the
contact picker needs no OS permission, and the picker is the consent. Build the picker
path. A registry entry asking for list access should not have passed review — send it
back rather than implementing it.

**"The scanner works but the consent sheet shows up every time."** → correct until you
know the scope. `once` is per-operation by design. If the registry says `while-using` and
you are seeing a prompt per call, the consent record key is wrong, not the sheet.

**"Payment confirm needs the amount so the sheet can show it."** → the sheet is native
and reads the amount from the server-bound order, not from the call. If the amount is in
the envelope you have handed the author authority over money. → refuse, take the order ID.

**"Geolocation p99 is 400 ms, over the one-frame budget."** → acquiring a fix is not a
round trip. Split it: a fast capability that returns the last known fix, and a
subscription that streams updates. Do not widen the budget for it.

## What does not belong here

- **Whether the capability should exist, its consent class, its versioning rules.**
  `native-capability`. This skill builds what that one approved; if you are arguing about
  the shape, you are in the wrong skill and the argument gates.
- **Which tiers may request it, and the deprecation date.** `mini-app-governance`.
- **WebView configuration, origin, CSP, the package.** `container-wiring`.
- **What we publish to authors as documentation.** `mini-app-contract`.
- **The latency number.** `mobile-smoothness` owns it; you own meeting it.
- **A new abstraction over handlers** because there are now several. Capabilities are
  enumerated explicitly in native code on purpose — a generic dispatcher is on the
  never-expose list, and a "small helper" that takes a capability name is the first
  version of one.

## Hand off

`mini-app-contract` to publish the authoring surface once the handler works —
undocumented capabilities get used through reverse engineering, and then the reverse
engineering becomes the contract. `mobile-smoothness` for the round-trip measurement.
`human-gate` the moment the surface turns out to be wider than the registry says.
