# On-device LLM — Research: shell cung cấp gì, app dùng thế nào cho hiệu quả

> Trạng thái: **research / proposed** — chưa implement, chưa đo trên device-lab.
> Mọi claim "production-ready" đều cần evidence theo SOUL §3.12 và MEMORY FND-003.
> Ngày research: 2026-09-20. OS/API đổi nhanh — re-check docs gốc trước khi code.

## 1. Kết luận trước (fact vs proposal)

| # | Nội dung | Loại |
|---|---|---|
| 1 | iOS và Android đều có LLM on-device do **hệ điều hành phân phối**, app không bundle weights | fact (docs Apple/Google bên dưới) |
| 2 | Chỉ chạy trên **dòng máy flagship hẹp**; Galaxy A14 (low-tier reference của repo) **không hỗ trợ** | fact (device list bên dưới) |
| 3 | Năng lực: tóm tắt, rewrite/proofread, trích xuất thực thể, structured output, tool calling, multimodal nhẹ. Không phải chatbot tổng quát, context nhỏ, output khác nhau theo model version | fact |
| 4 | App nên dùng qua **TurboModule host-only trước**, mini-app bridge chỉ là phase 2 cần human gate | proposal (xem `on-device-llm.md`) |
| 5 | Mọi con số latency/memory dưới đây là **provisional/unverified** cho tới khi đo trên release build + low-tier ref | unverified |

## 2. iOS — Foundation Models framework (Apple Intelligence)

Nguồn: `developer.apple.com/documentation/foundationmodels`, Apple Newsroom 09/2025
"Foundation Models framework unlocks new intelligent app experiences", WWDC26 session 241.

### 2.1 Shell cung cấp gì (fact)

- Framework hệ thống `FoundationModels` (Swift-native), có từ **iOS 26 / iPadOS 26 / macOS 26**.
- Truy cập **miễn phí, offline, không API key, không per-token bill**, dữ liệu không rời máy
  (on-device path). Có thêm Private Cloud Compute (PCC) cho reasoning/context lớn hơn.
- Model on-device thế hệ đầu ~**3B parameters**; on-device context ~**4K tokens**
  (prompt + response dùng chung, đọc qua `SystemLanguageModel.default.contextSize`);
  PCC nâng lên ~32K. WWDC26 công bố thế hệ AFM mới (mixture-of-experts, multimodal
  text/image/speech, 25 ngôn ngữ) — coi là **evolving, chưa chốt số cho repo này**.
- Năng lực framework: text generation (summarize, entity extraction, refinement,
  dialog, creative), **guided/structured generation** (`@Generable`), **tool calling**
  (model gọi lại app để lấy dữ liệu), image understanding (kết hợp Vision OCR/barcode),
  streaming response, `session.prewarm()`, token counting (`tokenCount(for:)`), guardrails,
  evaluations instrument, Python SDK/fm CLI (dev only).
- Availability check bắt buộc trước mọi call:
  `SystemLanguageModel.default.availability` → `.available` hoặc `.unavailable(reason)` với
  `deviceNotEligible | appleIntelligenceNotEnabled | modelNotReady` (đang download).

### 2.2 Chỉ chạy ở đâu (fact — device gate)

- Chip: **iPhone 15 Pro/Pro Max (A17 Pro) trở lên + toàn bộ iPhone 16/17**;
  iPad mini A17 Pro, iPad M1+; Mac Apple Silicon M1+; Vision Pro. iPhone 15 thường
  (A16), iPhone 14 trở về trước: **không bao giờ hỗ trợ dù update OS**.
- OS: iOS 18.1+ cho Apple Intelligence nói chung; **Foundation Models cần iOS 26+**.
- Điều kiện runtime: Apple Intelligence **được bật**, cùng language/Siri language được
  hỗ trợ, còn **~7 GB trống**, region/language được hỗ trợ (EU/CN từng bị giới hạn —
  check lại tại thời điểm ship).
- Hệ quả cho repo: iPhone 14 (high-tier ref `policy/budgets.md`) **không dùng được**;
  floor hiện tại của repo (minSdk 24 / iOS baseline) thấp hơn nhiều → mọi UI phải
  feature-detect và fallback (xem §4).

### 2.3 Giới hạn năng lực (fact)

- Context nhỏ (4K on-device): prompt dài bị throw; phải chunk/truncate/bound trước khi gọi.
- Model do Apple ship và update theo OS — **không pin checkpoint, không fine-tune custom
  weights** qua framework này (muốn custom → MLX/CoreML tự bundle — ngoài scope proposal).
- Output thay đổi theo OS version (Apple ghi rõ "test prompts lại sau mỗi 26.x/27") —
  prompt cần version-tolerant + eval, không hardcode kỳ vọng từng token.
- Guardrails chặn một số nội dung benign (false positive) — cần fallback copy rõ ràng.
- Không phải secure-context issue như WebView custom-scheme: đây là native API, không
  liên quan `isSecureContext`.

## 3. Android — AICore + Gemini Nano + ML Kit GenAI

Nguồn: `developer.android.com/ai/gemini-nano`, `developers.google.com/ml-kit/genai`
(last updated 2026-09-17), Prompt API get-started.

### 3.1 Shell cung cấp gì (fact)

- **AICore**: system service chạy **Gemini Nano**, quản lý phân phối/update model,
  hardware acceleration, safety filter, request isolation (Private Compute Core:
  restricted package binding, indirect internet, không lưu input/output sau xử lý).
  APK **không bundle model** — gọi qua Google AI Edge SDK / ML Kit GenAI APIs.
- ML Kit GenAI APIs (high-level, per-use-case + generic):
  `Prompt` (custom text/multimodal), `Summarization` (bullet list),
  `Proofreading`, `Rewriting` (tone/style), `Image Description`, `Speech Recognition`
  (Basic mode API 31+ không cần GenAI; Advanced mode cần Pixel 10/11).
  Có streaming và non-streaming; structured output / system instructions /
  thinking mode / prefix caching ở mức Beta/Alpha/Experimental tùy API.
- Trạng thái model phải check mỗi lần: `checkStatus()` →
  `AVAILABLE | DOWNLOADABLE | DOWNLOADING | UNAVAILABLE`; nếu downloadable thì
  `download()` (LoRA adapter theo feature tải nhanh nếu Nano đã có, tải lâu nếu chưa).
- Version variance: `getBaseModelName()` trả về nano-v2/v3/v4 — **cùng prompt,
  output khác nhau**. Google yêu cầu eval prompt trên từng version
  (`evaluate-prompt` guide).
- Giới hạn đã công bố: Summarization input **< 4000 tokens (~3000 từ EN)**,
  article > 400 chars (tốt nhất ≥ 300 từ); ngôn ngữ hỗ trợ tùy API
  (Summarization: EN/JA/KO); Prompt API cần API level 26+ trong gradle nhưng
  availability thực tế do AICore quyết định.

### 3.2 Chỉ chạy ở đâu (fact — device gate, hẹp hơn iOS)

- Chỉ **flagship 2024–2026** có trong allowlist, ví dụ tại 2026-09-17:
  - Pixel 9/10/11 series (nano-v2/v3/v4 tùy đời),
  - Samsung Galaxy **S25/S26, Z Fold7/8, Z Flip8, TriFold**,
  - OnePlus 13/15, OPPO Find X8/X9/N5, Xiaomi 14T Pro/15/17, vivo X200/X300,
    Honor Magic 7/8, iQOO, realme GT 7, Motorola Razr 60 Ultra/Signature, v.v.
- **Không hỗ trợ unlocked bootloader.** Thiết bị mới setup/reset AICore cần thời gian
  init (tải config) — call sớm sẽ fail với setup error, phải retry/backoff.
- Hệ quả cho repo: **Galaxy A14 (low ref) và A54 (mid ref) không có trong list** →
  on-device LLM là **flagship-only feature**, không bao giờ là critical path.
  Mọi budget/UX phải thiết kế "unavailable là trạng thái hợp lệ" (SOUL §5).

### 3.3 Quota, background, privacy (fact — ảnh hưởng trực tiếp design)

- **Quota per-app**: gọi dồn dập → `BUSY`; vượt quota dài hạn (ngày/battery) →
  `PER_APP_BATTERY_USE_QUOTA_EXCEEDED`. Nhận lỗi này thì **exponential backoff**,
  không retry sát.
- **Foreground-only**: inference chỉ khi app là top foreground; background kể cả
  foreground service → `BACKGROUND_USE_BLOCKED`. Không dùng cho worker/background job.
- AICore isolate từng request, không persist — nhưng **app vẫn chịu trách nhiệm safety/UX**
  (ML Kit GenAI Terms). Audit log của ta chỉ ghi digest, không ghi prompt/output thô.

## 4. App nên dùng thế nào cho hiệu quả (proposal dựa trên fact trên)

### 4.1 Nguyên tắc chọn việc (theo mobile-architecture + native-capability)

1. **Việc hợp**: tóm tắt ngắn, rewrite/proofread tin nhắn, trích xuất field có schema,
   gợi ý 1 câu, mô tả ảnh ngắn, voice transcript ngắn. Input/output đều **bounded,
   structured, user-initiated**.
2. **Việc không hợp**: chatbot mở, RAG tài liệu dài, reasoning sâu, xử lý batch/background,
   việc cần determinism/version pin, việc cần chạy trên mọi máy. Những việc này đi
   **server LLM** (ngoài scope PoC này) hoặc không làm.
3. **Không bao giờ là critical path**: vì flagship-only + modelNotReady/download +
   quota/background-block, on-device LLM chỉ là **enhancement có fallback**
   (disable / server / cached) — SOUL §7 "Native API mới chỉ có một platform" áp dụng
   tương tự cho "chỉ có một subset device".

### 4.2 Pattern hiệu quả (tổng hợp từ cả hai platform)

- **Check availability trước, mỗi lần**: iOS `availability`, Android `checkStatus()`;
  branch `AVAILABLE / DOWNLOADABLE(+offer download) / DOWNLOADING(+progress) /
  UNAVAILABLE(+fallback)` — không version-sniff, không cache kết quả quá lâu.
- **Prewarm sau first frame, không block startup**: iOS `prewarm()`, Android
  trigger `download()` khi user vào screen có khả năng dùng; tuân thủ
  mobile-smoothness (không eager init trước `first_meaningful_frame`).
- **Prompt ngắn, có schema, có giới hạn**: system instruction cố định từ signed config;
  input truncate/chunk ≤ 4000 tokens; yêu cầu structured output (`@Generable` /
  Structured Output API) để parse không vỡ; `maxOutputTokens` nhỏ; timeout rõ
  (xem proposal: `on-device-llm.md`).
- **Streaming cho output dài, non-stream cho output ngắn**; coalesce/drop chunk cũ,
  render incremental; cancel khi blur/unmount (lifecycle contract).
- **Xử lý version variance**: eval prompt trên nano-v2/v3/v4 + iOS 26.x mới;
  log `baseModelName`/OS version (không PII) để attribute regression.
- **Tôn trọng quota/năng lượng**: serialize session (1 inference tại một thời điểm),
  debounce per-intent, backoff khi `BUSY`, không retry khi battery-quota, không gọi
  khi background; inference nặng tránh lúc thermal cao/đang scroll (jank attribution).
- **Privacy/telemetry**: không log prompt/output thô, không đưa PII vào audit;
  telemetry chỉ gồm capability/version/result-code/duration/model-version/digest.

### 4.3 Ma trận nhanh iOS vs Android

| Khía cạnh | iOS Foundation Models | Android AICore / ML Kit GenAI |
|---|---|---|
| Phân phối | System framework, iOS 26+ | System service + Play-managed, lib `genai-prompt` |
| Model | On-device ~3B (~4K ctx), PCC ~32K | Gemini Nano v2/v3/v4 tùy máy |
| Check | `availability` (eligible/enabled/ready) | `checkStatus()` + `download()` |
| Device | A17 Pro+/M1+, iPhone 15 Pro+ | Allowlist flagship (S25/S26, Pixel 9–11, …) |
| Quota | Không công bố per-app quota số; giới hạn bởi ctx/guardrail | `BUSY` / battery quota / foreground-only (fact) |
| Stream | Có | Có (streaming vs non-streaming) |
| Structured | `@Generable` guided generation | Structured Output API (Alpha) |
| Bootloader/bg | N/A | No unlocked bootloader; bg bị block |
| Chi phí dep | 0 dep (system) | 1 native dep + AICore (cần simplicity gate) |

## 5. Rủi ro và gap chưa verify (unverified — cần device-lab trước mọi claim)

- Chưa đo latency/TTFT/tokens-per-sec, memory delta, battery trên bất kỳ reference device nào.
- Chưa verify tiếng Việt quality trên cả hai model; chưa eval nano-v2 vs v3 vs iOS 26.x.
- Chưa verify hành vi khi AICore vừa reset / model đang download / OS update đổi model.
- Chưa có CI gate, chưa có field telemetry — mọi budget row liên quan là **unverified**.
- Mini-app exposure là **open decision** (cần native-capability + governance gate) —
  phase 1 chỉ host-only.

## 6. Nguồn để re-check

- Apple: `developer.apple.com/documentation/foundationmodels`,
  `developer.apple.com/documentation/updates/foundationmodels`,
  Apple Newsroom "Foundation Models framework unlocks new intelligent app experiences" (09/2025),
  WWDC26 session 241, `support.apple.com/121115` (device requirements), `apple.com/apple-intelligence`.
- Android: `developer.android.com/ai/gemini-nano`,
  `developers.google.com/ml-kit/genai` + `genai/prompt/android/get-started` +
  `genai/summarization/android`, AICore privacy blog.
- Nội bộ: `app/docs/ai-foundation/{SOUL,MEMORY,SKILLS}.md`,
  `.claude/skills/{mobile-spine,mobile-architecture,mobile-simplicity,mobile-smoothness,native-capability,mini-app-runtime}/SKILL.md`,
  `policy/{capabilities.yaml,budgets.md,conformance.md,dependency-decisions.md}`,
  proposal chi tiết: `docs/features/on-device-llm.md`.
