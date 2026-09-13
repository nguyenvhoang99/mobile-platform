# Budgets

## How to use this file

Every number the mobile platform is held to lives here, once. The skills carry the
reasoning — why a budget exists, how it is measured, what to do when it is breached — and
this file carries the current value. One file means one frame budget rather than three
skills quietly asserting three.

`mobile-smoothness` owns every stopwatch and gauge row. `mobile-simplicity` owns every
counter row. The split is: does the number come from timing or measuring something at
runtime, or from counting something in the repo?

**CI reads this file.** A budget that is not enforced in CI is a preference, because it
will be skipped in the week it matters most.

## How to change a number

Tightening a budget needs no ceremony — ratchet it down and note the date.

**Loosening one is a gate** per `human-gate`, with the measurement attached and a named
owner. Whoever is blocked by a budget cannot be the person who relaxes it; that is the
single failure mode that makes a budget ledger decorative.

## Confidence, and why it is a column

Rows are marked so a reader knows what they are arguing with:

- **derived** — follows from something else and is not negotiable. The frame budget is
  arithmetic. The bridge round trip is one frame, because a capability call must not cost
  a frame.
- **perceptual** — a human-perception constant, not a preference.
- **measured** — baselined on our own reference device. The date matters.
- **provisional** — a starting point taken from elsewhere, not yet baselined. **Treat
  every provisional row as a guess.** Baseline it, then ratchet.
- **unresolved** — we know this needs a number and we do not have one. Shipping an
  invented constant here is worse than leaving it open, because six months later an
  invented number is indistinguishable from a measured one and gets cited as fact.

## Reference devices

Every row is stated against the **low** tier unless it says otherwise. The low tier is the
device at the low end of *our* install base, chosen from field data — not the cheapest
phone that exists, and never the flagship the team carries. Re-pick annually, and expect
budgets to get harder over time: as the install base improves, holding the same number is
a slow regression.

| Tier | Device | OS | Notes |
|---|---|---|---|
| low | Samsung Galaxy A14 (SM-A145F) | Android 14, One UI 6 | Vietnam low-tier reference; MediaTek Helio G80 class, 4 GB RAM — budgets are stated against this |
| mid | Samsung Galaxy A54 5G | Android 14, One UI 6.1 | mid-tier reference |
| high | iPhone 14 | iOS 18 | high-tier / iOS reference — measure WebView baseline separately per platform |

Lab measurements run on a fixed device in CI to catch regressions. Field percentiles tell
us whether the budget was the right budget. Both read the same app-owned trace markers so
the two are comparable — mandate one without the other and you are either blind or noisy.

## Trace markers

The budgets below are defined in terms of these markers, which the app emits and which
every profiler merely reads. Treat the tools as replaceable; platform performance APIs
churn between releases.

`process_start` · `native_init_done` · `bundle_evaluated` · `first_meaningful_frame` ·
`miniapp_tap` · `miniapp_splash_visible` · `miniapp_first_paint` · `bridge_request` ·
`bridge_response`

## Stopwatch and gauge budgets — owner: `mobile-smoothness`

| Budget | Value | Percentile | Confidence |
|---|---|---|---|
| Frame budget | 16.67 ms at 60 Hz, 8.33 ms at 120 Hz | — | derived |
| Frozen frames (>700 ms) | zero | absolute | derived — enforce hardest |
| Tap to visual response | 100 ms | p95 | perceptual |
| Slow frames during scroll, lists, and animations | under 1% | — | provisional |
| Navigation transition committed | 300 ms | p95 | provisional |
| `process_start` → `first_meaningful_frame`, cold | `<baseline first>` | p90 | provisional |
| `process_start` → `native_init_done` | `<baseline first>` | p90 | provisional |
| Warm start, process alive → screen ready | `<baseline first>` | p90 | provisional |
| `miniapp_tap` → `miniapp_splash_visible` | 50 ms p50 / 100 ms p95 | — | derived — entirely native, so achievable |
| `miniapp_tap` → `miniapp_first_paint`, warm pool + cached package | 350 ms / 800 ms | p50 / p95 | provisional |
| `miniapp_tap` → `miniapp_first_paint`, cold WebView + cached package | 700 ms / 1500 ms | p50 / p95 | provisional |
| First-ever mini-app open, including download | `<depends on package cap and CDN>` | p90 | unresolved |
| `bridge_request` → `bridge_response`, trivial payload | 5 ms p50, **16 ms p95 — one frame** | — | derived |
| Synchronous host call | 1 ms, else it must be async | — | derived |
| Max concurrent live WebViews | 3, LRU with state serialization | — | provisional |
| Host idle resident memory, no mini-app, post-launch steady | `<baseline first>` | p90 | unresolved — baseline on low-tier reference before setting delta |
| Resident memory per live WebView | **unresolved — measure an empty WebView baseline per platform, then set ceiling = baseline + delta** | — | unresolved |
| Heavy-screen resident memory, long list/media catalog in release | `<baseline first>` | p90 | unresolved — same device/fixture as idle, compare steady state |
| Host resident memory with 3 mini-apps live | `<baseline first>`, and **zero low-memory kills in the field** | p90 | unresolved on the megabytes, derived on the zero-kills clause |
| Field crash-free sessions | `<baseline first>`; every crash carries symbolicated stack and attribution | — | unresolved on the percentage, derived on the attribution clause |

## Build timing budgets — owner: `mobile-smoothness`

Release-build product budgets above answer "does the user feel it". The rows below
answer "can the team still iterate". They use the same lab discipline — fixed
reference, repeated samples, percentiles — but the reference is the CI machine
(or a named dev machine) rather than the low-tier handset. Record machine,
cache state, variant, and sample count next to every baseline.

| Budget | Value | Percentile | Confidence |
|---|---|---|---|
| Clean release build wall time, cold cache (AAB + IPA) | `<baseline first>` | p50 | provisional |
| Incremental dev iteration, single TS change to refresh | `<baseline first>` | p50 | provisional |
| Incremental native iteration, single Kotlin/Swift change to install | `<baseline first>` | p50 | provisional |

A feature that moves any of these without a measurement is unverified, same as a
frame regression without a trace. Report before/after on the same machine and
cache state; noise is handled with repetition, not a wider threshold.

## Motion design budgets — owner: `mobile-smoothness`

These values define the single animation vocabulary for host surfaces and mini-apps.
They are interaction ceilings, not permission to delay feedback: a tap must still receive
an immediate visual state change. Product configuration may tune values downward or choose
a different curve through signed configuration, but it may not exceed these ceilings.

| Token or behavior | Default | Ceiling | Confidence |
|---|---:|---:|---|
| Feedback transition | 100 ms | 100 ms | perceptual |
| Standard transition | 200 ms | 300 ms | provisional |
| Emphasized navigation or sheet transition | 300 ms | 300 ms | follows navigation-transition budget |
| Non-gesture travel distance | 24 logical px | 24 logical px | provisional |
| Reduced-motion transition and travel | 0 | 0 | accessibility invariant |

Motion that follows a live gesture is not duration-limited while the pointer is down; it
must track the gesture directly and settle within the emphasized-transition ceiling after
release. Infinite, decorative, autoplay, parallax, and oscillating motion is not part of
the platform vocabulary.

## Telemetry delivery budgets — owner: `mobile-smoothness`

These are provisional starting values consumed through signed remote configuration. A
mini-app never supplies its own priority or limit.

| Priority | Maximum queue wait | Target request size | Local retention |
|---|---:|---:|---:|
| Critical | 1 second | 32–64 KB | 7 days |
| Operational | 5 seconds | 128 KB | 72 hours |
| Product | 30 seconds | 256 KB cellular / 512 KB Wi-Fi | 24 hours |
| Diagnostic | 5 minutes | 512 KB, unmetered preferred | 1 hour |

| Queue limit | Value | Confidence |
|---|---:|---|
| Single event, uncompressed | 16 KB | provisional |
| Single request | 512 KB or 200 events | provisional |
| Durable on-device journal | 8 MB with critical/operational reservation | provisional |

## Counter budgets — owner: `mobile-simplicity`

Prefer a growth limit to an absolute one on every artifact row. It is enforceable on day
one without knowing the right absolute value.

| Budget | Value | Confidence |
|---|---|---|
| Android download size | ratchet: no more than +2% per release without a gate | provisional on the percentage |
| iOS thinned install size | same ratchet | provisional |
| Hermes bytecode bundle | ratchet, plus an absolute ceiling set from the first baseline | provisional |
| Direct runtime dependencies | `<ceiling>` — breach needs a refusal-log entry and a gate | team-specific |
| Native modules, counted separately | `<ceiling>` — the number that predicts upgrade pain | team-specific |
| Unsupported / unmaintained packages (no New Arch support, incompatible peer, or abandoned upstream) | 0 without a gate and a refusal-log entry | provisional |
| iOS Pod dependencies, transitive from `Podfile.lock` | ratchet: no growth without a gate and a refusal-log entry | provisional |
| Gradle plugins and buildscript classpaths (`android/**/build.gradle`, `settings.gradle`) | ratchet: no growth without a gate and a refusal-log entry | provisional |
| Custom build scripts and extra build phases (`scripts/*`, Xcode phases, Gradle tasks) | ratchet: no growth without a gate; each carries owner and removal condition | provisional |
| Custom native patches (`patches/`, `patch-package`, manual Pod/Gradle edits) | 0 preferred; any addition needs a gate, upstream link, and removal plan | provisional |
| Non-reproducible clean builds (same commit + same env → different artifact) | 0 | derived — a non-reproducible build is a bug, not noise |
| Non-deterministic build/crash failures (flaky green, flaky red, unattributed crash) | 0 | derived — flakiness is fixed or quarantined with owner, never averaged away |
| Distinct ways to do each thing | 1 | derived |
| Open flags past their removal date | 0 | derived |
| React Native version lag | 2 minor versions or 6 months, whichever is sooner | provisional |
| Per-app compatibility-flag grants | `<cap>` — report as a metric; growth means versioning has already failed | derived |

### How to count the hygiene rows

`scripts/budgets.sh` is the mechanical reader for this table. Counting sources,
so a feature author and CI mean the same thing:

- Direct runtime dependencies: keys of `dependencies` in `app/package.json`.
- Native modules: runtime dependencies shipping `android/` or `ios/` sources,
  plus local modules under `app/android` / `app/ios` / `app/src/native`.
- Unsupported packages: native dependencies without first-class New Architecture
  support, with an incompatible peer on the current RN, or abandoned upstream
  (no release in 18 months or archived repo). Any of the three counts.
- Pod dependencies: transitive pod entries in `app/ios/Podfile.lock`.
- Gradle plugins: `classpath(...)` entries plus `apply plugin` / `plugins { id }`
  entries under `app/android`.
- Build scripts: executable entries in `app/scripts/` plus custom Xcode build
  phases and custom Gradle tasks. Generated RN phases do not count.
- Native patches: files under `app/patches/`, `patch-package` entries in
  `package.json`, and documented manual Pod/Gradle edits.

A feature that adds to any ratchet row reports before/after counts, what was
bought, the alternative refused, and the removal condition — the refusal-log
shape from `mobile-simplicity` — and gates when the ratchet would move up.

## Admission ceilings — owner: `mini-app-governance`

Enforced at review rather than in the host.

| Limit | Value | Confidence |
|---|---|---|
| Mini-app main package, compressed | `<value>` | provisional — industry references disagree; pick and measure |
| Total package size | `<value>` | provisional |
| Single file | `<value>` | provisional |
| File count | `<value>` | provisional |
| Critical-path subresource requests | `<value>` — each is an IPC round trip | provisional |

---

<!-- Baselines begin here. One entry per measurement session, newest at the bottom. -->
<!-- Record: date, device, budget, measured value, and what changed since the last one. -->
