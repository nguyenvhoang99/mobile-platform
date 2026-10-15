# Mobile Platform — Swift & Kotlin native

Hai ứng dụng native độc lập cho **vertical slice PoC đang chạy trong repository**. iOS dùng Swift/SwiftUI; Android dùng Kotlin và Android Views. Không cần Metro, Hermes, React Native hoặc CocoaPods để build/chạy hai host mới. Mini app Chia tiền chạy bằng WebKit/WebView của OS, qua bridge native. `app/` được giữ nguyên làm bản tham chiếu và rollback phát triển, gồm cả các thay đổi chưa commit của người dùng.

## Mở và chạy

- **iOS:** mở `ios/MiniAppPlatform.xcodeproj`, chọn scheme **MobileNative** và simulator. Baseline iOS 15.1; Live Activity cần iOS 16.2+. Thiết bị thật cần cấu hình signing riêng trong Xcode. Chưa cấu hình APNs entitlement/provisioning.
- **Android:** mở thư mục `android/` bằng Android Studio; JDK 17, Android SDK 36, minSdk 24. Chọn app và emulator/thiết bị. Đặt `ANDROID_HOME` hoặc `android/local.properties` theo máy; file này không commit.
- Hai bundle/application ID là `com.miniappplatform.nativehost`; không đọc hoặc ghi đè dữ liệu bản RN.

Chạy tại root repository:

```sh
node --test native/tests/content.test.cjs
swift test --package-path ios
./android/gradlew -p android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:assembleDebugAndroidTest
./android/gradlew -p android :app:bundleRelease :app:lintRelease
```

UI tests iOS trong scheme chạy bằng Product → Test hoặc:

```sh
xcodebuild -project ios/MiniAppPlatform.xcodeproj -scheme MobileNative -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO test
```

Chọn simulator có trên máy nếu tên khác. Sau build, kiểm tra đóng gói framework bằng artifact thật (đặc biệt quan trọng vì XCTest có thể che lỗi đường dẫn dylib):

```sh
NATIVE_IOS_APP=/path/to/MobileNative.app node --test native/tests/content.test.cjs
```

Nếu không đặt biến này, chỉ test đóng gói binary được skip; bốn kiểm tra source/policy vẫn chạy. Instrumentation Android dùng framework hệ thống, không thêm AndroidX Test:

```sh
./android/gradlew -p android :app:connectedDebugAndroidTest
```

Runner ghi `PASS`/`FAIL` và trả result code. Emulator check tự động gọi hành động trên widgets thật; không thay thế nghiệm thu thao tác chạm, bàn phím hay TalkBack.

## Phạm vi đã port

| Luồng hiện tại | Bản native |
|---|---|
| Khu vực | Hà Nội, TP.HCM, Đà Nẵng, fallback; chọn tay hoặc vị trí gần đúng |
| Home/Khám phá | Nhóm tiện ích, ghim/bỏ ghim, hai lối tắt, tìm không dấu; tùy chọn lưu riêng từng khu vực |
| Navigation | Route history, Back/Close, catalog allowlist, cross-link qua public entrypoint; kiểm tra tenant và input khi mở thông báo |
| Thẻ | Đủ 12 thẻ minh họa; tìm theo ngân hàng/tên/quyền lợi, xem chi tiết/phí năm |
| SDK Demo | Đủ 7 slot; đặt/join, riêng tư/công khai, xóa người tham gia, hủy; chỉ thay đổi fixture trong phiên |
| Storage demo | KV qua broker, scope tenant/app/local-preview-user, quota/payload/consent/revocation, audit chỉ digest; mất khi process khởi động lại |
| Nháp hóa đơn | Nhập/sửa/đánh dấu kiểm tra; consent và lỗi AI `UNAVAILABLE`; không dựng kết quả AI giả hoặc thanh toán |
| Thiết bị | Trạng thái mạng, xác thực cục bộ, vị trí gần đúng, nhận dạng giọng nói trên máy khi OS/thiết bị hỗ trợ; hỏi quyền lúc dùng |
| Inbox/nhắc/lịch | Inbox atomic theo tenant, dedupe, expiry; OS reminders, cancel; trình chỉnh sửa lịch có quyền quyết định của người dùng |
| Live surfaces | iOS ActivityKit/Dynamic Island, tap qua live activity đang tồn tại; Android ongoing notification/countdown và yêu cầu promotion nếu platform hỗ trợ |
| Remote push | APNs delegate native; FCM adapter tùy chọn. Parser bounded/fail closed; không cấu hình project, token upload hoặc credentials |
| Telemetry local | Host event declarations/config dùng chung; journal atomic có TTL, ưu tiên eviction, UUIDv7 session/event identity, giới hạn canonical; chưa có uploader |

Weather, transit, notes, market và entry badminton vẫn là **route preview**, giống trạng thái thực thi hiện tại của RN. Catalog không phải dịch vụ thời tiết, giao thông, ngân hàng hay đặt sân thật. UI native được tổ chức theo control hệ thống của mỗi OS; không sao chép bố cục constellation/glass của RN theo pixel. Home gợi ý giữ thứ tự catalog ổn định, không shuffle khi render. Dữ liệu/sample strings đều có ghi rõ tính minh họa.

`native/shared/platform.json` là artifact duy nhất cho cả hai build, xuất từ source hiện tại và `policy/capabilities.yaml`. Sau khi sửa nguồn:

```sh
node native/tools/export-data.cjs
node --test native/tests/content.test.cjs
```

Exporter cần TypeScript và YAML trong `app/node_modules` (tooling có sẵn của repository); app native không bundle những thư viện này. Không sửa JSON thủ công hoặc chép lại giá trị budget vào Swift/Kotlin.

## Khác biệt nền tảng có chủ đích

**iOS:** SwiftUI List/Form/search/sheet, Dynamic Type, dark appearance, semantic buttons; state UI ở main actor, IO serialized ngoài main. Core logic có SwiftPM tests độc lập. CoreLocation/LocalAuthentication/Speech/Network thuộc host. Speech yêu cầu hỗ trợ on-device, không fallback sang server. Calendar dùng EventKitUI; iOS 17+ không xin quyền đọc toàn bộ lịch chỉ để mở editor. ActivityKit extension riêng, chỉ xử lý URL reminder nếu dữ liệu trùng hoạt động còn sống do OS quản lý.

**Android:** Activity/ListView tái sử dụng row, system EditText/IME và dialogs; không thêm UI SDK. AtomicFile và workers cho snapshot/journal/reminder ledger, dữ liệu nhạy cảm không backup. API 33+ dùng dispatcher Back của OS; phiên/draft giữ khi configuration change, reset an toàn sau process death. AlarmManager dùng alarm không chính xác, restore sau reboot; không xin exact-alarm permission hoặc mở foreground service. Calendar dùng INSERT intent, không đọc lịch. Native BiometricPrompt từ API 28; on-device speech từ API 31, unavailable rõ ràng ở OS thấp hơn.

Live Activity/Live Update là quyền quyết định của hệ thống, không là cam kết hiển thị, delivery hay thời lượng. Booking demo và các nút lịch/nhắc là công cụ host đã compile; không cấp API thiết bị cho mini-app bên ngoài. [Android Live Updates](https://developer.android.com/develop/ui/views/notifications/live-update) và [EventKit trên iOS 17](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) là tài liệu nền tảng liên quan.

## FCM tùy chọn

```sh
./android/gradlew -p android -PenableFirebase=true :app:assembleDebug :app:lintDebug
```

Dùng `firebase-messaging:25.1.1`, đã được admission trong `policy/dependency-decisions.md`; không thêm Analytics hoặc wrapper RN. Bản mặc định không include Firebase. Bản tùy chọn compile được nhưng chưa có Firebase project resources, backend registration, topic contract hoặc end-to-end delivery. `google-services.json`/Google Services plugin không được lấy từ bản RN hoặc credentials của máy. Việc cấu hình provider/signing cần task và quyền riêng.

Data-only payload phải có `tenant_id`, `notification_id`, `category`, `title`, `body`, `created_at_ms`; expiry và target optional. `target_input` nhận JSON object hoặc chuỗi JSON object cho FCM string map; PoC chỉ chấp nhận string values. Target chỉ mở qua entrypoint/source/input allowlist. Tenant payload không thay đổi khu vực hiện tại; thông báo khu vực khác ở hộp thư tương ứng.

## State, recovery và giới hạn

Snapshot v1 lưu preferences/inbox; không lưu voice/audio/toạ độ, biometrics, token, ảnh hóa đơn, draft hoặc bookings mẫu. Writes atomic, có lỗi hiển thị; iOS cập nhật UI trước khi write hoàn tất, nên process bị kill trước commit có thể mất thay đổi cuối. File corrupt được giữ recovery; nếu không giữ được, không ghi đè bản gốc. Journal corrupt không upload hoặc ghi đè; queue chỉ local. KV/audit hiện trong memory, không là keystore hay nhật ký audit production. Background/close/tenant switch revoke phiên, hủy acquisition và bỏ callback cũ; các hộp thoại quyền hợp lệ không bị coi là background.

Hiện chỉ instrument các host events `app_started`, `mini_app_opened`, `notification_received`. Transport, batching/compression/retry/ack, full event coverage và durable native notification-event replay chưa tương đương toàn bộ telemetry machinery trong RN. Không có endpoint để bật hoặc đo đường gửi. RN budgets/conformance scripts chưa tự kiểm tra root native projects; các lệnh native ở trên là gates riêng và cần được đưa vào CI trước release.

Đã có bundled Split Bill WebView execution; chưa có external package import/dual-signature verification, tenant-account authentication, trust-tier review/revocation/kill switch production, signed remote config, OTA, backend booking/AI/payment hoặc dữ liệu migration từ RN. Đây là các khoảng trống production đã có trong PoC, không được coi là giải quyết nhờ chuyển ngôn ngữ. Các bridge adapter device chưa implement tiếp tục fail closed. Release native đổi logic/content cần binary mới qua store; không có RN OTA.

## Kiểm tra và nghiệm thu

Kết quả build/test và ma trận performance/counters nằm trong [VERIFICATION.md](VERIFICATION.md). Contract ở [PORT-CONTRACT.md](PORT-CONTRACT.md). Các con số chuẩn vẫn thuộc `policy/`, không được nới bởi bản port.

Nghiệm thu thủ công trên build/thiết bị thực:

1. Home/Khám phá → mỗi app/route/link → Back/Close. Ghim và dock, đổi tenant, restart và kiểm tra cách ly.
2. Search tiếng Việt có/không dấu, không kết quả, chi tiết thẻ; keyboard/back/cancel giữ đúng trạng thái.
3. SDK đặt/join/cancel, capacity/owner, memory note, consent deny/allow, unavailable AI giữ draft; close/process death reset đúng phạm vi.
4. Quyền location/mic/notification/biometric lần đầu, từ chối, thu hồi, timeout, background và callback muộn; không có permission prompt tại launch.
5. Ngày mai/cuối tuần, reminder trễ/Doze, cancel, reboot, chạm thông báo; EventKit/INSERT save/cancel. Lock screen/Dynamic Island/Live Update trên OS thực.
6. VoiceOver/TalkBack, font accessibility lớn, landscape, dark mode, Reduce Motion, màn hình nhỏ; kiểm tra focus/đọc trạng thái và vùng chạm.
7. Offline, storage full/corrupt, kill/restart, background receive, push malformed/expired/cross-tenant. Không dùng token thật trong logs hoặc mini-app.

Performance acceptance cần release cùng fixture và thiết bị tham chiếu trong `policy/budgets.md`: Instruments trên iOS; Perfetto/Android profiler trên Android. Marker hiện mới ở mức host readiness, chưa chứng minh pixel presentation hoặc toàn bộ OS lifecycle. Không tuyên bố nhanh hơn RN khi chưa có trace before/after.

## Test · Khác

Home → Khác → Test, hoặc Khám phá → tìm Test. Có ở cả bốn khu vực. Chạy **Debug** để mở bộ kiểm thử; Release chỉ hiển thị hướng dẫn, không compile diagnostic adapters/SDK ML. Chi tiết phạm vi và lifecycle ở [TEST-CONTRACT.md](TEST-CONTRACT.md), evidence ở [TEST-VERIFICATION.md](TEST-VERIFICATION.md).

Mỗi mục có nút Chạy và kết quả riêng: mạng, location gần đúng, biometrics riêng/mật mã dự phòng, giọng nói, NFC NDEF, OCR và crypto fixture. Android chạy ML Kit OCR và LiteRT/TFLite Interpreter với model ADD đã pin digest. iOS chạy Vision OCR; ML Kit/TFLite iOS chưa tích hợp. Passkey hiển thị điều kiện RP/backend/app association còn thiếu; chưa có credential/server verification. FCM/APNs cần provider/project/provisioning để kiểm thử delivery. Lịch, reminders, live surfaces và broker được mở qua fixture trong SDK Demo. Các adapters public còn thiếu vẫn fail closed.

NFC iOS cần thiết bị thật và provisioning hỗ trợ Debug.entitlements (NDEF); build unsigned/simulator không chứng minh đọc NFC. Không thêm Associated Domains/RP hoặc dùng credentials thay người dùng. Model nhỏ chỉ kiểm tra runtime, không phải AI đọc hóa đơn. Sau mỗi phép thử chạy Dừng/Đóng/chuyển nền và thử lại; từ chối/thu hồi quyền để kiểm tra recovery. Kết quả trong phiên không gửi telemetry.

## Chia tiền · Split Bill

Home/Khám phá → **Chia tiền** trên cả hai root native apps. Bản host-target từ repo `split-bill`, nhánh `feat/expense-first-ux`, được đóng gói trong `native/shared/miniapps/split-bill`; build native không cần repo mini app, máy chủ web hoặc Metro. Giao thức tương thích `shared-platform/packages/host-bridge/core`; không cần tăng iOS minimum để kéo native package shared-platform vào host. RN `app/` không có registration mới.

Ba capability theo manifest: `storage.kv` lưu nháp atomic theo khu vực/app/local-preview-user; `scanner.scan` mở camera/chọn ảnh native và chỉ trả mã QR; `net.request` GET tới URL banks đã khai báo, giữ seed khi offline/lỗi. iOS hỏi quyền camera lúc chọn; Android dùng system camera và URI grant tạm, không xin quyền camera cho host. Không camera/mic/web storage/network trực tiếp trong WebView. Đây là bundled integration PoC, không phải external publication/signature enforcement đầy đủ.

Để nhập lại source hiện tại (không sửa hai repo nguồn):

```sh
node native/tools/sync-miniapps.cjs /Users/lap16954/Documents/mine/mini-apps/split-bill
node native/tools/export-data.cjs
node --test native/tests/content.test.cjs native/tests/miniapp-bridge.test.cjs
```

Tool cũng cập nhật test-only shared-platform client snapshot để kiểm tra compatibility; snapshot không được bundle vào app. Xcode/Gradle đóng gói asset có sẵn, không gọi sync tự động. Contract, giới hạn lưu nháp, manual script và evidence: [SPLIT-BILL-CONTRACT.md](SPLIT-BILL-CONTRACT.md), [SPLIT-BILL-VERIFICATION.md](SPLIT-BILL-VERIFICATION.md).

Hướng dẫn tích hợp theo từng platform: [Web mini app → host iOS](docs/WEB-MINIAPP-IOS.md) và [Web mini app → host Android](docs/WEB-MINIAPP-ANDROID.md). Mỗi tài liệu có bước nhập source, cấu hình container/bridge/native feature, build/test, troubleshooting và giới hạn của bản bundled hiện tại.
