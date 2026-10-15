# Mini-app sandbox — design review v0.4

**Trạng thái:** đề xuất thiết kế; khung tương tác đã implement trong [bản review Home/Dock](native-ui-dock-review.html). App native iOS/Android và Figma chưa thay đổi. “Sandbox” ở đây là vùng UI do host quản lý; prototype không tải package, tạo WebView hoặc chứng minh cách ly bảo mật.

## Tiêu chí đề xuất

| Tiêu chí | Hành vi dùng chung iOS/Android | Bằng chứng / giới hạn |
|---|---|---|
| Nhận diện rõ | Tên tiện ích và khu vực ở header; thông tin/quyền mở từ menu host | Có trong prototype; chưa kiểm tra native safe area |
| Luôn thoát được | Back, Thông tin, Đóng thuộc host; vẫn có khi loading hoặc renderer dừng | Có trong prototype; renderer dừng là mô phỏng |
| Back khác Đóng | Back từ trang con về root; root Back tương đương Đóng. Nháp chưa lưu cần xác nhận bỏ | Có state model và modal; Escape giữ nháp |
| Không mất công nhập khi chuyển vùng | Home/Khám phá hoặc đổi tiện ích giữ nháp riêng theo app trong phiên; Đóng xóa nháp của app đang đóng | Đề xuất mới; reload mất nháp, không lưu bền |
| Không báo thành công giả | Đặt sân, kho mẫu, AI, kiểm tra hóa đơn đều nói rõ mức thực thi; sửa trường làm mất đánh dấu kiểm tra | Chỉ fixture và mô phỏng, không API/booking/payment |
| Xin quyền đúng ngữ cảnh | Host nêu app yêu cầu, mục đích và dữ liệu; cho phép một lần hoặc từ chối; không mất nháp | Có modal mô phỏng AI; chưa grant thật hoặc image picker |
| Phục hồi dễ hiểu | Content, loading, empty, offline, denied, unavailable, error, renderer dừng có copy/action riêng | Selector ngoài khung giúp thử ở hai adapter; retry chưa gọi API |
| Không lẫn phiên | Catalog/route allowlist cho prototype; kết quả chỉ áp dụng đúng app và generation hiện tại | Model tests; không phải runtime security gate |
| Dễ tiếp cận | Control tối thiểu 48 CSS px, nhãn đầy đủ, focus heading, field có label, modal bàn phím; content cuộn, dock giữ vị trí | Browser evidence dưới đây; VoiceOver/TalkBack native chưa đo |
| Consistency có chủ đích | Chung cấu trúc/nội dung/transition; giữ Dock hiện tại, iOS theo hướng glass và Android nền đặc | Web dùng font fallback; không khẳng định pixel parity native |

Không thêm gesture thoát vào content: tránh xung đột cuộn ngang/dọc hoặc thao tác nội bộ mini-app. Dock và các đường Thêm/Xóa/Undo hiện có được giữ.

## Mapping và hành vi

Giữ ID [registry hiện có](native-ui-component-registry.md): `shell.root`, `shell.header`, `miniapp.preview`, `sample.booking`, `sample.bridge_storage`, `sample.bill_draft`, `sample.status`. Không tạo ID mới rồi mô tả như implementation đã có.

SDK Demo dùng booking fixture lấy từ source, cùng hai trang con Kho mẫu và Bản nháp hóa đơn. Native source hiện đặt các nhóm này trên một màn hình; trang con là **đề xuất navigation** để review Back và giữ nháp. Thẻ có root/detail minh họa; các app còn lại vẫn là preview, không giả lập dịch vụ sản phẩm.

Nháp giữ trong memory của phiên review, scope theo app vì prototype chỉ có một tenant/người dùng mẫu. Hai preview dùng chung state để so sánh, không phải hai runtime riêng. Đóng sạch về Home; Đóng có nháp mở modal, hủy giữ nguyên, xác nhận xóa duy nhất nháp hiện tại. Với Dock đang được refine v0.5, Home thu nhỏ tiện ích, nút nổi mở lại giữ trang/nháp; đóng xóa cả handle tương ứng. Host navigation chỉ suspend. Đề xuất giữ nháp khi suspend khác lifecycle fixture hiện tại trong [native port contract](../native/PORT-CONTRACT.md); cần cập nhật contract và kiểm chứng trước khi port.

AI là mô phỏng: đồng ý một lần dẫn tới **chưa khả dụng**, từ chối dẫn tới **denied**; cả hai giữ input. Không chọn ảnh, gửi dữ liệu hoặc cấp capability. Khi implement thật, image picker phải thuộc host; pixels không qua bridge; kết quả chỉ là nháp bắt buộc review, theo `ai.extract_bill` trong [capability policy](../policy/capabilities.yaml). Không dùng consent của OS như quyền mini-app.

Các giới hạn trường theo `SampleView.swift`: note 500, hint 280, amount 12 chữ số, recipient 120. Đây là input contract hiện tại, không phải budget mới. Không đổi policy hoặc thêm dependency.

## Runtime contract còn mở

Native PoC hiện **không thực thi package mini-app bên ngoài**, theo [PORT-CONTRACT](../native/PORT-CONTRACT.md). Để đưa design vào runtime thật, cần triển khai và có evidence cho:

- Package được xác minh trước script đầu tiên; factory/config WebView duy nhất, navigation và network theo allowlist, CSP qua response header; không tải mã tùy ý.
- Caller identity do host gắn; dữ liệu theo tenant/app/user, không chia sẻ credentials/cookies/localStorage giữa app. Bridge chỉ có capability được khai báo, grant/consent/quota/revocation theo policy.
- Callback/bridge request bị vô hiệu khi đóng, đổi tenant hoặc phiên; có terminal response, timeout/cancel và giới hạn payload theo policy, không đặt con số thay thế ở design doc.
- Renderer crash, background/restart và resource cleanup có đường phục hồi; kiểm tra adversarial, native CI, release device và performance theo [conformance](../policy/conformance.md), [budgets](../policy/budgets.md), [dependency decisions](../policy/dependency-decisions.md).

Các mục này là **điều kiện triển khai còn thiếu**, không được chứng minh bằng DOM test hoặc việc không có WebView. Không đổi runtime/framework trong vòng review này.

## Kiểm chứng

Model: `node --test docs/native-ui-sandbox-model.test.cjs docs/native-ui-dock-model.test.cjs`. Sandbox có kiểm tra allowlist, Back/close/cancel, nháp theo app, input bounds, loading conflict, stale callbacks và consent theo phiên. Dock giữ bộ kiểm tra gesture/state hiện có.

Evidence browser ngày 2026-10-04, sau tích hợp Dock v0.5:

| Kiểm tra | Kết quả |
|---|---|
| Nhập nháp → Back → mở trang con | Giữ amount/recipient, focus heading |
| Thu nhỏ qua Home → mở lại từ nút nổi Android | Giữ trang bill và amount `120000` |
| Đóng → tiếp tục chỉnh sửa | Giữ input; focus trả về nút Đóng đúng adapter |
| Đóng → bỏ nháp | Về Home; mở lại sạch, không giữ handle cũ |
| AI: từ chối / đồng ý lần này | Denied / unavailable, không gửi dữ liệu, input được giữ |
| Loading và renderer dừng | Host frame/Back/Đóng còn hoạt động; phục hồi về content |
| Empty | Chỉ empty copy/action, không hiển thị booking fixture bên dưới |
| Viewport 320 + Nhãn lớn | Khung 286 CSS px, không tràn ngang trang/header/content; header controls 55 px cao |
| Khung 390 và viewport 960 | Hai adapter cùng cấu trúc; các action content cuộn tới được, không bị Dock chặn |
| Syntax + model checks | PASS: sandbox 10 nhóm; bộ Dock hiện tại 23 nhóm |

Đã kiểm tra cả 8 trạng thái qua selector. Lỗi selector đo Home do nút review mới được xử lý bằng selector `.phone[data-platform]` trong bản tích hợp hiện tại. Modal controls không gửi thêm sự kiện navigation sau click; kiểm tra browser xác nhận focus sau cancel và consent. Không phát sinh network/API hoặc native operation từ các mô phỏng.

Ảnh minh chứng: [hai adapter sandbox](native-ui-sandbox-review.jpg). Đây là evidence web, không xác nhận native accessibility/security/performance. Human review sở hữu UX acceptance; sau khi chốt, port theo cùng fixture sang SwiftUI/Android Views và kiểm tra bàn phím, screen readers, font scale, safe area, lifecycle thực trên thiết bị.

## Cách feedback

Mở SDK Demo, thử hai trang con, nhập nháp, Back rồi Đóng, hoặc chọn trạng thái trong “Mô phỏng sandbox”. Thử Nhãn lớn và chiều rộng nhỏ. Ghi feedback theo registry ID vào [board hiện có](native-ui-design-board.html#miniapp.preview); liên kết vòng sandbox là v0.4, Figma vẫn ở revision cũ.

Implementation review: [model](native-ui-sandbox-model.js), [UI](native-ui-sandbox-review.js), [tests](native-ui-sandbox-model.test.cjs). Không có native security enforcement trong các file này.
