# Feature — ai.extract_bill (on-device LLM bill pilot for split-bill)

> **Status:** pilot PoC — implemented at the contract level, **not** production.
> Mini-app publication stays blocked per MEMORY SEC-001/SEC-002 until mandatory
> enforcement rows land. Device inference is **unverified** (PoC runs a labelled
> mock; native bodies report `unavailable` until the device milestone).
> Đọc cùng: `on-device-llm.md` (phase plan), `on-device-llm-technical.md`
> (shell→RN contract), `on-device-llm-product.md` (UX states),
> `capability-bridge.md` (10-step pipeline).

## 1. Feature contract (SKILLS §11)

```yaml
feature: "ai.extract_bill"
status: pilot
owner: "platform"
scope_and_non_goals: "One mini-app (split-bill, first_party) reads ONE user-picked payment screenshot per tap; host returns derived bill fields. Non-goals: generic prompts, bulk/photo-library access, background inference, server LLM, auto-commit money."
facts:
  - "Pixels never cross the bridge (native-capability camera-frames rule); args carry locale + idempotencyKey + optional hint only"
  - "Amounts are integer VND; result is an untrusted draft requiring user review (money rule)"
  - "Registry mirror enforced by R1; spec parity enforced by S3"
assumptions:
  - "Generated Codegen protocol derives as NativeOnDeviceLlmSpec (same pattern as NativeDeviceAccessSpec — unconfirmed until a native build runs codegen)"
user_goal: "split-bill user turns a paid-bill screenshot into a prefilled bill draft without typing amount/time/recipient"
success_condition: "declared + consented call returns schema-valid BillExtraction (or a branchable error); user reviews/edits before any bill is created"
journeys:
  first_time: ["tap 'Điền từ ảnh bill' → host picker + consent sheet → extracting state → review screen prefilled → confirm/edit"]
  repeat: ["same, picker remembers nothing (consent scope once)"]
  interrupted: ["cancel mid-extract → terminal CANCELLED/timeout, input kept; background → stop, no silent resume"]
ui_states_and_transitions: ["idle → picking → extracting → review | fallback(manual) | denied | rate-limited | timeout | unavailable"]
loading:
  intent_boundary: "tap CTA → terminal reply (extracted | error)"
  owner: "calling screen/flow (one intent, one owner)"
  critical_dependencies: ["G1 declared", "G2 once-consent + picker pick", "model available"]
  optional_dependencies: []
  blocking_scope: "CTA region only (skeleton/inline progress; Back + Cancel always live)"
state_ownership:
  local_ui: "mini-app screen (draft, review edits)"
  server: "none in pilot (no backend write)"
  session: "bridge session generation; native lease 1 inference at a time"
  animation: "host/UI runtime; no JS per-frame"
resource_contracts: ["§5"]
data_and_authorization: "purpose-bound screenshot chosen by user; G1 manifest+first_party tier → G2 once consent (picker IS the gesture) → G3 n/a (no OS permission); audit call_with_result with argsDigest only; no raw PII in logs"
native_capabilities: ["ai.extract_bill v1 (this doc); host_image_picker broker UI; OnDeviceLlm TurboModule skeleton"]
network_and_mutations: "no network; no mutation — extraction is a pure read; retry reuses idempotencyKey, never duplicates effect"
restoration: "safe-discard on process death (no durable work); user draft lives in mini-app screen, persisted via storage.kv if declared"
accessibility_and_motion: "CTA ≥48px, aria-live status, 200% text reflow, Reduce Motion → 0 travel; screen reader announces terminal result only, never stream chunks"
performance:
  scenario_and_device: "unverified — needs flagship device-lab (A14 reference cannot run on-device LLM)"
  budgets: "cold/warm startup (lazy module), bridge 16ms p95 N/A for inference (provisional 30s deadline), binary ratchet (no new dep in pilot)"
  measurement: "TTFT + total latency p50/p95/p99 + timeout/abandonment on Pixel 9 / iPhone 15 Pro release builds"
  verdict_per_row: "§7"
build_health:
  clean_build: "unverified (native .mm/.kt not compiled in this environment)"
  incremental_build: "TS-only paths verified via typecheck/jest"
  reproducibility: "deterministic — mock adapter is fixed fixture"
dependency_footprint:
  budgets_sh_before_after: "JS deps +0; native modules +1 (OnDeviceLlm, platform-owned, system frameworks only); pods/gradle plugins/scripts/patches +0"
  refusal_log: "not-needed — no third-party dep admitted; ML Kit/GenAI artifacts deferred to device milestone (see §8 open decisions)"
  removal_condition: "pilot ends 2026-12 without device milestone → remove capability + module + handler in one change"
implementation_strategy:
  layer: "native shell (mechanism skeleton) + RN host/bridge (PoC orchestration) + mini-app (untrusted caller, integration pending)"
  smallest_complete_slice: "registry + handler + mock + tests + contract doc (this change); device inference + picker UI are the next slice"
  compatibility_and_rollback: "additive-only; kill = remove manifest grant + fail-closed UNAVAILABLE; N-2 shells report no_module → manual fallback"
acceptance_tests: ["app/src/bridge/__tests__/aiExtractBill.test.ts (14 tests)", "conformance.sh C/R/S", "budgets.sh counters"]
manual_test_script: ["§9"]
evidence:
  measured: ["typecheck pass", "eslint 0 errors (touched files clean)", "jest 24 suites / 144 tests pass", "conformance C1-C4,C6,C7,R1,S2,S3 pass", "budgets counters ok"]
  not_yet_verified: ["§10"]
open_decisions: ["§8"]
```

## 2. Layer decision (mobile-architecture — recorded)

```markdown
## ai.extract_bill — layer decision
**Layer:** native shell (image picker + on-device inference mechanism) + capability
bridge (typed door) + mini-app (untrusted caller). RN host owns orchestration in PoC.
**Why this layer:** screenshot pixels must never reach untrusted JS (exfiltration
channel); inference must run off the JS thread with OS lifecycle (cancel on
background); consent must be a host-native gesture the author cannot forge. Any one
of these forces native + broker; preference alone would have stayed in RN host.
**Budget it must respect:** cold/warm startup (lazy init — TurboModule stays lazy);
bridge 16ms p95 does NOT apply to inference (provisional 30s deadline, §7);
binary-size ratchet (+0 new deps in pilot — measured via budgets.sh).
**What ships remotely vs in the binary:** binary = picker mechanism, inference
session, schema validation, error mapping. Remote/signed = bill-focus prompt
template + version, thresholds (timeout, quota), enablement kill switch, all
user-facing copy. No prompt text or threshold hard-coded in the binary.
**Rollback story:** remove grant → calls fail closed CAPABILITY_NOT_DECLARED/
UNAVAILABLE (<1h, no build). Broken native mechanism → new store build (stated cost).
**Skew tolerance:** N-2 shell (no OnDeviceLlm module) → facade/handshake absence →
mini-app manual-entry fallback. A remote mini-app update must never require an
unshipped shell.
**One-way doors:** capability name + v1 schema, TurboModule name, broker_ui value,
pilot tier. All gated before code (done in this change as pilot-scoped).
```

## 3. Use-case example — screenshot → bill draft (the integration sample)

User pays a VietQR/bank transfer, screenshots the success screen, opens split-bill,
taps **“Điền từ ảnh bill”**.

### 3.1 Focus contract (host-owned prompt template v1 — ships via signed config)

The LLM is instructed to look **only** at the paid-transaction region and extract:

| Field | Focus on screen | Ignore |
|---|---|---|
| `recipient.name` | Người nhận / Tên người hưởng | Sender name, promo banners |
| `recipient.accountMasked` | Masked account (`****1234`); never full PAN | Full account digits — mask natively |
| `totalVnd` | Số tiền / Total (integer VND) | Balances, fees shown separately, ads |
| `paidAt` | Thời gian giao dịch (ISO 8601 w/ offset) | Status-bar clock, unrelated dates |
| `items[]` | Item lines + fee lines if present (max 20) | Suggested products, cashback notes |

Rules: Vietnamese primary, English fallback; if several bills visible → most
prominent/latest paid + `confidence: low` + list it in `needsReview`; never invent —
unreadable ⇒ `null` + entry in `needsReview`. Output is closed-schema JSON only.

### 3.2 Example exchange (fixture — also the PoC mock output)

```jsonc
// Mini-app → bridge (NO image bytes, NO paths — C4)
{ "id": "uuid", "capability": "ai.extract_bill", "operation": "extract",
  "version": 1, "args": { "locale": "vi", "idempotencyKey": "bill-9f2k" } }

// Bridge → mini-app (derived fields only; UNTRUSTED DRAFT)
{ "ok": true, "data": {
    "totalVnd": 150000, "currency": "VND",
    "paidAt": "2026-09-20T13:41:00+07:00",
    "recipient": { "name": "NGUYEN VAN A", "accountMasked": "****1234" },
    "items": [ { "label": "Chuyển tiền", "amountVnd": 150000 },
               { "label": "Phí giao dịch", "amountVnd": 0 } ],
    "confidence": "medium", "needsReview": ["paidAt", "recipient.name"],
    "model": "nano-v3" }, "error": null }
```

Mini-app MUST render the **review screen** (amount editable, integer-VND math —
same discipline as split-bill `logic.js`) and only then create the bill.
`needsReview` non-empty ⇒ highlight those fields; `confidence: low` ⇒ banner
“hãy kiểm tra kỹ”.

## 4. What was implemented (shell + RN + sample test)

| Layer | File | Behavior |
|---|---|---|
| Policy | `policy/capabilities.yaml` | `ai.extract_bill` v1 entry (high/once/none/host_image_picker/first_party, quota 4/2, payload 8192, stream 0, audit call_with_result, pilot horizon, closed errors incl. `UNAVAILABLE`) |
| Bridge types | `app/src/bridge/types.ts` | `BridgeErrorCode += 'UNAVAILABLE'` (additive; no exhaustive switches in repo) |
| Registry | `app/src/bridge/registry.ts` | Typed mirror (R1) |
| Handler | `app/src/bridge/handlers/aiExtractBill.ts` | Adapter port + deep validation (locale/idempotency/hint bounds, unknown-field + image/path rejection) + response-shape guard (integer VND, caps, ISO time) failing closed; default adapter returns `UNAVAILABLE` until native inference is wired |
| Pipeline | `app/src/bridge/handler.ts` | `classifyError += UNAVAILABLE` mapping (R3 producible); `CAPABILITY_TIMEOUT_MS['ai.extract_bill']=30_000` provisional (frame budget N/A for inference) |
| Register | `app/src/bridge/register.ts` | Wires handler (R1) |
| Shell spec | `app/src/native/specs/NativeOnDeviceLlm.ts` | Codegen single source of truth: `getAvailability/extractBill/cancelBill` (no events — single terminal reply) |
| RN facade | `app/src/native/onDeviceLlm.ts` | Host-only (never from WebView): null-module → unsupported, `withTimeout` every call, closed statuses, native strings never leak |
| iOS shell | `app/ios/MiniAppPlatform/OnDeviceLlmModule.mm` | Skeleton adopting generated spec; runtime-only probe, resolves `unavailable`, no iOS 26 link-time symbols (toolchain stays green) |
| Android shell | `…/ondevicellm/OnDeviceLlmModule.kt` + `OnDeviceLlmPackage.kt` + `MainApplication.kt` | Same skeleton (no ML Kit dep admitted in pilot); resolves `unavailable`; `cancelBill` idempotent |
| Config | `app/package.json` | `codegenConfig.ios.modules.OnDeviceLlm` (S3 needs the mapping) |
| Static gates | `app/scripts/conformance.sh` | S3 case `NativeOnDeviceLlm` (kt + mm) |
| Graph | `app/scripts/feature-graph.mjs` + regen | Bridge row + `onDeviceLlm` feature node (16 features); `app/docs/feature-graph.*` regenerated |
| Tests | `app/src/bridge/__tests__/aiExtractBill.test.ts` | Test-local fixture adapter covers success schema; runtime default remains unavailable. Tests cover G1/G2, validation, quota, malformed output, audit digest, and deadline |

No JS dependency added; no pods/gradle plugins/scripts/patches added (`budgets.sh`
counters ok). `mini_apps/split_bill/**` untouched — integration is yours (§6).

## 5. Resource contract (SKILLS §5 template)

- `owner_scope`: calling mini-app instance `(tenant, appId, user)` + `idempotencyKey`;
  `identity`: host-minted image handle + session (never caller-constructed, never in payload).
- `start_condition`: G1 declared+granted AND G2 once-consent w/ fresh gesture AND model `available` AND foreground.
- `dependencies`: host picker (user pick), on-device model (downloaded), quota tokens.
- `stop_events`: user cancel, WebView close/navigate, app background, logout/tenant-switch, 30s timeout, consent revoke, quota-battery exhaustion.
- `resume`: none — background stops the run; foreground requires a new user gesture (no silent resume).
- `cleanup`: native `cancelBill` idempotent + client `close()`; late chunks dropped, never committed.
- `cancel`: may-have-landed ⇒ pure read, so terminal is `CANCELLED` (no `UNCERTAIN` money semantics — extraction creates nothing).
- `late_acquisition/late_result`: dropped + counted (debug), never rendered.
- `sharing`: exclusive lease — 1 inference at a time per host; concurrent tap ⇒ second call queues bounded or `RATE_LIMITED`.
- `process_death`: safe-discard; mini-app draft (if any) persists only via its own `storage.kv`.
- `observable_invariants`: exactly one terminal reply; cancel→terminal ≤ deadline; background→no commit after; quota-exhausted→`retryAfterMs` present.

## 6. Integration plan for split-bill (attach later — your side)

1. **Manifest** (`mini_apps/split_bill/manifest.json`): append
   ```json
   { "name": "ai.extract_bill", "version": 1,
     "purposeKey": "split_bill.extract_receipt",
     "purpose": "Đọc ảnh bill bạn vừa chọn một lần để điền sẵn số tiền, thời gian và người nhận. Ảnh không rời khỏi máy.",
     "scope": "once" }
   ```
   Purpose is user-facing copy → needs design/human sign-off (mini-app-contract).
   Mirror the same entry into the signed host catalog (your README “Host injection guide” step 1).
2. **Handshake**: host freezes `window.__MINIAPP_CAPS__['ai.extract_bill'] = { ops: ['extract'] }`
   only for granted tiers. Feature-detect — never version-sniff:
   ```js
   const canExtract = !!(window.__MINIAPP_CAPS__?.['ai.extract_bill']?.ops || []).includes('extract');
   ```
   Absent ⇒ hide the CTA or show manual-entry fallback (absence is normal, not an error).
3. **Call** via the one door (your `MiniAppBridge.request` — already constraint-clean):
   `{ id, capability: 'ai.extract_bill', operation: 'extract', version: 1,
     args: { locale: 'vi', idempotencyKey: <uuid-per-bill>, hint?: <≤280 chars> } }`.
   Never send image bytes/paths (rejected + audited); never send `appId`/identity.
4. **Branch every code + a default** (contract mandates default from day one):
   | code | mini-app behavior |
   |---|---|
   | extracted (`ok:true`) | prefill **review screen** (edit allowed); highlight `needsReview`; `low` ⇒ caution banner |
   | `CONSENT_DENIED` | retryable once at a better moment, else manual entry |
   | `CONSENT_DENIED_PERMANENTLY` | manual entry only; never re-prompt, never open Settings |
   | `OS_DENIED*` | n/a in pilot (no OS perm) → treat as `UNAVAILABLE` via default branch |
   | `RATE_LIMITED` | coalesced retry after `retryAfterMs`, then manual entry |
   | `TIMEOUT` | terminal; input kept; retry with same `idempotencyKey` |
   | `UNAVAILABLE` | manual entry (device without on-device LLM — the common case) |
   | unknown future code | generic failure + manual entry (default branch — required) |
5. **Money rule**: extracted `totalVnd` is a draft. Reuse your integer-VND settlement math;
   never auto-create transfers from extraction. `bill_created` stays user-confirmed.
6. **Constraints gate**: your `check-constraints.mjs` must keep passing — new call goes
   through `MiniAppBridge.request` only (declared-versus-actual must match the new manifest entry).
7. **Tracking** (optional, declare first): e.g. `bill_extract_completed` with allowlisted
   keys `{status, confidence, field_count}` — never amount/recipient/time values.

## 7. Performance/budget verdicts (SKILLS §9.1 — no numbers restated)

| # | Row | Verdict |
|---|---|---|
| 1–2 | Cold/warm startup | none (lập luận): TurboModule lazy, no import-time work, prewarm deferred past first frame; re-verify if device slice adds eager init |
| 3 | Memory | unverified + plan: image downscale-before-decode + bounded buffers; steady-state + zero low-memory kills on flagship lab |
| 4 | FPS/scroll/animation | none (lập luận): single terminal reply, no streaming, no per-frame bridge |
| 5 | Binary size | none (measured): +0 deps (budgets.sh); device slice adding ML Kit artifacts re-opens the ratchet gate |
| 6–7 | Clean/incremental build | unverified: native files not compiled here (§10) |
| 8 | Crash determinism | unverified + plan: N-2 + download-interrupt + AICore-reset matrix on device-lab; flaky = bug |
| Telem | Telemetry budgets | none (lập luận): audit digest-only, bounded events |
| Bridge 16ms | round trip | N/A by design for inference; provisional 30s deadline is a timeout, not a budget |

## 8. Open decisions / gates

| ID | Question | Default | Gate |
|---|---|---|---|
| BILL-01 | Pilot tier stays `first_party`? | Yes — `partner_verified`+ needs governance review + named contact | mini-app-governance |
| BILL-02 | Purpose-string copy above | Draft only — needs design/human sign-off | design + human-gate |
| BILL-03 | ML Kit artifacts (`genai-prompt` et al) for device slice | Admit minimum per modality + refusal-log entry each | mobile-simplicity + dependency-decisions.md |
| BILL-04 | 30s deadline + quota 4/2 | Provisional — baseline TTFT/latency on lab, then ratchet | mobile-smoothness |
| BILL-05 | New error codes later | Additive + default branch already mandated in §6.4 | native-capability |
| BILL-06 | Pilot horizon 2026-12 | Expire or re-review; removal = one change (capability + module + handler) | owner: platform |

## 9. Manual test script (human acceptance — release host build)

Preconditions: host build with pilot grant for split-bill; Device A flagship
(AI-capable, model downloaded) + Device B A14 (UNAVAILABLE); real transfer screenshots.
1. Happy: tap CTA → picker + consent sheet names split-bill + purpose → extracting
   (Cancel live) → review prefilled, `needsReview` highlighted → edit amount → confirm
   creates bill with integer math. 2. Deny consent → manual entry, no re-prompt loop;
   deny permanently → same, forever. 3. Flood taps → `RATE_LIMITED`, retry honored.
   4. Background mid-extract → stopped, foreground does NOT auto-resume. 5. Device B:
   CTA hidden/fallback, rest of app intact. 6. Airplane with downloaded model → works
   (on-device); model downloading → honest progress, no fake %. 7. VoiceOver/TalkBack +
   200% text + Reduce Motion: CTA reachable, terminal announced once, no color-only meaning.
Record build/device/OS/model + mismatches. Manual pass ≠ race/security/perf evidence.

## 10. Evidence

- **measured (this change, commands really run):** `npm run typecheck` pass;
  `npm run lint` 0 errors (touched files warning-free); `npm test` 24 suites/144 pass
  (incl. 14 new); `conformance.sh` C1–C4,C6,C7,R1,S2,S3 pass; `budgets.sh` counters ok;
  `feature:graph` regen → 16 features.
- **not_yet_verified:** on-device inference end-to-end; TTFT/latency/accuracy (incl.
  Vietnamese receipts); iOS/Android native compile of new modules (toolchains exist
  here but no build was run — Codegen protocol-name derivation assumed from the
  `NativeDeviceAccessSpec` pattern); N-2 absence path; quota-battery/long-quota OS
  behavior; field telemetry; external publication (blocked: SEC-001/SEC-002).
