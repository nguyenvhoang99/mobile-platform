# Native Test — verification 2026-10-04

This report applies to the Test screen added to the root Swift/Kotlin hosts. This is a Debug-only, compiled host tool, not an external-mini-app capability or production gate waiver.

| Check | Evidence / verdict |
|---|---|
| Shared catalog | 8 apps; Test in Khác and all four tenants; no declared capabilities/public entrypoints/cross-app links |
| Content/policy/fixture/bundle checks | 6 Node checks pass, including model digest and actual iOS @rpath packaging |
| TypeScript catalog/content | `tsc --noEmit` and 3 Home model tests pass; existing user display-content refactor preserved |
| SwiftPM | 10 core tests pass |
| iOS Debug | Simulator build passes; no external package |
| iOS Release | Unsigned generic arm64 build passes; Test diagnostic implementation compiled out |
| iOS UI | 3 XCTest journeys pass: Home/card search/back; SDK broker/draft/unavailable AI; Test Vision OCR fixture, EC sign/verify and OCR start/close |
| Android Debug | Assemble, 7 unit tests and lint pass; lint has warnings, zero errors |
| Android Release | Assemble, AAB and lint pass; dependency report contains only Kotlin stdlib/annotations, no ML Kit or LiteRT; NFC permission excluded |
| Android optional FCM Debug | Assemble/lint pass; NFC permission retained alongside HostMessagingService; provider/backend delivery still unconfigured |
| Android UI/inference | PASS on Android 17 emulator: direct runner reports 12 smoke checks, including ML Kit OCR, actual LiteRT ADD inference, EC sign/verify, passkey prerequisite and OCR start/close |
| Device-only integrations | UNVERIFIED: NFC, enrollment/lockout/biometrics, permissions/location, microphone speech and OS delivery |
| Passkey | NEEDS_CONFIG: RP/backend challenge/verification and signed app associations absent. No credential created or verified |
| iOS ML SDK parity | NEEDS_SDK: Vision OCR implemented; ML Kit and TFLite SDKs not integrated into the current independent Xcode build |

Build success and simulator fixture inference do not establish device UX, privacy/accessibility acceptance or production enforcement. Human acceptance remains required.

## Resources and counters

Two added direct Android Debug dependencies: ML Kit text-recognition 16.0.1 and LiteRT Interpreter 1.4.2, pinned and admitted in policy/dependency-decisions.md. Default iOS and both Release builds add zero third-party runtime SDKs. No new build plugin, script phase, service, public capability or identity payload. NFC permission/optional hardware feature is Debug-only on Android; iOS Debug has NDEF entitlement requiring real-device provisioning.

The universal Debug APK grows substantially because it bundles models and native runtimes for all ABIs (about 64 MiB versus the previous 1.7 MiB raw APK). This is a measured development artifact cost, not a released device download. Final byte counts/digests are in [test-artifacts.json](evidence/test-artifacts.json). Before values remain in the separate original port report, not overwritten. Release AAB/app-directory comparisons are raw unsigned, unthinned bytes. Startup/RSS/FPS/cold-cache build/physical-device download and binary ratchet verdicts remain UNVERIFIED; policy thresholds are unchanged.

## Repeat and manual acceptance

Run commands in README. The final `connectedDebugAndroidTest` task passes (custom runner, Gradle reports zero JUnit cases). The Android custom instrumentation runner reports PASS/FAIL in its stream; direct `adb shell am instrument -w …SmokeInstrumentation` is the authoritative runner result. Assertions on the UI thread are relayed to the runner, and list scrolling waits for layout. Emulator screen must be awake and keyguard dismissed; a hidden window can have an adapter but zero-size children. The runner keeps the test window awake and waits for focus/layout. SDK initialization gets a bounded 15-second fixture wait.

1. Debug → Home → Khác → Test and Explore → Test in every tenant. Run each feature twice, Stop, close, change tenant, rotate/background/return; no old callback replaces a new result.
2. NFC: actual NDEF tag, unsupported tag, NFC off, cancel and timeout. Confirm no UID/content is shown or saved. iOS provisioning must include NDEF; simulator unavailable is expected.
3. Biometrics only: enroll/no enrollment, deny/cancel/lockout. Verify a passcode fallback cannot satisfy the biometrics-only test. Then separately test the fallback row.
4. Location and speech: allow/deny/revoke, disabled provider/mic, OS model absent, offline, timeout and background. Location must not change the tenant or persist coordinates.
5. Notification permission/provider; SDK Demo reminder/cancel/calendar save/cancel/live surfaces. Real APNs/FCM delivery needs provider configuration and a device; registration request is not delivery proof.
6. Android offline ML Kit OCR must recognize the Latin fixture and LiteRT must return 6 for every float in the ADD output. iOS Vision OCR success must not be reported as ML Kit/TFLite success.
7. VoiceOver/TalkBack, large text, dark appearance, small screen, landscape and status announcements. Passkey end-to-end remains pending RP/backend setup.
