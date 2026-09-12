# Mobile — a React Native super-app hosting untrusted mini-apps

## Shared AI foundation

Before designing, implementing, reviewing, or measuring any product/feature in this
workspace:

1. Read `app/docs/ai-foundation/SOUL.md` for principles and trade-off order.
2. Read `app/docs/ai-foundation/MEMORY.md` for confirmed project state, decisions, and gaps.
3. Use the relevant workflow and contracts in `app/docs/ai-foundation/SKILLS.md`.
4. Then route through `mobile-spine` and any specialized `.claude/skills/` named by its
   routing table.

Treat `policy/capabilities.yaml`, `policy/budgets.md`, `policy/conformance.md`, and
`policy/dependency-decisions.md` as the narrower sources of truth. Do not turn provisional
budgets, PoC code, comments, or manual test results into production guarantees. Human review
is product/UX acceptance through manual device testing; automated checks and measurable
evidence remain required for correctness, security, lifecycle, accessibility, and performance.

## The thesis

A super-app is not a big app. It is a **platform with tenants**, and almost every hard
decision follows from two asymmetries.

The first is release agility: the native binary cannot be rolled back, while everything
above it can. Push a bad native release and the fix waits behind store review; push a bad
remote update and the fix is minutes. So capability belongs as high in the stack as the
performance budget allows, and the shell stays thin.

The second is trust: mini-apps are third-party code written by people we do not control,
some of whom are hostile and more of whom are careless. They reach the device through one
audited door or not at all.

Get those two right and the rest is engineering. Get either wrong and no amount of
process fixes it — an un-rollbackable shell full of policy is permanently slow, and a
bridge with two doors is permanently unsafe.

## Four invariants

1. **The native shell is thin, because it cannot be rolled back.** Anything in it must be
   something we accept being stuck with for a week. Mechanisms live in the binary; every
   threshold, string, and allowlist they consume comes from remote config.
2. **The bridge is the only door.** No direct network, no filesystem, no side channel for
   a favoured partner. The moment there are two doors, only one gets reviewed.
3. **Budgets are enforced in CI, not in review.** A budget a person checks is a budget
   skipped in the week it matters most. This is also the only mechanism here that works
   on someone who never reads a skill.
4. **A mini-app is untrusted until a signature and a tier say otherwise** — including the
   ones written by partners we like.

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

Downward is decreasing trust; upward is decreasing release agility. Most mobile design
arguments are about which band something belongs in.

## Skills

Start with **`mobile-spine`** — the routing table, the invariants, and where the numbers
live. It routes by what was actually said rather than by topic, because an agent that
cannot see itself in the table will not click through.

The family splits on one axis: **six skills decide what should be true, four build the
crossing.** Reading the decision skill when you were asked to build is the most common way
mobile work drifts — you get the principle and none of the order of operations.

Deciding:

| Skill | Use for |
|---|---|
| `mobile-spine` | Entry point: routing, invariants, the ledgers |
| `mobile-architecture` | Where a feature lives — native, RN, mini-app, or remote config |
| `mobile-simplicity` | What the codebase refuses to carry, with counters and a ratchet |
| `mobile-smoothness` | Every timing and memory budget, how it is measured, the CI gate |
| `mini-app-runtime` | The container: packaging, isolation, lifecycle, warm pool, crash containment |
| `native-capability` | The only door: transport, contract, three permission gates, versioning |
| `mini-app-governance` | Admission, trust tiers, review, rollout, revocation, deprecation |

Building:

| Skill | Use for |
|---|---|
| `bridge-wiring` | A capability end to end: broker-or-permission, handler order, gates, reply |
| `container-wiring` | One WebView factory, serving the package, containment, mounting, splash |
| `mini-app-contract` | The surface authors build against: manifest, handshake, errors, limits |
| `mini-app-pipeline` | Signing, review checks, declared-versus-actual, rollout, revocation |

Each build skill carries a **drift signal** — the one behaviour that means you have lost
the plot — and a conformance list that CI enforces.

This family is domain depth, not a replacement for the delivery process in
`../process`. `design` still owns generic technical design, `verify` the quality gate,
`autonomy-triage` and `human-gate` the decision mechanics.

## Layout

```
policy/budgets.md         every number, in one place — CI reads this
policy/capabilities.yaml  the capability registry, tier reach, never-expose list
policy/conformance.md     boundary rules a machine checks — the anti-drift mechanism
.claude/skills/           the platform's reasoning
```

## The mechanisms that make it work, in one place

The non-obvious parts. If this is being adapted, keep these.

- **Stopwatch or gauge → `mobile-smoothness`; counter → `mobile-simplicity`.** The one
  rule that stops two skills claiming the same budget. Cold-open time and memory are
  smoothness; bundle size and dependency count are simplicity.
- **`mobile-smoothness` owns every number; other skills own hitting it.** The warm pool is
  runtime; the cold-open budget it must satisfy is smoothness. Three skills each asserting
  a frame budget means three frame budgets.
- **The ratchet beats the absolute.** You rarely know the right absolute value on day one,
  and arguing about it delays having any check. A growth limit is enforceable immediately
  and catches the real failure — forty releases each adding one percent.
- **App-owned trace markers, replaceable tools.** Own the boundary markers; treat every
  profiler as swappable. Platform performance APIs churn, and a dashboard built on current
  names is wrong within two releases with nobody going back to fix it.
- **Governance decides and broadcasts; the runtime obeys and tears down.** Stated in both
  skills, because a kill switch where either half assumes the other's job does not fire.
- **Capabilities are additive-only, and every addition gates.** The surface grows one
  reasonable request at a time; each grant is defensible and the aggregate is a rooted
  device. The ritual for *adding* is the control, not a catalogue of what exists.
- **Three permission gates that never collapse:** review grant, per-mini-app user consent,
  then the OS permission. They look identical from inside the code and merging any pair is
  a real bug.
- **The OS prompt is a shared, non-renewable resource.** It is per-host-app and effectively
  one-shot, so one sketchy mini-app can permanently cost us a permission for everyone. The
  highest-leverage response is not better UX — it is capabilities that need no permission
  at all, via the platform's broker pickers.
- **Make the native part unconditionally fast rather than the WebView faster than it can
  be.** Tap-to-splash is entirely native, and that is what users experience as instant.
- **Isolation is weaker on Android than on iOS, and we say so.** All mini-app WebViews
  share one renderer with no out-of-process iframes, so origin separation does not survive
  the renderer being compromised. Mitigation is blast-radius reduction, not prevention.
  Never claim cross-platform parity in a design review.
- **A warm WebView carrying residue from the previous mini-app is a cross-tenant data leak
  wearing a performance optimization's clothes.** Disabling web storage entirely is what
  makes pooling safe, and it is exactly the coupling a later refactor removes without
  knowing what it held up.
- **You cannot guarantee a kill switch reaches a device.** Server-side authority expiry is
  the real mechanism; push is an accelerant. Design so a killed-but-still-running mini-app
  runs out of authority rather than out of reach.
- **Once data has legitimately crossed the bridge, exfiltration is a policy problem.** No
  technical control recovers it. That is why review, staged rollout, and revocation are
  load-bearing rather than belt-and-braces.
- **Deciding and building are separate skills, and the build skills carry a drift signal.**
  A miswired boundary never crashes — it works, ships, and leaks. Naming the one behaviour
  that means you have drifted catches it earlier than any review, because the agent can
  check itself mid-task rather than waiting to be told.
- **`policy/conformance.md` holds only the silent failures.** If a violation shows up as a
  crash or a red test, the ordinary suite already covers it and a conformance rule is
  duplication. That rule is what keeps the file short enough to stay real.
- **Adversarial fixtures, or the review pipeline becomes an approver.** Tested only against
  cooperative packages, it passes everything and reports success. Keep a suite that must be
  rejected and fail the build if any of them gets in.
