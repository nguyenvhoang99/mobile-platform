# Technical Document — On-device LLM: contract shell → RN

> **Status:** proposed contract (chưa implement). Mọi native addition / dependency /
> capability / budget-loosen sau đây đều là **gate** — không code trước approval
> (SKILLS §1–§2; mobile-architecture; mobile-simplicity; native-capability).
> Đọc cùng: `on-device-llm-product.md` (UX/states), `on-device-llm-research.md` (fact),
> `capability-bridge.md` (vì sao phase 1 host-only).
> Quy ước: **fact** = đã kiểm trong docs gốc/repo; **proposed** = đề xuất chờ gate;
> **unverified** = cần device-lab/CI evidence. Không restate số từ `policy/budgets.md`.

## 0. Layer decision (mobile-architecture — ghi để khỏi re-argue)

```markdown
## On-device LLM — layer decision
**Layer:** native shell (mechanism) + RN host (orchestration). Mini-app: không (phase 1).
**Why this layer:** cần device API không có ở JS (FoundationModels / AICore + ML Kit),
  lifecycle/background/timeout thuộc OS, inference phải off JS thread. Mọi thứ còn lại
  (copy, prompt template, validation, UI state) ở RN host + signed remote config.
**Budget it must respect:** xem §10 (trỏ row trong policy/budgets.md, toàn bộ unverified).
**What ships remotely vs in the binary:** binary = availability/session/generate-cancel-stream/error-map.
  Remote = enablement, prompt template + version, thresholds (max tokens/timeout/slow_after/retry_after),
  copy per error enum. Không hardcode copy/threshold/allowlist trong binary.
**Rollback story:** kill switch remote fail-closed < 1h; mechanism lỗi = build mới (cost nói rõ).
**Skew tolerance:** N−2 shell thiếu module → spec `null` → RN về S0 (unsupported) sạch.
**One-way doors:** tên TurboModule + spec Codegen, Android artifacts, (phase 2) registry capability.
```

## 1. Mục tiêu thiết kế (general cho iOS + Android)

1. **Một contract RN duy nhất** cho 2 OS × 3 modality (text/image/audio) × 2 tình trạng
   máy (hỗ trợ / không hỗ trợ). RN không `Platform.select` rải rác — isolate sau một port.
2. **Feature-detect, không version-sniff**: RN hỏi `getAvailability()` / `null`-module,
   không branch theo OS version hay model marketing name.
3. **Bounded trước allocate**: mọi size/length/duration được check ở RN (UX) và re-check
   ở native (enforcement) trước khi decode/cấp RAM.
4. **Handle, không bytes**: ảnh/audio không đi qua JSON dưới dạng base64; RN trao
   **opaque handle** do host-owned picker/capture cấp, native resolve + validate scope.
5. **Exactly-once terminal**: mọi session kết thúc đúng một lần (result hoặc typed error);
   late chunk sau cancel/teardown bị drop; không treo.
6. **Honesty over parity** (SOUL §6): chỗ nào OS không parity (audio iOS 2-stage, speech
   Basic vs Advanced, image-desc EN-only) thì contract phơi đúng khác biệt, không giả vờ.

## 2. Fact nền từ docs gốc (re-check trước khi code — OS đổi nhanh)

### 2.1 iOS — Foundation Models (fact)

- Framework hệ thống, iOS 26+ (`FoundationModels`), yêu cầu thiết bị Apple Intelligence
  + bật Apple Intelligence (fact — research §2).
- Primitive: `SystemLanguageModel.default` (`.availability`, `.contextSize`),
  `LanguageModelSession(instructions:tools:)` (+ init từ transcript/dynamic profile ở bản mới),
  `respond(to:generating:options:)` / `streamResponse(...)` (AsyncSequence snapshot,
  `PartiallyGenerated` cho `@Generable`), `Transcript` lưu prompts+responses,
  `GenerationOptions`, `Instructions` (ngắn, imperative; **không nhét untrusted content
  vào instructions**), `@Generable`/`GenerationSchema`/`Guide` (guided generation),
  `Tool` (model gọi lại app: search local/online, gọi service), `prewarm()`,
  `tokenCount(for:)`, `contextSizeExceeded` khi vượt context, guardrails + feedback log,
  multimodal **text + image attachments** (prompt attachments / image understanding,
  kết hợp Vision OCR/barcode qua tools). Audio trực tiếp **không** thuộc Foundation
  Models — dùng Speech framework transcribe rồi đưa text vào session (2-stage, §4.3).
- Model/quality đổi theo OS update (Apple yêu cầu test lại prompt mỗi bản) — prompt phải
  version-tolerant + eval, không hardcode kỳ vọng từng token.

### 2.2 Android — AICore + ML Kit GenAI (fact, docs 09/2026)

- AICore là system service chạy Gemini Nano (phân phối/update model, tăng tốc phần cứng,
  safety filter, isolate request; Private Compute Core). APK **không bundle weights**.
- Prompt API (`com.google.mlkit:genai-prompt`, hiện beta): text-only + **multimodal
  (ImagePart + TextPart, nhiều ảnh + text)**, `generateContent` (non-stream) +
  `generateContentStream` (chunks), `GenerateContentRequest` options: `temperature`,
  `topK`, `seed`, `candidateCount`, `maxOutputTokens`; system instructions (Beta),
  structured output (Alpha, cần KSP), thinking mode (Beta), prefix caching
  (Experimental), model select (`ModelConfig` releaseTrack/preference; nano-v2/v3/v4 qua
  `getBaseModelName()` — cùng prompt output khác nhau), `countTokens()`, `warmup()`.
  Giới hạn: input **< 4000 tokens (~3000 từ EN)**, tránh output > 4K tokens.
- Feature APIs: Summarization (`ARTICLE`/`CONVERSATION`, output 1–3 bullets; input
  < 4000 tokens, article > 400 chars tốt nhất ≥ 300 từ; ngôn ngữ EN/JA/KO),
  Proofreading, Rewriting, Image Description (**mô tả ngắn duy nhất, EN-only** giai đoạn này).
  Speech Recognition: **Basic** (model truyền thống, hầu hết máy API 31+) vs **Advanced**
  (GenAI, Pixel 10/11 + mở rộng); `AudioSource.fromMic()` khuyên dùng; `fromPfd` yêu cầu
  PCM 16-bit mono 16 kHz realtime; transcript stream partial → final.
- Vòng đời client thống nhất: `checkStatus()/checkFeatureStatus()` →
  `AVAILABLE | DOWNLOADABLE | DOWNLOADING | UNAVAILABLE`; `download()` (Flow/Callback
  Started/Progress/Completed/Failed); inference đầu tiên cũng tự trigger download;
  **`close()` release resource** (VD `summarizer.close()`, `imageDescriber.close()`).
- Quota/block (fact): `BUSY` (dồn dập → exponential backoff),
  `PER_APP_BATTERY_USE_QUOTA_EXCEEDED` (quota dài hạn/ngày → không retry sát),
  `BACKGROUND_USE_BLOCKED` (chỉ top-foreground, kể cả foreground service cũng block).
  Setup issues: `BINDING_FAILURE` 601 (AICore chưa bind sau setup/reset),
  `FEATURE_NOT_FOUND` 606 (chưa tải config xong — chờ mạng + restart; bootloader unlocked
  cũng ra lỗi này và **không được hỗ trợ**), lỗi download `UNAVAILABLE: Unable to resolve host`
  (giữ mạng + retry sau). Rule Google: **luôn `checkStatus()` trước khi hiện UI**.
- Known issues (ghi để implement né): `checkStatus()` bản beta3 throw unhandled trên
  non-Pixel (dùng beta4+); prefix caching fail trên nano-v4 + `FAST` (workaround: bỏ
  `ModelConfig`, dùng default) — chi tiết ở technical §11 + product S-states.

## 3. Module surface (proposed — Codegen single source of truth)

Noi theo `src/native/specs/NativeNotification.ts` (JSON qua string, result `Object`,
events qua `addListener/removeListeners`) và `NativeDeviceAccess.ts`
(host-only, shape contract ở facade). Tên đề xuất: `NativeOnDeviceLLM`.

```ts
// app/src/native/specs/NativeOnDeviceLLM.ts (PROPOSED)
import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  getAvailability(): Promise<Object>;          // LlmAvailability (đóng)
  ensureReady(requestJson: string): Promise<Object>; // trigger download/prewarm; bounded
  generateOnce(requestJson: string): Promise<Object>; // non-stream; bounded in/out
  startStream(requestJson: string): Promise<string>;  // trả sessionId ngay (ack nhẹ)
  cancel(sessionId: string): Promise<void>;           // idempotent
  attachImage(requestJson: string): Promise<string>;  // host handle cho ảnh (không base64)
  // audio capture/transcribe đi qua startStream với input audio (mic/file handle)
  addListener(eventName: string): void;               // 'llmChunk' | 'llmTerminal'
  removeListeners(count: number): void;
}
export default TurboModuleRegistry.get<Spec>('NativeOnDeviceLLM');
```

JS facade `app/src/native/onDeviceLlm.ts` (host-only — **không import từ WebView/mini-app**,
giống comment trong `deviceAccess.ts:44-49`):

- Validate DTO + bounds ở RN (UX chính), `withTimeout` mọi promise (kinh nghiệm bug treo
  `deviceAccess.ts:50-61`), map native → closed error enum (§6), serialize **1 session
  tại một thời điểm** (lease — inference là exclusive resource), drop late result sau
  unmount/background/logout/tenant-switch, settle terminal đúng một lần.
- N−2: `NativeOnDeviceLLM == null` → facade trả `unsupported` sạch (product S0).

## 4. Data contracts (proposed — closed enums, bounded, additive-only)

### 4.1 Availability (thống nhất 2 OS)

```ts
type LlmAvailability =
  | { status: 'available'; model: string; modalities: LlmModality[] }
  // model: 'apple-fm' | 'nano-v2' | 'nano-v3' | 'nano-v4' | 'speech-basic' (ghi để attribute)
  | { status: 'downloadable'; bytesEstimate?: number }
  | { status: 'downloading'; bytesDownloaded: number; bytesTotal?: number }
  | { status: 'needs_setup'; reason: 'ai_disabled' | 'aicore_init' | 'no_network' }
  | { status: 'unavailable'; reason: 'device_ineligible' | 'os_too_old' | 'bootloader_unlocked'
      | 'locale_unsupported' | 'no_module' /* N-2 */ | 'unknown' };
```

Mapping fact: iOS `deviceNotEligible→device_ineligible`,
`appleIntelligenceNotEnabled→needs_setup/ai_disabled`, `modelNotReady→downloading`;
Android `UNAVAILABLE→unavailable`, `DOWNLOADABLE→downloadable`, `DOWNLOADING→downloading`,
setup errors 601/606 → `needs_setup/aicore_init` (retry/backoff, không hiện raw).

### 4.2 Task + input đa modality (union có discriminant)

```ts
type LlmModality = 'text' | 'image' | 'audio';
type LlmTask = 'summarize' | 'rewrite' | 'proofread' | 'extract'
  | 'describe_image' | 'transcribe';

type TextInput  = { kind: 'text'; text: string };                    // ≤ maxInputChars/tokens
type ImageInput = { kind: 'image'; imageHandle: string;             // opaque, host-minted
                    prompt?: string };                              // câu hỏi/lệnh về ảnh, ngắn
type AudioInput = { kind: 'audio'; audioHandle: string }            // mic-session hoặc file-handle
  | { kind: 'audio'; audioHandle: string; locale: string };         // locale VD 'vi-VN' (beta nhiều nơi)

type LlmRequest = {
  v: 1; task: LlmTask;
  input: TextInput | ImageInput | AudioInput;
  options?: { maxOutputTokens?: number; temperature?: number; topK?: number;
              seed?: number; locale?: string; schema?: string /* extract/structured, versioned */ };
  idempotencyKey: string;   // retry cùng intent không nhân effect
  timeoutMs: number;        // từ remote config; native enforce
};

type LlmResponse = { text: string; truncated: boolean; model: string;
                     usage?: { inputTokens?: number; outputTokens?: number } };
type LlmChunk = { sessionId: string; delta: string; done: boolean };
```

Bounds đề xuất (remote config sở hữu số, native enforce — không hardcode product số ở doc):

- text: input ≤ 4000 tokens (~3000 từ EN) cho Prompt path; article > 400 chars (tốt nhất
  ≥ 300 từ) cho summarize-article; output nhỏ (VD ≤ vài trăm tokens; tránh > 4K).
- image: 1 ảnh/request phase 1 (nhiều ảnh là additive sau); native downscale + giới hạn
  pixel/bytes trước decode; `describe_image` output = 1 mô tả ngắn.
- audio: mic ưu tiên; file phải đúng PCM-mono-16kHz-realtime ở Android `fromPfd` path
  (nếu không → `INVALID_ARGUMENT` trước khi cấp resource); locale nằm trong list hỗ trợ
  của mode, `vi-VN` hiện beta ở nhiều mode → eval riêng (unverified).

### 4.3 Mapping modality → native (fact → proposed routing)

| Modality | iOS (fact) | Android (fact) | Contract thống nhất (proposed) |
|---|---|---|---|
| text | `LanguageModelSession`: instructions (ngắn, dev-owned) + `respond/streamResponse` + `@Generable` schema cho `extract` + `GenerationOptions` + `prewarm()` + `tokenCount` + catch `contextSizeExceeded` | Prompt API `generateContent/generateContentStream` + options (temperature/topK/seed/candidateCount/maxOutputTokens) + system instructions + structured output + `countTokens()` + `warmup()`; hoặc Summarization/Proofreading/Rewriting cho task khớp | RN gửi `TextInput` + task; native chọn API theo task (task khớp → feature API; còn lại → Prompt/session). Output variance theo OS/nano version được ghi vào `model`. |
| image | Prompt **attachments** (multimodal text+image) + Vision OCR/barcode qua `Tool` khi cần trích xuất | Prompt multimodal `ImagePart+TextPart` **hoặc** ImageDescription API (mô tả ngắn); `ImageDescriptionRequest(bitmap)` + streaming/non-stream + `close()` | RN gửi `imageHandle` (không bitmap/base64). Native resolve handle → downscale → gọi path tương ứng. iOS/Android đều trả **1 mô tả ngắn** phase 1 (parity trung thực). |
| audio | **2-stage**: Speech framework (on-device recognizer) transcribe → text vào Foundation Models nếu cần refine/tóm tắt. Không có audio-input trực tiếp vào FM. | Speech Recognition API: **Basic** (API 31+, model truyền thống) vs **Advanced** (GenAI, Pixel 10/11+). Stream partial → final; `stopRecognition()` + `close()`. | RN gửi `audioHandle` (+ locale). Native: iOS transcribe→(optional) LLM; Android chọn Basic/Advanced theo availability + locale. Phơi `model: 'speech-basic' | 'speech-advanced' | ...` để attribute. Audio capture là host-owned (mic sheet), dừng thực khi cancel/background. |

Parity không giả vờ (SOUL §6): `describe_image` EN-only phía Android image-desc và
nhiều locale beta phía speech được phơi qua `locale_unsupported`/S12 thay vì ép parity.

## 5. Lifecycle / resource contract (mỗi session — SKILLS §5 + resource template)

- `owner_scope`: calling RN screen/flow + `idempotencyKey`; `identity`: `sessionId`
  (host-minted, single-use); `sharing`: **exclusive lease — 1 inference tại một thời điểm**
  (start mới khi đang chạy → queue có bound hoặc `BUSY_BACKOFF`, không chạy song song).
- `start_condition`: `available` + gesture + foreground + trong quota.
- `stop_events`: Cancel user, blur/unmount, background (BLOCKED → terminal, không resume lén),
  logout/tenant-switch, timeout, revoke/quota-dài-hạn, process death.
- `cancel/cleanup`: `cancel(sessionId)` idempotent; native **stop thực**
  (hủy session/stream, `close()` client Android, end session iOS, release mic/bitmap),
  JS-cleanup-return không thay thế native release (SKILLS §5.2).
- `late_acquisition/late_result`: chunk/result đến sau terminal/teardown → drop + (debug)
  đếm, không commit vào UI/store.
- `resume/process_death`: inference là **safe-discard** (không durable work); draft/input
  của user thuộc screen (Back giữ draft — product §5); không hứa "đã lưu" trước durable write.
- `observable_invariants` (để test): đúng 1 terminal/session; cancel→terminal `CANCELLED`
  trong bound; background→terminal `BLOCKED_BACKGROUND`; unmount→không commit sau đó.

## 6. Error taxonomy (closed enum — R3: mọi code phải có chủ và được publish)

```ts
type LlmErrorCode = 'UNAVAILABLE' | 'NEEDS_SETUP' | 'NOT_READY' /* downloading */
  | 'INVALID_ARGUMENT' | 'LOCALE_UNSUPPORTED' | 'BUSY_BACKOFF' | 'QUOTA_EXCEEDED'
  | 'BLOCKED_BACKGROUND' | 'TIMEOUT' | 'CANCELLED' | 'GUARDRAIL_BLOCKED'
  | 'TRUNCATED' /* là flag trong response, không phải error */ | 'UNKNOWN';
```

- Mỗi code ↔ đúng một product state (§5 product doc S0–S14); message là template từ remote
  config, **không leak** raw native string/path/token/host.
- `BUSY_BACKOFF` kèm `retryAfterMs`; `QUOTA_EXCEEDED` (battery/ngày) không auto-retry;
  `TIMEOUT` giữ input + cho retry cùng `idempotencyKey`; cancel-while-landed → terminal
  `CANCELLED` (LLM là pure read nên không có `UNCERTAIN` kiểu tiền — ghi rõ khác biệt với
  bridge payment rule).
- Widening enum sau này là breaking trừ khi RN đã có default branch từ ngày một
  (native-capability versioning) — contract này đã có `UNKNOWN` default.

## 7. Validation, quota, backpressure (native-capability §Quota)

- RN validate (UX): length/tokens/pixel/locale trước gọi; debounce per-intent; không
  re-fire khi đang `generating` (command guard đồng bộ như action button SKILLS §4.1).
- Native enforce (boundary): re-check type/size/range/unknown-fields; bound
  queue/payload/outstanding (1 lease); token bucket riêng cho LLM (sustained thấp hơn
  location vì inference đắt — số thuộc remote config/policy khi gate, không chốt ở doc);
  trả `retryAfterMs` thay vì fail câm; sustained abuse → suspend instance.
- Stream: **coalesce + drop, không queue** (SKILLS/native-capability); chunk render ở RN
  cũng coalesce (tránh JS per-frame jank).

## 8. Privacy, audit, telemetry (SOUL §5)

- Data inventory: input = nội dung user chọn + template đã duyệt; ảnh/audio qua host-owned
  picker/capture; không vét thêm; không đưa host token/credential/PII thừa vào prompt.
- Audit **before reply** (B7): `{ capability:'llm.*', operation:task, version, gate outcomes,
  resultCode, durationMs, model, argsDigest }` — **digest, không args/prompt/output**.
- Telemetry allowlisted (purpose + retention như tracking hiện tại): availability,
  model version (`getBaseModelName()`/iOS version), task, result code, duration, truncated flag.
  Không prompt/output thô, không bitmap/audio, không PII.
- Gates: phase 1 host-only nên không qua G1/G2/G3 của bridge; bù lại mỗi run gắn gesture +
  foreground (consent-by-action). Phase 2 mini-app (nếu có) áp đủ G1→G2→G3 + tier + quota
  riêng — ngoài scope implement của doc này.

## 9. Versioning, N−2, rollback, remote ownership

- **Additive-only**: thêm optional field / task / modality mới; required mới = operation mới;
  không đổi type/units/nullability; không đổi nghĩa error code; không reuse code đã retire.
- RN **feature-detect** (`getAvailability()` + module `null`-check), không sniff OS version.
  N−2 shell → `no_module` → S0 sạch.
- Binary vs remote (§0): prompt template (+version), thresholds
  (`maxOutputTokens/timeoutMs/slowAfterMs/retryAfterMs`), enablement, copy — tất cả remote;
  binary chỉ mechanism. Prompt versioned để survive model đổi theo OS/AICore update;
  eval lại prompt mỗi OS/nanoumor change (fact từ cả 2 vendors).
- Rollback: kill switch remote fail-closed; mechanism hỏng = build mới (ghi rõ cost).

## 10. Performance + build-health verdicts (SKILLS §9.1 — trỏ row, không restate số)

| # | Row (`policy/budgets.md`) | Verdict (hiện tại: toàn bộ unverified + plan) |
|---|---|---|
| 1–2 | Cold/warm startup | **unverified**: giữ lazy TurboModule; `prewarm()/warmup()/download()` **sau**
  `first_meaningful_frame`; đo `process_start→first_meaningful_frame` before/after (A14, release) |
| 3 | Memory (idle/mini-app/heavy) | **unverified**: inference memory thuộc OS service; verify steady-state + zero low-memory kills; ảnh downscale trước decode, audio buffer bounded |
| 4 | FPS/scroll/animation | **none (lập luận)** nếu stream coalesced + không JS per-frame; breach nếu chunk spam re-render → gate |
| 5 | Binary size | **affected (dự kiến Android)**: thêm artifacts GenAI per-modality; đo AAB/bundle before/after; ratchet là gate |
| 6–7 | Clean/incremental build | **unverified**: đo cùng máy CI + cache, p50 |
| 8 | Crash determinism | **unverified**: matrix N−2 + download-dở + AICore-reset + bootloader-unlocked + bg-kill; flaky = bug |
| Telem | Telemetry budgets | **none (lập luận)** nếu chỉ digest + bounded event |
| Bridge 16ms | `bridge_request→bridge_response` | **không áp dụng** cho generation (async dài); chỉ `startStream` ack phải nhẹ; terminal/stream sau đó |

## 11. Dependency footprint (mobile-simplicity — gate trước khi thêm)

- iOS: **0 dep** (system framework); điều kiện build SDK mới + weak-link + `@available` guard.
- Android (proposed, cần refusal-log entry trong `policy/dependency-decisions.md`):
  per-modality artifacts — `genai-prompt` (text/multimodal), `genai-summarization`,
  `genai-proofreading`, `genai-rewriting`, `genai-image-description`,
  `genai-speech-recognition` (+ KSP nếu dùng structured output). Chỉ admit đúng artifact
  của task ship (không gom cả họ "cho tiện"); mỗi artifact: New Arch tương thích (đây là
  native SDK qua TurboModule tự viết — check toolchain), maintenance/license/security,
  threading/lifecycle/privacy manifest, binary/transitives/startup cost, multi-instance test,
  khả năng patch/replace. Removal condition: khi OS coverage/kill-switch đổi hoặc chuyển
  server path — xóa module + dep cùng change (Track 3: một cách làm LLM duy nhất).
- Dự kiến `scripts/budgets.sh` before/after: deps +N, native modules +1
  (`NativeOnDeviceLLM`), pods/gradle-plugins/scripts/patches đo lúc implement.

## 12. Conformance mapping (giữ C/R/B xanh)

- C2/C3/C4: phase 1 host-only nên **không** có mini-app-facing JS check, không identity từ
  envelope, không path qua lại (handles là opaque, resolve + canonicalize ở native).
  Phase 2 nếu mở bridge: áp đủ C2/C3/C4 + R1–R3 (registry entry trước handler) + B6 (terminal
  đúng hạn) + B7 (audit trước reply).
- Mini-app boundary không đổi: doc này **không** thêm bridge surface — `policy/capabilities.yaml`
  giữ nguyên 6 capability hiện tại cho tới gate phase 2.

## 13. Verification (risk-based — SKILLS §10)

- Unit: DTO bounds/truncate, error-map closed enum, cancel/timeout terminal-once,
  lease serialize (2 starts → 1 chạy), late-chunk drop, idempotent cancel.
- Device matrix (bắt buộc trước done): iPhone 15 Pro+ iOS 26 (available) / iPhone cũ-iOS<26
  (unavailable sạch) / Android allowlist (AVAILABLE–DOWNLOADABLE–DOWNLOADING) / A14
  (UNAVAILABLE→S0) / bootloader unlocked (unsupported) / AICore vừa reset (setup error→backoff) /
  background (BLOCKED) / flood (BUSY) / input > 4000 tokens (INVALID_ARGUMENT) /
  ảnh quá lớn / audio sai format (INVALID_ARGUMENT) / logout mid-stream (cancel thực + audit) /
  OS/nano update (prompt eval lại).
- Eval quality: bộ prompt cố định × (iOS 26.x, nano-v2/v3/v4, Basic/Advanced speech) × EN/VI;
  ghi model version cạnh mọi verdict (variance là fact).
- Adversarial tối thiểu: oversized text/image/audio, handle giả/hết hạn/sai scope,
  locale không hỗ trợ, double-start, cancel-ngay-sau-start, stream-consumer chậm (coalesce),
  download kill-giữa-chừng, N−2 module-missing.

## 14. Manual test handoff (tóm tắt — chi tiết ở product §10)

Board/scenario có thể chạy + script ngắn: goal/success quan sát được, preconditions
(device/build/data), happy + Back/cancel/retry + failure/interruption paths, a11y modes,
expected copy/state sau mỗi điểm quyết định (nhất là downloading/slow/timeout/unknown),
known gaps + điều manual test **không** chứng minh (race/release-native, quota dài hạn,
variance model, tail perf).

## 15. Open decisions

| ID | Câu hỏi | Đề xuất | Gate |
|---|---|---|---|
| T-01 | Task/modality set phase 1 | 6 task §1 product doc, ảnh 1/request, audio mic-first | PM + reviewer |
| T-02 | Structured schema cho `extract` | `@Generable`/structured-output, versioned từ remote | design |
| T-03 | iOS audio 2-stage latency bar | Chấp nhận cao hơn Android Advanced; đo rồi chốt bar | measurement |
| T-04 | Locale bar (VI beta nhiều nơi) | Eval VI riêng; chưa đạt → `locale_unsupported` + S12 | UX/product owner |
| T-05 | Android artifacts admit list | Tối thiểu theo task ship + refusal-log từng artifact | mobile-simplicity |
| T-06 | Owner + support horizon | Bắt buộc trước gate | registry/human-gate |
| T-07 | Phase 2 mini-app + PCC/cloud | Ngoài scope; cần gate riêng | governance + native-capability |

## 16. Evidence

- **measured**: chưa có. **not_yet_verified**: toàn bộ §10–§13, quality VI,
  variance nano-v2/v3/v4 × iOS 26.x, AICore-reset/download-dở, memory/battery field, CI gate.
- **facts**: §2 + link docs gốc (Apple Foundation Models; ML Kit GenAI hub + Prompt
  get-started + Summarization + Image Description + Speech Recognition + Known issues;
  Android Gemini Nano/AICore). Re-check trước khi code.
