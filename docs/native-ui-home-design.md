# Home — square card grid v0.3

**Yêu cầu:** category và mini app dùng card vuông, tối thiểu 2 cột và tăng theo width,
tối đa **8 cột mỗi hàng**. Không giới hạn tổng số card ở 8. **Visual:** draft.

[Thử bản review](native-ui-dock-review.html) · [Feedback theo ID](native-ui-design-board.html#home.landing)
· [Thông số và catalog snapshot](native-ui-home-design.json).

Phạm vi là design cho `home.landing` và `home.app_row`; giữ ID để mapping tới source.
Prototype dùng chung hình học card cho iOS/Android; dock có contract/revision riêng
trong bản review chung. Task Home này không sửa hai app native hay file Figma v0.1.

## Layout đề xuất

Home giữ greeting và hai nhóm: **Bộ sưu tập của bạn** (category), **Dành cho bạn** (mini app).
Mỗi nhóm là lưới cuộn dọc trong content; dock nằm cố định phía dưới. Khi rộng hơn, card
tăng cột thay vì kéo dài thành hàng chữ nhật. Hàng cuối căn trái, không nhân đôi card để lấp ô.

- Card tỷ lệ 1:1, nền surface, góc 12; icon phía trên, tên và thông tin ngắn phía dưới.
- Inset content 16, gap 12; dùng role từ `app/src/config/layout.ts`. Chiều rộng mong muốn
  của card **160** là lựa chọn design mới, chưa phải token native được duyệt.
- `columns = clamp(floor((availableWidth + 12) / (160 + 12)), 2, 8)`.
  `availableWidth` là width của grid sau safe area/inset, không phải width màn hình vật lý.
  Card co lại khi khung chỉ vừa 2 cột; max 8 cột tiếp tục chia đều width có sẵn.
- Category: icon + tên đầy đủ + số tiện ích. Mini app: icon + tên đầy đủ + thông tin ngắn.
  Không đưa toàn bộ description dài vào mặt card. Không truncate tên trong bản review.
- Ngoại lệ chữ lớn: giữ tối thiểu chiều cao bằng chiều rộng; cho card cao thêm để đọc đủ
  tên/thông tin. Cùng hàng vẫn thẳng hàng. Khả năng đọc ưu tiên hơn tỷ lệ vuông tuyệt đối.

## Nội dung và interaction

Tên/quan hệ của 6 category sản phẩm và 7 mini app lấy từ `native/shared/platform.json`.
Category kiểm thử integration native không thuộc fixture design này. Bản review
hiển thị fixture để xem layout; thứ tự mini app là fixture của prototype, chưa
phản ánh tenant/preference. Khi implement, dùng catalog và thứ tự của tenant hiện tại,
giữ category visibility, pinned state và dedupe đang được quản lý ở Home model.

Tap category mở danh sách tiện ích của nhóm đó trong prototype; có đường xem tất cả.
Tap mini app mở điểm đến minh họa với tên app; quay về Home qua dock. Không thực thi mini app,
booking, thanh toán hay ghi preferences. Grid không bổ sung long press/gesture mới.
Thao tác ghim hiện có ở `home.app_row` cần giữ qua menu/action native khi implement;
prototype này chưa mô phỏng ghim. Khi nhóm rỗng, dùng copy + action khám phá phù hợp;
không tạo card giả. Fixture hiện tại chưa có empty/unavailable state riêng.

Toàn card là một button có nhãn đầy đủ; icon mang tính minh họa. Focus rõ, thứ tự đọc
theo hàng và chuyển tới heading điểm đến sau tap. Có đường Back/Home bằng button.
Khi implement: SF/system font iOS, system font Android; adapter icon native; safe area,
Dynamic Type/font scale, VoiceOver/TalkBack và menu ghim cần kiểm chứng trên thiết bị.
Không đổi framework, toolchain hay thêm dependency cho layout này.

## Evidence ngày 2026-10-04

Kiểm tra browser DOM trên bản web, đơn vị CSS px:

| Khung preview | Grid | Kết quả |
|---|---|---|
| Điện thoại 390 | 356, 2 cột | Card 172 × 172 ở cả hai adapter; tên không tràn card |
| Viewport 320, điện thoại 288 | 254, 2 cột | Card 121 × 121; tên đầy đủ, trang không tràn ngang |
| Các width 704 / 832 / 960 / 1216 / 1344 | 3 / 4 / 5 / 6 / 7 cột | Tăng cột theo width |
| Preview 1600 | 1566, 8 cột | Card vuông; viewer chứa scroll ngang để review khung rộng |
| Viewport 320 + Nhãn lớn | 2 cột | Cho phép tăng chiều cao, không cắt nội dung |

Đã kiểm tra category → filtered apps → mini app và focus heading, category bằng Enter,
Android ở 8 cột và dock picker → Hủy giữ nguyên Home. Syntax script PASS;
16 nhóm kiểm tra dock model/gesture hiện có PASS (`node docs/native-ui-dock-model.test.cjs`).
Đây là evidence web; không xác nhận pixel parity, accessibility hoặc performance native.
Human review sở hữu UX acceptance. App không đổi nên không phát sinh số đo native mới;
khi implement, chạy checks/capture cùng fixture và đo theo `policy/budgets.md`.

## Handoff sau feedback

Cập nhật file Figma hiện có khi có lượt công cụ: card category/app, grid 2–8 cột và
chữ lớn, liên kết với 2 registry ID trên. Các node Figma v0.1 vẫn là revision cũ.
Sau khi chốt design, triển khai SwiftUI grid và Android Views grid theo width content
thực tế; giữ navigation/preference owners. Đây là đề xuất hướng triển khai, chưa có code.
