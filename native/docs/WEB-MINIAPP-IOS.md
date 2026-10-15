# Tích hợp web mini app vào host iOS

Tài liệu theo implementation ngày 04/10/2026, dùng **Chia tiền / Split Bill** làm ví dụ chạy được. Target là host Swift/SwiftUI tại `ios/`, scheme `MobileNative`, minimum iOS 15.1. Phần React Native tại `app/` là bản tham chiếu; các bước dưới đây áp dụng cho host native đã tích hợp.

Kết quả: host mở mini app trong WKWebView, mini app gọi các capability native qua giao thức `shared-platform` v1. Source nghiệp vụ/UI vẫn thuộc repo mini app. Đây là bundled first-party PoC; chưa phải pipeline nhận và phát hành mini app bên ngoài.

## 1. Thành phần và luồng chạy

```text
split-bill: build host-target
  → native/shared/miniapps/split-bill/
  → Xcode Copy Bundle Resources
  → kiểm tra hash trước khi tạo WKWebView
  → mini://split-bill/ + host.js trước bundle.js
  → MiniAppBridge.request
  → WKScriptMessageHandlerWithReply
  → native validation → storage / scanner / network → response
```

| Thành phần | File chịu trách nhiệm |
| --- | --- |
| Nhập/build mini app, tạo hash và provenance | [sync-miniapps.cjs](../tools/sync-miniapps.cjs) |
| Asset đã đóng gói | [miniapps/split-bill](../shared/miniapps/split-bill/) |
| Đăng ký catalog và xuất policy cho native | [export-data.cjs](../tools/export-data.cjs), [platform.json](../shared/platform.json) |
| Handshake và JS transport | [miniapp-host.js](../miniapp-host.js) |
| Package loader, WKWebView, bridge và native handlers | [MiniAppWebView.swift](../../ios/Sources/PlatformApp/MiniAppWebView.swift) |
| Route và Back của host | [NativeApp.swift](../../ios/Sources/PlatformApp/NativeApp.swift) |
| Source/resource membership | [project.pbxproj](../../ios/MiniAppPlatform.xcodeproj/project.pbxproj) |
| Purpose string camera | [Info.plist](../../ios/Info.plist) |

`shared-platform/packages/host-bridge/core` cung cấp giao thức/client phía web. Host iOS tự implement transport và handlers tương thích; không thêm native package của `shared-platform`, Pod hoặc framework WebView ngoài hệ thống. Bản snapshot client trong `native/tests/fixtures/` chỉ phục vụ kiểm thử compatibility, không được bundle vào app.

## 2. Chuẩn bị source và nhập asset

Trên máy phát triển cần Xcode, Node và dependencies tooling hiện có của `app/` (`typescript`, `yaml`). Hai source repo trong workspace này:

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

`export-data.cjs` thêm Chia tiền vào catalog native, featured apps của các khu vực và nhóm Khác. `resourceEndpoint: bundle://split-bill` là dấu hiệu catalog; URL WKWebView thực tế là `mini://split-bill/`. Không sửa `platform.json` bằng tay. Policy capability/quota lấy từ [capabilities.yaml](../../policy/capabilities.yaml).

## 3. Cấu hình Xcode và mở WKWebView

Các cấu hình sau **đã có** trong project:

1. `MiniAppWebView.swift` thuộc Sources của target `MobileNative`.
2. Folder resource `../native/shared/miniapps` thuộc Copy Bundle Resources và giữ cấu trúc thư mục. Runtime tìm `miniapps/split-bill/package.json` trong app bundle.
3. Resource `platform.json` được đóng gói theo cấu hình host hiện có.
4. Route `app.id == "split-bill"` trong `NativeApp.swift` tạo `MiniAppWebScreen(tenant:rules:)`, truyền tenant hiện tại và capability rules của host.
5. `Info.plist` có `NSCameraUsageDescription` phục vụ camera khi người dùng chọn quét QR.

Factory trong `MiniAppWebController.viewDidLoad()` thực hiện theo thứ tự:

- Đọc đúng bốn asset và đối chiếu SHA-256; lỗi package thì hiển thị lỗi native, chưa tạo/chạy WKWebView.
- Tạo `WKWebViewConfiguration` với `WKWebsiteDataStore.nonPersistent()`.
- Gắn `MiniPackage` làm `WKURLSchemeHandler` cho scheme `mini`.
- Gắn reply handler tên `miniapp` trong page content world.
- Inject bootstrap `host.js` tại `.atDocumentStart`, chỉ main frame; bootstrap idempotent nên script cùng tên trong HTML không tạo bridge lần hai.
- Gắn navigation/UI delegates và load `mini://split-bill/`.

Scheme handler phục vụ asset local và trả HTML entry cho route đã khai báo (`/`, `/bill/:billId`, `/settle/:billId`). CSP nằm ở **response header**: script chỉ local, `connect-src 'none'`, không frame/worker/object/form submit. Navigation chỉ cho main frame, đúng origin và route; cửa sổ mới bị từ chối. Không cần local HTTP server, ATS exception hoặc Metro.

## 4. Gọi feature native từ web

Host đặt `window.__MINIAPP_CAPS__` và `window.MiniAppBridge` trước author script. Snapshot được freeze theo app ID, gồm ba capability của app đang mở; native vẫn kiểm tra declaration, version, args và quota cho từng call. Snapshot không thay thế authorization và chưa là signed remote grant.

Ví dụ đọc nháp có feature detection và fallback:

```js
let requestSequence = 0;
async function readDraft(key) {
  if (!window.__MINIAPP_CAPS__?.['storage.kv'] || !window.MiniAppBridge) {
    return null; // UI giữ chế độ chưa có lưu trữ host
  }
  const result = await window.MiniAppBridge.request({
    id: `draft-${Date.now()}-${++requestSequence}`,
    capability: 'storage.kv',
    operation: 'kv',
    version: 1,
    args: { op: 'get', key },
  });
  if (result.ok) return result.data.value;
  switch (result.error) {
    case 'REVOKED':
    case 'UNAVAILABLE':
      return null; // UI báo chưa khôi phục được; không ghi đè nháp đang có
    default:
      return null; // Có fallback cho mã lỗi mới
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

Handshake storage liệt kê `get/set/delete`, nhưng wire operation là **`kv`**, hành động cụ thể nằm trong `args.op`. Không gửi `operation:'get'`. Request chỉ có `id`, `capability`, `operation`, `version`, `args`; không gửi `appId`, `tenant`, `user`, origin hoặc native path. Host bind identity từ container: tenant / split-bill / local-preview-user.

Response thành công: `{ok:true, data:...}`. Response lỗi: `{ok:false, error:'CODE', data:null}`. Các nhánh cần xử lý gồm `INVALID_ARGUMENT`, `CAPABILITY_NOT_GRANTED`, `RATE_LIMITED`, `CONSENT_DENIED`, `REVOKED`, `TIMEOUT`, `UNAVAILABLE` và default cho mã chưa biết. Từ chối/cancel không được tự động mở lại camera; không retry flood. Registry có nhiều mã hơn nhưng PoC scanner hiện gộp hủy/từ chối quyền thành `CONSENT_DENIED`, chưa phân biệt từ chối vĩnh viễn.

## 5. Native adapters và lifecycle

**Storage:** queue IO serial, file atomic trong Application Support, namespace hash theo tenant/app/local-preview-user, không backup. Host trả success sau write hoàn tất. File lỗi/quá giới hạn thì trả `UNAVAILABLE`, không ghi đè file corrupt. Mini app sở hữu schema và serialize dữ liệu thành string; đây là KV local, không phải Keychain hay server account.

**Scanner:** người dùng chọn Camera hoặc Chọn ảnh trong UI native. Camera dùng `UIImagePickerController`, xin quyền `AVCaptureDevice` lúc dùng; ảnh dùng `PHPickerViewController`, không xin đọc toàn bộ thư viện. Vision decode QR trên host, chỉ text trả về web. Không có camera streaming, `getUserMedia` hoặc API trả ảnh/raw path. Web media permission bị delegate từ chối.

**Network:** `URLSessionConfiguration.ephemeral`, chỉ GET URL banks nêu trên, không cookie/credential/cache/redirect, body bounded. Endpoint lỗi thì mini app dùng seed banks. Khai thêm host trong manifest chưa đủ để host cho gọi URL mới; phải thay native allowlist theo contract được duyệt.

**Lifecycle:** session/controller sở hữu WKWebView và pending calls. Background hủy network/scanner, kết thúc pending bằng `REVOKED`; foreground tiếp tục instance còn sống. Back thử history của WKWebView trước; Close tháo handler/delegates và view. Renderer chết thì host báo đóng/mở lại. Process restart chỉ khôi phục dữ liệu đã commit qua KV.

## 6. Build, chạy và kiểm tra

Mở `ios/MiniAppPlatform.xcodeproj` → scheme **MobileNative** → chọn simulator → Run. Vào **Home/Khám phá → Chia tiền**. Build dùng asset đã nhập, không tự chạy sync.

```sh
swift test --package-path ios
xcodebuild -project ios/MiniAppPlatform.xcodeproj -scheme MobileNative -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/MiniAppPlatform.xcodeproj -scheme MobileNative -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:NativeJourneyTests/NativeJourneyTests/testSplitBillWebViewBootDraftAndReopen CODE_SIGNING_ALLOWED=NO test
xcodebuild -project ios/MiniAppPlatform.xcodeproj -scheme MobileNative -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Thay tên simulator theo máy. Release command trên chỉ compile unsigned; chạy máy thật cần signing/provisioning riêng, không chứng minh archive/store readiness.

Kiểm tra thủ công: đặt tên bill → chuyển focus → thêm `Bữa tối 45k An trả` → xác nhận ALL lần đầu → chờ lưu → Close/mở lại và restart. Thử quét QR từ ảnh/camera, hủy, từ chối/thu hồi quyền, background, đổi khu vực, offline, keyboard, VoiceOver và chữ lớn.

## 7. Lỗi thường gặp, cập nhật và giới hạn

| Hiện tượng | Kiểm tra |
| --- | --- |
| Không thấy Chia tiền | Chạy exporter; kiểm tra `platform.json` trong đúng target `MobileNative` |
| “Gói Chia tiền không hợp lệ” | Folder resource giữ `miniapps/split-bill`; sync lại asset + hash, rebuild; không sửa hash để bỏ qua asset bị thay |
| Bridge thiếu/hangs | `host.js` ở document start, reply handler tên `miniapp`, main frame đúng `mini://split-bill` |
| `INVALID_ARGUMENT` khi storage | `operation:'kv'`, `args.op`, value là string; envelope không thêm identity fields |
| `fetch` không chạy | Dùng `net.request`; CSP chặn direct network, không mở `connect-src` để chữa lỗi |
| Nháp cuối mất khi đóng ngay | Mini app đổi title trên blur và coalesce save; chờ request lưu xong, không coi trạng thái UI là durable receipt |
| Camera không dùng được | Thử iPhone thật, purpose string, trạng thái quyền; giữ fallback chọn ảnh/nhập QR |

Sau mỗi thay đổi mini app hoặc `native/miniapp-host.js`: chạy sync → exporter → checks → rebuild native. Bản hiện tại cần phát hành binary mới để đưa asset mới đến người dùng; không có OTA/remote package loader.

Factory hiện hỗ trợ Split Bill và Manage Expense qua app ID đã xác minh. Nếu tích hợp **mini app khác**, cần điều chỉnh contract/import validator, asset whitelist, origin, catalog, route, native grants và scope KV, vẫn giữ một factory. Không chỉ đổi URL để tải website bất kỳ. Capability mới cần contract/handler/policy và kiểm thử riêng; ba capability trên không tự cấp mọi feature của host.

Evidence đã có: iOS Debug/unsigned Release compile, Swift core tests và WKWebView XCTest lưu/đóng/mở/relaunch. Camera máy thật, accessibility và performance/binary budgets trên thiết bị tham chiếu còn chưa xác minh. Hash pinning của asset bundled không phải dual-signature verification. Nonpersistent store + chặn API persistence ở page chưa chứng minh native-engine storage isolation hoàn chỉnh; minimum WebView admission, unavailable-web-feature matrix và external publication vẫn là gaps.

Xem [contract](../SPLIT-BILL-CONTRACT.md), [evidence và manual acceptance](../SPLIT-BILL-VERIFICATION.md), [conformance](../../policy/conformance.md), [budgets](../../policy/budgets.md) và [dependency decisions](../../policy/dependency-decisions.md). Không nới các gate bằng cấu hình trong tài liệu này. Rollback gỡ registration, resource và route/adapter Split Bill; giữ KV đã lưu để phục hồi dữ liệu.

## Manage Expense (2026-10-06)

Factory hiện nhận appId thuộc allowlist Split Bill/Manage Expense; mỗi app có asset hash, origin, route, grants và scope KV riêng. Chạy sync với `/Users/lap16954/Documents/mine/mini-apps/manage-expense` trên nhánh `feat/manage-expense-revamp`, exporter rồi `node --test native/tests/content.test.cjs native/tests/miniapp-bridge.test.cjs native/tests/manage-expense.test.cjs`. Manage Expense được đăng ký trong Khác. Source build tạo bundle React offline, không cần Next server, giữ CSP connect-src none. Manage Expense khai báo storage.kv, ai.extract_expenses và notifications.schedule_digest. Host dùng picker được user chọn, xử lý model local và trả giao dịch nháp để review; không gửi ảnh cloud. iOS cần Foundation Models khả dụng trên iOS 26+, Android cần model multimodal .litertlm được user nhập và LiteRT-LM 0.17.1/Kotlin 2.4.0. KV vẫn giới hạn 64 KiB/request, tổng 24 MiB cho app; ledger dùng revision chunks/journal. Digest là nhắc mở báo cáo hiện tại; chưa có backend push hoặc tổng tiền tính khi app không chạy. Lối tắt gợi ý thẻ từ header dùng Live Activity/notification, mở #advisor. Build đã qua; inference, delivery và performance trên máy thật còn cần acceptance.


## Manage Expense — tích hợp ngày 06/10/2026

Manage Expense dùng cùng factory WebView, origin/hash/grant và KV namespace riêng. App được đăng ký trong Khác cho mọi tenant; không được cấp scanner/network của Split Bill. Sync từ `/Users/lap16954/Documents/mine/mini-apps/manage-expense` trên nhánh `feat/manage-expense-revamp`, rồi chạy `export-data.cjs` và ba test package/bridge, gồm `native/tests/manage-expense.test.cjs`.

Source nghiệp vụ và UI ở repo Manage Expense; xem `docs/HOST_INTEGRATION.md` và `docs/reports/REVAMP_READINESS.md` trong repo đó. Ledger local dùng profile `local-preview-user`, quota tổng 24 MiB, mỗi request tối đa 64 KiB; adapter chia chunk và commit pointer sau cùng. Không đồng bộ ledger local với cloud legacy.

Ảnh được chọn/paste bằng thao tác người dùng và xử lý on-device, không có fallback cloud. iOS dùng Vision OCR + Foundation Models khi model hệ thống khả dụng trên thiết bị hỗ trợ; Android dùng LiteRT-LM 0.17.1 với model multimodal `.litertlm` do người dùng chọn. Handler trả candidate chưa xác nhận, tối đa 40 dòng; UI cần sửa/duyệt trước khi ghi sổ.

Digest là lời nhắc local của OS để mở báo cáo hiện tại, nội dung khóa màn hình chung. Lối tắt gợi ý thẻ được bật riêng: iOS Live Activity hoặc notification Android, mở sheet merchant/số tiền trong app, không đặt bàn phím trên Lock Screen. Test iOS `testManageExpenseManualLedgerSurvivesCloseAndProcessRelaunch` đã qua trên Simulator; model inference, thông báo/Live Activity và latency/memory trên thiết bị thật vẫn cần acceptance.
