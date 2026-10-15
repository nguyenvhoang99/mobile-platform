# Native UI — bảng design chung, bản đề xuất v0.1

**Source snapshot:** 2026-10-03 · **Figma:** 2026-10-04 · **Trạng thái:** draft, kiểm chứng một phần  
**Phạm vi:** hai app SwiftUI và Kotlin/Android Views ở root `ios/`, `android/`.  
**Bản review:** [native-ui-design-board.html](native-ui-design-board.html) · [dữ liệu review](native-ui-design-board.json)  
**Định danh:** giữ nguyên 21 ID trong [registry](native-ui-component-registry.md).

**Mở design:** [Figma · Review & decisions](https://www.figma.com/design/aSnrJJ38Pbif95uoYt4FK5?node-id=11-833)  
**Mapping:** [node URL theo từng ID, component và giới hạn](native-ui-design-figma.json).

**Dock refinement 2026-10-04:** [prototype v0.5](native-ui-dock-review.html) và
[contract](native-ui-dock-design.md): Home mặc định có Khám phá ở giữa; swipe từ giữa
để thêm lối tắt. Trong mini app, Home thu nhỏ app vào nút nổi; hai lối tắt ẩn/hiện có
animation, nhấn giữ để xóa + Undo. Giữ iOS hướng Liquid Glass, Android nền đặc.
Yêu cầu của user đã ghi nhận; visual đang draft.
Refinement hiện chỉ ở docs/prototype cục bộ; node Figma v0.1 và hai app chưa đổi.

**Home refinement 2026-10-04:** [review v0.3](native-ui-dock-review.html) và
[design card grid](native-ui-home-design.md): category/mini app dùng card vuông,
2–8 cột mỗi hàng theo width; chữ lớn cho phép tăng chiều cao để giữ tên đầy đủ.
Dock có contract/revision riêng trong prototype chung. Task Home chỉ sửa design review;
không sửa Figma hoặc hai app.

## Quyết định đề xuất

Dùng **Figma Design** làm nơi con người xem, chỉnh, comment và duyệt design. Mỗi ID có
component/frame với biến thể `platform`, `state`, `appearance`; prototype nối các journey
quan trọng. Figma hỗ trợ [component variants](https://help.figma.com/hc/en-us/articles/360056440594-Create-and-use-variants)
và [variables/modes](https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma).
Canva phù hợp với bảng tổng quan/workshop và [comment trên whiteboard](https://www.canva.com/online-whiteboard/),
nhưng với mục tiêu design → hai implementation, đề xuất ưu tiên Figma.

Đã tạo file **Mobile Platform · Native UI Review v0.1** trên Figma: 21 card review, 26
khung màn/vùng (13 cặp iOS/Android), 6 nhóm component với 22 biến thể, 40 variables và
10 text styles. Text, auto-layout và component instances có thể chỉnh sửa; đã kiểm tra
override text iOS cập nhật component property tương ứng. Không dựng UI bằng ảnh raster.
Bảng HTML vẫn là phương án review đọc được và lưu feedback cục bộ.

**Giới hạn hiện tại:** Figma MCP của team Starter đã hết lượt trước bước audit cuối.
Trong phiên Figma web đã xem, khung Android Home đọc được nhưng text SF Pro của iOS
không render. Cần sửa khả năng render font hoặc chọn font preview có ghi rõ fallback;
không đổi font native của app. Prototype **chưa nối**, mặc dù intro trên canvas còn mô
tả flow dự kiến; cần sửa copy đó trong lần chỉnh Figma kế tiếp. Các link trong HTML/JSON
là link mở node design, không phải prototype hoạt động. Chưa có design sẵn sàng implement.

## Evidence và nguồn tham chiếu

- Registry chứa 21 màn/vùng chính, không phải inventory từng primitive. Source scan này
  xem cả hai implementation, style Android và widget iOS.
- Home có ảnh sẵn trong `native/evidence/ios-home.png` và `android-home.png`. Hai file UI
  chính khớp fingerprint của `native/evidence/artifacts.json` khi dựng bảng. Metadata của
  từng ảnh không xác lập đầy đủ device/OS/font scale/theme/build; gọi chúng là **ảnh evidence
  có sẵn**, không coi là capture mới hoặc nghiệm thu trên thiết bị.
- Các vùng còn lại chỉ có mô tả kiểm tra từ source; cần capture đúng fixture trước khi
  kết luận về pixel, clipping, focus hoặc UX thực tế.
- Bộ [design system RN](../app/docs/design-system/README.md) đã tồn tại ở trạng thái v0.1;
  palette/layout/typography có nguồn trong `app/src/config/`. Hai app native hiện chưa
  tiêu thụ chung bộ token đó. RN là reference; không áp đặt lại runtime RN.
- Các preview bên phải là **đề xuất bố cục**, không phải screenshot native hay chứng nhận
  accessibility/behavior. Copy minh họa tiếp tục nói rõ dữ liệu mẫu, AI unavailable,
  chưa đặt chỗ/chi tiền/lưu bền khi source chưa làm được.

## Khác biệt cần review trước

| ID | Evidence từ source | Quyết định đề xuất |
|---|---|---|
| `shell.header` | iOS Home: khu vực + inbox; Android luôn có Back/Close, inbox ở danh sách Home | Cùng vai trò và điều kiện xuất hiện; Home có khu vực/inbox, màn con có Back/Close |
| `home.landing` | iOS chia collection/recommended; Android ghép các hàng, dedupe pinned + apps | v0.3: category/mini app dùng card vuông, 2–8 cột; giữ ranh giới nhóm và tenant/preference owners khi implement |
| `shell.navigation.dock` | iOS Menu, chọn shortcut mở menu; Android tap mở, giữ để đổi | v0.5: Khám phá/Home ở giữa; swipe từ giữa để thêm; Home thu nhỏ mini app vào nút nổi; lối tắt ẩn/hiện có animation; long press xóa + Undo |
| `home.customize` | SwiftUI toggle ghi ngay; Android dialog chọn rồi Lưu | Chung draft + Lưu/Hủy rõ ràng; đây là thay đổi behavior cần contract khi implement |
| `sample.booking` | iOS slot/action trong section; Android đặt demo storage/bill trước danh sách slot | Booking là nhóm đầu; storage/bill tách nhóm để không lấn tác vụ chính |
| `sample.status` | iOS trạng thái trong SampleView; Android TextView toàn shell | Feedback tại vùng của intent; thông báo nền/global chỉ dùng cho lỗi global |
| Foundation | iOS tint theo tenant; Android accent cố định theo theme, text mặc định màu xám | Chung semantic token và hierarchy; vẫn dùng font/control native theo platform |

Chưa có design được duyệt để gọi những khác biệt trên là “vi phạm design”. Chúng là
**ứng viên drift hoặc quyết định platform cần làm rõ**. Calendar editor, quyền OS và
Live Activity/ongoing notification giữ bản chất platform-owned.

## Cấu trúc file Figma đã tạo

| Page | Nội dung | Điều cần quyết định |
|---|---|---|
| `00 · Review & decisions` | Legend + 21 card: source iOS/Android, proposal, states, source paths, decision log | Hiện toàn bộ draft; review theo stable ID |
| `01 · Foundations & components` | Reference palette/layout/type; Action, AppRow, Field, Feedback, Header, Dock | Token đề xuất, platform adapter và state thực sự cần |
| `02 · Screens & flows` | 13 cặp màn/vùng, 7 feedback concepts, OS handoff notes | Shared hierarchy; prototype chưa nối; visual audit còn thiếu |

Kho mẫu/Hóa đơn là đoạn trong cùng SDK Demo đang cuộn, không đề xuất thêm route.
Calendar editor/live surface chỉ có ghi chú phạm vi và handoff; chưa vẽ lại giao diện OS.
Ảnh evidence có sẵn ở bảng HTML/repo; không upload toàn bộ screenshot UI vào canvas.
Khi design được duyệt mới tạo vùng Ready for implementation với revision/contract/evidence.

Tên frame: `<registry-id> / <state> / <platform> / <appearance>`. Ví dụ:
`home.landing / content / ios / light`.
Description giữ ID, source links, purpose, owner, revision, evidence và quyết định. Component
thành phần nhỏ tham chiếu parent ID; chỉ thêm registry ID khi có trách nhiệm UI mới.
Không tạo một cartesian product vô nghĩa: state/platform chỉ có variant thực sự liên quan.

Đã tìm library Material 3 và iOS 26/27, nhưng chưa có library sản phẩm/Code Connect của
hai implementation native. Control mặc định và Liquid Glass không khớp source hiện tại;
bản này tạo phạm vi 6 host primitives từ source thay vì nhập toàn bộ OS kit.

## Foundation đề xuất

Kế thừa **vai trò** semantic từ `palette.ts` và `layout.ts` thay vì chọn màu/spacing độc lập
cho mỗi OS. Bản review lấy palette mặc định RN làm hướng visual và scale layout hiện có;
đây là snapshot tham chiếu, chưa là token contract mới đã duyệt. Tenant accent vẫn cần
biến thể review. Chưa chốt dark palette; không tự suy ra dark design từ light screenshot.

- Chung: content order, label/action meaning, type hierarchy, spacing roles, trạng thái,
  validation, recovery, phạm vi lưu và feedback.
- Platform: SF/Roboto hoặc system font, Back gesture, keyboard, safe area, focus,
  menu/sheet/dialog phù hợp. Không đổi SwiftUI hay Android Views trong design task này.
- Icon: một bảng nghĩa và role; adapter SF Symbols/drawable native sau khi duyệt. Không
  thêm icon library/dependency chỉ để đồng nhất hình.
- Accessibility: label/role/selected/busy/error rõ, text scaling/reflow, logical focus,
  không chỉ dùng màu. Touch target lấy nguồn token hiện có + baseline OS lúc implement.
- Motion/performance dùng [policy/budgets.md](../policy/budgets.md); không sao chép hoặc nới
  ceiling trong Figma. Host chrome và consent luôn phân biệt với mini-app content.

## Review và quản lý feedback

Bảng HTML cho chọn ID, xem hai mô tả source, preview đề xuất và ghi feedback/trạng thái
review riêng từng ID. Feedback chỉ lưu trong browser nếu storage khả dụng; **không tự sửa
repo, không đồng bộ với Figma hoặc người khác**. Xuất JSON để chia sẻ/backup; nhập JSON
từ cùng schema/revision để tiếp tục. Refresh/file-origin khác có thể không giữ storage.
JSON xuất hiện trực tiếp để sao chép/dán lại; tải file là lựa chọn phụ và còn phụ thuộc
trình duyệt. Có thể nhập bằng file hoặc JSON đã dán. Export chứa feedback người dùng nhập;
không nhập dữ liệu thật nhạy cảm vào bảng này.

Ví dụ feedback: `shell.header — Home không nên có Back; giữ nút khu vực bên trái, inbox
bên phải; cần xem dark mode`. Concept approved chỉ ghi ý kiến, không cho phép agent tự
thay behavior/credentials/release. Proposal đã có editable layers/components và node URL
theo từng ID. Figma giữ design đã duyệt;
registry giữ mapping implementation; policy giữ gate; bảng này chỉ là review snapshot để
tránh hai nguồn design cùng được sửa lâu dài.

## Thứ tự triển khai sau feedback

1. Chốt Foundations + `shell.header`, `shell.navigation.dock`, `home.landing`, `home.app_row`.
2. Dựng component catalog native và Home trên cả hai platform từ cùng revision được duyệt.
3. Tiếp tục Explore/tenant/customize, Cards, Inbox/Account, rồi SDK Demo và live surfaces.
4. Mỗi slice kèm loading/content/empty/denied/unavailable/error phù hợp; giữ fixture, tenant
   isolation, permissions, draft/lifecycle và các giới hạn PoC hiện tại. Đổi customize save
   semantics hoặc navigation/retention phải có contract trước code.
5. Update implementation links khi symbol di chuyển; gắn Figma node + revision + evidence
   theo ID. Chỉ đánh dấu verified sau automated checks và manual acceptance tương ứng.

Contract cho mỗi slice: purpose + owner; states/transitions; events và rapid-tap rule;
loading/feedback scope; retained input/Back/cancel; accessibility/focus/motion; adaptive
layout; platform exception có lý do; acceptance evidence. Theo template ở
[SKILLS.md §4.1/§11](../app/docs/ai-foundation/SKILLS.md).

Manual review cùng fixture/khu vực và trạng thái trên hai máy: Home → app → Back/Close;
đổi ghim/dock rồi restart; tìm không dấu/không kết quả; font lớn/VoiceOver/TalkBack,
dark mode/Reduce Motion/keyboard; permission deny; thao tác booking/bill lỗi vẫn giữ input.
Ghi device/OS/build/tenant/font scale/theme/state cùng ảnh. Agents chạy native domain,
lint/build/UI checks thích hợp; con người sở hữu product/UX acceptance.

Task này chỉ thêm tài liệu/bảng review. Startup/memory/FPS/binary/build/crash và 7 dependency
counters: **không ảnh hưởng app**, vì không đổi source/build/config/dependency hay bundle
review artifact vào binary. Device/a11y/performance của design đề xuất vẫn **unverified**;
đo trên release cùng fixture/reference device theo policy khi implement, owner Mobile Platform.
Rollback bản review: bỏ các file `native-ui-design-*`; không cần migration app hoặc thay policy.

## Kiểm tra bản review này

Đã kiểm tra 21 ID khớp registry; file/line target tồn tại; source fingerprint và dữ liệu
JSON nhúng khớp snapshot; JavaScript qua syntax check. Browser review kiểm tra chọn/lọc ID,
lưu feedback qua reload, xuất JSON trực tiếp, nhập lại và reject revision khác; chiều rộng
320 px không tràn ngang ở case đã xem. Không thấy browser console error trong phiên review.

Figma trả về ID của 21 card, 26 khung màn/vùng, các component và variables; đã lưu mapping
node cụ thể để tiếp tục trong file đó. Web review thấy Android Home đọc được và phát hiện
vấn đề render SF Pro ở iOS. Chưa audit toàn canvas, chưa xác nhận prototype hoặc a11y/device.
Trước vòng Figma tiếp theo: sửa font render; sửa intro nói về prototype dự kiến; nối flow;
hoàn thiện Dock selected/shortcut variants; sửa Header library default; bind text styles;
xóa header trial `9:2` ở Foundations. Các state còn thiếu và dark/tenant accent tiếp tục draft.

Tải file JSON qua browser hiện tại chưa xác nhận được (download event timeout); dùng nội dung
JSON hiển thị để sao chép/dán là đường đã kiểm tra. Nhập bằng file chưa kiểm chứng. Không
chạy native build/test vì task không đổi app; chưa có nghiệm thu design trên thiết bị thực.
