# Guidelines — Central Checklist + Skill Routing (Post-PoC 1)

> Copy the **Feature Checklist** at the bottom into your ticket/PR. If a line is skipped without a gate, the feature is not done — the mechanical DoD decides, not memory.

## 1. Start here — route before you write

Ask one question: **decision or build?**

| If you are about to… | Open | Do not open |
|---|---|---|
| `where should this live`, `native or JS`, `ship without store review`, `RN upgrade` | `mobile-architecture:6` + `mobile-simplicity` first | `bridge-wiring` |
| `add MMKV`, `wrap fetch`, `support both`, `just one more dep` | `mobile-simplicity` (Track 1-4, refusal log) | `mobile-architecture` |
| `app is slow`, `cheap Android jank`, `cold open`, `bridge 16ms` | `mobile-smoothness:1` + `policy/budgets.md:68` | — |
| `how mini-apps update`, `can they see each other`, `open is slow`, `crash takes host down` | `mini-app-runtime:1` | `container-wiring` alone |
| `expose camera`, `read contacts`, `payment API` | `native-capability:1` (always gates) | `bridge-wiring` before shape settled |
| `partner wants high-risk`, `abusing bridge`, `retire API`, `tier change` | `mini-app-governance:1` | `mini-app-runtime` alone |
| `wire up camera`, `bridge hangs`, `handler` | `bridge-wiring:1` (after capability gated) | `native-capability` to argue shape |
| `mount WebView`, `scheme handler`, `blank screen`, `splash stuck` | `container-wiring:1` | `mini-app-runtime` to decide isolation |
| `manifest field`, `what authors rely on`, `SDK shape` | `mini-app-contract:1` | `bridge-wiring` |
| `signing`, `review check`, `kill switch`, `rollout ramp` | `mini-app-pipeline:1` | `mini-app-governance` to decide tier |
| `animation direction`, `sheet slides from where` | `mobile-motion:1` — every appearance has a source | `mobile-smoothness` alone |
| `add vibrate`, `haptic for pin` | `mobile-haptics:1` — scarcity, typed, gated | `mobile-motion` alone |

If two rows apply, **read both** before writing. Deciding and building are separate skills — the build ones carry a drift signal you can self-check mid-task.

## 2. Before you write anything — inspect repository evidence

State these facts in the PR description (from `react-native-miniapp-host:22`):

- `react-native 0.85.x`, Hermes `hermesEnabled`, New Arch `fabricEnabled`/`turbo` — bare CLI, `minSdk 24`/`compileSdk 36`/`targetSdk 36`, Kotlin 2.1, Swift 5, Gradle 9, NDK 27
- Runtime model: **one WebView per mini-app, one origin each** (`mini://appId` iOS, `https://appId.miniapp.*` Android), shared renderer on Android (`mini-app-runtime:21` honest gap), `incognito=true` pool-generic
- Navigation owner: host owns global nav/back/deep links/permission prompts; mini-app owns only inside its container
- Existing contract: `policy/capabilities.yaml:22` (6 caps `registry.ts:24`), `policy/budgets.md:68`, `policy/conformance.md:35`

Do **not** silently change runtime model, RN version, architecture mode, navigation foundation, package manager, or public contract — explain and obtain direction first.

## 3. Choose the narrowest effective layer

Order from `mobile-architecture:40` + `references/native-boundaries.md:7` — use the smallest that covers the need:

1. **TypeScript/RN host** — portable orchestration, ordinary screens
2. **TurboModule (Codegen)** — stateless platform service
3. **Fabric component** — native view/controller/fragment
4. **Swift/Kotlin** — OS lifecycle, background, SDK ownership
5. **Shared C++ TurboModule** — cross-platform compute/binary
6. **Native screen behind host port** — lifecycle-heavy vendor flow

Check `mobile-simplicity` Track 1 scoring before admitting a native module (transitive deps, New Arch support, abandonment cost).

## 4. The kill — what fails the build if skipped

| Kill | Where it lives | What it catches |
|---|---|---|
| `C1` one WebView factory | `conformance.sh:22` grep | Second container (unreviewed surface) |
| `C2-C4` no tier/consent/identity/path in JS | `conformance.sh:30` | Authority in sandbox (bypassable) |
| `C6` no Intent parsing in container | `conformance.sh:47` | Host-compromise via `intent://` |
| `C7` no RN scroll handler on WebView | `conformance.sh:52` | Jank + gesture arbitration |
| `R1` registry ↔ handler ↔ docs agreement | `conformance.sh:57` | Undocumented capability (reverse-engineered contract) |
| `B1-B10` behavioural (storage off assert, CSP header not meta, navigation cancel, renderer-death on pooled, verify before script, terminal reply, audit before reply, token revoke fail-closed, seq downgrade, unavailable features absent) | `policy/conformance.md:62` targeted tests | Silent security/performance bugs |
| `S1-S7` generation regime (deps need decision, budgets imported not inlined, types generated, snapshots gated, test weakening gated, provenance, one-way-door label) | `conformance.sh:73` + `app/docs/ai-development-standard.md:1` | AI-generated plausible-but-wrong code |
| Motion: hardcoded `duration`/`easing` outside `motion.ts` | `mobile-motion:35` lint | Surprise without source, jank |
| Haptics: raw `Vibration.vibrate` outside `native/haptics.ts:1`, missing approval label | `mobile-haptics:1` | Buzz spam, wrong intensity |
| Budgets | `budgets.sh:1` ratchet | +2% per release without gate → decorative budget |
| Adversarial fixtures | `fixtures/adversarial/README.md:1` | Pipeline degraded to approver |

A warning is a breach that ships.

## 5. Layer decision template — paste into `design` track

```markdown
## <Feature> — layer decision

**Layer:** <native shell | RN host | mini-app | remote config>
**Why this layer:** <one constraint that forced it; preference → RN host by default>
**Budget it must respect:** <row from policy/budgets.md + headroom, not "should be fine">
**What ships remotely vs in binary:** <thresholds/strings allowlists → remote>
**Rollback story:** <under 1h how undone; "new build" is a real cost>
**Skew tolerance:** <what happens on N−2 shell — host feature-detects, never version-sniffs>
**One-way doors:** <what becomes hard to undo — the gate>
```

Gate when: new native layer, new mini-app contract, irreversible surface, budget breach, capability/tier/budget/conformance removal, native dep, `policy/capabilities.yaml` entry.

## 6. Definition of Done — mechanical, not remembered

`scripts/verify.sh:1` decides done. Run it locally — copy its output into the PR:

1. `typecheck` `tsc --noEmit` pass
2. `lint` with boundary rules pass (0 errors)
3. `unit` 20 suites/96 tests pass (`npm test -- --maxWorkers=2`)
4. `conformance` C/R/S + B-subset green
5. `budgets` counters within ratchet; `Performance — <item>` report attached if stopwatch/gauge touched (baseline/this/ceiling/verdict + attribution + field check + untested)
6. `provenance` trailer (`[task: ...]`) present
7. `registry agreement` holds; public surfaces unchanged or gate-labeled
8. docs+enforcement shipped together (`mini-app-contract` drift signal)

Human review is for: gates, specs/T0 tests for new surface, refusal log, purpose strings, tier/budget, incident response — not for re-checking a grep.

## 7. Motion + haptics — paired, not interchangeable

**Motion** (`mobile-motion:1`): taxonomy `bottom CTA→slide Y (sheet height, 300ms emphasized enter)` | `small→large→scale+fade from trigger bounds` | `list→detail→shared X 24px` | `swap→fade through` | `press→0.98/100ms`. Off JS thread (native driver/worklet), `reduceMotion` transforms to 0 travel/0 duration.

**Haptics** (`mobile-haptics:1` + `native/haptics.ts:1`): `selection 8ms` (enter edit), `successLight 10ms` (pin/add), `removal 20ms` (unpin), warning/error patterns. Intensity is *not* a parameter — caller declares intent. Adding any haptic is a **gate** (PM/design approval, `human-gate`), removing is free. Never fire on render/`useEffect`, pair every buzz with visual (jiggle/badge/pulse).

**Pin/unpin kill:** long-press pinned item → jiggle `±1.2deg` 120ms loop + `−` badge scale `0→1` 100ms + `selection` 8ms = enter edit (all tiles jiggle, `isEditing` boolean `HomeCollection.tsx:44`). Tap `−` → `removal` 20ms + exit `scale+opacity 1→0` 200ms then commit. Pin → pulse `0.96→1` 50+100ms + `successLight` 10ms. Tap tile while `isEditing` just exits, no open. `Done` badge exits jiggle.

## 8. AI-generated code — the tenant model

Every change is by an untrusted tenant until proven: `P1` assume author read nothing, `P2` machines check/humans decide, `P3` spec before code (registry/schema/budget row + T0 test first), `P4` structure is guard, `P5` ratchet (blocked party never relaxes), `P6` adversarial fixtures, `P7` provenance, `P10` agent is tenant. See `app/docs/ai-development-standard.md:1` for H1-H8 harnesses and T0-T11 ladder.

---

## Feature Checklist — copy into every PR

```markdown
- [ ] Routed via `mobile-spine` table — which skill(s) governed this change
- [ ] Inspected repo evidence (RN version, runtime model, budgets row, capability entry)
- [ ] Layer decision written (if native/mini-app/remote) — one-way doors listed
- [ ] If deps/native: `mobile-simplicity` Track 1 scored + `policy/dependency-decisions.md` entry
- [ ] If capability: `policy/capabilities.yaml` entry gated + `native-capability` vertical slice (name, DTOs, permission, threading/cancel, payload, compat, telemetry)
- [ ] Boundary chosen narrowest-effective + Codegen/ports, not scattered Platform.select
- [ ] Motion: source declared, tokens from `motion.ts:34`, native driver, reduceMotion handled, dismiss is reverse
- [ ] Haptics: only via `native/haptics.ts` with typed intent, approval label if new, not on render, paired with visual
- [ ] Pin/edit flow: long-press → jiggle+selection, − → removal+exit, pin → pulse+success, Done exits
- [ ] `npm run typecheck` / `lint` / `npm test -- --maxWorkers=2` / `scripts/verify.sh` green (paste output)
- [ ] Performance report attached if stopwatch/gauge touched; `policy/conformance.md` B-subset green if boundary touched
- [ ] Provenance trailer `[task: …]` and gate label if one-way door
```
