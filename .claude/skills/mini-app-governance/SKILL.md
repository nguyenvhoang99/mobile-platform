---
name: mini-app-governance
description: Admit, publish, police, and remove third-party mini-apps — trust tiers, the signing chain, the review pipeline, staged rollout, revocation, the deprecation calendar, and incident response. Use when someone says "a partner wants background location", "this mini-app is abusing the bridge", "how do we retire an old API", "can we let them ship faster", or when a publisher needs onboarding, a tier change, or removal. Governance decides and broadcasts; `mini-app-runtime` obeys and tears down.
---

# Mini-App Governance

## Why this exists

With no review, a hostile mini-app reaches users under our brand, with our signature
and our permissions, and the first anyone hears of it is a journalist. The author is
anonymous by then, and the damage is ours to explain.

With heavy review, no third party ever ships. Onboarding takes six weeks, every update
queues behind a human, and the mini-app platform has no mini-apps. That failure is
quieter and therefore more likely — nobody writes a postmortem for a marketplace that
just never filled up.

The resolution is the same one the delivery process uses: **automated gates first, humans
last, and only on the questions a human is uniquely able to answer.** If review is a person
reading someone else's JavaScript looking for malice, it does not scale and it does not
work. If review is a pipeline of automated checks with a human deciding brand, legal, and
tier, it scales, and the human decisions compound into policy.

The other thing to be honest about up front: **we cannot technically prevent a mini-app
from misusing data we legitimately gave it.** Once a contact or a location has crossed the
bridge, exfiltration is a policy problem — host-mediated egress raises the cost and gives us
telemetry, but a determined author can encode data into allowed requests. That is precisely
why review, staged rollout, and revocation are load-bearing rather than belt-and-braces:
they are the controls that remain when the technical ones are exhausted.

## Trust tiers

| Tier | Who | Capability reach | Review depth | Rollout |
|---|---|---|---|---|
| First-party | our own teams | all, including the highest risk | automated plus owning-team sign-off | normal release process |
| Partner-verified | contracted, identity-verified, named contact | up to high-risk, per contract | automated plus human review of every capability change | staged, health-gated |
| Self-serve | registered developer, verified email and payment identity | low and medium risk only | automated, human spot-check on first submission and on any capability change | staged, slower ramp, hard install ceiling until seasoned |
| Sandbox | anyone, dev builds only | test capabilities against fixtures | none | never reaches real users |

**Tier is a property of the publisher, not the app**, and it only moves on evidence: identity
verification, contract, time in market without incident. A tier is never raised "temporarily"
to unblock a launch — that is how the tier system stops meaning anything, and it always
happens under deadline pressure with a plausible reason.

`policy/capabilities.yaml` holds which capabilities each tier may request.
`native-capability` decides what a capability *is*; this skill decides who may ask.

## The signing chain

Root of trust pinned in the host binary → a cross-signed store signing key that can be
rotated without a host release → a per-release signature over the canonicalized
manifest. `mini-app-runtime` enforces verification; this skill owns the keys.

**Two signatures, two meanings.** The store signature says *we reviewed and authorized
this*. The author signature says *this publisher produced it*. Requiring both means a
store-key compromise cannot forge attribution and an author-key compromise cannot
bypass review.

**The store signing key must be rotatable without shipping a host update.** If rotation
requires a release, then a key compromise requires store review to fix, which is a
multi-week window. Cross-signing from the pinned root is what buys that.

**Record build provenance** — builder identity, source digest, timestamp — in the manifest.
Its value is at incident time: it is how you answer "was this the code we reviewed"
without taking the publisher's word for it.

## The review pipeline

Automated first, and each stage is blocking unless marked advisory:

1. **Package integrity.** Signature, hash tree, archive-entry safety, size ceilings.
2. **Manifest coherence.** Declared capabilities, declared network hosts, declared
   pages, minimum WebView version, all internally consistent.
3. **Declared-versus-actual.** Static analysis of what the bundle actually calls
   against what the manifest declares. **A mismatch is a rejection, not a warning** — a
   package calling seven capabilities while declaring three is either careless or
   probing, and you cannot tell which from the diff.
4. **Dynamic-code detection.** Any evaluation, remote script fetch, or
   config-that-is-really-code. Blocking at every tier.
5. **Privacy surface.** What personal data is requested, whether a purpose string
   exists for each, whether the privacy policy covers it.
6. **Capability diff against the previous version.** Newly added capabilities, new
   egress hosts, and new consent classes are the highest-signal fields in any update,
   and they are what routes a submission to a human.
7. **Performance smoke.** Package size, first-paint on the low tier. Advisory except at
   hard ceilings — a slow mini-app is bad for us but not dangerous.

## What a human reviewer actually decides

Bounded on purpose. Anything not on this list should be automated, and if it cannot be
automated it is a policy gap, not a reviewer's judgment call:

- **Brand and content.** Does this belong next to our name.
- **Legal and regulatory.** Licensing, age-gating, jurisdictional restrictions, whether
  a financial or health claim needs sign-off.
- **Tier and capability grants.** Whether *this publisher* may hold *this capability*,
  and whether the stated purpose is plausible for the app's actual function.
- **The purpose strings users will read.** These are user-facing copy on our surface,
  so they are taste, and `design` governs them.
- **Anything the automated pipeline flagged and could not resolve.**

**A reviewer is not a malware analyst.** Asking a person to find deliberate malice in
minified third-party code produces false confidence and slow reviews. The controls
against malice are the sandbox, the capability surface, staged rollout, and revocation.

## Staged rollout

Every submission at every tier below first-party ramps rather than launching. Ramp by
publisher-stable bucketing so a given user sees consistent behaviour — per-request
randomization produces irreproducible bug reports and destroys credibility with authors.

Gate each step on health signals, and define them before the rollout, not during:
crash and renderer-death rate attributable to the mini-app, bridge error rate,
consent-denial rate, quota and rate-limit violations, abuse reports, and any security
event. **A rollout with no defined halt condition is not staged, it is just slow.**

Automatic halt on a security event or a renderer-death spike. A human decides whether to
resume, and the resume decision is precedent worth recording.

For risky contract or runtime changes, prefer the host reference's compatibility window: ship the host accepting old+new capability versions, observe adoption and failure metrics, move mini-apps, then remove the old path only after the supported host population permits it. Flags for sensitive capabilities must fail closed.

## Kill switch and revocation

**Start from the honest limit: you cannot guarantee a kill reaches a device.** It may be
offline, backgrounded, or on an OEM build that discards your push. So the design goal is
not delivery — it is to **bound what a killed-but-still-running mini-app can do by making
its authority expire.**

| Channel | Latency | What it actually buys |
|---|---|---|
| Server-side capability-token revocation | next call | **Unbypassable. This is the real kill switch.** A running instance goes inert because its authority no longer validates. |
| Launch gate — signed pointer check on every open | next open | High, when online |
| Existing foreground long-lived connection | seconds | Good while the host is foregrounded |
| Foreground poll while a mini-app is open | up to a minute | Good |
| Silent push | minutes to hours | **Do not rely on it.** iOS background push is throttled and may be dropped with no error; Doze and OEM task-killers hit Android too. An accelerant, never the mechanism. |

**The freshness trade, stated as policy rather than discovered per feature:** low-risk
capabilities work with a pointer up to a day stale, so a mini-app is usable offline. Any
high-risk capability — payments, biometrics, contacts, precise location — requires a
pointer fresher than a few minutes, which means it requires network. **You do not need
the kill to reach the device; you need the authority to expire.**

Revocation granularity must include **version**, because "kill 3.4.1, keep 3.4.0" is the
common real need and a whole-app kill punishes users for the publisher's bad release:

| Blast radius | When it is right |
|---|---|
| One version | a bad release, a regression, a specific exploit |
| Whole mini-app | the app itself is the problem |
| One capability across all of a publisher's apps | systematic misuse of a specific capability |
| Whole publisher | fraud, repeated violations, an unreachable owner |

## The deprecation calendar

Removing a capability or an SDK version is possible only if scheduled, announced, and
enforced at the point where we have actual leverage — the store.

| Phase | Action |
|---|---|
| T+0 | Mark deprecated with a sunset date in the handshake and the docs. Console warning **in dev builds only** — a production warning defaces a third party's UI. |
| T+0 to T+6mo | Per-author telemetry and direct outreach to the highest-volume callers. Publish adoption numbers so authors can see they are not alone. |
| T+6 to T+9mo | **Reject any new submission that uses the deprecated operation.** This is the lever that actually works, because we control the store. |
| T+9 to T+12mo | Soft-break ramp, bucketed by mini-app, returning the retired error to a growing share of traffic. |
| T+12mo | Removed. Survivors are carried only by an explicit, expiring compatibility grant with a named owner and a date. |

**There is no third option after T+12, and say so out loud**, because "we'll keep it
forever for that one integration" is the default outcome and it is exactly how you end up
with a surface you cannot secure. What makes removal possible at all is upstream: every
capability ships on day one with a named owner and a stated support horizon, per
`native-capability`.

## Incident response

The first decision is **blast radius and speed, not root cause.** Revoke at the narrowest
level that stops the bleeding, then investigate. An investigation that runs while the
exploit is live is a choice to keep serving it.

Then: notify the publisher through the contact we required at admission — this is why an
unreachable owner is an admission blocker rather than a nuisance. Preserve the audit log
and the reviewed package for comparison against build provenance. Determine whether other
mini-apps could use the same path, because a capability-level flaw is never one app's.

Harvest the outcome into precedent per `process-spine`. **Rejections and incidents teach more
than approvals** — an approval confirms our model of what is acceptable; an incident corrects it.

## The admission record

```markdown
## <Mini-app> by <publisher> — <date>

**Tier, and the evidence for it:** <Identity verification, contract, track record. "They
seem legitimate" is not evidence.>

**Capabilities granted, and why each is plausible:** <Per capability, tie it to a function
a user would recognize. A capability with no user-visible purpose is the finding.>

**Declared-versus-actual result:** <From the pipeline. Any mismatch and its resolution.>

**Consent classes and purpose strings:** <As users will read them.>

**Rollout plan and halt conditions:** <Defined before the ramp starts.>

**Publisher contact for incidents:** <A named human, reachable within hours.>

**Reviewer decisions:** <Only the bounded human calls, each with reasoning — this is what
becomes precedent.>

**Revisit trigger:** <What would cause a tier or grant review — an incident, an install
threshold, a contract change.>
```

## Never admit these

Not judgment calls — these are rejections regardless of tier, deadline, or who is asking:

- **A package that loads executable script at runtime**, at any tier. It makes review
  meaningless: you reviewed a loader, not an app.
- **A manifest whose declared capabilities do not match what the bundle calls**, or an
  unsigned package, or one missing either signature.
- **A publisher with no reachable human for incidents.** You will need them at 2am, and
  discovering they do not exist is discovering you cannot revoke intelligently.
- **A capability above the publisher's tier, "just for launch".**
- **A mini-app that is load-bearing for our own product** — a first-party feature wearing a
  mini-app costume, where every future capability restriction breaks us.

## What does not belong here

- **Runtime enforcement mechanics.** Signature verification, isolation, teardown are
  `mini-app-runtime`. Governance decides and broadcasts; the runtime obeys.
- **Capability design — signatures, consent semantics, versioning rules.**
  `native-capability`. This skill sets dates and tiers, not contracts. Host app release is
  `mobile-architecture` and `ship`.
- **Generic gate-packaging mechanics.** `human-gate`. Admission and tier decisions are
  gates like any other; this skill supplies the content, not the format.
- **Reviewing code for malice.** Stated above, and worth repeating because it is what
  everyone assumes review means.

## Hand off

`mini-app-pipeline` to build the enforcement — this skill decides tiers and dates, that one
makes them mechanical. `human-gate` for admission, tier changes, and any grant above the
tier default. `mini-app-runtime` for what the container enforces once admitted.
`native-capability` when an incident shows the flaw is in a capability, not in one app.
