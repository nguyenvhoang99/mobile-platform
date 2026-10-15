# Dependency decisions

## Firebase Cloud Messaging for Android — 2026-08-06

**Proposed by / for:** The host-owned remote-notification pipeline needs an Android push
transport that can receive messages while the application process is not active.

**What carrying it costs:** Firebase Messaging adds a native SDK and Google Services build
plugin, so it participates in Android build compatibility and future React Native/Gradle
upgrades. It is isolated behind the host notification module and is not exposed to
mini-apps.

**Decision:** Admitted. Android does not provide an application-facing push transport that
can replace a provider SDK; implementing a custom persistent connection would be less
reliable, less battery-efficient, and substantially more code to maintain.

**What we did instead of adding a cross-platform wrapper:** iOS uses the platform APNs APIs
directly. Android depends only on the Firebase Messaging artifact, not Analytics or a React
Native Firebase wrapper. The Google Services plugin is applied only when a project-owned
`google-services.json` exists.

**Revisit when:** Firebase Messaging loses support for the project's Android toolchain, the
backend selects a different Android push provider, or Android exposes an equivalent system
transport without a provider SDK.

## 2026-10-04 — Native Test Debug ML integrations

**Decision:** admit Android `com.google.mlkit:text-recognition:16.0.1` and `com.google.ai.edge.litert:litert:1.4.2` as `debugImplementation` only for the explicitly requested Test integration screen. ML Kit supplies offline Latin OCR; LiteRT Interpreter CPU supplies a bounded ADD fixture smoke. No camera, cloud recognizer, model download at runtime, generic capability or production SDK exposure. System APIs cover location, biometric, NFC and iOS Vision; no wrapper SDK. Versions are pinned. Official references: [ML Kit](https://developers.google.com/ml-kit/vision/text-recognition/v2/android), [LiteRT version support](https://developers.google.com/edge/litert/android).

**iOS decision:** use existing system Vision for OCR; defer ML Kit/LiteRT SDK admission rather than introduce CocoaPods or an unreviewed community Swift package into the existing independent Xcode build. Test explicitly reports missing SDK; Vision success is not ML Kit/TFLite success. Passkey requires RP/backend/association configuration and has no fake success path.

**Costs/gates:** two direct Android Debug dependencies, transitive/artifact/build deltas measured in native/TEST-VERIFICATION.md when available. Release dependency graph must exclude both SDKs. Startup/RSS/FPS on reference devices unverified; no budget change. Remove these two declarations and Debug screen to roll back. Licenses/model provenance must accompany bundled fixture. No new build plugin/phase.

## 2026-10-04 — Split Bill native WebView integration

**For:** user's requested bundled Split Bill integration into both root native hosts. Existing public storage.kv/scanner.scan/net.request only; no registry or budget changes.

**Admitted:** `com.google.zxing:core:3.5.4` in root Android, pure Java decoder (Apache-2.0), no transitive/runtime SDK, permission, service, network, native binary or build plugin. Android has no platform QR decoder; use system camera/document picker, then decode host-side. iOS uses system Vision and photo/camera UI, no package/Pod. Refused a WebView framework and camera streaming/ML Kit SDK addition; platform WebView/WKWebView and system broker suffice. Release version/Java/API compatibility reference: [ZXing](https://github.com/zxing/zxing), [release](https://github.com/zxing/zxing/releases/tag/zxing-3.5.4). No RN dependency/module change. Removal: delete decoder and integration if bundled Split Bill is removed, or replace only after tested equivalent platform decoder exists.

**Build tooling:** one local sync script, `native/tools/sync-miniapps.cjs`, stages the mini-app's existing build and copies only host-target assets. Owner Mobile Platform; removal condition signed package importer replaces bundled staging. No additional custom Xcode/Gradle phase/plugin. Both source repos stay unchanged. Root artifact/counters and pending device budget rows reported in `native/SPLIT-BILL-VERIFICATION.md`; no release size exemption or relaxed threshold inferred from this development integration.
