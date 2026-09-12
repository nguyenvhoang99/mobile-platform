---
name: mini-app-contract
description: Write and change the surface third-party authors build against — the manifest schema, the frozen capability handshake, the SDK shape, the error codes they branch on, and the honest statement of which web platform features are unavailable. Use when someone says "document this capability", "what can authors rely on", "the manifest needs a new field", "authors keep getting this wrong", or before any capability reaches its first external developer. Documenting behaviour the native side does not enforce means you have drifted.
---

# Mini-App Contract

## Why this exists

Everything in this file is a promise to people you cannot call. Once five hundred
mini-apps are shipped, a documented behaviour is load-bearing whether or not you meant it
to be, and whether or not it was ever true — authors build on what they observe, and what
they observe becomes the contract the moment enough of them observe it.

So the failure is not a wrong sentence in a doc. It is that **an undocumented capability
still gets used.** An author reverse-engineers the handler, discovers a field we never
promised, ships against it, and now that field cannot change. The reverse engineering
became the contract, and nobody chose it. Writing the contract down is how you keep the
authority to change your own code.

The opposite failure is over-promising: documenting a nicety the native side does not
actually enforce, or a timing we have not measured. That is worse than silence, because it
is cited back at you during an incident.

## The drift signal

**If you are documenting a behaviour the native side does not enforce, stop.** Not
"document it and file a ticket" — the doc will ship and the ticket will not. Every sentence
in the contract must correspond to something a handler checks, a header sets, or a
signature covers. If you cannot point at the enforcement, the sentence is a wish, and
authors will build on it.

Two disguises: writing "the SDK will prevent…" when the SDK is ergonomics and not a
boundary, and writing "you should not…" for something the platform permits. If we permit
it, some author will do it, so either enforce it or stop pretending it is a rule.

## What the contract actually is

Five artifacts, versioned together, and nothing else counts as the contract:

| Artifact | What it fixes |
|---|---|
| Manifest schema | every declaration an author makes: capabilities, hosts, pages, splash, minimum WebView |
| Capability handshake | what is available at runtime, frozen before any author script runs |
| SDK surface | the call shape, the promise semantics, the types |
| Error enum | every terminal outcome an author can branch on |
| Platform statement | which web features are present, and which are not |

A behaviour that is not in one of those five is not promised, and the docs must say that
explicitly rather than leaving it ambiguous — silence reads as permission.

## The platform statement, told honestly

This is the section authors need most and the one most likely to get softened.

**The mini-app platform is defined at the iOS level, and that level is below the open web.**
Custom-scheme pages on iOS are not secure contexts, which removes the Web Crypto subtle
API, Service Workers, and WebAuthn. Android's origin does not have that limitation, and we
still do not offer those features — because a platform where something works on one OS and
not the other is worse for authors than one that never offered it.

So state plainly, in the authors' documentation and not only in ours:

- **No Web Crypto, no WebAuthn, no Service Workers.** Crypto, authentication, and caching
  are bridge capabilities instead.
- **No cookies, no `localStorage`, no `IndexedDB`.** Persistence is a bridge capability,
  scoped per mini-app and per user, with a quota.
- **No direct network.** `fetch` to a foreign origin is blocked by policy and by CSP. Use
  the host request capability against hosts declared in the manifest.
- **No iframes, no new windows, no navigation off the mini-app's own origin.**
- **A minimum WebView version, declared per mini-app** — and the reason it exists: the axis
  that breaks authors is the WebView version, not the OS version.

Name what they get in exchange: an atomically verified package, offline by default, no
cache-invalidation class of bug, and capabilities they could not reach from a web page.

## The manifest is the whole declaration

Every authority a mini-app can hold is declared here and granted at review. Design the
schema so that is obvious rather than incidental:

- **Capabilities are declared with a purpose string each**, and a purpose string is
  user-facing copy on our surface — so it is subject to `design`, not just to validation.
- **Network hosts are declared explicitly.** No wildcards. The declaration derives both the
  CSP `connect-src` and the native egress allowlist, so an author who omits a host gets a
  blocked call rather than a silent one.
- **Pages are declared.** Anything else 404s at the handler.
- **The author may tighten our CSP, never loosen it.** Say so in the schema documentation,
  because the intersection behaviour surprises people who expect a union.
- **Version is a monotonic integer for machines and a semver string for humans**, and every
  enforcement uses the integer. Explain that rollback is a roll-forward with older content,
  so authors do not expect to republish an old version number.

## Feature detection, never version sniffing

Publish the handshake as the only supported way to ask what exists, and make the ergonomic
idiom the correct one — authors copy the first snippet in the docs, so that snippet is your
real policy.

Document that the handshake is frozen before author script runs, that capabilities appear
in it only when granted for that mini-app's tier, and that a capability's absence is a
normal runtime state rather than an error. Then require a fallback: show the branch, not
just the happy path, or every author ships the happy path.

**Mandate a default branch on every response enum from day one.** Widening an enum later is
breaking unless the contract required a default from the start — this is the cheapest thing
you can do now to keep the ability to evolve later.

## Errors authors must be able to branch on

The enum is the contract's most-read part, because it is what authors see when something
goes wrong at 2am. Two distinctions carry most of the value and must never be collapsed:

- **Consent denied, versus denied permanently.** The first invites a better moment; the
  second means build a fallback and stop asking.
- **OS permission denied, versus denied permanently.** The second means the user must go to
  Settings, and an author who cannot tell the difference will prompt-spam — which costs the
  permission for every mini-app and for our own features.

Also document: which codes are retryable and with what backoff, that the uncertain-cancel
outcome is real and must be reconciled by querying rather than assumed, and that unknown
codes may appear and must map to a generic failure rather than crashing.

## Changing the contract

Additive changes — a new optional manifest field, a new capability in the handshake, a new
error code — ship with the release. Everything else follows `native-capability`'s
additive-only rules and gates.

Two rules specific to the published surface:

- **Deprecation warnings go in development builds only.** A console warning in production
  defaces a third party's UI, and it is our name on the app.
- **The docs and the enforcement ship together.** Documentation ahead of enforcement invites
  authors to build on something that does not exist; enforcement ahead of documentation
  breaks them without notice.

## Contract evolution — negotiated, additive, tested (host reference)

Negotiate a capability version or feature set explicitly via the frozen handshake — never via host version sniffing. Keep additive changes backward compatible where practical; do not change the meaning of an existing field silently; return a stable `unsupported_version`/`unknown_capability` instead of crashing. Test the current host against every supported contract version and, when distribution permits, test a new mini-app against the oldest supported host (N−2). Generate schemas and adapters from one source of truth when Codegen supports it — the manifest schema *is* the validator, and transport details stay out of application policy. For risky changes, follow `mini-app-governance`'s compatibility window: host accepts old+new, observe, move mini-apps, then remove old.

## Stop and gate when

- A new capability, scope, error code, or consent class appears. All are contract changes
  per `native-capability`.
- A purpose string or any user-facing copy is being written. That is taste — `design` plus a
  human gate.
- You are about to document a limit we do not enforce, or remove a documented behaviour.
  Removal follows the deprecation calendar in `mini-app-governance`; there is no quiet path.
- Authors repeatedly get the same thing wrong. That is a contract defect, not an author
  defect, and the fix may be a schema change rather than a doc change.

## Conformance

In `policy/conformance.md` and in CI:

- Every capability in `policy/capabilities.yaml` has a documented entry, and every
  documented capability exists in the registry.
- The manifest schema is machine-readable and the review pipeline validates against that
  same file, so the doc and the check cannot drift apart.
- Every error code in the published enum is producible by some handler; every code a
  handler can return is published.
- The documented platform statement is asserted by a test that runs each listed unavailable
  feature inside a real container and confirms it is absent.
- No production build emits a deprecation console warning.

## What does not belong here

- **Whether a capability should exist, and its versioning rules.** `native-capability`.
- **Which tiers may request it, admission, and deprecation dates.** `mini-app-governance`.
- **The handler and the SDK implementation.** `bridge-wiring`. This skill writes what the
  surface promises; that one makes it true.
- **Container configuration.** `container-wiring`.
- **Marketing, onboarding funnels, developer-portal design.** Not a platform contract.
- **Any promise you cannot point at an enforcement for.** Stated twice on purpose.

## Hand off

`design` for every purpose string and any author-visible copy. `mini-app-governance` to
schedule anything being retired and to run the outreach. `bridge-wiring` when the contract
turns out to promise something the handler does not yet do — that is a code change, and
until it lands the sentence does not ship.
