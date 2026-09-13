# SKILLS — Playbook chung để design, implement và review Mobile Platform

**Phiên bản:** 1.0  
**Phạm vi:** mọi product/feature trong repository.  
**Đọc trước:** [SOUL.md](SOUL.md) và [MEMORY.md](MEMORY.md).

Đây là workflow cho AI agents và team, không phải package được bundle vào app. Áp dụng tỷ
lệ thuận với rủi ro: đổi copy/icon nhỏ không cần một design document lớn; thay public
contract, native capability, lifecycle, storage hoặc critical journey phải có contract và
evidence đầy đủ.

## 1. Khởi động task và routing

### 1.1 Luôn làm trước khi viết code

1. Đọc yêu cầu hiện tại, `SOUL.md`, `MEMORY.md`, repository instructions và source of truth
   hẹp liên quan.
2. Kiểm tra code, package/lockfiles, native config, public contracts, existing components,
   tests và commands. Phân biệt `fact`, `assumption`, `proposed`, `measured`, `unverified`.
3. Xác định task là **design/decision**, **implementation/build**, **diagnosis/review** hay
   **measurement/verification**. Không implement khi user chỉ yêu cầu design/review.
4. Nêu user intent, success condition, phạm vi/non-goal, affected layers, one-way doors và
   evidence cần có. Tự xử lý routine choices; chỉ hỏi khi thiếu input làm đổi product
   semantics, authority/security boundary hoặc hậu quả nghiệp vụ.
5. Giữ nguyên stack/conventions hiện có. Không tự upgrade React Native, đổi architecture
   mode, runtime model, package manager, navigation foundation hoặc public contract.

### 1.2 Route vào skill chuyên biệt hiện có

`mobile-spine` là entrypoint của project. Nếu nhiều hàng cùng áp dụng, đọc tất cả trước khi
viết. Decision skill chốt “điều gì phải đúng”; build skill thực hiện crossing đã chốt.

| Tình huống | Skill/source cần dùng |
| --- | --- |
| Feature nằm native/RN/mini-app/remote ở đâu | `mobile-architecture`, sau `mobile-simplicity` |
| Dependency, abstraction, flag hoặc cách thứ hai | `mobile-simplicity`, dependency decision ledger |
| Startup, jank, latency, memory, bridge budget | `mobile-smoothness`, `policy/budgets.md` |
| WebView isolation/lifecycle/pool/crash | `mini-app-runtime` để quyết định; `container-wiring` để build |
| Thiết kế capability, permission, privacy | `native-capability`; addition luôn là human gate |
| Implement capability handler/bridge | `bridge-wiring` sau capability design được chốt |
| Manifest/SDK/handshake/error contract | `mini-app-contract` |
| Signing/review/rollout/revocation machinery | `mini-app-governance` quyết định; `mini-app-pipeline` build |
| Motion direction/source/choreography | `mobile-motion`; timing do `mobile-smoothness` sở hữu |
| Thêm hoặc đổi haptic | `mobile-haptics`; cần product/design approval |
| Feature/component/capability relationship đổi | `feature-graph`; refresh generated graph |
| Generic UX/loading/form/data/recovery | Các workflow tương ứng trong file này |

Build-skill drift signal là stop condition. Ví dụ: authority check trong mini-app-facing JS,
WebView storage được bật để chữa lỗi, bypass theo publisher, hoặc docs hứa điều runtime không
enforce—dừng và báo gate, không workaround.

## 2. Workflow end-to-end cho feature

### 2.1 Design trước implementation

1. **Task model:** user goal, success, frequency, entry/exit, first-time/repeat/interrupted,
   hậu quả nếu sai, back/cancel/retry/undo.
2. **States:** initial/loading/content/empty/error/offline/stale/partial/pending/unknown/
   permission; chỉ rõ tổ hợp hợp lệ và terminal behavior.
3. **Ownership:** local/server/session/navigation/animation/resource; subscription scope,
   source of truth, persistence và account/tenant key.
4. **Lifecycle:** start/stop/resume/cancel/timeout/cleanup, late acquisition/result,
   background/process death và native interruption.
5. **Network/write:** validation, freshness, deadline, bounded retry, idempotency, conflict,
   unknown outcome/reconciliation.
6. **Native/privacy:** capability contract, caller/auth/consent/OS gates, data inventory,
   denied/limited/unavailable fallback và retention.
7. **UX/accessibility:** total effort, loading owner, component contract, keyboard/focus,
   text scale/screen reader/Reduce Motion và recovery.
8. **Performance và build health:** với mỗi feature, duyệt 8 nhóm đo ở mục 9
   (cold startup, warm startup tới screen ready, memory idle/mini-app/heavy screen,
   FPS scroll + animation, binary size AAB/IPA, clean build, incremental build,
   crash/build failure determinism) và ghi row nào trong `policy/budgets.md` bị ảnh
   hưởng, headroom, device/fixture/measurement. Trả lời "none" phải được lập luận,
   không mặc định.
9. **Dependency footprint:** với mỗi feature, duyệt 7 counters ở mục 9
   (dependencies, native modules, unsupported packages, build scripts, Pod deps,
   Gradle plugins, custom native patches), báo before/after từ `scripts/budgets.sh`
   và refusal-log entry khi chạm ratchet. Không thêm dependency/native module mà
   chưa qua `mobile-simplicity`.
10. **Acceptance:** observable happy/failure/race/resource invariants và manual test script.
11. **Delivery:** smallest complete vertical slice, compatibility, rollout, rollback và gaps.

Prototype interaction khi keyboard, gesture, navigation transition hoặc loading orchestration
là rủi ro; screenshot không chứng minh các behavior đó. Implement UI + data + error + recovery
trong cùng slice, không dựng abstraction chung trước use case thật.

### 2.2 Layer decision

Chọn layer hẹp nhất đáp ứng constraint:

1. TypeScript/RN host cho portable orchestration và ordinary screens.
2. TurboModule/Codegen cho stateless platform service.
3. Fabric component cho native view/controller.
4. Swift/Kotlin cho OS lifecycle, background hoặc vendor SDK ownership.
5. Shared C++ chỉ cho measured cross-platform compute/binary need.
6. Native screen sau host port cho lifecycle-heavy flow.

Native shell addition, capability/tier/contract change, dependency/native module, budget
loosen, conformance removal và irreversible data migration là gate. Ghi constraint buộc chọn
layer, binary vs remote ownership, N−2 behavior, rollback và one-way doors.

## 3. Thiết kế task và interaction

### 3.1 Tối ưu tổng công sức

So sánh tap, typing, decisions, reading/search time, wait, errors và correction. Không tạo
weighted score tùy ý. Loại field không cần; prefill từ dữ liệu đáng tin; dùng recent/favorite/
search nhưng giữ cách nhận biết và sửa. Repeat shortcut không làm control nhảy vị trí; deep
link/auth/permission quay về task cũ nếu còn hợp lệ.

Form chia theo nhóm quyết định khi có nhiều chủ đề/branch/cognitive load. Một field một screen
không là default. Back giữ dữ liệu, review/edit nhanh, validation trước khi rời nhóm phụ thuộc.
Khi field trước làm dữ liệu sau invalid, giữ nếu an toàn, đánh dấu và giải thích thay vì xóa im.

### 3.2 Chọn control

| Dữ liệu | Baseline | Invariant |
| --- | --- | --- |
| Ít lựa chọn rõ | Radio/segment/selection card | Selected semantic, không chỉ màu |
| Số nguyên nhỏ | Stepper + direct input khi cần | Bounds, unit, hold behavior |
| Ước lượng trong range | Slider + value | Có accessible/precise alternative khi cần |
| Amount/số chính xác | Numeric/decimal input | Locale, caret, paste, rounding/domain type |
| Nhiều lựa chọn | Search + recent/favorite | Loading/error/no-result khác nhau; order ổn định |
| Date/time | Platform/domain picker | Min/max/timezone và disabled reason |
| Free text | Native/system input | IME, selection, dictation/autofill/clipboard phù hợp |

System/native input là baseline. Custom keypad phải là semantic buttons/text, không dùng ảnh
đơn thuần. Chỉ chọn sau benchmark keyboard-ready, first-digit, input reliability, total task,
accessibility và runtime cost trên cold/warm iOS/Android low-tier release build.

Amount field tách raw editing, formatted display và canonical domain value. Không dùng
floating point tùy tiện; không làm caret nhảy; hỗ trợ paste/delete/mid-string/empty/zero/
locale/limit. Remote validation không chạy sync mỗi keystroke; response cũ không ghi đè.

## 4. Component, visual, motion và haptic contracts

### 4.1 Component contract

Component quan trọng phải có purpose, value owner, states, events/payload/dedup, first
feedback, pending/completion, rapid-input concurrency, loading scope, accessibility, motion,
adaptive layout, recovery và evidence. Tách behavior/accessibility khỏi visual skin.

State orthogonal thay vì boolean chồng: ví dụ `content`, `fetch`, `freshness`, `mutation`;
reducer/use case giới hạn tổ hợp. Shared component không tự tạo global loading/business state.

Action button:

- pressed feedback ngay; command guard đồng bộ để rapid tap không lọt trước re-render;
- pending chỉ khóa command xung đột, giữ layout và accessible busy/name;
- server idempotency vẫn bắt buộc khi duplicate business effect có thể xảy ra;
- lỗi giữ input và có retry/recovery; disabled state có lý do user hiểu được.

### 4.2 Visual system

- Chỉ dùng semantic palette/type/spacing/radius/size/motion tokens. Business logic không theo
  màu; status có text/icon/state. Host-only glass/scrim/shadow/trusted chrome không expose.
- Touch target theo shared token và platform baseline; icon có thể nhỏ, hit region không được
  chồng. Text scaling/reflow, safe area, keyboard, long text và RTL theo supported scope.
- Skeleton giữ hình học content; không cắt essential identity/amount để giữ layout.
- Review default/pressed/focused/selected/disabled/loading/error, short/long text, text lớn và
  supported themes trên component catalog lẫn screen thật.

### 4.3 Motion

Mỗi appearance khai source; dismiss là reverse. Vocabulary hiện tại:

- bottom CTA/tab → sheet/modal: slide Y từ đáy;
- small trigger → larger surface: scale + fade từ trigger bounds;
- list → detail: shared X axis;
- same-layer content swap: fade-through;
- press: feedback scale.

Timing/distance/easing lấy từ token và `policy/budgets.md`, không hardcode; product config chỉ
tune xuống. Transform/opacity chạy native driver/UI worklet; không JS per-frame. Gesture bám
ngón tay và settle theo budget. Reduce Motion là token transform trên cùng UI tree, không fork.
Không invisible overlay nuốt tap, không queued animation bỏ qua intent mới.

### 4.4 Haptics

Haptic là scarce, typed và gated. Chỉ gọi facade theo intent: selection, reversible creation/
move, removal/destruction, warning, system failure hoặc rare physical boundary. Không raw
duration/style ở caller; không navigation/scroll/typing/system-driven success; không fire từ
render/effect. Pair cùng visual, tôn trọng system setting, một haptic/user intent. Thêm hoặc
tăng intensity cần PM/design approval; remove/tune xuống không cần gate.

## 5. Loading, async state và recovery

### 5.1 Một intent, một owner

Flow/use case tạo intent/operation ID. Critical dependencies quyết định usable state;
optional requests không re-block screen. Fetch độc lập song song trong bounded concurrency;
BFF chỉ thêm khi waterfall thật là bottleneck.

| Tình huống | Behavior |
| --- | --- |
| Local content đủ dùng | Render ngay, refresh nền, giữ input/layout |
| Stale nhưng an toàn để đọc | Hiện content và freshness cue nếu ảnh hưởng quyết định |
| Thiếu critical data | Một stable region loader/skeleton; shell/Back còn dùng được |
| Optional data pending/fail | Quiet local placeholder/error; không block lại screen |
| Submit | Feedback tại CTA/status region; giữ dữ liệu đang xác nhận |
| Slow/failure | Cùng region đổi state/copy; timeout có exit/recovery |
| Pagination | Giữ list, footer status |
| Explicit retry | Episode mới nhưng liên kết intent/operation trước |

Có thể thử delay loader ngắn theo budget để tránh flash, nhưng input acknowledgement phải ngay;
hủy timer khi hoàn tất. Không giữ content để spinner đủ minimum duration, không spinner vĩnh
viễn, không giả phần trăm. Instrument intent/blocking/content-usable/resolved/abandoned.

### 5.2 Async/race rules

- Query/search dùng request identity/generation; response A cũ không overwrite B mới.
- Cleanup invalidate owner generation, cancel adapter nếu có; late handle phải release ngay.
- Callback chỉ commit khi owner/session/account/tenant còn hợp lệ và settle terminal một lần.
- Native exclusive resource serialize acquire/stop; JS cleanup return không chứng minh native
  stop hoàn tất.
- Shared task/query không bị một consumer hủy khi còn owner khác. Task sống sau unmount phải
  được handoff có chủ đích với checkpoint/cancel/retention.

## 6. Data, offline và mutation workflow

### 6.1 Read/storage

- L1 memory cho hot data; persistent key-value cho nhỏ/simple; DB cho query/index/transaction.
- Cache entity có account/tenant owner, schemaVersion, serverVersion/ETag khi có, fetchedAt,
  freshness, retention và bounded size/LRU. Pending operation/draft không evict như cache.
- Data class quyết định TTL; stale-readable khác stale-warning và stale-forbidden-for-commit.
- Logout/switch dừng worker cũ, invalidate generation, hide protected UI, isolate/purge cache/
  token/queue theo policy. Queue A không chạy bằng credential B.
- Secret ở Keychain/Keystore-backed adapter; sensitive file/DB có encryption/key lifecycle,
  backup exclusion và deletion. Disk full/corrupt/migration fail không được báo đã lưu.

### 6.2 Reversible local-first write

Validate và tạo operation ID; transaction local lưu projection + outbox nếu cần; chỉ báo local
save sau durable write. Worker gửi, persist version/result và reconcile. Permanent failure giữ
draft/status; rollback đúng version, không đè edit mới. Coalesce chỉ khi semantics cho phép;
`set X` khác `increment`, append hoặc money transfer.

### 6.3 Server-authoritative write

Giữ state `Draft → Submitting → Confirmed | Rejected | Unknown`; `Unknown → Reconciling`.
HTTP 202/queue ACK không bằng business success. Cùng intent retry dùng cùng idempotency key và
payload; status lookup theo durable operation identity. Transport cancel không bằng business
cancel. Offline mặc định chỉ lưu draft cho hành động hậu quả lớn, không âm thầm execute sau.

Retry transient bằng bounded exponential backoff+jitter/Retry-After; không retry permanent/
validation; khi hết budget operation vẫn có status/action. Conflict quan trọng dùng version/
conditional write hoặc user review, không mặc định phone-clock last-write-wins.

## 7. Native capability và privacy workflow

1. Định nghĩa capability theo user need; kiểm broker/system picker trước broad permission.
2. Tạo/gate registry entry trước implementation: ID/version, owner, OS/binary availability,
   trust tier, consent/purpose, permissions, schema/errors, quotas, threading, lifecycle,
   timeout/cancel, retention, fallback, kill switch và tests.
3. Xác minh exact RN/OS/SDK compatibility. Chọn maintained wrapper hoặc local Codegen module;
   facade tách khỏi spec/vendor SDK.
4. Enforce gate order: signed declaration/review tier → user purpose consent → current OS
   permission. Backend vẫn kiểm object/action/tenant authorization.
5. Native/host boundary bind caller từ runtime, validate unknown fields/type/size/range/URI,
   bound queue/payload/outstanding calls và settle exactly once.
6. Stream/resource có lease, interruption/background/revoke cleanup, coalescing/backpressure;
   không emit vào invalid runtime. Raw camera/audio/location không cross bridge nếu derived/
   host-owned UI/opaque handle đáp ứng intent.
7. Audit before reply với allowlisted metadata/digest, không raw PII/payload. Data inventory đi
   từ collection đến processing/storage/recipient/retention/deletion/telemetry.
8. Test grant/deny/limited/blocked/unavailable/settings-revoke, malformed caller, flood,
   cross-tenant/app, start-stop race, late callback và real native release trên device.

## 8. Mini-app runtime và contract workflow

- Một factory/configuration. Verify archive paths, manifest and both signatures before first
  script. Serve app-owned origin with CSP response header; reject meta weakening/foreign
  navigation/undeclared routes and dynamic code per contract.
- Bind identity to container; no request `appId/user/tenant` authority. Network, storage,
  notification, tracking and device access all cross one broker.
- Pool only when reset contract proves no tenant residue; storage/cookies/files off. On memory
  pressure evict LRU after bounded state serialization. Renderer death handles visible,
  hidden and pooled instances.
- Public surface is additive/versioned and snapshot-gated. Error codes terminal/actionable;
  unavailable web features are stated honestly. Docs and enforcement ship together.
- Governance decides tier/admission/kill; runtime checks at open and tears down. Revocation
  relies on expiring server authority; push is acceleration, not guarantee.
- Review pipeline includes fixtures that must fail: undeclared capability, remote script,
  wildcard host, traversal, missing signature, version downgrade, meta CSP and forged appId.

## 9. Performance workflow

1. Chọn fixed scenario/device/release-profile build/dataset và canonical budget row.
2. Emit/inspect app-owned markers; reproduce và baseline nhiều samples, gồm tail/timeout.
3. Phân bottleneck: JS CPU/render, UI/native layout/draw, GPU/image, IO/network, startup,
   memory/energy. React Profiler không thay native tooling.
4. Sửa ownership, broad subscription, duplicate request/effect, unstable identity, payload/
   event/cache bounds trước. Memo/list tuning/offload chỉ khi evidence còn chỉ ra need.
5. Đo before/after cùng điều kiện; kiểm stale closure, input, correctness, memory steady-state
   và platform differences. Giữ optimization khi gain vượt noise/complexity.
6. Report baseline, result, budget/ceiling, verdict, attribution và unverified field behavior.

### 9.1 Checklist đo cho feature mới — plan, implement và test

Số liệu duy nhất nằm ở `policy/budgets.md`; dưới đây chỉ là checklist trỏ tới row,
không restate con số. Mỗi feature đi qua từng hàng, ghi `affected | none (lập luận) |
unverified + measurement plan`.

**Runtime và artifact (plan: chọn row; implement: giữ headroom; test: đo before/after):**

| # | Nhóm | Row chuẩn trong `policy/budgets.md` | Điều cần kiểm tra khi plan/implement/test |
| --- | --- | --- | --- |
| 1 | Cold startup | `process_start → first_meaningful_frame`, `→ native_init_done` | Feature có thêm native init eager, import-time work, hay blocking trước first frame? Test cold trên release build, low-tier reference. |
| 2 | Warm startup | Warm start, process alive → screen ready | Screen ready có bị re-block bởi optional data? Một blocking episode/intent; optional không re-block. |
| 3 | Memory | idle host, per-WebView, heavy screen, host + 3 mini-apps | Idle baseline, 1 mini-app, heavy list/media screen: PSS/resident steady-state + low-memory kills = 0. Eviction LRU sau bounded serialization. |
| 4 | FPS scroll + animation | slow frames, frozen frames, frame budget | Scroll list, transition, gesture: slow-frame %, frozen = 0. Transform/opacity native driver; không JS per-frame. |
| 5 | Binary size | Android download, iOS thinned, Hermes bundle | Before/after AAB/IPA/bundle; kiểm ratchet theo `policy/budgets.md` — vượt là gate. |
| 6 | Clean build | clean release build wall time, cold cache | Cùng máy CI + cache state; lặp lấy p50. Feature native mới có kéo dài clean build? |
| 7 | Incremental build | single TS change → refresh; single native change → install | Dev iteration không regress; lazy TurboModule, không eager SDK setup. |
| 8 | Crash / build failure determinism | crash-free sessions; 0 non-reproducible; 0 flaky | Cùng commit + env → cùng kết quả. Crash có symbolicated stack + attribution; flaky là bug, không average. |

**Dependency và build hygiene (plan: refusal trước; implement: wrap qua port; test: `scripts/budgets.sh`):**

| # | Counter | Nguồn đếm | Gate khi feature chạm tới |
| --- | --- | --- | --- |
| 9 | Dependencies count | `dependencies` trong `app/package.json` | Mọi add cần refusal-log entry + gate khi vượt ceiling/ratchet. |
| 10 | Native modules count | dep có `android/` hoặc `ios/` + module local | Native đắt gấp bội (veto upgrade); ưu tiên platform → framework → dep → code mình. |
| 11 | Unsupported packages | thiếu New Arch support / peer incompatible / bỏ rơi >18 tháng | Budget 0 — vượt là gate; kiểm bằng `budgets.sh` heuristic + review thủ công. |
| 12 | Build scripts | `app/scripts/*` + Xcode phases + Gradle tasks custom | Ratchet: script mới cần owner + removal condition. |
| 13 | Pod dependencies | transitive entries trong `ios/Podfile.lock` | Ratchet: báo before/after; tăng là gate. |
| 14 | Gradle plugins | `classpath` + `apply plugin`/`plugins id` dưới `android/` | Ratchet: báo before/after; tăng là gate. |
| 15 | Custom native patches | `patches/` + `patch-package` + sửa Pod/Gradle thủ công | 0 preferred; mỗi patch cần gate + upstream link + removal plan. |

Không dùng zero re-render làm universal gate. Promise/timer/`startTransition` không chuyển CPU
khỏi JS/UI thread. Scroll/gesture/sensor không bridge per frame; coalesce/drop stale values.

## 10. Verification theo rủi ro

| Thay đổi | Evidence tối thiểu liên quan |
| --- | --- |
| Pure business rule | Boundary/invalid input/invariant unit tests |
| Pure UI | Type/lint, interaction/a11y states, manual device review |
| Query/form async | loading/error/stale, rapid input, out-of-order, retry/cancel, retained data |
| Resource/effect | setup-cleanup-setup, focus/blur/pop, bg/resume, late acquire/result, repeat entry |
| Session/cache | logout/account/tenant switch mid-request, restore, isolation |
| Native/privacy | OS state matrix, revoke/interruption, native release, no PII telemetry |
| Mutation/offline | double tap, unknown timeout, process death, retry/conflict, account-bound queue |
| Performance | same-device release before/after, JS/native traces, memory/resource steady state |
| Startup (cold/warm) | cold `process_start → first_meaningful_frame` + warm → screen ready, release build, low-tier ref, p90 before/after |
| Memory (idle/mini-app/heavy) | idle baseline, 1 WebView, heavy screen, 3 mini-apps steady-state + zero low-memory kills |
| FPS scroll/animation | slow-frame %, frozen = 0 trên scroll/transition/gesture; native driver cho transform/opacity |
| Binary size | before/after AAB/IPA/Hermes bundle; ratchet check, vượt là gate |
| Build health | clean wall time + incremental iteration cùng máy/cache (p50); reproducible = deterministic, flaky = bug |
| Dependency hygiene | `scripts/budgets.sh` before/after: deps, native modules, unsupported, scripts, pods, Gradle plugins, patches + refusal-log khi chạm ratchet |
| Mini-app boundary | forged caller, malformed/flooded messages, origin/CSP/signature/renderer death |
| OTA/schema | binary compatibility, interrupted migration/restart, last-known-good/data integrity |

Classify failure as product bug, test bug, environment issue hoặc design gap. Không sửa
expectation/threshold để “xanh” nếu behavior vi phạm contract. Mở rộng verification theo risk,
không chạy mọi workflow không liên quan cho cosmetic change.

### 10.1 Manual testing handoff cho con người

AI phải cung cấp build/scenario có thể chạy và một script ngắn gồm:

- goal và success signal quan sát được;
- preconditions/test data/device/build;
- happy path, Back/cancel/retry và failure/interruption paths liên quan;
- accessibility modes/large text/Reduce Motion/keyboard cần bật;
- expected copy/state sau mỗi điểm quyết định, đặc biệt local/pending/confirmed/unknown;
- known gaps và điều manual test **không** chứng minh.

Human report nên ghi observed behavior, repro steps, device/OS/build và expectation mismatch.
“Cảm thấy ổn” là product feedback hữu ích nhưng không thay race/security/performance evidence.

## 11. Feature contract template

```yaml
feature: "<name>"
status: proposed
owner: "<role>"
scope_and_non_goals: "<bounds>"
facts: []
assumptions: []
user_goal: "<observable outcome>"
success_condition: "<how we know>"
journeys:
  first_time: []
  repeat: []
  interrupted: []
ui_states_and_transitions: []
loading:
  intent_boundary: "<start/end>"
  owner: "<one owner>"
  critical_dependencies: []
  optional_dependencies: []
  blocking_scope: "<region/action/none>"
state_ownership:
  local_ui: "<owner>"
  server: "<key/account/freshness>"
  session: "<generation>"
  animation: "<runtime>"
resource_contracts: []
data_and_authorization: "<purpose/scope/retention/backend checks>"
native_capabilities: []
network_and_mutations: "<deadline/retry/idempotency/conflict/reconcile>"
restoration: "<checkpoint/schema/safe discard>"
accessibility_and_motion: "<focus/reader/text/reduced motion>"
performance:
  scenario_and_device: "<fixture + low-tier ref / CI machine + cache state>"
  budgets: "<canonical rows and confidence — cold/warm startup, memory idle/mini-app/heavy, FPS, binary size>"
  measurement: "<protocol/evidence>"
  verdict_per_row: "<affected + before/after | none + reason | unverified + plan>"
build_health:
  clean_build: "<before/after wall time, same machine + cold cache | none + reason>"
  incremental_build: "<TS refresh + native install before/after | none + reason>"
  reproducibility: "<deterministic | gap + owner>"
dependency_footprint:
  budgets_sh_before_after: "<deps / native modules / unsupported / scripts / pods / gradle plugins / patches>"
  refusal_log: "<entry link or not-needed + reason>"
  removal_condition: "<when this addition gets removed>"
implementation_strategy:
  layer: "<native shell/RN host/mini-app/remote>"
  smallest_complete_slice: "<UI+data+failure+recovery>"
  compatibility_and_rollback: "<plan>"
acceptance_tests: []
manual_test_script: []
evidence:
  measured: []
  not_yet_verified: []
open_decisions: []
```

Resource contract bổ sung `owner_scope`, `identity`, `start_condition`, `dependencies`,
`stop_events`, `resume`, `cleanup`, `cancel`, `late_acquisition`, `late_result`, `sharing`,
`process_death` và `observable_invariants`. Capability contract dùng registry fields ở mục 7.

## 12. Definition of Done

Trong phạm vi task:

1. Acceptance criteria và user-visible states đạt; no false success/data loss/duplicate effect.
2. Owners, lifecycle, cancellation, session/tenant/privacy và recovery paths liên quan rõ.
3. Accessibility, loading, error, keyboard/motion behavior có contract và evidence phù hợp.
4. Public/native/mini-app changes có spec/gate/version/fallback/rollback trước code.
5. `npm run typecheck`, lint, targeted tests và `scripts/verify.sh` (gồm `scripts/budgets.sh`
   với before/after deps, native modules, unsupported, scripts, pods, Gradle plugins, patches)
   được chạy thực tế theo risk; output/failure không bị diễn giải thành pass. Refresh feature
   graph khi dependency đổi.
6. Mỗi hàng trong checklist 9.1 có verdict: affected kèm before/after, none kèm lập luận,
   hoặc unverified kèm measurement plan và owner. Performance-sensitive path có report theo
   canonical budget; thiếu device/lab ghi unverified, không tuyên bố pass.
7. AI giao manual-test script; human acceptance ghi build/device/observed gaps.
8. Docs, schema, generated artifacts, code, tests và enforcement không drift.
9. Report cuối nêu behavior đổi, lý do, validation thật, phần chưa chứng minh, risk và rollback.
10. Chỉ cập nhật `MEMORY.md` bằng fact/decision bền; không lưu secret/PII/transient chat.

Nếu thiếu source/device/backend/approval cần thiết, hoàn thành phần chắc chắn rồi ghi gate và
handoff; không gọi task done và không tự mở rộng quyền để vượt chặn.
