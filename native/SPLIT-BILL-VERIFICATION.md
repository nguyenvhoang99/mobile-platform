# Split Bill integration verification — 2026-10-04

Targets: root `ios/` MobileNative and root `android/`, existing Swift/Kotlin runtime. RN `app/` remains reference. Both mini-app source repositories retain their original user changes. Import uses the working tree on `feat/expense-first-ux`, records commit + asset hashes, and stages its build under temporary storage. The shared-platform JS host client is a pinned test-only compatibility snapshot; it is not a new host runtime dependency.

## Automated evidence

- Host asset/protocol/conformance checks: 11 pass, including actual built iOS framework paths, tamper/hash checks, frozen handshake, shared-platform KV/client compatibility, Android MessagePort reply/late-connection timeout, single native factory and native origin/frame/CSP controls.
- Split Bill source domain + existing DOM smoke tests: 28 pass. Source/bundles in the mini-app repository were not rewritten.
- Swift PlatformCore: 10 tests pass after catalog grows from eight to nine entries.
- Android domain: 7 tests pass. Debug/unsigned Release builds and lint pass (existing warnings remain).
- Android real emulator instrumentation: host-served page boot, shared wire protocol, durable KV and real app expense restore after Close/reopen, duplicate request no duplicate mutation, forged caller/version/unknown/oversized request denial, storage/direct fetch/foreign navigation denial, offline QR image fixture decode, scanner cancel and quota flood rejection. This tests the real WebView → native transport, not a mocked broker.
- iOS simulator XCTest: real WKWebView, edit bill title and move focus to commit, Close/reopen, terminate/relaunch and read the committed title. Camera capture and photo picking on an actual iPhone remain manual acceptance.
- iOS unsigned Release compile passes; no signing/provisioning or credentials used.

Evidence files under `native/evidence/split-bill-*` distinguish final successful runs from earlier failed fixture attempts. Earlier UI attempts typed an incomplete expense, omitted the first ALL confirmation, or closed before the author's save timer; tests were corrected to use the author's actual workflow and durable writes. No runtime expectation/policy was relaxed.

RN checks were also run: typecheck, static conformance and counter budgets pass. Full `scripts/verify.sh` stops at an existing lint error in `app/App.tsx` (unnecessary `activeFrame.sessionId` memo dependency). Independent RN Jest run has 24 suites/151 tests pass and 2 suites/13 tests fail in `bridge/__tests__/aiExtractBill.test.ts` and `bridge/__tests__/handler.test.ts` (including CAPABILITY_NOT_GRANTED in the existing AI grant paths). These RN implementation/test files were not changed by the integration. Full workspace verification is therefore **not green**; these failures are not represented as native integration passes.

## Commands

```sh
node native/tools/sync-miniapps.cjs /Users/lap16954/Documents/mine/mini-apps/split-bill
node native/tools/export-data.cjs
node --test native/tests/content.test.cjs native/tests/miniapp-bridge.test.cjs
swift test --package-path ios
./android/gradlew -p android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:assembleRelease :app:lintRelease
./android/gradlew -p android -PtestRunner=com.miniappplatform.nativehost.SplitBillInstrumentation :app:assembleDebugAndroidTest
# Install both APKs on an emulator, then:
adb shell am instrument -w com.miniappplatform.nativehost.test/com.miniappplatform.nativehost.SplitBillInstrumentation
xcodebuild -project ios/MiniAppPlatform.xcodeproj -scheme MobileNative -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:NativeJourneyTests/NativeJourneyTests/testSplitBillWebViewBootDraftAndReopen CODE_SIGNING_ALLOWED=NO test
```

Gradle's default test runner remains the existing host SmokeInstrumentation; `testRunner` only selects the integration test build, not product behavior. ADB can exit zero even when custom instrumentation reports FAIL; inspect its stream for PASS/FAIL.

## Known limits and manual acceptance

1. Open Home/Khám phá → Chia tiền on a real iPhone/Android device. Name a bill, move focus, add `Bữa tối 45k An trả`, confirm ALL the first time. Wait for the mini-app save to complete, Close/reopen and restart. The host returns storage success only after atomic write. **The existing mini-app coalesces saves and changes title on blur; immediate Close/kill while typing or before its timer fires can lose uncommitted edits. Its persistence badge does not identify a pending write reliably. This author-side gap was observed, not fixed by host configuration.** Android orientation recreates the WebView from committed KV; uncommitted UI edits have the same limitation.
2. Settlement recipient → scan VietQR → Camera or Chọn ảnh. Test a known QR image, camera permission deny/revoke on iOS, no QR, cancel, repeat, background/Close and timeout. Only decoded text reaches JS; never pixels, file paths or provider grants. Android camera availability depends on an installed system capture app. No live camera preview in the mini-app.
3. Repeat in a different host area; its bill must be separate. There is no authenticated server account; identity is explicitly local-preview-user. Storage errors/full/corrupt file fail without false native success or overwriting corrupt bytes. KV/audit remain local and are not production secure storage/central audit.
4. Bank refresh is restricted to the mini-app's exact declared `https://vietqr.net/api/banks`. An unavailable/offline/non-2xx/oversized/redirected response retains the mini-app seed list. Online data delivery was not established; no extra endpoint/credential was silently authorized.
5. Back/Close always remain native. Test keyboard, small phone, landscape, dark appearance, VoiceOver/TalkBack, large text and Reduced Motion. Automatic tests do not constitute product/a11y/camera device acceptance.
6. These are bundled first-party assets, pinned before WebView construction. External import, dual signatures, minimum-WebView admission, signed remote grants/revocation, full unavailable-web-feature enforcement and CI/device security evidence remain production gaps. WK storage is a fresh nonpersistent data store plus page API suppression, not a proven native engine-level ban. Android shared renderer retains its platform isolation limits. No warm pool or direct web native permissions.

## Canonical budget checklist

No values in `policy/budgets.md` were changed.

| Row/group | Verdict |
| --- | --- |
| Cold/warm startup, mini-app open | Affected: first real WebView creation/assets; reference-device release before/after latency not measured. Mobile Platform owns measurement. |
| Idle/per-WebView/heavy/three-app memory, low-memory kills | Affected: one WebView only; native cleanup tested by close path, RSS/energy/pressure and three-instance budgets unverified. No pool claim. |
| Scroll/FPS/frozen frames | Affected by WebView; reference-device traces and screen-reader/large-text journeys unverified. |
| Binary size | Raw unsigned artifacts recorded in split-bill-artifacts.json. Growth is significant; device download/thinned install ratchet is **not accepted** and requires measurement/owner release gate before publication. No exemption inferred. |
| Clean/incremental build timing, reproducibility/crash | Compilation measured as commands only; no controlled clean/cache before/after series, deterministic artifact comparison or device crash rate. Unverified. |
| RN deps/modules/unsupported/Pods/plugins/patches | Unchanged by this task: 4 runtime deps, 1 counted external native module, 0 unsupported candidates, 132 Pods, 4 classpaths + 6 apply/id, 6 app scripts, 0 patches. RN budget script still excludes root native projects. |
| Root dependency/tooling | Default Release direct decoder dependency 0 → 1 (ZXing core, pure Java, no transitive deps); native import scripts 1 → 2 (sync owner/removal documented). No new Pod/plugin/custom build phase/patch. Platform WebView/WKWebView, provider and host scanner/storage/network source added; maintenance/device footprint requires native release review. |

Rollback: remove split-bill registration from native exporter, asset resource, view route/factory and QR decoder dependency; retain the scoped KV files for user recovery. RN rollback/reference, SDK Demo and existing policy remain intact.
