---
name: native-capability
description: Design and review the single door from untrusted mini-app JavaScript to device and host functionality — bridge transport, call contract, the three permission gates, additive-only versioning, quotas, and audit. Use when someone says "expose the camera to mini-apps", "can a mini-app read contacts", "add a payment API", "why can't the mini-app just call this directly", or when adding, changing, or retiring any capability. Adding a capability is a security-posture and public-contract change, so it always gates.
---

# Native Capability

## Why this exists

An open bridge means a mini-app effectively owns the device, and our signature is on the
app that gave it away. The user blames us, the store blames us, the regulator asks us —
never the author. A bridge so restrictive nobody can build anything fails the other way:
authors leave, and the architecture was overhead for nothing.

Neither is the failure that actually happens. **The surface grows one reasonable request
at a time.** Every capability is defensible when someone asks — a partner needs contacts
for invites, a merchant needs the camera for a scanner, someone needs "just a generic HTTP
call, we'll allowlist it later". Each is fine. The aggregate is a rooted device, and there
is no meeting where anyone approved that. So the central mechanic here is not a catalogue
of what exists but a **ritual for adding**, because additions are where this is lost.

## The bridge is the only door

A mini-app reaches the device through a capability or not at all. No direct network, no
filesystem, no side channel for one special partner, no debug path that happens to be
reachable in production. **The moment there are two doors, only one gets reviewed.**

The corollary that gets resisted: **never enforce a permission in mini-app JS.** Anything
checkable inside the sandbox is bypassable inside it — the author writes that page and can
delete our SDK to call the raw handler. The injected SDK is ergonomics, not a boundary.
Every check lives at the native boundary or nowhere.

## Transport

| Path | Verdict |
|---|---|
| iOS: script message handler **with reply** | **Use.** Native promise semantics; the message carries unforgeable security origin, frame, and WebView identity. |
| Android: web message listener with origin rules and reply proxy | **Use.** WebView-enforced origin gate, frame-scoped reply dropped if the frame navigates away. Gate on the feature constant, never the API level. |
| Android: `addJavascriptInterface` | **Never.** Injected into *every* frame including iframes, zero origin information, historically reflection-reachable for remote code execution, synchronous on a background thread so native code is silently reentrant. |
| URL-scheme RPC (`myapp://call?json=…`) | **Never.** Truncation, encoding corruption, payloads leaking into history and `Referer`, no reply channel, triggerable by an `<img src>` — and decisively, indistinguishable from a real navigation, so you cannot tell an attack from a call. |
| `react-native-webview` messaging | Host-chrome coordination only. **Never for capabilities.** |

**The RN JS thread is not on this path.** Four reasons, each sufficient: two extra hops
inside a one-frame budget; RN JS can be blocked by unrelated host work or unmounted
mid-operation; origin evidence is native-only, so routing through JS degrades it from
*evidence* to *a claim*; and an RN JS error must never strand a payment. The host injects
the SDK stub at document start — mini-apps must not ship their own, or we cannot patch it.

## The call contract

**Identity is never in the payload.** No `appId`, `origin`, `userId`, or token — if the
envelope can carry identity, an author will forge it. Native derives it from the
WebView's bound session, intersected with the message's security origin and a main-frame
assertion. On mismatch: drop, log a security event, terminate the instance. **Do not
return an error — an error is an oracle**, and a probing author maps the surface with it.

**Every resource identifier the bridge accepts is a host-minted, instance-scoped handle —
never a caller-constructed name.** This one rule closes an entire class: mini-app A asking
for B's stored value, or passing B's order ID to a payment confirm. Namespacing happens
natively, never by concatenating a caller-supplied string.

**Errors are a closed enum, never strings**, and the distinction that matters is
consent-required versus permanently-denied versus OS-denied versus OS-denied-permanently.
Tell an author the truth and they build a fallback; blur it and they prompt-spam the
user, which costs us the permission. Messages are template-generated: a raw native error
string carries paths, tokens, sometimes user data.

**Every call terminates in exactly one reply**, with an SDK watchdog past the deadline to
synthesize a timeout — a lost reply is the largest single source of mini-app hangs, because the
page cannot tell "slow" from "never". **Cancelling something that may already have landed
returns an explicitly uncertain result**; an author who trusts a clean cancellation you
cannot guarantee will double-charge someone.

**Streams coalesce and drop, never queue** — an unbounded queue turns a slow consumer into a
memory leak — and **large payloads return an expiring handle** rather than bytes.

**Camera frames never cross the bridge.** The encoding cost is real, but the reason is that
a frame pipe is a perfect exfiltration channel. Default to a host-owned native capture UI
returning only the extracted result — the barcode string, a host-stored image handle. Reserve
in-page media capture for genuine realtime video at the highest tier, where pixels also
never cross the bridge.

**The money rule: the mini-app never supplies the amount as authority.** Order creation
returns a host- and server-created order with amount and payee bound server-side;
confirmation carries only the order ID, a single-use short-expiry nonce, and an idempotency
key. **The payment sheet is native, not WebView DOM**, so the amount the user sees is
authoritative, and **a biometric result is a hardware-backed signature over the order ID,
never a boolean** — a boolean is a value the page can fabricate.

## Three gates, never collapsible

| Gate | Who decides | When | Denial |
|---|---|---|---|
| G1 declaration and review grant | reviewer and policy | publish time | not declared / not reviewed |
| G2 runtime consent, per mini-app | the user, in host-native UI | first meaningful use | consent required / denied |
| G3 OS permission, per **host app** | the user, in the OS prompt | first use across the host | OS denied |

**The order G1 → G2 → G3 is mandatory.** Ask the OS first and you have spent the host's
one prompt on behalf of a mini-app the user never agreed to use.

These collapse into one in almost every first draft, because from inside the code they all
look like "check permission". They are three principals answering three questions, and
merging any pair is a real bug: merge G1 and G2 and review silently consents on the user's
behalf; merge G2 and G3 and one mini-app's ask becomes a host-wide ask.

## The OS prompt is a shared, non-renewable resource

The hardest constraint here, and it cannot be engineered away: **the OS permission is
per-host-app and effectively one-shot.** Android turns repeated denial into permanent
refusal; iOS largely gives one chance then sends the user to Settings. The OS also
attributes the access to *us* — our name in the privacy indicator. So one sketchy mini-app
asking for Contacts can permanently destroy the host's ability to use Contacts, for every
other mini-app and for our own features. In priority order:

1. **Do not need the permission.** The highest-leverage decision in this skill. The
   platforms provide broker pickers — photos, documents, contacts — requiring *no*
   permission, because the picker itself is the consent gesture. **The corollary:
   capabilities that hand over a bulk dump should not exist.**
2. **A host-owned native pre-prompt** naming the mini-app, the capability, and the
   author's stated purpose, with a "Not now" that does not touch the OS. This turns the
   OS prompt from a surprise into a confirmation, which is what keeps the grant rate
   high enough to preserve the resource.
3. **Ration who may trigger a prompt.** While a permission is undetermined, only
   mini-apps above a trust threshold may spend it. Unfair to new authors, and correct:
   the resource is shared and spending it is irreversible.
4. **Sequence the first ask through our own flows**, and **never re-prompt after
   permanent denial** — deep-link to Settings instead.
5. **Provide our own attribution**, since the OS blames us: a native indicator naming the
   active mini-app during camera, microphone, or location use, plus an inspectable
   per-mini-app access log.

## Consent scope, and fatigue

Scopes are `once`, `while-using`, `session`, `persistent`; default to `while-using` for
anything sensitive. **`persistent` needs an explicit reviewer grant, not merely an
author request** — an author asking for forever is not evidence they need it.

- **Bundle at first meaningful use, never at launch.** A mini-app asking for six things on
  open is a review failure, not a UX preference.
- **No consent prompt without a preceding user gesture** — native records the last touch
  inside the WebView and requires it to be recent. This kills drive-by prompts, and works
  precisely because it is checked natively.
- **The picker *is* the consent.** Never a sheet then a picker for the same action — the
  user agrees twice to one thing and learns our sheets are noise. Cap prompts per
  session, and stop permanently after repeated denial.

Revocation invalidates the consent record, terminates live streams with a distinct
reason, invalidates every outstanding handle **immediately rather than lazily**, and is
re-checked per call, never cached inside the WebView.

## Versioning: additive only

Five hundred shipped mini-apps cannot be made to update. So:

- New **optional** request fields and new response fields only; a new required field is
  a new operation. Never change a field's type, units, or nullability.
- **Widening a response enum is breaking** unless the contract mandated a default branch
  from day one. Mandate it from day one and lint for it.
- Never tighten validation on an existing operation; tightening is a new version.
- Never silently move an operation from non-prompting to prompting — callers built their
  UX around it not prompting.
- Never change an error code's meaning, and never reuse a retired one.
- **Feature-detect against a frozen capability handshake, never the host version.**
  Version sniffing breaks on every platform that back-ports.

Keep the previous two versions behind shims, tested against **recorded real mini-app
traffic** rather than our idea of how they call it, and never branch on a mini-app's identity
inside capability code. The one escape hatch is a signed per-app compatibility flag held **in
the store record, not the author's manifest** — capped, and **reported as a metric**, because
if that count grows the discipline has already failed and you want to know before the surface
is unsecurable. **The axis people forget is the WebView version, not the OS version.**

## Quotas and audit

Token buckets per mini-app per capability with per-operation cost weights, plus a global
bucket per mini-app and one per host process. Return a retry hint rather than failing
opaquely; suspend an instance on sustained abuse. Audit is an append-only, hash-chained log
carrying capability, operation, version, the three gate outcomes, result code, duration, and
an **argument digest — never the arguments.** Logging payloads recreates the data-exposure
problem inside our own infrastructure, and this log is what a regulator reads.

## Scope boundary — host only

Apply this skill only to the host-owned capability contract and broker — typed name/version, request/response/events/error taxonomy, permission/consent, threading/cancellation/timeout/lifecycle, payload size, backward compatibility, telemetry. Do not implement a mini-app's *consumption* of the capability under this skill. A change to the broker is in scope; calling it from a mini-app is `mini-app-contract`.

## Adding a capability — define the vertical slice before code

A new capability changes the security posture *and* sets a public contract, so it is
already in the always-gate list of `autonomy-triage`. You are not judging whether to gate;
you are packaging one per `human-gate`. Define *before* implementation, in this order:

- stable name and version
- typed request, response, events, and error taxonomy (closed enum — this skill owns it)
- permission and user-consent behavior (which of the four: mini-app declaration, host permission, host policy, user consent)
- threading, cancellation, timeout, and lifecycle semantics (what happens on background/kill/revoke)
- payload size/frequency and ownership of binary data (handle-only vs bytes, never raw frames)
- backward compatibility and unsupported-version behavior
- telemetry fields that exclude secrets and unnecessary personal data
- consent class and scope; whether an OS permission is required and whether a broker picker avoids it; quota; audit level; **who owns it and its support horizon**; and what a mature mini-app platform deliberately does *not* expose here. That last line catches more bad ideas than any other.

Do not silently change the runtime model or the bridge transport to support the capability. If it requires a new native view, a new thread, or a new permission, explain and obtain direction first.

## Never over the bridge

`policy/capabilities.yaml` is the registry — current surface, tier reach, rate and payload
ceilings, and the full never-expose list, so it grows without editing this skill. That
list is led by the rule that makes review meaningful at all:

- **No dynamic code execution or loading, in any form.** No evaluation capability, no remote
  script outside the signed package, no remote config that is really code. *If a mini-app
  can fetch code at runtime, you reviewed nothing.*
- **No raw filesystem path in either direction.** File capabilities take handles, minted only
  by a user-driven picker or the mini-app's own root, canonicalized *before* the containment
  check. Never return an absolute path.
- **No host credentials, no persistent cross-app identifier, nothing reflective or
  generic.** No native-module invoker, no method dispatcher. Identifiers include the
  platform's per-vendor ID, host-wide and therefore linking a user across every mini-app;
  issue a per-mini-app pseudonymous ID instead.
- **No bulk personal data** — contact list, call log, messages, installed apps, media
  enumeration, calendar export; pickers only. **And no raw biometric material, nor
  "biometry succeeded" as a boolean.**

## Non-negotiable host invariants — the broker enforces these

Borrowed from the host reference — treat as hard gates, not guidance:

- Treat all mini-app packages, manifests, messages, URLs, persisted state as untrusted input.
- A JS/WebView runtime is not a security sandbox — isolation is the container, not the context.
- Never expose unrestricted filesystem, networking, native-module lookup, reflection, code loading, or credential access.
- Never place long-lived secrets in JS bundles, mini-app storage, logs, or bridge payloads (audit logs carry digests, not args).
- Enforce capability permissions in the host, not only in mini-app UI — every handler re-checks G1→G2→G3 on every call.
- Make lifecycle transitions idempotent and cancellation-safe — a revoked consent or terminated WebView must cancel in-flight work exactly once.
- Correlate telemetry across host/runtime/native without logging sensitive payloads.
- Preserve accessibility, dynamic type, reduced-motion, localization, RTL, safe areas, and back conventions — haptics and motion are separate skills.
- Scope and bound: storage namespaces/quotas, network destinations/redirects/cookies/headers, concurrent ops/timers/message rate, background wakeups — apply backpressure before queues grow, cancel on terminate/logout/revoke.
- A capability that is purpose-specific (`selectPhoto`, `createPaymentIntent`) is safer than a generic one (`readFile`, `fetch`) — prefer the former.

## Avoid default mistakes — the capability kill

These are the most common ways a well-meaning capability becomes a privileged one:

- Routing high-frequency camera/sensor/binary data through JSON messages — keep pixels native, return the decoded result.
- Wrapping a native UI SDK as a service module instead of a Fabric component — permission sheets and pickers are views, not `getX()` calls.
- Letting mini-apps discover or call TurboModules directly — the broker is the only door, no `NativeModules` passthrough.
- Treating memoization as a performance fix for a chatty bridge — batch or make it async instead.
- Replacing native platform behavior for pixel-identical UI — the host sheet's correctness matters more than its shade.
- Adding global mutable singletons that ignore multiple WebView instances or teardown — scope by `(tenant, appId, user)`.
- Assuming an OTA can change a native contract already shipped — additive only, host must accept old+new during the window.

## Worked examples

**A partner wants the full contact list to find friends.** Bulk dump. → refuse. Offer
the contact picker, which needs no OS permission, or server-side matching on hashed
identifiers the user submits deliberately.

**A merchant wants the camera to scan a barcode.** → host-owned native scanner returning
the decoded string. No pixels cross the bridge, and on one platform no camera permission
is needed at all.

**A mini-app wants generic HTTP to call its own backend.** Legitimate need. → a host-executed
capability against manifest-declared hosts: no cookies, stripped referrer, quotas, logging.
Never a pass-through, never a wildcard host.

## What does not belong here

- **The consent sheet's layout and copy.** User-perceivable, therefore taste — `design` plus
  a human gate. This skill states the constraints and refuses to design it.
- **Which tier may request what, publisher policy, and the deprecation calendar.**
  `mini-app-governance`. This skill owns the compatibility rules; governance owns the
  enforcement dates and author outreach.
- **WebView lifecycle, isolation, packaging.** `mini-app-runtime`. This skill builds the
  door; that one builds the box. Host-internal native modules no mini-app ever calls are
  `mobile-architecture`.
- **Any check that lives in mini-app JavaScript.** Stated twice on purpose.

## Hand off

`bridge-wiring` to build it once the shape is settled — that skill owns the order of
operations, this one owns the contract. `human-gate` for the surface change, always.
`mini-app-governance` to set which tiers may request it. `mini-app-contract` to publish it
to authors. `mobile-smoothness` for the one-frame round-trip budget.
