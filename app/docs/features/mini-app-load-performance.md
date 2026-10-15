# Mini-app load performance — host tracking

## Contract

Status: RN PoC instrumentation; device timings and WebView metrics are unverified.
Owner: host tracking/navigation. Goal: attribute the time spent opening a mini-app
without blocking navigation or counting interrupted launches as completed loads.

The current `App.tsx` renders `MiniAppScreen` and RN preview content, not
`MiniAppContainer`. Instrument this actual path in the RN host; keep the runtime,
native shell, bridge permissions, dependencies and budgets unchanged.

- Start at the host open request, before navigation validation. Emit only after
  navigation accepts the request; rejected requests keep `navigation_denied`.
- Cover dock, picker, home/category, cross-app links and notifications. Opening the
  already visible same session is a no-op, not another load. Returning through Back
  is excluded; explicitly opening a retained session is `existing_session`.
- `mini_app_load_started` and `mini_app_load_finished`, version 1, operational,
  essential, use the existing host journal and transport. The allowlist includes
  `mini_app_id`, `mini_app_version`, `mini_app_session_id`, `load_id`, `source`,
  `runtime` (`react_native_poc`) and `launch_kind` (`new_session|existing_session`).
  These identities come from host navigation/catalog, never mini-app event data.
- Finished adds `outcome` (`content_laid_out|interrupted`), `reason`,
  `elapsed_ms`, `navigation_commit_ms`, `content_layout_ms`, `commit_to_layout_ms`.
  All timings use the same monotonic `performance.now()` clock; wall time is only
  for event occurrence. Missing milestones are `null`, never zero or estimated.
- Navigation commit is the RN screen's layout effect. Content layout is the first
  nonzero layout of the host content region, excluding trusted chrome. These are
  JS-observed callbacks, not compositor paint or proof that async business data is ready.
- One pending attempt belongs to the visible host launch. Every accepted new
  launch supersedes the pending one. Leaving/changing route, background, tenant
  switch or host unmount settles it once as interrupted. Duplicate/stale callbacks
  cannot finish another attempt. No timer, polling, observer or history accumulation.
- No raw route/URL, query, notification input, error, user content or device identifier
  in the payload. `load_id` is for correlation, not an aggregation dimension.
  Retention, queue limits and batching use existing policy/config. Telemetry failure
  must not throw into navigation. Process death may leave an unmatched start;
  classify it as incomplete, not a successful load.

## Relationship to website metrics

[Web Vitals](https://web.dev/articles/vitals) separates loading (LCP),
interactivity (INP) and visual stability (CLS); FCP and TTFB help diagnose loading.
This implementation follows the idea of separating milestones, but does **not**
emit those browser metrics from RN layout callbacks.

| Metric | Source needed | Current status |
| --- | --- | --- |
| Request → content layout | Host monotonic clock + RN content layout | Instrumented |
| Request → RN commit; commit → layout | RN layout effect + layout callback | Instrumented |
| FCP | Browser paint timing / real renderer | Unavailable in RN preview |
| LCP | Browser observer and correct finalization lifecycle | Unavailable in RN preview |
| TTFB / DOMContentLoaded / load | Browser navigation timing | No document/network load on this path |
| INP / CLS | Browser event/layout-shift observations | Separate future WebView instrumentation |
| Native splash / first paint | Native compositor trace | Existing production gap |

Do not compare layout durations to first-paint budgets or use `onLoad` as FCP/LCP.
When the real container is integrated, bind coarse measurements to its host session
through the existing runtime/broker, feature-detect browser support, and record
unavailable metrics explicitly. No new raw WebView message channel in this change.

## Validation and handoff

Automated acceptance: monotonic phase durations, all terminal paths, supersession,
same-session retry, duplicate/late callbacks, missing milestones, no-op opens,
telemetry rejection, allowlisted journal payload and RN signal integration.

Manual script (human acceptance): use an iOS/Android build; open Sample and a catalog
preview through home/dock/picker, cross-app and notification entry points. Inspect
the local tracking journal: one matching start/finish pair with nonnegative phase
durations. Repeated tap on visible app adds no pair. Rapidly open another app, close,
background or switch tenant before layout: old attempt is interrupted and late
callbacks do not report success. Resume/reopen creates a fresh attempt only for a
new explicit open. Back, scrolling, screen reader, large text and Reduce Motion
should behave as before. Offline events stay in the existing journal. Endpoint is
not configured by this task; backend acceptance remains unverified.

## Performance and build evidence

Canonical authority: `policy/budgets.md`; no new timing threshold or relaxed gate.

| Checklist row | Verdict / measurement plan |
| --- | --- |
| Cold/warm startup | Unverified overhead of one idle tracker allocation; release startup before/after on reference devices |
| Mini-app open | Affected: phase instrumentation and two asynchronous journal events; collect release p50/p95/p99 by app/version/source/launch kind, count interruptions/incomplete starts separately |
| Memory (idle, mini-app, heavy, three apps) | Unverified device memory; one pending record, no timers/listeners added by tracker; repeat open/close and measure steady state |
| Scroll/animation FPS | Unverified device frames; one content layout callback, no scroll/per-frame tracking; compare release traces |
| Binary / Hermes size | Unverified release artifact delta; TS only, no native/dependency additions; compare same-build artifacts |
| Clean / incremental builds | Unverified wall times; TS only, no build configuration changes; compare same machine/cache |
| Crash / build determinism | Targeted lifecycle tests and repository checks; device crashes and reproducible native builds unverified |
| Dependencies / native modules / unsupported / scripts / Pods / Gradle / patches | Before/after counters recorded after checks; no admission required, no dependency/native/build-file additions |

No device/lab/field evidence yet. Owner: host platform team. Rollback: remove the
host signal wiring and event producers; versioned journal records remain readable
by the existing delivery path. No binary/schema migration or public mini-app API.

### Local checks — 2026-10-04

- `npm run typecheck`: pass.
- Three relevant suites (`miniAppLoadTracker`, `trackingService`, `miniAppLoad`):
  33 tests pass in the full run, including actual host/screen signal wiring with
  mocked unrelated services/home animations. This is functional evidence, not
  device latency or UX acceptance.
- Full `npm test -- --runInBand`: 24 suites pass / 2 fail; 151 tests pass / 13 fail.
  Failures are in existing `handler.test.ts` and `aiExtractBill.test.ts`: fixture
  sessions omit `tier`, and the already changed bridge gate returns
  `CAPABILITY_NOT_GRANTED`. These files/gates were not edited by this task.
- `CI=true bash scripts/verify.sh` stops at lint: the existing `sampleBridge`
  memo dependency list in `App.tsx` reports unnecessary `activeFrame.sessionId`.
  The overall verification gate is **not passed**; no lint rule/gate was relaxed.
- Separately run `scripts/conformance.sh` and `scripts/budgets.sh`: pass.
  Before → after reported counters: runtime dependencies 4 → 4; native dependency
  candidates 1 → 1; unsupported candidates 0 → 0; Pods 132 → 132;
  Gradle classpaths 4 → 4 and apply/id entries 6 → 6; scripts 6 → 6;
  native patches 0 → 0. The script does not enumerate local native modules;
  this task adds/edits no native source or build configuration.
- Feature graph regenerated and checked for tracker ownership; `git diff --check`
  passes. Browser/compositor/device measurements and backend ingestion remain
  unverified as stated above.
