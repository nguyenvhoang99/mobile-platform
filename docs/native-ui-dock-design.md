# Dock navigation — refinement v0.5

**Yêu cầu đã xác nhận:** ở Home mặc định chỉ có Khám phá ở giữa; vuốt bắt đầu từ
Khám phá để thêm lối tắt trái/phải. Khi mở mini app, nút giữa đổi thành Home để thu nhỏ
app vào một nút nổi; hai lối tắt ẩn và chỉ hiện lại ở Home, có animation. Giữ iOS hướng
Liquid Glass và Android nền đặc. **Visual / choreography:** draft, cần human review.

[Thử prototype](native-ui-dock-review.html) · [Bảng review](native-ui-design-board.html#shell.navigation.dock)

Đây là refinement cho host dock, picker và minimize/resume trong prototype. Giữ Home
card grid v0.3 và sandbox review hiện có. Hai app, build, dependencies, preference schema
và runtime enforcement chưa thay đổi. Figma v0.1 chưa cập nhật vì giới hạn lượt công cụ.

## Visual và source evidence

- Native root hiện có Home + hai shortcut + Khám phá, chưa có behavior mới này.
  RN tham chiếu trong [GlassTabBar.tsx](../app/src/components/GlassTabBar.tsx) cung cấp
  mapping swipe trái/phải và ngưỡng gesture; ngưỡng native/device vẫn chưa kiểm chứng.
- Default Home: capsule nhỏ, chỉ Khám phá. Không render nút “+” rỗng trong dock.
  Sau khi thêm: trái · Khám phá · phải; chỉ slot đã gán là control. Giữ Khám phá đúng
  tâm ngang, nên fixture một lối tắt có khoảng trống cân bằng phía còn lại.
- Trong mini app: capsule nhỏ chỉ Home ở giữa. Hai lối tắt giữ cấu hình nhưng không
  nhận pointer, keyboard hay screen reader. Host Explore cũng có Home để về trang chính,
  nhưng đây không phải mini app và không tạo nút nổi.
- Home sau thu nhỏ: hiện lại các lối tắt đã gán và một nút nổi mang icon/tên app.
  Chạm nút nổi mở lại trang con, nháp và vị trí scroll của app trong phiên review.
  Một handle nổi đại diện cho app vừa thu nhỏ gần nhất; không phải danh sách đa nhiệm.
- iOS: một material host cho dock, hướng Liquid Glass **regular**, theo
  [Apple · Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).
  Khi implement dùng API hệ thống khi khả dụng, có fallback, tôn trọng các accessibility
  settings. Web blur là mô phỏng; chưa chứng minh Liquid Glass native.
- Android: cùng silhouette và semantics, **0% trong suốt / alpha nền 1**, không blur.
  Không giảm opacity của cả thanh vì sẽ làm mờ chữ/icon.

## Contract interaction

Owner là host navigation + preferences theo tenant; UI phát intent, không gọi bridge
hay cấp quyền cho mini app. Entrypoint ở vòng này là app ID / trang chính từ catalog.

| Ngữ cảnh / intent | Kết quả |
|---|---|
| Home lần đầu | Chỉ Khám phá ở giữa; không có Home hoặc ô cộng trống |
| Tap Khám phá | Mở catalog review của host |
| Vuốt từ Khám phá sang trái / phải | Mở list chọn cho slot trái / phải tương ứng |
| Vuốt từ shortcut, khoảng trống hay dock trong mini app | Không mở picker |
| Chọn và xác nhận | Thêm / Thay đúng slot; không đổi vùng đang xem |
| Duplicate ở slot còn lại | Không tạo trùng, không âm thầm di chuyển |
| Hủy / Escape / system Back trong picker | Giữ cấu hình; focus về Khám phá ở giữa |
| Tap shortcut / card mini app | Mở app; Home thay nút giữa, hai shortcut ẩn |
| Tap Home trong mini app | Thu nhỏ; giữ phiên, về Home, khôi phục shortcut, hiện nút nổi |
| Tap nút nổi | Resume cùng app/page/draft/scroll; ẩn nút nổi và hai shortcut |
| Nhấn giữ shortcut ở Home | Xóa đúng slot + feedback + Hoàn tác; không mở app |
| Xóa shortcut đang có handle nổi | Chỉ xóa shortcut; không xóa phiên hoặc handle |
| Hoàn tác | Khôi phục nếu slot trống và không trùng; không ghi đè thay đổi mới |
| Đóng từ sandbox chrome | Giữ flow xác nhận khi có nháp; đóng thật không tạo nút nổi |

Chỉ nhận swipe khi pointer bắt đầu trên nút Khám phá ở Home. Long press chỉ nhận từ
shortcut đã gán ở Home. Horizontal capture hủy timer hold; vertical scroll/cancel/
secondary pointer/blur/hidden cũng cleanup. Hold đã nhận thì release không swipe/tap.
Một pointer sequence có tối đa một intent. Picker có một owner; model chặn mutation
khi không ở Home. Gesture arbitration với system Back/home phải đo trên thiết bị.

Nút Thêm/Xóa ngoài artboard là alternative review cho bàn phím/screen reader; native
cần custom actions/đường quản lý dễ khám phá. Focus về giữa khi shortcut bị xóa; Undo
đưa focus về shortcut vừa khôi phục. Mọi control chính có text/semantic label; ẩn khỏi
accessibility và input ngay khi đổi state, không chờ animation kết thúc.

## Phiên, persistence và resource

**Prototype:** session state theo app ID trong bộ nhớ trang. Thu nhỏ giữ page/history,
fields và scroll; không ghi browser storage hay app preferences. Reload/reset xóa fixture.
Một nút nổi không chứng minh có WebView còn sống hay background execution.

**Khi implement native:** host giữ session identity theo tenant/user/app và trạng thái
foreground/suspended. Thu nhỏ phải hạ foreground ownership, keyboard/focus, resource leases,
timers/media/stream theo runtime policy; không chỉ đặt view opacity 0. Không cấp thêm
background quyền. Resume revalidate tenant, account, catalog, permission và instance.
Process death, revoke, memory pressure và renderer crash cần recovery có snapshot/checkpoint
theo hợp đồng dữ liệu; không hứa nháp bền nếu chưa durable write. Không giữ vô hạn WebView;
giới hạn và eviction theo policy, không nới budget để giữ floating handle.

Preference commit nguyên tử theo tenant; picker mở trực tiếp từ dock commit sau Thêm/Thay.
Picker từ Tùy chỉnh Home sửa draft, chỉ commit khi Lưu. Tenant/catalog thay trong lúc picker
mở thì bỏ kết quả cũ; lỗi ghi giữ snapshot đã commit, báo lỗi và cho thử lại. Undo đi qua
cùng validation. Contract native này vẫn là đề xuất, chưa runtime/device evidence.

## Motion

Tokens review được sinh từ [motion.ts](../app/src/config/motion.ts), kèm fingerprint trong
[native-ui-dock-motion.js](native-ui-dock-motion.js); ceiling do [policy](../policy/budgets.md)
sở hữu. Không đưa một vocabulary mới vào app.

| Chuyển trạng thái | Source và motion trong review |
|---|---|
| Home ↔ mini app | Nút giữa / app trigger; content fade-through: feedback rồi standard |
| Shortcut ẩn / hiện | Từ hai phía quanh nút giữa; opacity feedback + travel small |
| Capsule rộng ↔ gọn | Cùng tâm ngang; retarget width standard, không khóa input |
| Handle nổi xuất hiện / biến mất | Vị trí handle của host; fade + travel small standard |
| Giảm chuyển động | Cùng DOM/state; duration và travel về 0 |

CSS transition giữ controls ổn định; content animation dùng snapshot DOM review inert,
aria-hidden. Đổi nhanh state hủy animation cũ và snapshot; blur/hidden/reduce-motion cũng
cleanup. Snapshot review không phải đề xuất chụp nội dung nhạy cảm trong native app.
Ẩn control khỏi input/semantics ngay lúc state đổi. Không haptic, bounce hoặc decorative loop.
Motion trên web chưa chứng minh frame rate, compositor cost hay behavior native.

## Validation và handoff

- 23 kiểm tra model/gesture PASS: center/default, mini app hide, guards, minimize/resume,
  một handle, close, side-origin gesture không mở picker, long press/cancel/undo/race.
  Chạy: `node docs/native-ui-dock-model.test.cjs`.
- Sandbox model regression: 10 checks PASS. Syntax prototype/model PASS.
- Board structure: 21 IDs và mapping Figma giữ nguyên. Baseline hash v0.1 khác source
  hiện tại ở NativeApp.swift, MainActivity.kt và platform.json; full source fingerprint
  check FAIL tại NativeApp.swift. Giữ fingerprint baseline, đánh dấu sourceAudit cần
  refresh/re-audit liên kết dòng trước native implementation.
- Browser PASS: swipe từ giữa mở đúng list hai bên; thêm hai slot; mở app ẩn hai shortcut;
  Home thu nhỏ; resume từ preview Android giữ trang storage và nháp; Close/Discard không
  tạo floating handle; đổi nhanh state không để snapshot treo.
- 320px + nhãn lớn: không overflow ngang; mỗi target dock khoảng 80.66 × 72 CSS px.
  Giảm chuyển động: transition duration 0, transform none, không còn snapshot.
- Long press trên touch device, VoiceOver/TalkBack, system gesture, persistence,
  background lifecycle và native performance **chưa kiểm chứng**.

Tám nhóm startup/memory/FPS/binary/build/crash không đổi binary hoặc runtime ở task docs này;
bảy dependency counters không đổi vì không thêm package/native module/bundled asset.
Native implementation cần đo các row chịu ảnh hưởng theo policy; chưa có số đo để tuyên bố pass.
Rollback bằng revision trước của docs/prototype. Khi có lượt Figma, sửa file hiện có theo
registry IDs, thêm Home/default/configured/miniapp/minimized/resume và reduced-motion states;
không gắn link Figma v0.1 như thể đã có v0.5.
