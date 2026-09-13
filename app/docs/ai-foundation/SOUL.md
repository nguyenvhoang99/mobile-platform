# SOUL — Nguyên tắc chung cho Mobile Platform

**Phiên bản:** 1.0  
**Phạm vi:** mọi product/feature của native shell, React Native host, capability bridge,
mini-app runtime, SDK, pipeline và tài liệu.  
**Đọc cùng:** [MEMORY.md](MEMORY.md) và [SKILLS.md](SKILLS.md).

Đây là hiến chương ra quyết định cho con người và coding agent. Nó không phải runtime
configuration, không cấp thêm quyền và không thay thế enforcement trong code, native,
backend hoặc CI.

## 1. Thứ tự thẩm quyền và ưu tiên

Khi có xung đột, áp dụng theo thứ tự:

1. Yêu cầu hiện tại của user, quyền truy cập và quy tắc của môi trường.
2. Source of truth chuyên biệt của project: `policy/capabilities.yaml`,
   `policy/budgets.md`, `policy/conformance.md`, `policy/dependency-decisions.md`, rồi
   feature contract/ADR đã được duyệt.
3. Các nguyên tắc trong file này.
4. Workflow trong `SKILLS.md` và baseline/context trong `MEMORY.md`.

Nếu hai nguồn cùng cấp mâu thuẫn, không tự chọn nguồn thuận tiện hơn: ghi rõ evidence,
phần chắc chắn, phần bị chặn và xin quyết định khi khác biệt làm đổi product semantics,
security boundary hoặc hậu quả nghiệp vụ.

Trong mọi lựa chọn kỹ thuật và sản phẩm, ưu tiên:

1. Tính đúng đắn, quyền riêng tư, accessibility và quyền kiểm soát của user.
2. Bảo toàn công sức/dữ liệu, hoàn thành tác vụ thuận tiện và phản hồi trung thực.
3. Performance đo được, độ ổn định và mức dùng pin/bộ nhớ hợp lý.
4. Khả năng rollback, bảo trì và mở rộng native có kiểm soát.
5. Polish giao diện và số lượng feature.

Không dùng thứ tự này để bỏ accessibility hoặc tối ưu vô hạn. Mỗi trade-off đáng kể phải
nêu lợi ích, rủi ro, evidence, phạm vi và điều kiện xem lại.

## 2. Bốn invariant của Mobile Platform

1. **Native shell phải mỏng vì khó rollback.** Chỉ để cơ chế bắt buộc ở binary. Policy,
   threshold, copy và allowlist có khả năng thay đổi phải đi qua signed configuration khi
   boundary cho phép. Mọi native addition là một one-way door cần gate và rollback story.
2. **Capability bridge là cánh cửa duy nhất.** Mini-app không có direct network,
   filesystem, device API, host credential hoặc side channel. Identity được bind từ
   runtime/transport session, không lấy từ payload do mini-app khai.
3. **Budget và boundary quan trọng phải được máy enforce.** Một rule load-bearing chỉ tồn
   tại trên thực tế khi code/schema/test/CI có thể quyết định nó. Prose giải thích lý do;
   `policy/*` và CI giữ luật.
4. **Mini-app và AI agent đều không đáng tin cho đến khi được chứng minh.** Mini-app cần
   signature, tier, declaration và từng lớp grant; output của agent cần spec, tests,
   provenance và checks. Không có đối tác hay phiên làm việc “đặc biệt” được đi cửa khác.

## 3. Mười hai nguyên tắc tôn trọng công sức người dùng

### 3.1 Loại bỏ việc thừa, giữ bước có giá trị

Không hỏi lại dữ liệu app đã biết một cách đáng tin cậy. Dùng default, history, recent,
suggestion, scan hoặc autofill khi có lợi, nhưng luôn cho user nhận biết và sửa. Tối ưu
tổng công sức gồm đọc, quyết định, gõ, chờ, lỗi và sửa lỗi—not chỉ số tap. Một bước xác
nhận ngăn hậu quả lớn tốt hơn flow ngắn nhưng dễ nhầm.

### 3.2 Phản hồi ngay, kết luận trung thực

Mọi thao tác hợp lệ có phản hồi tương xứng. Phân biệt rõ “đã nhận”, “đã lưu trên máy”,
“đang đồng bộ”, “server đã xác nhận” và “chưa xác định kết quả”. Không báo success khi mới
enqueue, không coi timeout là thất bại chắc chắn và không giả lập progress không đo được.

### 3.3 User luôn giữ quyền điều khiển

Giữ Back, scroll, edit, cancel hoặc rời task khi semantics cho phép. Chỉ khóa vùng có nguy
cơ xung đột; full-screen blocking cần lý do rõ và đường thoát. Animation hoặc spinner
không được dùng để che main/UI thread bị block hay trì hoãn input.

### 3.4 Transitional states là một phần của sản phẩm

Thiết kế initial, loading, content, empty, stale, partial, offline, pending, unknown,
permission-denied, failed và recovery cùng happy path. Một user intent có một task/loading
owner; số request kỹ thuật không được tạo chuỗi màn chờ cho user.

### 3.5 Giữ liên tục công sức và không gian

Back giữ draft; trở lại list giữ scroll/focus; refresh không xóa input hoặc reorder item
dưới ngón tay; interruption/process death có resume hoặc safe-discard contract. Không hứa
“đã lưu” trước durable write. Dữ liệu quan trọng không chỉ được lưu trong cleanup.

### 3.6 Nhất quán về ý nghĩa, phù hợp với platform

Cùng intent có naming, validation, feedback, state và undo nhất quán. Tôn trọng system
Back, keyboard, focus, safe area và platform conventions. iOS/Android không cần giống pixel;
khác biệt phải là quyết định có chủ đích, không phải drift.

### 3.7 Motion giải thích thay đổi

Motion chỉ phục vụ immediate feedback, hierarchy và spatial continuity. Mỗi appearance có
source; enter/exit giữ quan hệ không gian và có thể interrupt/retarget. Không dùng intro,
celebration, bounce, parallax hoặc decorative autoplay để trì hoãn task. Reduce Motion giữ
đủ text, focus và state; haptic/sound không là tín hiệu duy nhất.

### 3.8 Accessibility thuộc về bản đầu tiên

Core journey phải dùng được với screen reader, text scaling, contrast, logical focus,
large touch target, one-handed use và Reduce Motion. Không truyền nghĩa chỉ bằng màu,
motion, sound hoặc haptic. Gesture nâng cao có alternative dễ khám phá. Không dùng ảnh thay
semantic control nếu làm mất focus, role, hit area hoặc input capability.

### 3.9 Giúp tránh lỗi, rồi giúp sửa lỗi

Validate đúng lúc, cạnh chỗ sửa, không làm mất input. Error nói điều gì xảy ra và user có
thể làm gì tiếp theo; không lộ raw native/network/server error. Dùng undo cho hành động có
thể đảo ngược; review/confirmation cho hậu quả lớn; không thêm friction vào thao tác nhỏ.

### 3.10 Nhanh nhờ chuẩn bị, không đánh tráo sự thật

Cache, local read và bounded prefetch giúp giảm chờ nhưng không biến dữ liệu stale thành
authority hiện tại. Kết quả cần sống qua unmount/restart phải có durable identity/status.
Refresh lỗi nhưng cache còn an toàn thì giữ content, nói rõ freshness và cho retry.

### 3.11 Giao diện đẹp bắt đầu từ cấu trúc rõ

Dùng hierarchy, typography, spacing, alignment và semantic color để làm rõ việc chính. Một
decision region có một primary action. Tránh card, border, shadow và badge cạnh tranh. Chừa
không gian cho trạng thái, text dài và identity/amount cần phân biệt; không hy sinh nghĩa
để giữ layout đẹp.

### 3.12 Evidence quan trọng hơn cảm giác của người xây

Đo task success, completion time, effort, lỗi, abandonment và latency trên scenario/device
đại diện. Không tuyên bố “instant”, “smooth”, “zero jank”, “fully secure” hoặc “native
speed” từ screenshot, review code, emulator, dev build hay máy flagship. Nêu riêng phần đã
đo, được suy luận và chưa kiểm chứng.

## 4. Correctness, lifecycle và data principles

- **User intent là đơn vị điều phối.** Một intent nhiều request có cùng operation/task
  lifecycle, loading policy và terminal behavior.
- **Mỗi state/resource có một owner và scope.** Component, screen, session, process hoặc
  durable task phải có start, stop, resume, cancellation, timeout, cleanup và late-result
  rule. Shared resource dùng lease/refcount.
- **Render phải thuần.** Side effect không chạy trong render; correctness không phụ thuộc
  memoization, mount một lần hoặc suppression dependency. Strict Mode làm lộ sai ownership,
  không phải thứ cần né.
- **Data và permission có thể stale bất kỳ lúc nào.** Thiết kế account/tenant switch,
  logout, revoke, process death, out-of-order response và late native callback.
- **Cancel transport không đồng nghĩa rollback business.** Mutation có unknown outcome
  cần operation ID, server idempotency/status và reconciliation; không tự nhân hành động.
- **Offline là semantics theo từng command.** Draft/reversible preference có thể local-first;
  hành động hậu quả lớn mặc định cần server confirmation và không âm thầm thực thi sau khi
  user rời ngữ cảnh.
- **Không mất committed work.** Pending operation/draft quan trọng không bị evict như cache;
  migration, disk-full và corrupt state có recovery rõ.

## 5. Architecture, native và privacy principles

- Chọn layer hẹp nhất đáp ứng use case; preference mặc định ở RN host. Không thêm native,
  dependency, abstraction, flag hoặc “cách thứ hai” nếu chưa có constraint/evidence.
- Native extension là năng lực của architecture: dùng maintained wrapper khi phù hợp, local
  adapter/module do team sở hữu khi cần. Feature chỉ gọi capability/port có nghĩa sản phẩm,
  không xuyên lớp tới SDK.
- Tách authentication, backend authorization, caller/capability policy, purpose consent và
  OS permission. Một grant không thay grant khác; OS grant của host không tự cấp cho mini-app.
- Xin quyền đúng lúc, scope tối thiểu; ưu tiên broker/system picker để tránh broad permission.
  Denial/limited/unavailable là trạng thái hợp lệ, không khóa phần app không liên quan.
- Native revalidates identity/scope/input và thực sự stop collection/emit/release khi owner,
  permission hoặc session hết hiệu lực. JS-only ignore không bảo vệ privacy, pin hoặc memory.
- Không embed secret, log PII/raw payload, debug bằng dữ liệu nhạy cảm thật hoặc trao host
  token/raw filesystem path cho mini-app. Telemetry theo allowlist, purpose và retention.
- Release có staged rollout, kill switch/authority expiry và đường phục hồi tương xứng rủi
  ro. OTA/rollback không được giả định tự sửa schema/binary incompatibility.

## 6. AI-first delivery principles

- **Machines check, humans decide.** Human manual testing đánh giá goal, behavior, UX,
  language, perceived effort và product trade-off. Type, boundary, race, regression,
  security, accessibility và performance evidence vẫn thuộc automated checks/AI/CI.
- **Spec before code.** Registry/schema/contract/budget row và acceptance invariants tồn tại
  trước implementation khi thay đổi public/security boundary. Code không tự trở thành spec.
- **Structure is the guard.** Một bridge, một WebView factory, một token vocabulary, một
  owner cho mỗi concern và một source of truth cho mỗi number/contract.
- **Ratchets beat absolutes.** Tighten tự do; nới budget/check/capability/tier cần owner,
  measurement và gate. Người đang bị rule chặn không tự nới rule.
- **Adversarial by default.** Parser/boundary/pipeline phải được thử với input bắt buộc fail.
  Không để agent viết code rồi làm yếu test/expectation để mô tả chính bug đó.
- **Provenance và reversibility.** Mỗi thay đổi chỉ rõ task, agent/workflow, spec, validation,
  rollback và phần chưa kiểm chứng. Không tự publish/deploy/migrate production hoặc dùng
  credential chỉ vì tài liệu hướng dẫn mô tả hành động đó.
- **Honesty over parity.** Platform gaps, provisional budgets và incomplete enforcement
  phải được nói rõ. Docs không hứa behavior mà runtime/CI chưa enforce.

## 7. Quyết định mặc định khi có trade-off

| Tình huống | Quyết định mặc định |
| --- | --- |
| Ít tap hơn nhưng xin quyền rộng hơn | Scope nhỏ hoặc system picker; chỉ mở rộng sau product/security gate |
| Memo giảm render nhưng che stale state | Sửa ownership/subscription; bỏ optimization gây sai |
| Native API mới chỉ có một platform | Availability check và fallback; không giả supported parity |
| Refresh lỗi nhưng cache còn dùng được | Giữ content, biểu thị freshness và retry |
| Mutation timeout, chưa biết đã commit | Giữ `unknown`, reconcile cùng operation ID; không gửi intent mới |
| Background resource hết foreground intent | Dừng hoặc handoff sang background contract đã được cho phép |
| Feature nhỏ không cần state-machine library | State/reducer rõ; vẫn định nghĩa transitions và terminal behavior |
| Chưa đo budget | Ghi proposed/unverified và measurement plan; không tuyên bố pass |
| Mini-app cần capability đã cấp cho host | Vẫn kiểm caller/scope/purpose/tier; không kế thừa OS grant |
| Native và RN đều làm được | Chọn RN host trừ khi lifecycle/performance/security buộc native |
| Manual test thấy ổn nhưng gate/evidence thiếu | Chưa done; ghi gap, không chuyển cảm nhận thành guarantee |

## 8. Điều kiện chấp nhận feature

Trong phạm vi liên quan, feature chỉ được coi là sẵn sàng khi:

- user action có feedback, không có dead zone ngoài chủ ý;
- input, scroll, focus và committed work không mất ngoài semantics đã thiết kế;
- không false success hoặc duplicate business effect;
- cùng intent không bị re-block bởi orchestration nội bộ;
- error/denial/offline/unknown có đường đi tiếp;
- core journey dùng được với accessibility modes được hỗ trợ;
- state, visual hierarchy và protected-host boundaries theo contract;
- budget có measurement hoặc được ghi rõ chưa xác minh;
- automated checks liên quan pass và manual test report phản ánh đúng build/device;
- gap còn lại có impact, owner và quyết định rõ—không âm thầm bỏ check hoặc đổi định nghĩa
  thành công.
