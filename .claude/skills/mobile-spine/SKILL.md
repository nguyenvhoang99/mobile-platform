---
name: mobile-spine
description: Route a mobile platform question to the right skill, and hold the four invariants and the budget ledger the whole family depends on — the layer rule, the single bridge, CI-enforced budgets, untrusted-until-signed. Use whenever mobile work starts and you do not yet know which skill applies, when someone says "the app feels slow", "can a mini-app read contacts", "where should this feature live", or "what is our frame budget", and when resuming mobile work after a break. Start here before reaching for any individual mobile skill.
---

# Mobile Spine

## Why this exists

This is a super-app: a React Native host that runs third-party mini-apps in
WebViews and lends them device capabilities. That shape creates decisions the
generic `design` stage cannot carry. "Cover components, sequence, data model,
non-functional" is the right instruction for a backend service and useless when
the real questions are which origin scheme, which bridge transport, which of
three permission gates, and what the frame budget is. Left to each design
review, those get re-derived from scratch and land somewhere different every
time — and the third different answer is the one that ships a security hole.

The opposite failure is a stack of documents nobody opens. Seven skills is
enough that an agent can read this page, feel oriented, and improvise the rest.
So this skill does two jobs and no others: it routes, and it points at the
numbers. Every "how" lives in the skill that owns it.

The guard against being ignored is not this page. It is that the budgets are
enforced in CI, so they bind even when nobody reads a word of this.

## The architecture in one picture

```
┌─ native shell ────────────────────── ships via the store, cannot roll back
│  launch, mini-app frame, splash, permission sheets, payment sheet
│  ┌─ React Native host ───────────── remotely updatable
│  │  first-party product surfaces, navigation, host state
│  │  ┌─ capability bridge ────────── native code, the only door
│  │  │  ┌─ WebView ─┐ ┌─ WebView ─┐  one per mini-app, one origin each
│  │  │  │ mini-app  │ │ mini-app  │  untrusted third-party code
```

Read it downward as decreasing trust and upward as decreasing release agility.
Almost every mobile design argument is about which band something belongs in.

## The four invariants

**The native shell is thin, because it cannot be rolled back.** A bad native
release is fixed by shipping another one through store review. So capability
belongs in the remotely-updatable bands, and anything in the shell must be
something you are willing to be stuck with for a week. `mobile-architecture`
owns the consequences.

**The bridge is the only door.** A mini-app reaches the device through the
capability bridge or not at all — no direct network, no filesystem, no second
channel for "just this one thing". The moment there are two doors, only one of
them gets the security review. `native-capability` owns the door.

**Budgets are enforced in CI, not in review.** A budget checked by a person is
a budget that is skipped in the week it matters most. `mobile-smoothness` and
`mobile-simplicity` own the checks.

**A mini-app is untrusted code until a signature and a tier say otherwise.**
Not "usually fine" — untrusted, including the ones written by partners you like.
`mini-app-governance` owns who is trusted with what.

## Skills

Route by what was actually said, not by the topic you infer.

**First, one question that halves the table: is this a decision or a build?** "May a
mini-app read contacts" and "wire up contacts" are different jobs with different skills,
and reading the decision skill when you have been asked to build is the most common way
mobile work drifts — you get the principle and none of the order of operations.

Deciding what should be true:

| If it sounds like | Go to |
|---|---|
| "where should this feature live", "native or JS", "we need to fix this without a store release" | `mobile-architecture` |
| "should we add MMKV", "let's build an abstraction for this", "can we support both" | `mobile-simplicity` |
| "the app takes forever to open on cheap Androids", "scrolling stutters", "it feels janky" | `mobile-smoothness` |
| "how do mini-apps get updated", "can two mini-apps see each other's data", "opening a mini-app is slow" | `mini-app-runtime` |
| "can a mini-app read contacts", "expose the camera to mini-apps", "add a payment API" | `native-capability` |
| "a partner wants background location", "this mini-app is abusing us", "how do we retire an API" | `mini-app-governance` |

Building the crossing, once the decision exists:

| If it sounds like | Go to |
|---|---|
| "wire up the camera", "implement this capability", "the bridge call hangs" | `bridge-wiring` |
| "mount the WebView", "add the scheme handler", "the splash is stuck", "blank screen" | `container-wiring` |
| "document this capability", "what can authors rely on", "the manifest needs a field" | `mini-app-contract` |
| "set up signing", "add a review check", "wire the kill switch", "build the rollout ramp" | `mini-app-pipeline` |

**Never build from a decision skill, and never decide inside a build skill.** A build skill
that starts arguing about whether a capability should exist has lost its place in the
sequence; stop and gate instead.

If a request spans two rows, it almost always starts at `mobile-architecture` and hands off.

## The budget ledger

Every number lives in `policy/budgets.md` — one file, so there is one frame
budget rather than three skills quietly asserting three. This page states no
numbers, and neither does any skill that does not own the measurement.

`mobile-smoothness` owns the derivation of every stopwatch and gauge budget and
explains how each is measured. `mobile-simplicity` owns the counters.
`policy/budgets.md` is what CI reads.

`policy/conformance.md` is the same idea for boundary work: the subset of the build skills'
rules that a machine can check, so the invariants bind on an agent who read none of this.
Everything else here depends on someone choosing to read a document; that file does not.

## Who owns what, when two skills could both claim it

These four rules settle most boundary arguments:

- **Stopwatch or gauge → `mobile-smoothness`. Counter → `mobile-simplicity`.**
  Cold-open time and resident memory are smoothness. Bundle size, dependency
  count, and RN version lag are simplicity.
- **`mobile-smoothness` owns every number; the other skills own hitting it.**
  The warm pool is `mini-app-runtime`; the cold-open budget it must satisfy is
  `mobile-smoothness`.
- **Governance decides and broadcasts; runtime obeys and tears down.** True of
  the kill switch, revocation, and tier changes.
- **Does a third-party mini-app ever call this native module?** Yes →
  `native-capability`. No → `mobile-architecture`.

## Where this sits in the delivery process

This family is the domain depth the process stages call into, not a replacement
for them. `process-spine` still owns how work moves.

- `analyze` — feasibility claims about the mobile platform come from
  `mobile-architecture`, and "can a mini-app even do that" from
  `native-capability`.
- `design` — Track 2 technical design for mobile work means the layer decision
  from `mobile-architecture` and the budgets from `mobile-smoothness`. Do not
  restate generic sequence or data-model guidance; `design` already has it.
- `verify` — the load-and-performance layer consumes the performance report
  from `mobile-smoothness`.
- `autonomy-triage` and `human-gate` — a new capability, a trust-tier change, or
  a budget being permanently relaxed are all already in the always-gate list.
  You are not exercising judgment on those; you are packaging a gate.

## Starting a mobile change

1. Route from the table above. If two skills apply, read both before writing
   anything — the boundary rules exist because guessing produces duplicated
   guidance that later disagrees with itself.
2. Check `policy/budgets.md` for any number the change touches, and
   `policy/capabilities.yaml` if it touches the bridge. These are current state;
   the skills are reasoning.
3. Run `autonomy-triage` before assuming you need a human. Most mobile work is
   correctness-shaped and does not gate.
4. If the change would breach a budget or widen the bridge, that is a gate, not
   a task. Say so early rather than discovering it at `accept`.

## What does not belong here

- **Any guidance on how to do something.** The moment this page explains a
  technique it starts drifting from the skill that owns it, and a reader who
  learns the technique here never opens the real skill.
- **Restating a budget's derivation.** The number is in `policy/budgets.md` and
  the reasoning is in the owning skill. Three copies of a number is three
  numbers.
- **Process mechanics.** Stage order, work-item layout, gate packaging, and
  resuming all belong to `process-spine`. This family assumes them.
- **A decision.** If you are reading the spine to settle an argument, you have
  not routed yet.

## Hand off

To the skill the table named. If nothing in the table fits, the honest move is
to say the family does not cover it rather than stretching the nearest skill —
and if the same gap appears twice, that is the signal to write an eighth skill
rather than bloat a seventh.
