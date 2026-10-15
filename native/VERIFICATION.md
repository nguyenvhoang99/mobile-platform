# Native verification — 2026-10-03

Owner: Mobile Platform. Source includes the user's existing working-tree changes; no claim of a clean committed baseline. This report applies to the new root native projects. Existing RN checks remain separate.

## Automated evidence

| Check | Result | Evidence |
|---|---|---|
| Shared content/source/policy parity | PASS, 4 tests | `node --test native/tests/content.test.cjs` |
| Swift core | PASS, 10 tests | SwiftPM; search/tenant, ownership/capacity, snapshot scope, route/cross-link/notification allowlists, malformed/expired push, FCM string-map input, UUIDv7, consent/version/quota/audit/revocation and no write after synchronous revoke |
| Kotlin core | PASS, 7 tests | `:app:testDebugUnitTest`; booking/capacity, date interval, Vietnamese search, tenant resolution, route/notification gates, preferences and broker isolation/quota/revocation |
| iOS app/core/extension debug | PASS | Xcode simulator build, signing disabled |
| iOS core/app/Live Activity release | PASS | arm64 generic iOS device build, signing disabled; not an IPA or device install |
| iOS standalone launch/framework load | PASS | Direct simctl install/launch outside XCTest, embedded @rpath framework verified for debug and arm64 release; binary packaging regression test |
| iOS UI journeys | PASS, 2 tests | iPhone 17 simulator, iOS 27.0: Home/Explore → cards/search → Back; sample KV write/read → AI consent/unavailable → Close |
| Android debug + release AAB | PASS | `assembleDebug`, `bundleRelease`; R8 enabled; release unsigned |
| Android debug/release lint | PASS, zero errors | 14 warnings in default variants; not suppressed or re-baselined |
| FCM optional debug variant | PASS compile/lint | `-PenableFirebase=true`; no Firebase resources, credentials or network delivery test |
| Android instrumentation | PASS, 7 checks | Medium_Phone emulator: bundled content, real JSON snapshot roundtrip/isolation, valid/invalid/expired payload, cards/search/back, SDK storage write/read and retained edited input |
| Original RN reference | Typecheck PASS; verify FAIL at existing lint | `app/App.tsx:700` unnecessary `activeFrame.sessionId` useMemo dependency; native work did not edit this file. This blocks that RN verification run before subsequent stages |

Android instrumentation uses real platform Activity/widgets and IO/JSON adapters, with programmatic view actions. iOS XCTest uses actual UI automation and accessibility queries. Neither proves manual UX acceptance. The two initial iOS runs failed because search mode hides the navigation toolbar and List virtualizes offscreen status/buttons; tests now close search in the active locale and scroll to controls/status. Assertions were preserved and the final run passed. No permission/resource success was inferred from those UI tests. A later direct launch outside XCTest exposed a DYLD failure: the framework install name used an absolute system path, which XCTest’s framework search path had masked. Both configurations now use `@rpath/PlatformCore.framework/PlatformCore`; standalone launch and actual Mach-O dependencies passed. A binary-based regression test covers both debug and release packaging.

Android warning categories: durability uses `SharedPreferences.commit()` on an IO worker (explicit result required); Vietnamese literals not yet resource-localized; retained target API 36 vs newer tool suggestion; modern manifest attribute ignored below its API. Gradle reports deprecated tooling APIs. Xcode reports AppIntents metadata extraction skipped because no AppIntents framework is used. These are not production readiness proofs.

Raw logs and XCTest result bundle were produced in `/private/tmp/mobile-native-*`; this directory is temporary. The checked-in report/snapshots and `artifacts.json` identify the evidence retained in this port. Repeat commands in README to regenerate results on another machine. Release builds after the UI run include defensive speech-engine cleanup/failure handling; the UI journeys do not exercise microphone access.

## Performance matrix

All thresholds remain in `policy/budgets.md`. Device rows use its actual reference tiers, not the emulator as a substitute. Compilation, debug UI tests and raw file sizes do not establish a performance budget pass.

| Required measurement group | Status and next evidence |
|---|---|
| Cold startup and native init | UNVERIFIED. Release launch traces on reference devices; native markers currently represent host readiness, not verified compositor presentation; align before comparing RN |
| Warm startup to screen ready | UNVERIFIED. Same fixture/session state, repeated release samples; distinguish process alive from cold restart |
| Memory idle / mini-app / heavy screen | UNVERIFIED. Same device and fixture; background/close/resource cleanup/pressure; no external WebViews exist in either exercised PoC slice |
| Scroll + animation FPS, slow/frozen frames | UNVERIFIED. Release card/home/sample scroll traces at device refresh rate, accessibility text sizes and Reduce Motion |
| Binary size | Raw unsigned native artifacts recorded in `artifacts.json`. Android AAB bytes are not Play device download bytes; iOS app directory is not thinned install size. RN before/after and ratchet verdict remain UNVERIFIED |
| Clean release build | UNVERIFIED benchmark. Successful local builds used an already populated SDK/dependency cache; no repeated cold-cache AAB+IPA samples |
| Incremental build/install | UNVERIFIED benchmark. Cached incremental builds passed, but not a controlled single-change repeated measurement |
| Crash/build determinism | A standalone launch initially crashed due to the framework install name; fixed and verified by direct launch and binary dependency inspection. UNVERIFIED field crash-free rate, low-memory behavior, OS resource paths, reproducible clean builds and repeatable lab execution |

There is no evidence to claim a native speedup percentage, zero jank, all budget rows green, APNs/FCM delivery, external-mini-app sandbox enforcement or production release readiness.

## Dependency and tooling counters

`app/scripts/budgets.sh` was run against the unchanged RN reference. It reports four direct JS runtime dependencies, one detected third-party native-module package, zero unsupported candidates, 132 transitive Pod entries, four Gradle classpaths plus six apply/id entries, six custom scripts, zero patches. Its native-package detection is a partial heuristic and does not count every local native adapter. Its parsing targets the RN paths/Groovy and does not count the new Kotlin build files.

| Counter | New native footprint / decision |
|---|---|
| Direct runtime dependencies | iOS: zero external packages. Android default: Kotlin stdlib; optional FCM: one additional declared runtime artifact, with its admitted transitive SDK dependencies. JUnit is test-only |
| Native modules | No RN native modules. Platform adapters are compiled host sources; iOS has app/core/extension targets. Track native feature ownership independently of RN package metrics |
| Unsupported packages | No new wrapper/UI package. Toolchain is repo-matched and compiled locally; continued maintenance/compatibility audit remains a release responsibility |
| Build scripts/phases | One new content exporter with owner/removal condition; normal static Xcode phases, Gradle application/Kotlin plugins and copied standard Gradle wrapper. No JS/CocoaPods build phase |
| Pod dependencies | Zero in native iOS; existing 132 entries remain only in the RN reference |
| Gradle plugins | Two unique plugins in native Android: AGP and Kotlin. Four plugin declarations across root/module; no RN or Google Services plugin. Versions selected from existing toolchain, not silently upgraded |
| Custom native patches | Zero vendor/dependency patches. New application configuration is native host source, not a dependency patch |

Trade-off/refusal: additional Compose/AndroidX UI library, cross-platform native wrapper and shared C++ core were refused because current fixtures/control/state logic do not demonstrate a need. SwiftUI and Android system Views already cover the flows; independent pure domain tests plus shared catalog retain cross-platform consistency. FCM stays behind a build property because the optional SDK is already admitted and provider configuration is absent. Owner: Mobile Platform. Remove exporter when signed native configuration replaces bundled source content; remove optional FCM switch when the project chooses a configured production transport. No policy ceilings were loosened. Retained RN code plus new hosts increases repository footprint; this is development rollback, not a shipped second runtime.

## Release blockers and human acceptance

See README manual script and contract. Must still obtain actual-device permission/deny/revoke/resource evidence, large-text and VoiceOver/TalkBack acceptance, local reminder/reboot/Doze/calendar/Live Activity/Live Update behavior, low-tier release performance, signing/thinning/download artifacts, provider/backend contracts, CI integration and reproducible clean-build evidence. Native telemetry transport/full instrumentation/replay and isolated external-package runtime remain unimplemented; current runtime is a trusted native preview. Do not interpret failed-closed adapters as production capability implementations.
