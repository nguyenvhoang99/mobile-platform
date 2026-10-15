# Test — native integration contract v1

Status: Debug implementation verified by builds and simulator fixture journeys; human/device acceptance pending.

`test` is a bundled, first-party host screen in category `other` (Khác), available in every tenant. It has no public entrypoints, cross-app links or generic bridge capability. Diagnostic hardware adapters compile only into Debug; Release shows an explanatory page. This is not permission for external mini-apps to access host APIs. Existing seven capability declarations and production gates stay authoritative.

## Scope and observable results

- Existing host integrations: network, coarse location (no tenant change), biometrics only and biometrics/passcode fallback, on-device speech, notification permission/provider registration; calendar, reminders and live surfaces remain available through SDK Demo with its existing fixture.
- NFC: read-only NDEF, record count only, no tag UID/payload stored or dispatched. Missing hardware/disabled reader/entitlement/permission, user cancel and timeout produce explicit results.
- OCR: generated Latin text fixture; Android ML Kit bundled recognizer, iOS Vision. Success requires the expected text actually recognized. No camera/photos/network required.
- TFLite: Android CPU Interpreter smoke with bundled ADD fixture (y = x + x + x, float32 shape 1×8×8×3); explicit error on unexpected output or missing model/runtime. iOS LiteRT SDK is not admitted into the current no-CocoaPods build; show missing integration explicitly, never substitute Vision as TFLite success.
- Passkey: prerequisite inventory only until a real RP domain, signed app associations and backend challenge/verification contract are supplied. Never invent RP, challenge or successful login. No credential creation from arbitrary user-entered domains.
- Broker: use SDK Demo for existing storage and unavailable bill extraction, separately from host device checks. Scanner/crypto/network/location/notify public adapters continue fail closed.

## Ownership and lifecycle

One acquisition per Test screen, user initiated. Cancel before starting another. Stop, close, navigation, tenant switch, destruction and background invalidate the generation; late callbacks cannot change current results. Permission sheets do not revoke a foreground session. NFC timeout 30 seconds, OCR deadline 15 seconds; native SDK tasks cannot always be interrupted, so discard late results and release recognizer/interpreter on task completion. DeviceServices retains its bounded location/speech acquisition. No diagnostic results, coordinates, credentials, images, tag bytes, audio or recognition text are persisted or sent to telemetry. Existing host notification fixtures are explicitly durable OS resources and managed in SDK Demo.

## Acceptance and evidence

Automated: catalog export equality, all-tenant route/category coverage, no public debug capability, both Debug/Release compile, existing core tests, entry-screen/fixture smoke where simulator supports it. Physical acceptance: NFC NDEF/disabled/cancel/background; biometric enrollment/denial/lockout; coarse location denied/revoked/offline; speech unsupported; notification allow/deny; passkey registration/authentication after provisioning. VoiceOver/TalkBack, large text, dark mode, scroll and status announcements remain human checks. A successful build is not a successful hardware test.

## Counters and rollback

No new iOS third-party dependency, build phase or runtime. Android Debug-only ML Kit and LiteRT dependencies; Release excludes SDKs and NFC permission. APK/IPA/build/startup/RSS/FPS deltas are unverified until measured, not waived. Dependency admission is recorded in policy/dependency-decisions.md. Rollback removes Test catalog/category entries and Debug screen/dependencies; does not change broker policy or existing integrations.
