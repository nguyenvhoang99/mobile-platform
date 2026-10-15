# Product Document — On-device LLM (host shell feature)

> **Status:** proposed (chưa implement, chưa đo device-lab).
> **Scope:** first-party host app (RN screens) gọi LLM on-device qua shell.
> Mini-app gọi trực tiếp là **non-goal** của doc này (phase 2, cần gate riêng).
> Đọc cùng: `on-device-llm-research.md` (fact nền),
> `on-device-llm-technical.md` (contract shell→RN),
> `capability-bridge.md` (vì sao phase 1 không chạm bridge).
> Ngôn ngữ làm việc: tiếng Việt (MEMORY). Mọi con số budget thuộc về
> `policy/budgets.md` — doc này không restate số.

## 1. Metadata (SKILLS §11 — rút gọn cho product doc)

```yaml
feature: "on-device-llm (host-only)"
status: proposed
owner: "TBD — bắt buộc trước gate (registry yêu cầu owner + support_horizon)"
scope_and_non_goals: "§2 dưới đây"
facts:
  - "LLM do OS phân phối, app không bundle weights (research §2–§3)"
  - "Flagship-only: Galaxy A14/A54 và iPhone 14 không hỗ trợ"
  - "Android inference foreground-only; quota per-app (BUSY/battery)"
  - "Repo hiện tại: RN 0.85.1 bare CLI, New Arch + Hermes, minSdk 24 (MEMORY ARC-002)"
assumptions:
  - "Phase 1 dùng TurboModule host-only, noi theo NativeNotification/NativeDeviceAccess"
  - "Copy/threshold/prompt template đi qua signed remote config (SOUL invariant 1)"
user_goal: "user hoàn thành việc tóm tắt/viết lại/trích xuất/mô tả ngắn ngay trên máy, offline-capable, với fallback rõ khi không hỗ trợ"
success_condition: "§3 — quan sát được trên device thật, không suy từ emulator/dev build"
```

## 2. Mô tả feature

### 2.1 Feature là gì

"On-device LLM" là **một năng lực của native shell** (mechanism trong binary) +
**orchestration ở RN host** (UI, validation, lifecycle, fallback), cho phép các màn
hình first-party gọi model ngôn ngữ chạy **hoàn toàn trên máy**:

- iOS: Apple Foundation Models framework (iOS 26+, thiết bị Apple Intelligence).
- Android: AICore + Gemini Nano qua ML Kit GenAI APIs (allowlist flagship).

Không API key, không per-request server cost ở path on-device, dữ liệu không rời máy
ở path này (fact — xem research). Shell **chỉ phơi mechanism** (availability,
session, generate/cancel/stream, error mapping); mọi policy/copy/threshold thuộc về
signed remote config theo SOUL invariant 1.

### 2.2 Việc được hỗ trợ (closed set phase 1 — đề xuất)

| Task | Input modality | Output | Ví dụ dùng |
|---|---|---|---|
| `summarize` | text (article/conversation) | 1–3 bullets | Tóm tắt ghi chú, đoạn chat dài |
| `rewrite` | text ngắn | text cùng nghĩa, tone khác | Viết lại tin nhắn lịch sự/ngắn gọn |
| `proofread` | text ngắn | text sửa lỗi + (optional) danh sách gợi ý | Soát lỗi trước khi gửi |
| `extract` | text | structured fields theo schema | Trích xuất tên/ngày/số từ đoạn văn |
| `describe_image` | image + text prompt ngắn | 1 mô tả ngắn | Alt-text, tiêu đề ảnh, hỗ trợ khiếm thị |
| `transcribe` | audio (mic/file) | text transcript (streaming partial → final) | Ghi chú thoại thành văn bản |

### 2.3 Non-goals (nói rõ để khỏi scope-creep)

- Chatbot mở / RAG tài liệu dài / reasoning sâu / batch xử lý nền.
- Server/Cloud LLM và Private Cloud Compute path (ngoài scope phase 1).
- Mini-app hoặc WebView gọi trực tiếp (phase 2, cần native-capability + governance gate).
- Custom weights / fine-tune / pin checkpoint (OS ship model theo OS update).
- Background inference (Android block; iOS ngoài semantics foreground của feature).

## 3. Success signal (quan sát được — SOUL §3.12, §8)

- Trên máy hỗ trợ: user tap → **ack ngay**, thấy stream/tiến triển thật, nhận kết quả
  bounded hoặc lỗi có đường đi tiếp; input/draft **không mất**; không false success.
- Trên máy không hỗ trợ: feature **không enable** (disable có lý do) hoặc fallback đã
  công bố; không crash, không treo, không spinner vô hạn.
- Denial/quota/offline/download-dở/background đều là **trạng thái hợp lệ** có UI,
  không khóa phần app không liên quan (SOUL §5).
- Core journey dùng được với screen reader, text scale lớn, Reduce Motion
  (SOUL §3.8) — "cảm thấy ổn" không thay evidence ở §10.

## 4. Ma trận khả dụng (tóm tắt product — chi tiết ở research + technical)

| Nhóm | Hỗ trợ (fact tại thời điểm research 09/2026, re-check trước ship) |
|---|---|
| iOS | iPhone 15 Pro/Pro Max (A17 Pro)+, toàn bộ iPhone 16/17; iPad mini A17 Pro, iPad M1+; Mac M1+; cần iOS 26+, Apple Intelligence bật, đủ storage, region/language hỗ trợ |
| Android text/image prompt | Allowlist flagship (Pixel 9/10/11, Galaxy S25/S26/Z Fold7/8, OnePlus/OPPO/Xiaomi/vivo/Honor/iQOO/realme/Motorola đời mới…); API level 26+ chỉ là điều kiện gradle, quyết định thật là `checkStatus()` |
| Android speech | Basic (model truyền thống): hầu hết máy API 31+; Advanced (GenAI): Pixel 10/11, đang mở rộng |
| Không hỗ trợ | Galaxy A14 (low ref), A54 (mid ref), iPhone 14 (high ref), bootloader unlocked, AICore chưa init |

Hệ quả product: on-device LLM là **enhancement flagship-only**, không bao giờ là
critical path; mọi màn hình phải thiết kế với "unavailable" là default rẻ nhất.

## 5. UX tối ưu theo từng trạng thái (SOUL §3.4 — transitional states là sản phẩm)

Một intent = một owner (screen/flow), tối đa một blocking episode liên tục (MEMORY UX-003).
Bảng dưới là **hợp đồng UX**: mỗi trạng thái có trigger, UI, copy-hướng (copy thật do
remote config sở hữu) và action tiếp theo.

| # | Trạng thái | Trigger (native báo gì) | UX bắt buộc |
|---|---|---|---|
| S0 | `unsupported` (máy không hỗ trợ) | iOS `deviceNotEligible` / Android `UNAVAILABLE` | **Không enable feature**: button ẩn hoặc disabled kèm lý do ngắn ("Thiết bị này chưa hỗ trợ AI trên máy"). Không hiện sheet/download, không log lỗi ồn. Phần còn lại của screen dùng bình thường. |
| S1 | `needs_setup` | iOS `appleIntelligenceNotEnabled` / Android AICore chưa init (`BINDING_FAILURE`/`FEATURE_NOT_FOUND` sau setup mới) | Thông báo 1 lần, đúng lúc (khi user chạm feature, không phải lúc mở app): nêu việc gì + nút mở Settings/Thử lại sau. Không re-prompt dồn dập; permanent thì deep-link Settings thay vì hỏi lại. |
| S2 | `downloadable` | Android `DOWNLOADABLE` | Hỏi user trước khi tải (tốn dung lượng/mạng): nêu lợi ích + kích thước ước lượng nếu có + nút "Tải" / "Để sau". Không tự tải lén trên cellular nếu chưa consent. |
| S3 | `downloading` | `DOWNLOADING` + progress bytes thật | Hiện **progress thật** (bytes đã tải), cho phép Cancel và rời màn hình (download tiếp tục hay hủy theo contract technical; không giả %). Không dùng % giả, không giữ user bằng minimum-duration spinner. |
| S4 | `ready` | `AVAILABLE` | Enable full UI. Prewarm/warmup đã chạy nền sau first frame (không block startup). |
| S5 | `generating` (ack + stream) | session đã start | Tap → **visual ack ngay** (đổi trạng thái CTA, giữ layout, accessible busy). Kết quả stream render incremental (coalesce, không re-render per-token gây jank). Luôn có **Cancel/Dừng** dễ thấy; Back giữ draft/input. |
| S6 | `slow` (lâu chưa có kết quả) | quá ngưỡng `slow_after_ms` từ remote config mà chưa terminal | Cùng region đổi copy: "Đang xử lý trên máy, hơi lâu hơn thường…" + giữ Cancel + (nếu policy cho) nút "Thử lại" tạo episode mới link cùng intent. Không treo spinner vĩnh viễn, không tự retry mù (tôn trọng quota). |
| S7 | `timeout` | hết `timeout_ms` chưa terminal | Terminal rõ: giữ input, nêu "chưa xong, chưa lưu gì thêm" (không báo success, không coi là fail chắc chắn nếu semantics unknown), cho Retry (cùng idempotency/intent mới theo technical) hoặc Dismiss. |
| S8 | `success` (+ `truncated`) | terminal result | Hiện kết quả + dấu hiệu `truncated` khi bị cắt ("Đã rút gọn — xem bản đầy đủ" nếu có). Output của model là **untrusted text**: render như text thường, không auto-link/auto-execute, không dùng làm authority cho giá/quyền/số dư (SOUL §3.10). Cho Copy/Sửa/Dùng lại. |
| S9 | `guardrail_blocked` | model từ chối (safety/guardrail, cả benign false-positive) | Nói rõ "không tạo được nội dung cho yêu cầu này" + gợi ý sửa input (ngắn hơn, đổi cách diễn đạt), giữ input. Không đổ lỗi user, không lộ raw reason. |
| S10 | `quota_busy` | Android `BUSY` / iOS quá tải | Backoff theo `retry_after`: "Đang bận, thử lại sau Xs" + nút thử lại bị disable tới hạn. Không spam retry (làm tệ hơn). Battery-quota dài hạn → fallback/disable tới hôm sau, không hứa "đợi chút". |
| S11 | `background_blocked` | app mất foreground giữa chừng | Dừng inference, giữ draft + trạng thái `interrupted`; quay lại foreground **không tự chạy lén** — user bấm tiếp tục mới chạy episode mới. Không reschedule nền. |
| S12 | `language_unsupported` | locale/model không hỗ trợ (VD image-desc EN-only, summarization EN/JA/KO) | Báo trước khi chạy nếu detect được ("Ảnh→mô tả hiện chỉ hỗ trợ tiếng Anh"), hoặc sau khi lỗi với fallback (dịch sau ở RN nếu policy cho). Không để user gõ dài rồi mới báo. |
| S13 | `input_too_long` | vượt 4000 tokens / giới hạn ảnh/audio | Validate **trước khi gọi** ở RN (đếm token/kích thước): báo chỗ sai, cạnh chỗ sửa, giữ input; gợi ý chunk/rút gọn. Native re-check là lưới thứ hai, không phải UX chính. |
| S14 | `error` (còn lại) | closed enum còn lại | Copy template theo enum (không lộ raw native string/path/token), giữ input, có Retry/Dismiss. Unknown outcome thì giữ `unknown` + reconcile theo technical, không nhân intent mới. |

Quy tắc xuyên suốt:

- **Không enable khi unsupported (S0)** — đây là câu trả lời trực tiếp cho yêu cầu:
  availability check chạy trước khi render CTA; `null`/thiếu module (N−2 shell) cũng
  là unsupported sạch.
- **Model chưa ready (S1–S3)** thì nói đúng việc đang xảy ra + ai làm gì tiếp theo;
  không gộp "chưa bật AI", "đang tải", "máy không hỗ trợ" thành một thông báo chung
  (user cần branch khác nhau).
- **Chạy lâu (S5–S7)**: ack ngay → stream thật → ngưỡng slow có exit → timeout terminal
  có retry; không spinner vĩnh viễn, không fake progress, không success giả (SOUL §3.2).
- Giữ liên tục công sức (SOUL §3.5): Back giữ draft, xoay màn hình/process death theo
  restoration contract (technical §7) — safe-discard cho inference, không hứa "đã lưu".

## 6. Copy, motion, accessibility (product gate)

- **Copy**: mọi string user-thấy thuộc signed remote config (thay copy không cần release);
  binary không hardcode copy product. Mỗi error enum có đúng một template + action.
- **Motion** (mobile-motion; timing do budgets): CTA → sheet/surface trượt từ trigger;
  stream hiện dần (fade-through cùng layer); dismiss là reverse; tôn trọng Reduce Motion
  (0 travel, vẫn đủ text/focus/state). Không intro/celebration/parallax giữ task.
- **Accessibility**: tên/role/state có nghĩa; focus logic khi chuyển S5→S8/S7;
  screen reader **chỉ announce kết quả terminal** (không đọc từng chunk);
  text scale lớn không vỡ layout; touch target theo token; không truyền nghĩa chỉ bằng
  màu/spinner/âm thanh/haptic. Haptic (nếu có) theo facade + cần product/design approval
  — mặc định đề xuất **không haptic** cho inference (không thuộc taxonomy scarce).
- **Platform fit** (SOUL §3.6): iOS/Android không cần giống pixel; khác biệt
  (photo picker, Settings path, speech mode) là quyết định có chủ đích, ghi trong tech doc.

## 7. Privacy, consent, dữ liệu (product cam kết — enforcement ở technical)

- Không tốn OS permission mới cho LLM on-device ở phase 1; mỗi lần chạy gắn với
  **user gesture** (tap CTA / bấm mic / chọn ảnh) — không chạy lén, không chạy nền.
- Dữ liệu vào model: đúng nội dung user chọn + prompt template đã duyệt; không vét thêm
  danh bạ/tin nhắn/thư viện. Ảnh/audio đi qua **host-owned picker/capture**,
  trả derived result (mô tả/transcript), không phơi raw pipe cho bên thứ ba.
- Không log prompt/output/PII thô; audit/telemetry chỉ digest + metadata allowlisted
  (xem technical §8). Output hiển thị có thể copy — nhắc user trước khi paste dữ liệu
  nhạy cảm vào input (copy phòng ngừa, không phải consent wall).

## 8. Rollout, rollback, N−2 (product phải trả lời trước gate)

- Rollout: shell mechanism ship trước, đợi adoption, RN mới bật CTA (không bao giờ yêu
  cầu shell chưa phát hành). Staged theo remote enablement; flagship trước.
- Rollback < 1h: kill switch remote fail-closed → toàn bộ CTA về S0/fallback, không cần
  build mới. Mechanism lỗi trong binary thì rollback = build mới (nói rõ cost, SOUL inv.1).
- N−2 shell thiếu module → JS feature-detect `null` → S0 sạch, không crash.

## 9. Acceptance (product — observable, human + automated chia việc)

1. S0 trên Galaxy A14/iPhone 14: CTA disabled/ẩn có lý do; phần còn lại của app nguyên vẹn.
2. S1–S3 trên máy hỗ trợ nhưng chưa ready: mỗi trạng thái đúng UI + action; progress thật.
3. S5–S8: ack ngay, stream incremental, Cancel mọi lúc, success/truncated đúng, input giữ.
4. S6–S7/S10–S11: slow/timeout/quota/background đều terminal đúng + retry/backoff đúng.
5. S9/S12–S14: guardrail/language/input-dài báo đúng chỗ, giữ input, không raw error.
6. A11y/motion (§6) pass trên VoiceOver/TalkBack + text lớn + Reduce Motion.
7. Không false success, không duplicate business effect, không mất draft ngoài semantics.
8. Budgets/audit/privacy có evidence ở technical doc; human report ghi build/device/gap.

## 10. Manual test script (giao human — build release, máy thật)

- Chuẩn bị: 1 máy hỗ trợ (VD Pixel 9 / iPhone 15 Pro, OS mới, AI bật) + 1 máy S0
  (Galaxy A14) cùng build; nội dung text dài/ngắn, 1 ảnh, 1 đoạn thoại ngắn.
- Đi qua S0→S14 theo bảng §5: tap CTA, cancel giữa stream, background giữa chừng,
  download-dở rồi kill app, quota flood (nếu lab cho phép), input quá dài, locale không
  hỗ trợ. Ghi observed behavior + repro + device/OS/build + mismatch.
- Bật VoiceOver/TalkBack, text 200%, Reduce Motion, kiểm tra lại S5→S8.
- Ghi rõ điều manual test **không** chứng minh: race/release-native, quota dài hạn,
  variance nano-v2/v3/v4 và iOS 26.x mới, performance tail (thuộc automated/device-lab).

## 11. Open decisions (cần owner trước gate)

| ID | Câu hỏi | Đề xuất mặc định | Khi xem lại |
|---|---|---|---|
| P-01 | Task set phase 1 có gồm ảnh/audio? | Có nhưng bounded (mô tả ngắn, transcript ngắn) | Eval quality + device coverage |
| P-02 | Bar tiếng Việt | Eval VI riêng; chưa đạt → EN-only + báo trước (S12) | Usability/quality evidence |
| P-03 | Fallback khi S0/S10 (server LLM / disable / cached) | Ngoài scope PoC — đề xuất disable/cached trước | Architecture decision |
| P-04 | Owner + support horizon | Bắt buộc điền (registry yêu cầu) | Trước human-gate |
| P-05 | Mini-app phase 2 | Không trong doc này | Governance + native-capability gate |

## 12. Evidence

- **measured**: chưa có.
- **not_yet_verified**: toàn bộ hành vi §5 trên device-lab; quality VI; variance model;
  quota dài hạn; tail latency; field telemetry.
- **facts**: xem research + technical §2 (mapping native) với link docs gốc.
