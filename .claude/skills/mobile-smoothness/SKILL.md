---
name: mobile-smoothness
description: Own every timing and memory budget the mobile platform is held to — startup, interaction, steady-state jank, mini-app open, bridge latency, memory — how each is measured on the New Architecture, and the CI gate that stops regressions. Use when someone says "the app is slow", "it takes forever to open on cheap Androids", "scrolling stutters", "it feels janky", when a change might cost frames, and before claiming any performance work is done. This skill owns the numbers; other mobile skills own hitting them.
---

# Mobile Smoothness

## Why this exists

Smoothness dies by a thousand cuts, and every cut is defensible on its own. No
single change makes the app slow; there is simply never a moment where someone is
accountable for a specific number, so each change spends a little of a budget
nobody is holding. By the time it is obviously slow, the cause is four hundred
commits wide and nobody can point at one.

The opposite failure wastes a quarter. A team notices slowness, picks the code
that *looks* expensive, and optimizes it — and it was never on the critical path,
so nothing improves and the effort is written off as "performance work is hard".

There is a third thing, and it is the one most teams get wrong: **average frame
rate is a lie.** An app averaging 58 fps can feel broken and an app averaging 52
can feel fine, because a user does not perceive the mean. They remember the one
frame that froze during checkout and not the three thousand that were fine. Every
budget here is a tail — p90, p95, or a worst-case count — and a mean anywhere in a
performance report is a sign the report is measuring the wrong thing.

## Budgets are meaningless without a reference device

A budget with no named device is a preference. "Under two seconds" on whose
phone, holding what, on which network, from which thermal state?

Define three tiers and put the actual model numbers in `policy/budgets.md`. The
low tier is not the cheapest phone that exists — it is the device at the low end
of *your* install base, picked from field data, and it is the tier every budget
is stated against unless a row says otherwise. Budgeting against the flagship
developers carry is how a codebase acquires a performance problem invisible to
everyone who could fix it. Re-pick the tiers annually, and expect budgets to get
*harder* over time: the install base improves, so holding the same number is a
slow regression.

## The budget table

Every number lives in `policy/budgets.md`. This skill owns the derivation and
the measurement; the file is what CI reads. Three things it must say about
itself:

**Most of these start as baselines, not targets.** Measure the current value on
the reference device, set the budget at or slightly inside it, then ratchet. A
number adopted from a document without measurement gets breached in week two and
ignored forever, which is worse than having no number.

**Mark which numbers are derived and which are chosen.** The frame budget is
arithmetic. The one-frame bridge round trip is derived — a capability call must
not cost a frame, so its ceiling *is* the frame. Tap-to-response is a perceptual
constant. Those are not negotiable the way a cold-start target is, and a table
presenting all of them with equal authority teaches people to treat the derived
ones as soft.

Where a value cannot be defended without measurement — resident memory per
WebView is the clearest case — the entry says *measure this*.

## Phase 1: cold start

Split it, because "startup is slow" is not actionable and the three parts have
different owners:

1. **Process start to native init done.** Shell work — linked frameworks, early
   singletons, anything on the main thread before RN begins. This is where
   eagerly-initialized native modules hide.
2. **Native init to JS bundle evaluated.** Bytecode load and top-level module
   evaluation. Top-level side effects in modules are charged here even if the
   feature is never used.
3. **Bundle evaluated to first meaningful frame.** The first real render.

The rules that actually move this: **TurboModules initialize lazily — keep them
that way**, and any module that must exist at launch is a budget line with a name
on it. **Nothing does work at import time**; a module opening a database at the
top level is charged to every launch, including the ones that never touch it.
**First meaningful frame is not first frame** — define it as the moment the user
can act on what they see, or you will optimize your way to a faster spinner.

## Phase 2: interaction

Tap to visual response, and gesture tracking. This is where users form their
opinion, and it is almost entirely about what is *not* on the JS thread.

- Any animation or gesture that must not drop frames runs on the UI thread as a
  worklet, or in native. If the JS thread *can* block it, it will, on the device
  where it matters.
- Acknowledge every tap immediately, even when the work behind it is slow. A
  100 ms response with a 2 s operation behind it feels responsive; a correct
  400 ms operation with no acknowledgement feels broken.
- Long lists: virtualize, keep item components cheap, precompute layout.

## Phase 3: steady state

The budgets that only fail after a while, which is why they escape lab testing:

- **Slow and frozen frames during scroll and transitions.** Frozen frames are the
  row to enforce hardest — one is a bug report.
- **Resident memory over a session**, and the count of low-memory kills in the
  field. A memory budget with no field kill count next to it is untested.
- **Image decode**, the most common cause of scroll jank blamed on JavaScript.
  Decode off the main thread, and size images to their display size rather than
  decoding a 4000 px asset into a 200 px slot.
- **Thermal state.** Sustained load throttles the CPU, so the second minute of a
  session is slower than the first. Long measurements catch this; 30 s ones do
  not.

## Phase 4: mini-app open

The perceived-latency rule that governs this whole phase: **make the native part
unconditionally fast rather than making the WebView faster than it can be.**

Tap to native splash visible is entirely native — no WebView, no JS, no network —
so it can be held to a few tens of milliseconds, and that is the number users
experience as "instant". Everything after it hides behind a splash the user has
already accepted.

Budget the open path in three stages, because they have different causes: warm
pool hit with the package cached; cold WebView with the package cached; and
first-ever open including the download. One blended number hides which of the
three is broken. `mini-app-runtime` owns the mechanisms; this skill owns whether
they are working.

Bridge round trip gets its own budget for a derived reason: a capability call
must never cost a frame, so the ceiling is one frame at the display's refresh
rate. Anything slower belongs in an async capability that returns immediately
and reports later, per `native-capability`.

## Measuring on the New Architecture

**Emit your own trace markers and treat every tool that reads them as
replaceable.** React Native's performance APIs and the tooling around them churn
between releases, so a dashboard built on current API names is wrong within two
releases and nobody goes back to fix it. Own the boundaries:

process start · native init done · bundle evaluated · first meaningful frame ·
mini-app tap · mini-app first paint · bridge request · bridge response

Platform instruments — Perfetto, Instruments, MetricKit, Play Vitals, frame
metrics APIs — then read those markers. Verify the current name of any API before
writing it into a dashboard, and gate platform features on feature detection
rather than OS version wherever the platform offers it.

**Split lab and field, and mandate both.** Lab is a fixed device in CI answering
"did this change make it worse". Field is real-user percentiles answering "is
this fast enough for the people who have it". Mandate only lab and you optimize a
device nobody owns; mandate only field and you cannot attribute a regression to
the change that caused it. Both read the same markers, so the two are comparable
— the part teams usually get wrong.

## Measurement loop — release only, with evidence

Do not claim a win from debug mode. For any performance-sensitive change (startup, navigation, lists, animation, media, container launch, native crossing):

1. Reproduce in a **release build** on the low-tier reference device (Samsung A14, `policy/budgets.md`).
2. Capture a baseline with the app's trace markers plus Instruments/Perfetto/system tracing — not `console.time`.
3. Identify whether time is on JS thread, UI thread, render thread, native worker, I/O, network, GC, or startup init.
4. Change the *owning layer*, not a nearby symptom — `mobile-architecture` if the budget cannot be met without moving layers.
5. Repeat the *same* scenario and retain before/after traces.
6. Add a regression check when automation is practical — the CI gate, not a follow-up ticket.

Record device, OS, build variant, data fixture, network, sample count, and measurement method. Compare like with like. Without this, "optimization" is a guess that gets reverted.

## Attribute before optimizing

**A fix with no profile behind it is a guess, and guesses get reverted.** Before
any optimization: capture a trace on the reference device, reproduce the actual
complaint, and name the span that is over budget. If you cannot point at a span,
you are not ready to change code.

Then attribute honestly, because the usual suspects are usually innocent. Worked
examples, all real shapes:

**"The feed is janky, it must be the JS thread."** JS thread idle, long
main-thread decode spans. → image decode; the JS work would have changed nothing.

**"Startup regressed 300 ms."** The regression sits entirely before JS begins. →
a newly added native module initializing eagerly. Fix is lazy init, not the
feature that shipped.

**"The bridge is fast, p50 is 4 ms."** p99 is 240 ms. → a lock contended when
another capability runs. p50 was never the budget; the tail was.

**"Slow after a few minutes."** Nothing in a 30 s trace. → thermal throttling
plus growing resident memory, which is why steady state is its own phase.

## React Native strengths to exploit — use them, do not reimplement them

- Keep Hermes enabled unless repo evidence requires otherwise — measure on Hermes bytecode, not JSC.
- Keep urgent interaction state small and separate from deferrable render/data so the concurrent renderer can schedule it.
- Preserve lazy TurboModule init; avoid eager SDK setup at launch (the top cause of `native_init_done` regression).
- Use Fabric/native views for components the platform already does well (lists, images, video, maps) — do not recreate them in JS.
- Let native scrolling, gestures, and animations remain independent of JS work — the whole point of `mobile-architecture`'s worklet rule.
- Virtualize long collections with stable keys and predictable layout; keep render state local and select narrow state slices.
- Decode/resize/cache/prefetch images intentionally; do not ship display-sized thumbnails as full-resolution assets (the top cause of scroll jank blamed on JS).
- Move CPU-heavy, high-frequency, or binary work to native/C++ and return coarse results; batch host/runtime messages and avoid repeated large JSON copies.
- Load mini-app code, assets, native services, and caches on demand while preserving a fast first interaction — preload the likely next mini-app only after the host is responsive and within memory/network limits.

## Startup — separate, parallelize, defer

Split process startup, RN init, shell render, auth restoration, runtime warm-up, and mini-app launch — parallelize only independent work. Defer noncritical analytics, catalog refresh, SDK setup, and cache maintenance until after `first_meaningful_frame`. Do not eagerly initialize every native capability so it is ready for a mini-app that may never request it.

## Memory and lifecycle — exercise the hard paths

Repeatedly exercise open/close, background/foreground, logout/login, runtime update, and low-memory. Look for retained native views, listeners, closures, timers, SDK sessions, image caches, bridge callbacks, and runtime instances — the pool makes this worse if teardown is missed. Cache ownership and eviction must be explicit; a cache that helps a microbenchmark but causes process death under realistic multi-mini-app use is a regression. This is where `mini-app-runtime`'s LRU and `max concurrent WebViews = 3` are verified, not just documented.

## Quality gates — the repo's actual commands

Use the repo's gates, not generic advice. Relevant gates commonly include: formatting, static analysis, TypeScript, lint, Codegen freshness; Java/Kotlin/Swift/C++ compilation and unit tests; Android/iOS integration/UI tests; accessibility checks and manual screen-reader validation for changed critical flows; release builds, startup/container smoke tests, native symbol/source-map generation; contract compatibility against supported mini-app API versions; and performance comparison for changed critical paths. Keep verification focused on observable behavior — a snapshot test is not a substitute for lifecycle, permission, thread, or contract behavior.

## The CI regression gate

This is the teeth. Everything above depends on someone choosing to read a
document; the CI gate works on the week nobody does.

- Run the lab measurements on a fixed device per change, or per merge if
  per-change is too slow. Compare against the ratcheted baseline, not against
  the previous run — comparing to the previous run lets a slow drift through.
- **Fail on a breach, do not warn.** A warning is a breach that ships.
- **Handle noise with repetition and percentiles, not with a wider threshold.** A
  threshold loosened to stop flakes is a budget that no longer holds.
- Raising a budget is a gate per `human-gate`, with the measurement attached.
  Whoever is blocked by a budget cannot be the one who relaxes it.

## The performance report

Feeds the load-and-performance layer of `verify`. Without it, that layer has
nothing to check against and becomes a formality.

```markdown
## Performance — <work item>

**Reference device / tier:** <Model, OS version, network, thermal state. If this
was measured on a flagship, say so; the reviewer needs to discount it.>

**Budgets touched:** <Which rows from policy/budgets.md this change could
plausibly affect. "None" is a valid answer and must be argued, not assumed.>

| Budget | Baseline | This change | Ceiling | Verdict |
|---|---|---|---|---|
| <name> | <p95> | <p95> | <p95> | pass / breach |

**Attribution for anything that moved:** <The span, from a trace. Not a theory.>

**Field check:** <What the equivalent field percentile is today, or "no field
data yet" — which is itself worth knowing before shipping.>

**Untested budgets:** <Anything you could not measure, and why. This is the most
useful line in the report; a report with no gaps is usually hiding them.>
```

## Do not do this

- **Do not report averages.** Tails only. An average in a performance report
  means the measurement was not built for perception.
- **Do not optimize before attributing.** Covered above; it is the most expensive
  mistake in this skill.
- **Do not own artifact sizes.** Bundle, binary, and dependency counts are
  counters and belong to `mobile-simplicity`. If it comes from counting rather
  than timing or measuring, it is not here.
- **Do not own the mechanisms.** Warm pooling, eviction, and package caching are
  `mini-app-runtime`. This skill states the open budget and whether it is met.
- **Do not conflate a slow API with jank.** A slow backend is not a frame
  problem, and reporting it as one sends optimization effort to the wrong team
  and leaves the actual latency unowned.
- **Do not write a generic load or regression plan here.** `verify` owns test
  mechanics; this skill supplies the budgets and the report it consumes.
- **Do not ship a constant nobody measured.** Especially per-WebView memory. An
  invented number in a budget file is indistinguishable from a measured one six
  months later, and it will be cited as if it were real.

## Hand off

`verify` with the performance report. `mobile-architecture` when a budget cannot
be met without moving something to a different layer — that is a design decision
and a gate, not an optimization task. `mini-app-runtime` when a mini-app open
budget is breached and the cause is in the container.
