# Feature — On-device LLM (shell → RN, host-only trước)

> Design/decision doc — **proposed, chưa implement**. Đọc cùng
> `docs/features/on-device-llm-research.md` (fact nền) và
> `docs/features/capability-bridge.md` (10-step pipeline hiện tại).
> Mọi thay đổi public/native/capability sau đây đều là **human gate** —
> không code khi chưa có approval (SKILLS §1.1, §2.2; native-capability).
>
> Update 2026-09-20: pilot `ai.extract_bill` (purpose-specific cho split-bill,
> xem `ai-extract-bill.md`) đã implement ở contract level thay vì `ai.summarize`
> generic — generic prompt cho mini-app vẫn bị từ chối theo `never_expose`
> (dynamic-code-adjacent review bypass).

## 0. Task model (SKILLS §2.1)

- **User goal (phase 1)**: user của host app (first-party RN screens) được tóm tắt /
  viết lại / trích xuất ngắn **ngay trên máy, offline-capable, không gửi cloud**,
  với fallback rõ khi máy không hỗ trợ.
- **Non-goals phase 1**: chatbot mở, RAG dài, background inference, server LLM,
  mini-app gọi trực tiếp, custom weights/fine-tune, PCC/cloud path.
- **Success quan sát được**: trên máy hỗ trợ → có kết quả bounded + streaming;
  trên máy không hỗ trợ → UI disable/fallback, không crash, không treo, không false success.
- **Hậu quả nếu sai**: native release kẹt store (SOUL invariant 1), dependency veto
  upgrade (mobile-simplicity), hoặc mở cửa bridge sai (native-capability) — vì vậy
  phase 1 **không chạm bridge mini-app**.

## 1. Layer decision (mobile-architecture)

```markdown
## On-device LLM — layer decision
**Layer:** native shell (mechanism) + RN host (orchestration). Mini-app: không (phase 1).
**Why this layer:** cần device API không có sẵn ở JS (FoundationModels / AICore),
  lifecycle/background/timeout thuộc OS, inference phải off JS thread. Đó là constraint
  buộc native; mọi thứ còn lại (copy, prompt template, validation, UI state) ở RN host.
**Budget it must respect:** policy/budgets.md — cold/warm startup (lazy init),
  bridge 16ms p95 KHÔNG áp dụng cho generation (async dài, xem §4), memory per-WebView
  không liên quan (không chạy trong WebView), binary-size ratchet (Android thêm dep).
  Tất cả hiện unverified + measurement plan ở §6.
**What ships remotely vs in the binary:** binary chỉ chứa mechanism
  (availability check, session, generate/cancel/stream, error mapping).
  Prompt template, threshold (max tokens/timeout), enablement, copy → signed remote
  config; thay đổi prompt không cần store release.
**Rollback story:** kill switch remote (fail closed → fallback UI) < 1h không cần build mới;
  nếu mechanism lỗi → submit build mới (nói rõ: không phải rollback story).
**Skew tolerance:** N−2 shell không có module → JS feature-detect `null` và disable.
  Không bao giờ yêu cầu shell chưa phát hành.
**One-way doors:** tên TurboModule + JS spec (Codegen), registry capability nếu mở phase 2,
  Android dep `genai-prompt`. Đều cần gate trước khi code.
```

## 2. API phơi ra RN (proposal — chưa code)

### 2.1 TurboModule host-only `NativeOnDeviceLLM` (Codegen, lazy init)

Spec dự kiến `app/src/native/specs/NativeOnDeviceLLM.ts` (noi theo
`NativeNotification.ts`, `NativeDeviceAccess.ts` hiện có):

```ts
export type LlmAvailability =
  | { status: 'available'; model: string }        // model: 'apple-fm' | 'nano-v2/v3/v4'
  | { status: 'downloadable' }                    // Android: có thể tải
  | { status: 'downloading'; progress?: number }
  | { status: 'unavailable'; reason: string };    // closed enum, không leak native string

export interface Spec extends TurboModule {
  getAvailability(): Promise<LlmAvailability>;
  ensureReady(): Promise<LlmAvailability>;        // trigger download/prewarm, không block quá timeout
  generateOnce(requestJson: string): Promise<string>; // bounded JSON in/out, non-stream
  // streaming qua event emitter: llmChunk {sessionId, text, done} — coalesce/drop, không queue
  startStream(requestJson: string): Promise<string>;  // trả sessionId ngay (< 1 frame budget cho ack)
  cancel(sessionId: string): Promise<void>;
}
```

`requestJson` là bounded DTO (không phải free-form string vô hạn):

```ts
type LlmRequest = {
  task: 'summarize' | 'rewrite' | 'proofread' | 'extract'; // closed set phase 1
  input: string;        // RN đã truncate ≤ budget (VD 3000 từ), native re-check length
  maxOutputTokens: number;  // nhỏ, VD ≤ 256
  locale?: string;      // 'vi' default path cần eval riêng (unverified)
};
type LlmResponse = { text: string; truncated: boolean; model: string };
```

JS facade `app/src/native/onDeviceLlm.ts` (host-only, giống `deviceAccess.ts`):
validate input, `withTimeout` mọi call (trừ user-waiting stream thì timeout theo
session), map native error → closed enum
`UNAVAILABLE | NOT_READY | INVALID_ARGUMENT | BUSY_BACKOFF | TIMEOUT | CANCELLED | BLOCKED_BACKGROUND | UNKNOWN`,
không expose raw platform string; serialize **1 session tại một thời điểm**
(lease — inference là exclusive resource).

### 2.2 Native mapping (mỗi OS một adapter, sau một port)

- **iOS** (`FoundationModels`, iOS 26+, weak-link để N−2 không crash):
  `availability` → `SystemLanguageModel.default.availability`;
  session + `@Generable` schema + `prewarm()` + streaming; không dùng PCC phase 1.
- **Android** (`com.google.mlkit:genai-prompt`, AICore):
  `checkStatus()/download()` → availability; Prompt/Summarization API tùy `task`;
  `getBaseModelName()` đưa vào response/telemetry; chuyển `BUSY` →
  `BUSY_BACKOFF` + retry-after, `BACKGROUND_USE_BLOCKED` → typed error, không retry mù.
- Cả hai: validate length **trước allocate/decode**, cancel thực ở native khi
  JS cancel/unmount/background, late result sau teardown bị discard, exactly-once
  terminal (result hoặc error, không treo).

## 3. Capability registry — phase 2 (đề xuất, KHÔNG thêm vào yaml lúc này)

Phase 1 không chạm `policy/capabilities.yaml` (giữ R1/R2/R3 xanh).
Khi + chỉ khi governance duyệt, đề xuất shape để gate (chưa có hiệu lực):

```yaml
# PROPOSED ONLY — cần native-capability human-gate + governance tier decision
- name: ai.summarize
  version: 1
  risk: medium            # output do model sinh, phải coi là untrusted text
  consent: once           # gesture-bound, host-native pre-prompt; persistent cần reviewer grant riêng
  os_permission: none     # không tốn OS permission; picker/consent chính là gesture
  broker_ui: host_ai_sheet
  min_tier: partner_verified   # self_serve/sandbox không (open decision)
  quota: { sustained: 4, burst: 1 }   # strict hơn location vì inference đắt + BUSY
  payload_cap: 16384     # input+output bounded; lớn hơn → INVALID_ARGUMENT, chunk ở caller
  stream_cap: 10         # chunk events/sec, coalesce+drop
  audit: call_with_result
  owner: TBD (bắt buộc trước gate)
  support_horizon: TBD (bắt buộc trước gate)
  errors: [CAPABILITY_NOT_DECLARED, INVALID_ARGUMENT, CONSENT_REQUIRED, CONSENT_DENIED,
           RATE_LIMITED, TIMEOUT, REVOKED, UNAVAILABLE, BUSY_BACKOFF]
  notes: host-owned UI/sheet trả derived text; prompt/output thô không cross bridge;
    output không bao giờ là authority cho price/permission/balance (SOUL §3.10)
```

`never_expose` vẫn giữ: không generic `ai.prompt(arbitrary)` cho mini-app
(tương đương dynamic-code-adjacent review bypass), không bulk PII qua model,
không background inference, không persistent memory cross-app.

## 4. Contract vận hành (lifecycle, quota, privacy, error)

- **Lifecycle/resource contract**: owner = calling screen/session; 1 lease/inference;
  stop events: blur, unmount, background, logout/tenant-switch, timeout, revoke;
  `cancel()` idempotent; late chunk sau cancel/teardown bị drop; process-death →
  safe-discard (không durable work, không promise "đã lưu" trước write).
- **Loading/UX**: một intent một owner; ack tap ngay (≤100ms p95 perceptual);
  streaming render incremental; timeout có exit/retry; `downloading` hiện progress thật,
  không fake %; `unavailable` là state hợp lệ với fallback (disable/server/cached).
- **Quota/backpressure**: JS debounce + serialize; native token bucket riêng cho LLM
  (sustained thấp); `BUSY/BATTERY_QUOTA` → backoff, không re-block screen bằng spinner
  vô hạn; `BACKGROUND_USE_BLOCKED` → dừng, không reschedule lén.
- **Privacy/audit**: G1 (phase 2: declaration+review) → G2 (purpose consent, gesture-bound)
  → G3 `none` (không OS permission). Audit `call_with_result` ghi capability/version/
  gate outcomes/result-code/duration/**argsDigest** — không prompt/output/PII.
  Telemetry allowlist + retention như tracking hiện tại; output của model là untrusted,
  render như text thường (không auto-link/auto-execute).
- **Versioning**: TurboModule additive-only; handshake feature-detect
  (`getAvailability() != null`), không sniff OS version; prompt template versioned từ
  remote config để survive model đổi theo OS update.

## 5. Dependency footprint (mobile-simplicity — cần refusal-log khi implement)

- **iOS**: 0 dep (system framework). Điều kiện: build với iOS 26 SDK, weak-link +
  `@available` guard; N−2 runtime thiếu framework vẫn chạy (JS disable).
- **Android**: thêm `com.google.mlkit:genai-prompt` (+ transitives) + AICore system app.
  Đây là **native dep → veto tiềm năng cho RN/Gradle upgrade**, phải có entry trong
  `policy/dependency-decisions.md` + gate trước khi thêm. Alternative đã xét:
  platform trước (AICore chính là platform), không bundle weights (từ chối vì size +
  update + license), không dùng cloud LLM cho phase 1 (từ chối vì privacy/offline scope).
- Dự kiến `scripts/budgets.sh` before/after: deps +1, native modules +1
  (`NativeOnDeviceLLM`), pods/gradle-plugins/scripts/patches: đo lúc implement,
  vượt ratchet là gate. Removal condition: khi OS coverage đủ lớn mà feature bị kill
  hoặc khi chuyển sang server path — xóa module + dep trong cùng change (Track 3:
  một cách làm LLM on-device duy nhất).

## 6. Performance/budget verdicts (SKILLS §9.1 — hiện toàn bộ unverified)

| # | Row (`policy/budgets.md`) | Verdict phase 1 |
|---|---|---|
| 1–2 | Cold/warm startup | **unverified + plan**: giữ lazy TurboModule, prewarm sau first frame; đo `process_start→first_meaningful_frame` before/after trên Galaxy A14 release (kỳ vọng ~none vì lazy, phải chứng minh) |
| 3 | Memory idle/mini-app/heavy | **none (lập luận)**: không chạy trong WebView, không giữ pool; inference memory thuộc OS service — verify bằng steady-state + low-memory kills = 0 |
| 4 | FPS/scroll/animation | **none (lập luận)** nếu chunk render coalesced + không JS per-frame; breach nếu stream spam re-render → gate |
| 5 | Binary size | **affected (dự kiến Android)**: đo AAB/bundle before/after; ratchet +2%/release là gate |
| 6–7 | Clean/incremental build | **unverified + plan**: đo cùng máy CI + cache state, p50 |
| 8 | Crash determinism | **unverified + plan**: N−2 + unavailable + download-interrupt matrix, flaky = bug |
| Telem | Telemetry budgets | **none** nếu chỉ digest + bounded event (16KB/event) |
| Bridge 16ms | `bridge_request→bridge_response` | **không áp dụng** cho generation (async dài); chỉ `startStream` ack phải nhẹ; generation báo qua stream + terminal sau |

## 7. Verification plan (risk-based, không chạy thừa cho cosmetic change)

- Unit: DTO bound/truncate, error mapping closed enum, cancel/timeout terminal-once,
  serialize-lease (call 2 → 1 chạy 1 queue/backpressure).
- Native/device matrix (bắt buộc trước done): iPhone 15 Pro+ iOS 26 (available),
  iPhone cũ/iOS < 26 (unavailable sạch), Android allowlist (Pixel/S25 — AVAILABLE/
  DOWNLOADABLE/DOWNLOADING), Galaxy A14 (UNAVAILABLE — fallback), unlocked bootloader
  (unsupported), AICore vừa reset (setup error → backoff), background (BLOCKED),
  flood (BUSY), prompt > 4000 tokens (INVALID_ARGUMENT), revoke/logout mid-stream
  (cancel thực + audit), OS update đổi model (prompt vẫn pass eval).
- Eval quality: bộ prompt cố định × (iOS 26.x, nano-v2/v3/v4) × EN/VI; ghi model
  version bên cạnh mỗi verdict (output variance là fact, không phải bug trừ khi vỡ schema).
- Conformance liên quan: C2 (không check consent trong JS mini-app-facing — phase 1
  N/A vì host-only), R1–R3 giữ xanh (không thêm handler khi chưa thêm registry entry).

## 8. Manual test script (giao human — máy thật, build release)

1. Chuẩn bị: 1 máy hỗ trợ (VD Pixel 9 / iPhone 15 Pro, OS mới, đủ storage, AI bật) +
   1 máy không hỗ trợ (Galaxy A14) cùng build.
2. Happy: mở screen demo → tap Summarize → ack ngay → stream hiện dần → terminal +
   `truncated` đúng; background giữa chừng → stream cancel sạch, quay lại không treo.
3. Download path (Android): máy chưa tải model → `downloadable/downloading` progress →
   xong mới generate được; kill app giữa download → mở lại resume/fallback rõ.
4. Failure: tắt AI / hết quota / prompt quá dài / background / revoked → mỗi case có
   copy + action tiếp theo (retry/backoff/settings/fallback), không raw error, không
   false success, input/draft giữ nguyên.
5. A11y/motion: VoiceOver/TalkBack đọc được streaming result cuối, text scale lớn
   không vỡ, Reduce Motion vẫn đủ state (không chỉ dựa vào animation).
6. Ghi lại: build/device/OS/model version/observed gaps. "Cảm thấy nhanh" không thay
   trace p50/p95/timeout/abandonment.

## 9. Open decisions (cần owner trước khi code)

| ID | Câu hỏi | Đề xuất mặc định | Gate |
|---|---|---|---|
| OLLM-01 | Phase 1 scope host-only? | Có — mini-app là phase 2 | human-gate (capability mới) |
| OLLM-02 | Task set phase 1 | summarize/rewrite/proofread/extract bounded | PM + reviewer |
| OLLM-03 | Tiếng Việt quality bar | Eval VI riêng; chưa đạt thì EN-only + fallback | UX/product owner |
| OLLM-04 | Server-LLM fallback | Ngoài scope PoC; phase 1 fallback = disable/cached | architecture |
| OLLM-05 | Android dep admission | Cần refusal-log + gate (`dependency-decisions.md`) | mobile-simplicity |
| OLLM-06 | Mini-app tier cho phase 2 | `partner_verified` min, `persistent` cần grant riêng | governance + native-capability |
| OLLM-07 | Owner + support horizon | Bắt buộc điền trước gate (registry yêu cầu) | registry gate |
| OLLM-08 | PCC/cloud path | Không phase 1 (privacy/offline scope) | architecture |

## 10. Evidence

- **measured**: chưa có (chưa implement, chưa device-lab).
- **not_yet_verified**: toàn bộ §6–§7; quality VI; nano-v2/v3/v4 variance; hành vi
  AICore reset/download-dở; memory/battery field; CI gate.
- **facts**: xem `on-device-llm-research.md` §2–§3 + nguồn gốc ở §6 file đó.
- Không sửa `policy/*`, không thêm dep, không đổi runtime model trong change này —
  đây là design doc, code tuân thủ sau khi gate mở.
