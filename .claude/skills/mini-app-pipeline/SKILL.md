---
name: mini-app-pipeline
description: Build the machinery `mini-app-governance` decided on — the signing chain and key rotation, the automated review checks and which of them block, declared-versus-actual analysis, staged rollout with health gating, and revocation that works by expiring authority rather than by reaching the device. Use when someone says "set up signing", "add a review check", "wire the kill switch", "how do we verify what the bundle actually calls", or "build the rollout ramp". A bypass for one named publisher means you have drifted.
---

# Mini-App Pipeline

## Why this exists

Governance decides who is trusted with what. None of that is worth anything until
something mechanical enforces it, and the gap between a written policy and a running check
is where third-party platforms actually get compromised. A tier that exists only in a
spreadsheet is not a tier.

The specific failure is that **the pipeline gets built to pass the apps you have.** You
test it against four cooperative first-party packages, everything is green, and the checks
that would have caught a hostile package were never exercised because no hostile package
existed yet. Then one arrives and the pipeline reports success. A review pipeline needs
adversarial fixtures more than it needs real ones.

The opposite failure is a pipeline so slow or so noisy that humans start overriding it.
Every override teaches the next person that the checks are advisory, and a check everyone
overrides is worse than no check, because it manufactures a false record of review.

## The drift signal

**If you are adding a code path keyed to a specific publisher or mini-app, stop.** Not
"add it and clean up later" — that branch is permanent the moment something depends on it,
and it is invisible to everyone who did not write it.

There is exactly one legitimate form of per-app variation: a compatibility grant in the
store record, with a named owner, an expiry date, and a metric counting how many exist.
Anything else — an allowlist in the checker, a tier override in the signer, a skip flag for
a partner's build — is the same drift, and each instance makes the tier system mean less.

The second disguise: turning a blocking check advisory to unblock a launch. That is not a
pipeline change, it is a governance decision, and it gates.

## Step 1: the key hierarchy

- **Pin a root of trust in the host binary.** It is the one thing that cannot be rotated
  remotely, so it signs as little as possible and does nothing else.
- **Cross-sign a store signing key from that root**, and use the store key for releases.
  **The store key must be rotatable without a host release** — if rotation needs store
  review, a key compromise takes weeks to fix, which is the whole window an attacker needs.
- **Require both signatures on every package.** The store signature authorizes, because the
  store is who reviewed. The author signature attributes. With one only, a store-key
  compromise forges attribution and an author-key compromise bypasses review.
- **Sign the canonicalized manifest, never the archive.** The manifest carries a hash-tree
  root over the assets, so the archive stays transport and your zip parser never becomes a
  trust boundary.
- **Author keys live with the author.** If we can sign on an author's behalf, the author
  signature attributes nothing, and the whole two-signature argument collapses.

## Step 2: the checks, and which block

Automated first, humans last. Every check reports the same structured result so the
pipeline can be read by a machine and by a person under time pressure.

| Check | Blocks? |
|---|---|
| Both signatures valid, hash tree matches, archive entries safe | yes, at every tier |
| Manifest validates against the published schema | yes |
| Declared capabilities match what the bundle calls | yes — see step 3 |
| No dynamic code execution or remote script loading | yes, at every tier |
| Declared network hosts contain no wildcards and resolve | yes |
| Capability diff against the previous version | routes to a human, does not block alone |
| Purpose string present for every declared capability | yes |
| Package size and file-count ceilings | yes |
| First-paint smoke on the low tier | advisory, except at a hard ceiling |

**Blocking is the default and advisory is the exception that must be argued.** A check
added as advisory "for now" stays advisory, and its findings become a report nobody reads.

## Step 3: declared-versus-actual

This check does more work than all the others together, so build it first and build it
properly.

Static analysis of the bundle for every bridge invocation, resolved against the manifest's
declared capability list. **A mismatch is a rejection, not a warning** — a package calling
seven capabilities while declaring three is either careless or probing, and the diff cannot
tell you which. Treating it as a warning means you have decided in advance to trust the
careless explanation.

Two things that make this check honest rather than theatrical:

- **Minification and indirection defeat naive matching.** An author calling through a
  computed property name will pass a grep. Accept that the check is a floor, not a proof,
  and pair it with the runtime signal: a capability invocation that was never declared
  should be refused *and* logged as a security event, so the gap between static and runtime
  is observable rather than assumed.
- **Adversarial fixtures are part of the check.** Keep a suite of packages that should fail
  — undeclared capability, remote script fetch, wildcard host, path traversal in the
  archive, mismatched signature — and fail the build if the pipeline passes any of them.
  This is the only thing that stops the pipeline quietly degrading into an approver.

## Step 4: rollout and health gating

Ramp every submission below first-party tier. **Bucket by mini-app identity, never per
request** — per-request randomization produces bug reports nobody can reproduce and burns
your credibility with authors permanently.

Define the halt conditions before the ramp starts, and wire them to automatic action:
crash and renderer-death rate attributable to the mini-app, bridge error rate, consent
denial rate, quota violations, abuse reports, and any security event. **A rollout with no
automatic halt is not staged, it is just slow.** A human decides whether to resume, and
that decision is precedent worth recording.

Attribute crashes to the mini-app, not to the host. On Android a renderer death may take
the host process with it, so the naive signal blames us; without per-instance attribution
the health gate cannot see the app that caused it.

## Step 5: revocation, built as authority expiry

**Build the server-side path first, because it is the only one that always works.** A
high-risk capability requires a server-signed token; revoke it and a running instance goes
inert on its next call. Everything else is an accelerant.

Then, in descending reliability: the signed channel pointer checked at every open; an
existing foreground connection; a foreground poll while a mini-app is open; and silent
push, which you must treat as best-effort — it is throttled and droppable, and a design
that depends on it has no kill switch at all.

Two things to get right in the implementation:

- **The pointer carries a monotonic sequence number, and the device stores the highest seen
  in platform secure storage.** A lower sequence is rejected. Without this, an attacker who
  keeps an old signed pointer can replay it and reinstate a revoked version forever.
- **Revocation granularity includes version.** "Kill 3.4.1, keep 3.4.0" is the common real
  need; a whole-app kill punishes users for a publisher's bad release.

Make the freshness policy explicit in code rather than emergent: low-risk capabilities work
with a stale pointer so mini-apps function offline, and high-risk capabilities require a
fresh one, which means they require network. **You do not need the kill to reach the
device; you need the authority to expire.**

## Stop and gate when

- A blocking check would have to become advisory, or be skipped for anyone.
- A tier's capability reach, a size ceiling, or a rollout constraint needs changing. Those
  are `mini-app-governance` decisions with real consequences, not pipeline configuration.
- The key hierarchy changes shape, or a key needs to live somewhere new.
- An incident reveals the flaw is in a capability rather than in one app. That is a surface
  change and it goes through `native-capability` and `human-gate`.
- You cannot attribute a health signal to a mini-app. Shipping a health gate that cannot
  see its subject is worse than shipping none, because it will be trusted.

## Conformance

In `policy/conformance.md` and in CI:

- The adversarial fixture suite runs on every pipeline change, and the build fails if any
  fixture is admitted.
- No publisher identifier or mini-app identifier appears in signer, checker, or rollout
  code. Compatibility grants live in the store record and are counted as a metric.
- Every check declares blocking or advisory in one place, and advisory entries carry an
  owner and a date.
- A test proves a lower pointer sequence number is rejected.
- A test proves a high-risk capability fails closed when its server token is revoked.
- The manifest validator and the published schema are the same artifact, not two copies.

## Test matrix — what the pipeline must prove (from host reference)

Cover at least these, relevant to the change:

- valid, unsigned/invalid-signature, corrupted, oversized, incompatible, and rolled-back packages
- allow, deny, revoke, OS-deny, expired consent, and identity change (tied to `native-capability` gates)
- malformed fields, unknown capability/version, oversized payload, burst rate, timeout, cancel, duplicate response, completion after teardown (broker contract)
- offline, slow network, redirected request, partial download, storage full, low memory, native SDK failure
- host upgrade/downgrade combos within the supported N−2 window (`mobile-architecture`)

Measure package verification/install/rollback, broker latency (p50/p95), denials, cancellations, and native failures with `appId` and package version as bounded dimensions — never log sensitive payloads.

## Worked examples

**"Signature verification is slow on the low tier, can we verify at install only?"** →
refuse. Verification at open is what makes a tampered cache detectable; the cache sits on a
device we do not control. If the cost is real, measure it per `mobile-smoothness` and
optimize the hashing, not the trust model.

**"A partner's build tool can't produce the author signature yet, ship without it."** →
refuse. Unsigned is on the never-admit list. Give them a sandbox tier while they fix the
tool.

**"Declared-versus-actual keeps flagging a minified bundle that is actually fine."** →
tighten the author-side requirement rather than loosening the check: require the capability
list to be statically resolvable, and document that in `mini-app-contract`.

**"Rollout halted on a crash spike but it was our renderer bug, not theirs."** → the
attribution is wrong, which is a pipeline defect. Fix attribution before resuming, or the
gate will halt innocent apps and get switched off.

## What does not belong here

- **Trust tiers, review depth, admission decisions, deprecation dates.**
  `mini-app-governance` decides; this skill enforces.
- **What a capability is and its versioning rules.** `native-capability`.
- **On-device verification and teardown.** `mini-app-runtime` and `container-wiring`.
- **The manifest schema authors write against.** `mini-app-contract`.
- **Host app release and store submission.** `mobile-architecture` and `ship`.
- **Judging a package for malice by reading it.** That does not scale and does not work;
  the controls are the sandbox, the surface, the ramp, and revocation.

## Hand off

`mini-app-governance` with the pipeline's actual pass and reject rates — a policy nobody can
measure against is the next thing to drift. `container-wiring` for what the device must
enforce at open. `human-gate` for any check that is about to stop blocking.
