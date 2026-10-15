# Tích hợp web mini app vào host Android

Tài liệu theo implementation ngày 04/10/2026, dùng **Chia tiền / Split Bill** làm ví dụ chạy được. Target là host Kotlin/Android Views tại `android/`, application ID `com.miniappplatform.nativehost`, minSdk 24, compileSdk/targetSdk 36. Phần React Native tại `app/` là bản tham chiếu; các bước dưới đây áp dụng cho host native đã tích hợp.

Kết quả: host mở mini app trong Android WebView, mini app gọi các capability native qua giao thức `shared-platform` v1. Source nghiệp vụ/UI vẫn thuộc repo mini app. Đây là bundled first-party PoC; chưa phải pipeline nhận và phát hành mini app bên ngoài.

## 1. Thành phần và luồng chạy

```text
split-bill: build host-target
  → native/shared/miniapps/split-bill/
  → Gradle assets
  → kiểm tra hash trước khi tạo WebView
  → https://split-bill.miniapp.platform.local/ (asset local)
  → host.js trước bundle.js → MiniAppBridge.request
  → origin-targeted WebMessagePort
  → native validation → storage / scanner / network → response
```

| Thành phần | File chịu trách nhiệm |
| --- | --- |
| Nhập/build mini app, tạo hash và provenance | [sync-miniapps.cjs](../tools/sync-miniapps.cjs) |
| Asset đã đóng gói | [miniapps/split-bill](../shared/miniapps/split-bill/) |
| Đăng ký catalog và xuất policy cho native | [export-data.cjs](../tools/export-data.cjs), [platform.json](../shared/platform.json) |
| Handshake và JS transport | [miniapp-host.js](../miniapp-host.js) |
| Package loader, WebView, bridge, handlers và capture provider | [MiniAppWebView.kt](../../android/app/src/main/java/com/miniappplatform/nativehost/MiniAppWebView.kt) |
| Route, Back và Activity lifecycle | [MainActivity.kt](../../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt) |
| Assets, decoder dependency và test runner | [build.gradle.kts](../../android/app/build.gradle.kts) |
| Network permission và capture provider | [AndroidManifest.xml](../../android/app/src/main/AndroidManifest.xml) |

`shared-platform/packages/host-bridge/core` cung cấp giao thức/client phía web. Host Android tự implement transport và handlers tương thích; không thêm native package của `shared-platform` hoặc framework WebView ngoài hệ thống. Bản snapshot client trong `native/tests/fixtures/` chỉ phục vụ kiểm thử compatibility, không được bundle vào app.

## 2. Chuẩn bị source và nhập asset

Trên máy phát triển cần JDK 17, Android SDK 36, Node và dependencies tooling hiện có của `app/` (`typescript`, `yaml`). Cấu hình SDK bằng `ANDROID_HOME` hoặc `android/local.properties` theo máy; không commit đường dẫn máy cá nhân. Hai source repo trong workspace này:

- `/Users/lap16954/Documents/mine/mini-apps/split-bill`, nhánh chính xác `feat/expense-first-ux`.
- `/Users/lap16954/Documents/mine/mini-apps/shared-platform`, nằm cạnh repo `split-bill` để script đọc host-bridge client.

Chạy từ root host:

```sh
cd /Users/lap16954/Documents/mine/platform/mobile
git -C /Users/lap16954/Documents/mine/mini-apps/split-bill branch --show-current
node native/tools/sync-miniapps.cjs /Users/lap16954/Documents/mine/mini-apps/split-bill
node native/tools/export-data.cjs
node --test native/tests/content.test.cjs native/tests/miniapp-bridge.test.cjs
```

Script nhận Split Bill ở nhánh `feat/expense-first-ux` và Manage Expense ở nhánh `feat/manage-expense-revamp`, với manifest/grant được kiểm tra riêng cho từng app. Split Bill có `storage.kv`, `scanner.scan`, `net.request`; Manage Expense có `storage.kv`, `ai.extract_expenses`, `notifications.schedule_digest`. Root route là `/`. Script copy `build.mjs`, `src`, `vendor` sang thư mục tạm, chạy build host-target ở đó rồi nhập:

```text
native/shared/miniapps/split-bill/
  index.html     # host.js nằm trước script của mini app
  bundle.js
  host.js
  manifest.json
  package.json   # SHA-256 từng asset, branch, commit, working-tree provenance
```

Working tree hiện tại được đưa vào bản build, kể cả thay đổi chưa commit; `sourceIncludesWorkingTree` ghi rõ điều này. Script không checkout/reset và không sửa hai repo nguồn. `package.json` ở đây là chỉ mục xác minh package, không phải dependency manifest npm.

`export-data.cjs` thêm Chia tiền vào catalog native, featured apps của các khu vực và nhóm Khác. `resourceEndpoint: bundle://split-bill` là dấu hiệu catalog; URL WebView thực tế là HTTPS origin local ở mục 1. Không sửa `platform.json` bằng tay. Policy capability/quota lấy từ [capabilities.yaml](../../policy/capabilities.yaml).

## 3. Cấu hình Gradle, manifest và WebView

Các cấu hình sau **đã có** trong project:

```kotlin
// android/app/build.gradle.kts
android {
    sourceSets["main"].assets.srcDir("../../native/shared")
}
dependencies {
    implementation("com.google.zxing:core:3.5.4")
}
```

Gradle đóng gói `platform.json` và `miniapps/split-bill/*`. ZXing core là decoder QR Java, không phải camera UI; admission/removal ghi tại [dependency decisions](../../policy/dependency-decisions.md).

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<!-- Đặt provider trong application; giữ các thuộc tính application hiện có. -->
<provider
    android:name=".ScanCaptureProvider"
    android:authorities="${applicationId}.scan"
    android:exported="false"
    android:grantUriPermissions="true" />
```

Host không khai báo `CAMERA` cho flow Split Bill: chụp ảnh được giao cho camera app hệ thống qua URI grant tạm. `usesCleartextTraffic=false`, backup tắt theo manifest host hiện có. Không thêm quyền truy cập bộ nhớ rộng.

Route Split Bill trong `MainActivity.render()` giữ một `MiniAppWebView` theo navigation frame/session. Factory thực hiện:

1. Đọc đúng bốn asset và đối chiếu SHA-256 trước `WebView(activity)`; package lỗi thì host chưa chạy JS.
2. Bật JS để chạy bundle; tắt DOM/database storage, file/content access, mixed content, geolocation và cookie. Tắt cache, từ chối WebView media permissions và cửa sổ mới.
3. Dùng `shouldInterceptRequest` để trả asset local cho đúng HTTPS origin, GET và path; route đã khai báo được trả HTML entry. URL này không gọi DNS/web server bên ngoài.
4. Đặt CSP ở **response header**: script local, `connect-src 'none'`, không frame/worker/object/form submit. Hủy navigation đến foreign origin/scheme hoặc route chưa khai báo.
5. `onPageFinished` tạo `WebMessageChannel`; gửi port sang page bằng `postWebMessage` với target origin chính xác, không wildcard. `host.js` chờ port trước khi gửi các request đã queue.

Production transport không dùng `addJavascriptInterface`, reflective method dispatcher hoặc `evaluateJavascript`. Chỉ mở debugging khi APK debuggable. Không cần server, Metro hoặc `file://` origin.

## 4. Gọi feature native từ web

Host đặt `window.__MINIAPP_CAPS__` và `window.MiniAppBridge` trước author script. Snapshot được freeze theo app ID, gồm ba capability của app đang mở; native vẫn kiểm declaration, version, args và quota cho từng call. Snapshot không thay thế authorization và chưa là signed remote grant.

Ví dụ ghi nháp có feature detection và xử lý lỗi:

```js
let requestSequence = 0;
async function saveDraft(key, draft) {
  if (!window.__MINIAPP_CAPS__?.['storage.kv'] || !window.MiniAppBridge) {
    return { saved: false }; // UI giữ draft và báo chưa có lưu trữ host
  }
  const result = await window.MiniAppBridge.request({
    id: `draft-${Date.now()}-${++requestSequence}`,
    capability: 'storage.kv',
    operation: 'kv',
    version: 1,
    args: { op: 'set', key, value: JSON.stringify(draft) },
  });
  if (result.ok) return { saved: true };
  switch (result.error) {
    case 'RATE_LIMITED':
    case 'REVOKED':
    case 'UNAVAILABLE':
      return { saved: false }; // Giữ draft; không tự gửi lại liên tục
    default:
      return { saved: false }; // Có fallback cho mã lỗi mới
  }
}
```

`id` phải duy nhất cho mỗi request mới, dạng chữ/số/`_`/`-`; có thể dùng ID do adapter tạo. Trong một live session, ID đã hoàn tất trả lại kết quả cũ để tránh mutation lặp; không tái sử dụng ID khi args thay đổi. Đây không phải idempotency ledger durable sau process restart.

| Capability | `operation` | `args` của integration hiện tại | Success `data` |
| --- | --- | --- | --- |
| `storage.kv` | `kv` | `{op:'get', key}` | `{value: string hoặc null}` |
| `storage.kv` | `kv` | `{op:'set', key, value: JSON.stringify(draft)}` | `null` |
| `storage.kv` | `kv` | `{op:'delete', key}` | `null` |
| `scanner.scan` | `scan` | `{mode:'qr', formats:['qr']}` | `{value: decodedText, format:'qr'}` |
| `net.request` | `request` | `{method:'GET', url:'https://vietqr.net/api/banks'}` | `{status, body: string}` |

Handshake storage liệt kê `get/set/delete`, nhưng wire operation là **`kv`**, hành động cụ thể nằm trong `args.op`. Không gửi `operation:'set'`. Request chỉ có `id`, `capability`, `operation`, `version`, `args`; không gửi `appId`, `tenant`, `user`, origin hoặc native path. Host bind identity từ container: tenant / split-bill / local-preview-user.

Response thành công: `{id, ok:true, data:...}`. Response lỗi: `{id, ok:false, error:'CODE', data:null}`. Transport match `id` và resolve Promise. Các nhánh cần xử lý gồm `INVALID_ARGUMENT`, `CAPABILITY_NOT_GRANTED`, `RATE_LIMITED`, `CONSENT_DENIED`, `REVOKED`, `TIMEOUT`, `UNAVAILABLE` và default cho mã chưa biết. Từ chối/cancel không được tự động mở lại camera; không retry flood. Registry có nhiều mã hơn nhưng PoC scanner hiện gộp hủy/từ chối thành `CONSENT_DENIED`, chưa phân biệt từ chối vĩnh viễn.

## 5. Native adapters và lifecycle

**Storage:** worker IO + lock serialize writes, `AtomicFile` trong `filesDir`, namespace hash theo tenant/app/local-preview-user; backup tắt. Host trả success sau write hoàn tất. File corrupt/quá giới hạn trả `UNAVAILABLE`, không ghi đè bản gốc. Mini app sở hữu schema và serialize value thành string; KV không phải keystore hay server account.

**Scanner:** UI native cho Camera/Chọn ảnh. Camera dùng `ACTION_IMAGE_CAPTURE` với `EXTRA_OUTPUT` trỏ tới random URI của `ScanCaptureProvider`; provider không exported và chỉ nhận tên file capture hợp lệ. Chọn ảnh dùng `ACTION_OPEN_DOCUMENT`. Host downsample/decode bằng ZXing, chỉ QR text trả về web; thu hồi URI grant và xóa ảnh tạm khi kết thúc. Không có camera streaming, `getUserMedia` hoặc API trả ảnh/raw path. Thiết bị phải có camera app phù hợp; không có thì trả `UNAVAILABLE`.

**Network:** `HttpURLConnection` trên worker, chỉ GET URL banks nêu trên, không theo redirect/cache, response bounded và deadline hữu hạn. Endpoint lỗi thì mini app dùng seed banks. Khai thêm host trong manifest chưa đủ để host cho gọi URL mới; phải thay native allowlist theo contract được duyệt.

**Lifecycle:** `MainActivity` chuyển `onStop` tới `pause`, render khi `onStart` resume instance cùng frame, `onDestroy`/đổi frame gọi `close`. `onActivityResult` chuyển kết quả picker request code 701 tới instance sở hữu; flow picker hệ thống được nhận diện riêng để không hủy giữa lúc đang chọn ảnh. Background hủy request khác; close hủy network/scanner, đóng port, destroy WebView và worker, bỏ callback muộn. Back thử web history trước, Close luôn thuộc host. Renderer chết thì đóng instance và báo mở lại. Orientation/process recreation chỉ phục hồi dữ liệu KV đã commit.

## 6. Build, chạy và kiểm tra

Mở `android/` bằng Android Studio → app → Run trên emulator hoặc thiết bị. Vào **Home/Khám phá → Chia tiền**. Build dùng asset đã nhập, không tự chạy sync.

```sh
./android/gradlew -p android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
./android/gradlew -p android :app:assembleRelease :app:lintRelease
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Release command trên tạo APK unsigned theo cấu hình hiện tại; chưa phải bản đã ký để phát hành. JDK/SDK/signing là cấu hình máy/host riêng, không lấy credentials từ mini app.

Chạy instrumentation integration riêng:

```sh
./android/gradlew -p android -PtestRunner=com.miniappplatform.nativehost.SplitBillInstrumentation :app:assembleDebugAndroidTest
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w com.miniappplatform.nativehost.test/com.miniappplatform.nativehost.SplitBillInstrumentation
```

Cài app Debug trước test APK, bật/mở khóa emulator, chọn đúng thiết bị nếu ADB có nhiều thiết bị. Kiểm tra stream có `PASS` và không có `FAIL`; exit code ADB bằng 0 chưa đủ. Default runner vẫn là `SmokeInstrumentation`; `-PtestRunner` chỉ chọn runner cho bản test.

Kiểm tra thủ công: đặt tên bill → chuyển focus → thêm `Bữa tối 45k An trả` → xác nhận ALL lần đầu → chờ lưu → Close/mở lại và restart. Thử QR từ camera/ảnh, hủy, background, đổi khu vực, offline, rotate, system Back, keyboard, TalkBack và chữ lớn.

## 7. Lỗi thường gặp, cập nhật và giới hạn

| Hiện tượng | Kiểm tra |
| --- | --- |
| Không thấy Chia tiền | Chạy exporter; kiểm tra asset `platform.json` trong APK root native |
| “Gói Chia tiền không hợp lệ” | APK có đủ `assets/miniapps/split-bill/*`; sync lại asset + hash, rebuild; không bỏ kiểm tra hash |
| Bridge thiếu/hangs | `host.js` trước `bundle.js`, `onPageFinished` gửi port tới đúng origin; không thay target bằng `*` |
| `INVALID_ARGUMENT` khi storage | `operation:'kv'`, `args.op`, value là string; envelope không thêm identity fields |
| `fetch` không chạy | Dùng `net.request`; CSP chặn direct network, không bật file/universal access để chữa lỗi |
| Camera trả `UNAVAILABLE` | Camera app hệ thống có sẵn; provider authority khớp `${applicationId}.scan`, result chuyển đúng request 701 |
| Nháp cuối mất khi đóng/rotate ngay | Mini app đổi title trên blur và coalesce save; chờ request lưu xong, không coi trạng thái UI là durable receipt |

Sau mỗi thay đổi mini app hoặc `native/miniapp-host.js`: chạy sync → exporter → checks → rebuild native. Bản hiện tại cần phát hành binary mới để đưa asset mới đến người dùng; không có OTA/remote package loader.

Factory hiện hỗ trợ Split Bill và Manage Expense qua app ID đã xác minh. Nếu tích hợp **mini app khác**, cần điều chỉnh contract/import validator, asset whitelist, origin, catalog, route, native grants và scope KV, vẫn giữ một factory. Không chỉ đổi URL để tải website bất kỳ. Capability mới cần contract/handler/policy và kiểm thử riêng; ba capability trên không tự cấp mọi feature của host.

Evidence đã có: Debug/unsigned Release build/lint, domain tests và real-WebView emulator instrumentation: boot, durable draft/reopen, protocol validation, dedupe, malformed/forged/oversized/flood rejection, storage/network/navigation denial, QR bitmap fixture và scanner cancel. Acquisition camera/ảnh trên máy thật, accessibility và performance/binary budgets trên thiết bị tham chiếu còn chưa xác minh. Hash pinning của asset bundled không phải dual-signature verification. Android shared renderer chưa tương đương isolation iOS; minimum WebView admission, full unavailable-web-feature matrix và external publication vẫn là gaps. Online banks delivery chưa được xác nhận.

Xem [contract](../SPLIT-BILL-CONTRACT.md), [evidence và manual acceptance](../SPLIT-BILL-VERIFICATION.md), [conformance](../../policy/conformance.md), [budgets](../../policy/budgets.md) và [dependency decisions](../../policy/dependency-decisions.md). Không nới các gate bằng cấu hình trong tài liệu này. Rollback gỡ registration, asset, route/adapter và QR decoder Split Bill; giữ KV đã lưu để phục hồi dữ liệu.

## Manage Expense (2026-10-06)

Factory hiện nhận appId thuộc allowlist Split Bill/Manage Expense; mỗi app có asset hash, origin, route, grants và scope KV riêng. Chạy sync với `/Users/lap16954/Documents/mine/mini-apps/manage-expense` trên nhánh `feat/manage-expense-revamp`, exporter rồi `node --test native/tests/content.test.cjs native/tests/miniapp-bridge.test.cjs native/tests/manage-expense.test.cjs`. Manage Expense được đăng ký trong Khác. Source build tạo bundle React offline, không cần Next server, giữ CSP connect-src none. Manage Expense khai báo storage.kv, ai.extract_expenses và notifications.schedule_digest. Host dùng picker được user chọn, xử lý model local và trả giao dịch nháp để review; không gửi ảnh cloud. iOS cần Foundation Models khả dụng trên iOS 26+, Android cần model multimodal .litertlm được user nhập và LiteRT-LM 0.17.1/Kotlin 2.4.0. KV vẫn giới hạn 64 KiB/request, tổng 24 MiB cho app; ledger dùng revision chunks/journal. Digest là nhắc mở báo cáo hiện tại; chưa có backend push hoặc tổng tiền tính khi app không chạy. Lối tắt gợi ý thẻ từ header dùng Live Activity/notification, mở #advisor. Build đã qua; inference, delivery và performance trên máy thật còn cần acceptance.


## Manage Expense — tích hợp ngày 06/10/2026

Manage Expense dùng cùng factory WebView, origin/hash/grant và KV namespace riêng. App được đăng ký trong Khác cho mọi tenant; không được cấp scanner/network của Split Bill. Sync từ `/Users/lap16954/Documents/mine/mini-apps/manage-expense` trên nhánh `feat/manage-expense-revamp`, rồi chạy `export-data.cjs` và ba test package/bridge, gồm `native/tests/manage-expense.test.cjs`.

Source nghiệp vụ và UI ở repo Manage Expense; xem `docs/HOST_INTEGRATION.md` và `docs/reports/REVAMP_READINESS.md` trong repo đó. Ledger local dùng profile `local-preview-user`, quota tổng 24 MiB, mỗi request tối đa 64 KiB; adapter chia chunk và commit pointer sau cùng. Không đồng bộ ledger local với cloud legacy.

Ảnh được chọn/paste bằng thao tác người dùng và xử lý on-device, không có fallback cloud. iOS dùng Vision OCR + Foundation Models khi model hệ thống khả dụng trên thiết bị hỗ trợ; Android dùng LiteRT-LM 0.17.1 với model multimodal `.litertlm` do người dùng chọn. Handler trả candidate chưa xác nhận, tối đa 40 dòng; UI cần sửa/duyệt trước khi ghi sổ.

Digest là lời nhắc local của OS để mở báo cáo hiện tại, nội dung khóa màn hình chung. Lối tắt gợi ý thẻ được bật riêng: iOS Live Activity hoặc notification Android, mở sheet merchant/số tiền trong app, không đặt bàn phím trên Lock Screen. Test iOS `testManageExpenseManualLedgerSurvivesCloseAndProcessRelaunch` đã qua trên Simulator; model inference, thông báo/Live Activity và latency/memory trên thiết bị thật vẫn cần acceptance.
