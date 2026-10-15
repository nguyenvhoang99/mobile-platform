# MEMORY — Bối cảnh chung của Mobile Platform

**Phiên bản:** 1.0  
**Cập nhật:** 2026-09-06  
**Ngôn ngữ làm việc:** tiếng Việt  
**Đọc cùng:** [SOUL.md](SOUL.md) và [SKILLS.md](SKILLS.md).

File này giữ context bền vững cho con người và AI agents: fact đã kiểm tra trong
repository, quyết định đã chốt, proposed default, hypothesis, progress và open gap. Nó
không phải runtime config và không được bundle vào app.

## 1. Vai trò của bộ ba

| File | Sở hữu | Cách dùng |
| --- | --- | --- |
| `SOUL.md` | Invariant, nguyên tắc và thứ tự trade-off | Đọc trước mọi thay đổi behavior/architecture |
| `SKILLS.md` | Routing, workflow, contract, verification và handoff | Đọc phần liên quan đến task |
| `MEMORY.md` | Current state, decision, assumption, evidence và gap | Đọc khi bắt đầu; chỉ cập nhật khi có fact/decision bền |

Đây là source of context chung, không thay thế source of truth chuyên biệt:

| Concern | Source of truth |
| --- | --- |
| Capability, tier, consent, quota | [`policy/capabilities.yaml`](../../../policy/capabilities.yaml) |
| Timing, memory, artifact, telemetry, motion budget | [`policy/budgets.md`](../../../policy/budgets.md) |
| Machine-enforced boundary rules | [`policy/conformance.md`](../../../policy/conformance.md) |
| Dependency admission/refusal | [`policy/dependency-decisions.md`](../../../policy/dependency-decisions.md) |
| Platform behavior dành cho mini-app authors | [`mini-app-platform-standard.md`](../mini-app-platform-standard.md) |
| Cách AI-generated change được tạo và chứng minh | [`ai-development-standard.md`](../ai-development-standard.md) |
| Architecture/file ownership hiện tại | [`architecture.md`](../architecture.md), [`host-core-components.md`](../host-core-components.md) |
| Feature-specific behavior | Feature contract/ADR và code/tests tương ứng |

Khi MEMORY tóm tắt khác source hẹp hơn, source hẹp hơn thắng và MEMORY phải được sửa.

## 2. Bối cảnh và intent đã xác nhận

- Sản phẩm là một React Native super-app/host có nhiều tenant và định hướng chạy mini-app
  bên thứ ba trong WebView.
- Mô hình phát triển: AI implement toàn bộ; con người quyết định product/trade-off và review
  bằng manual testing trên mobile app. Automated verification vẫn bắt buộc cho các thuộc
  tính manual testing không chứng minh được.
- Foundation UX mạnh, lifecycle correctness, performance, native extensibility, security,
  privacy và rollback được ưu tiên trước mở rộng feature/brand polish.
- Mini-app được coi là untrusted tenant. Native shell khó rollback, RN/remote layer linh
  hoạt hơn; capability nằm ở layer cao nhất mà security/lifecycle/performance cho phép.
- Host sở hữu global navigation, identity/trusted chrome, auth/session, permission mediation,
  capability bridge, notification coordination và telemetry.
- User không nên trải qua nhiều blocking loader cho cùng một intent chỉ vì frontend gọi
  nhiều API. Animation giải thích thay đổi, không che delay. Draft/progress phải được bảo
  toàn theo durability contract.
- Airbnb và flow chuyển tiền Zalopay trong tài liệu đầu vào chỉ là ví dụ UX mong muốn; không
  có reverse engineering hoặc benchmark xác nhận. Project này chưa được xác nhận là app
  tài chính và payments hiện vẫn deferred.

## 3. Repository facts đã kiểm tra

### 3.1 Toolchain và platform

Tại ngày cập nhật:

- Git repository thực nằm ở `app/`; workspace parent chứa `CLAUDE.md`, `.claude/skills/`,
  `policy/` và bản mirror của một số docs.
- `app/package.json`: React Native `0.85.1`, React `19.2.3`, TypeScript `5.8.x`, bare React
  Native CLI; Node engine `>=22.11.0`.
- Android: `minSdk 24`, `compileSdk 36`, `targetSdk 36`, Kotlin `2.1.20`, New Architecture
  và Hermes đang bật.
- Runtime dependency hiện có: `pako`, React, React Native và
  `react-native-safe-area-context`. `react-native-webview` chưa có trong dependency list.
- Commands hiện có: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run feature:graph`, và `scripts/verify.sh`.

Không tự đổi framework version, architecture mode, navigation foundation, package manager,
runtime model hoặc public contract trong một feature task không yêu cầu việc đó.

### 3.2 PoC đã tồn tại

Repository có một vertical-slice PoC gồm:

- React Native host, app orchestration, navigation broker, tenant selection và catalog;
- bốn tenant MVP: `vn-hn`, `vn-hcm`, `vn-dn`, `vn-fallback`;
- registry/model cho bảy capability: `net.request`, `storage.kv`, `scanner.scan`,
  `location.current`, `crypto.sign`, `notify.subscribe` và `ai.extract_bill`
  (pilot PoC cho split-bill — xem `docs/features/ai-extract-bill.md`);
- TypeScript bridge orchestration, gate/quota/audit models và per-capability handlers;
- manifest schema/validator/signer, local review model, CSP/navigation/container models,
  warm-pool logic và adversarial-fixture specification;
- tracking journal, notification inbox/FCM/APNs integration, host storage/device access và
  generic reminder Live Activity code (`LiveActivityExtension` + `Reminder*` coordinators);
- semantic palette/layout/motion tokens, host components, design-system docs và feature graph;
- local scripts cho type/lint/tests, static conformance, counter budgets và provenance.

Các artifact trên chứng minh rằng design/model/PoC code tồn tại; chúng không tự chứng minh
production enforcement hoặc external-mini-app readiness.

### 3.3 Trạng thái thực tế và khoảng cách production

Đây là cách giải quyết có chủ đích cho mâu thuẫn giữa các tài liệu cũ:

- `docs/README.md`/`architecture.md` mô tả Stage 1 như một vertical slice hoàn thành.
- `mini-app-platform-standard.md` và `ai-development-standard.md` mô tả production/external
  readiness và ghi nhiều guard chưa implement.
- Cả hai có thể đúng nếu “complete” chỉ có nghĩa PoC slice, không phải production contract.

Evidence từ source hiện tại:

| Area | Hiện trạng | Không được tuyên bố |
| --- | --- | --- |
| WebView container | Component/config/stub và tests tồn tại; dependency WebView chưa được cài | Không nói real container đã chạy/isolate trên device |
| Package verification | Signer/model tồn tại; container hiện dựa vào caller và chỉ kiểm package map không rỗng | Không nói B5 đã enforce trước byte/script đầu tiên |
| CSP | Policy và wrapper comment tồn tại | Không nói CSP response header đã được native scheme handler enforce |
| Capability bridge | Pipeline chính đang ở TypeScript; native modules riêng lẻ tồn tại | Không nói authority/identity/gates đã kết thúc hoàn toàn ở native boundary |
| Argument validation | Orchestrator ghi rõ MVP shallow validation, handlers chịu deeper validation | Không nói schema enforcement đã hoàn chỉnh |
| CI/conformance | Scripts và rule catalog tồn tại, có thể chạy local | Repository chưa có CI blocking; “defined” không bằng “enforced” |
| Budgets | Ledger, token values và trace-marker names tồn tại | Nhiều row vẫn provisional/unresolved; chưa có device-lab baseline |
| Adversarial pipeline | Fixture specification/local review model tồn tại | Chưa có đầy đủ rejecting fixture suite, meta-canary, rollout backend |
| External mini-apps | Platform contract ở trạng thái draft | Publication bị block cho đến khi mandatory enforcement rows hoàn tất |

Do đó trạng thái chuẩn để agent dùng là: **PoC implementation exists; production and
external-mini-app enforcement remains incomplete.** Mọi claim mạnh hơn cần command/device/
CI evidence mới.

## 4. Architecture baseline đã chốt

```text
native shell                 store release, rollback chậm
  React Native host          first-party product, orchestration
    capability bridge        một cửa được audit
      isolated mini-app      untrusted tenant, một origin/container contract
```

Downward giảm trust; upward giảm release agility.

### 4.1 Ownership và dependency direction

- Host UI: screen/presentation, không sở hữu raw mini-app protocol.
- Application/use case: user intent, task/loading orchestration, không phụ thuộc component
  hoặc navigation object cụ thể.
- Domain/ports: pure rules và typed contracts, không import React/RN/storage/vendor SDK.
- Data adapters: API, DTO validation/mapping, cache/persistence, không quyết định UI flow.
- Native/platform adapters: OS lifecycle, permission, secure storage và SDK ownership,
  không tự quyết business authorization.
- Runtime adapter: package load/lifecycle/transport/accounting, không cấp host service trực tiếp.
- Capability broker: typed/versioned API, caller binding, validation, limits, audit và
  error mapping; không export arbitrary native access.
- Shared UI: behavior/accessibility contracts và semantic tokens; không tự gắn business
  state hoặc global loading.

Ưu tiên modular monolith theo feature và public API hẹp. Features không deep-import store
của nhau. Không xây microfrontend/framework nội bộ hoặc abstraction rỗng nếu chưa có use case.

### 4.2 Layer selection

Chọn boundary hẹp nhất theo thứ tự: TypeScript/RN host → TurboModule/Codegen → Fabric
component → Swift/Kotlin adapter → shared C++ khi có cross-platform compute thực → native
screen cho lifecycle-heavy vendor flow. Preference không phải constraint; RN host là default.

### 4.3 Mini-app boundary mục tiêu

- Một WebView factory, một mini-app/origin, host-owned trusted chrome.
- Host bind `appId`, tenant, user và origin từ container session; request payload không mang
  authority.
- Manifest declaration là request, không phải grant. Thứ tự permission không được collapse:
  review/tier grant → per-mini-app user consent/purpose → OS permission.
- Network/storage/navigation/capability đều host-mediated, scoped, quota-controlled và
  revocable. Không host token, cookie, raw filesystem path hoặc bulk device enumeration.
- Package và signatures phải được verify trước code execution. CSP là response header;
  navigation undeclared/foreign bị cancel. Renderer-death handler áp dụng cả pooled/hidden.
- Web storage tắt là điều kiện an toàn của warm-pool hiện tại; bật nó là cross-tenant risk,
  không phải performance fix.
- Android shared renderer là accepted weaker isolation; mitigation giảm blast radius, không
  được mô tả như parity với iOS.

## 5. State, lifecycle và resource model

### 5.1 State ownership mặc định

| State | Owner |
| --- | --- |
| Press/focus/expanded/modal/tab con | Component/subtree nhỏ nhất |
| Form draft | Feature flow/controller, persist có chọn lọc |
| Server data | Một query/repository cache; key gồm account/tenant/resource/params |
| Session identity | Session service/generation; secret qua secure storage |
| Cross-screen client state | Feature/session store với selector hẹp |
| Navigation | Host navigation, serializable identity và revalidation |
| Per-frame gesture/animation | Native/UI animation runtime, không mirror vào global React state |
| Camera/socket/timer/subscription | Resource owner/lease, không serialize |

Một loại data có một source of truth. Không copy query result sang global store chỉ để chia sẻ;
derived state không được đồng bộ bằng effect nếu có thể tính trực tiếp.

### 5.2 Lifecycle contract

Mọi effect/resource/task phức tạp phải xác định:

- owner scope và identity/generation;
- exact start eligibility và dependencies;
- blur/unmount/background/revoke/logout/tenant-switch/timeout stop events phù hợp;
- idempotent cancel/cleanup và native release thực;
- late acquisition/result rule;
- sharing/refcount/exclusive serialization;
- resume/process-death/checkpoint policy;
- observable invariants để test.

Unmount không luôn hủy user intent; task đã xác nhận có thể handoff sang durable task manager.
Ngược lại, camera/mic/location foreground không tự tiếp tục background. Process death không
đảm bảo cleanup, vì vậy durable data phải được checkpoint trước terminal lifecycle callback.

## 6. UX và data defaults

### 6.1 Interaction

- Tối ưu tổng effort/time/error, không chỉ taps. Giữ đường first-time rõ và repeat-user
  shortcut ổn định.
- Form group theo quyết định; Back giữ draft; review/edit section trực tiếp. Không mặc định
  một field/một screen.
- Native/system input là baseline. Amount giữ raw editing, formatted display và canonical
  amount riêng; hỗ trợ paste/caret/delete/locale và không dùng floating point tùy tiện.
- Custom/image keypad không là default; chỉ chọn sau benchmark system vs semantic custom vs
  image+semantic hit regions, bao gồm accessibility và total-task cost.
- Behavior/accessibility contract tách khỏi visual skin. Semantic tokens là vocabulary duy
  nhất; host-only chrome tokens không được trao cho mini-app.

### 6.2 Loading và data

- Một intent, một owner, tối đa một blocking episode liên tục theo proposed default. Critical
  dependency quyết định usable state; optional data không re-block screen.
- Có local data an toàn: render ngay rồi revalidate. Refresh không xóa usable content/input.
- Local-first chỉ cho semantics phù hợp. Cached preview không có authority để commit price,
  permission, balance hoặc limit.
- Persistent entity/operation gắn account/tenant, schema version, freshness/server version,
  retention và migration/recovery policy.
- Search dùng query identity/generation; response cũ không overwrite intent mới.
- Reversible write có thể local transaction + outbox + projection; permanent error giữ
  draft/status và rollback đúng version, không ghi đè edit mới.
- Server-authoritative mutation có `Draft → Submitting → Confirmed | Rejected | Unknown →
  Reconciling`; retry cùng intent giữ idempotency identity.

## 7. Performance, accessibility và quality evidence

- `policy/budgets.md` là nơi duy nhất sở hữu con số. Frame arithmetic, tap response và một số
  bridge/splash values là derived/perceptual; nhiều startup/WebView/memory/counter values còn
  provisional hoặc unresolved.
- Reference devices hiện được khai trong budget ledger: Galaxy A14 low, Galaxy A54 mid,
  iPhone 14 high. Chưa có device-lab evidence trong repo chứng minh các target đã đạt.
- Đo release/profile build; ghi device, OS, refresh rate, commit/build, thermal/network,
  cold/warm, fixture và sample count. So sánh p50/p95/p99 và timeout/abandonment, không chỉ mean.
- Phân biệt JS responsiveness, UI/native frames, memory, energy, network/disk. Native motion
  mượt không chứng minh JS input responsive; simulator/mock không chứng minh device resource.
- Accessibility baseline: meaningful names/roles/states, logical focus, VoiceOver/TalkBack,
  text scale, contrast, touch target, Reduce Motion, keyboard/safe area và alternative cho
  gesture-only actions. Existing swipe/long-press customization alternatives còn cần evidence.

## 8. Decisions và open items

| ID | Trạng thái | Nội dung | Xem lại khi |
| --- | --- | --- | --- |
| FND-001 | Confirmed | Bộ `SOUL/SKILLS/MEMORY` là foundation chung cho mọi feature | Product operating model đổi |
| FND-002 | Confirmed | AI implement; human manual test product/UX; AI/CI giữ mechanical evidence | Review model đổi |
| FND-003 | Confirmed | PoC exists nhưng production/external enforcement incomplete | Gate có blocking evidence |
| ARC-001 | Confirmed | Thin shell, one bridge, budget enforcement, untrusted tenants | Human gate thay invariant |
| ARC-002 | Confirmed | RN 0.85.1 bare CLI, New Arch + Hermes, Android min 24 | Explicit platform upgrade ADR |
| ARC-003 | Confirmed | Modular feature ownership, typed ports/adapters, narrowest layer | Measured constraint buộc đổi |
| UX-001 | Confirmed intent | Foundation UX trước feature/brand expansion | Product owner đổi ưu tiên |
| UX-002 | Proposed default | Tối ưu total effort/time/error, không chỉ taps | Usability evidence |
| UX-003 | Proposed default | Một loading owner và tối đa một blocking episode/intent | Semantics bắt buộc auth/retry khác |
| UX-004 | Proposed default | Local read theo freshness; server authority cho critical commit | Domain contract khác |
| UX-005 | Proposed default | System input trước custom keypad | Benchmark đầy đủ chứng minh lợi ích |
| UX-006 | Proposed default | Group form theo decision, giữ draft/Back | Usability test |
| UX-007 | Confirmed | Semantic tokens; host-only/protected chrome không giao mini-app | Versioned contract + gate |
| OPS-001 | Open | CI service thực sự chạy blocking verify/conformance/budgets | Trước external publication |
| OPS-002 | Open | Device-lab baseline và field telemetry cho provisional budgets | Trước performance claim/release gate |
| SEC-001 | Open | Real origin-bound native bridge, scheme handler, pre-script verify | Trước external mini-app |
| SEC-002 | Open | Full adversarial fixtures, public snapshots, meta-canary, rollout/revocation backend | Trước pipeline live |
| PRD-001 | Open | 2–3 core journeys, target users, payments/domain semantics | Trước information architecture lớn |
| PRD-002 | Open | Minimum supported iOS, localization/RTL scope, dark mode/brand | Trước release criteria tương ứng |

## 9. Quy tắc cập nhật MEMORY

- Ghi decision cùng status, owner/date/evidence, phạm vi và revisit trigger. Không biến proposal,
  hypothesis hoặc comment trong code thành fact.
- Commands/results phải là thật. Review code chứng minh structure; mock chứng minh model;
  device test chứng minh runtime trong scenario đã nêu; không mở rộng claim quá evidence.
- Khi implementation khác standard, ghi current state và debt; không gọi debt là quyết định đã
  duyệt. Khi standard đã được enforce, cập nhật row bằng đường dẫn check/test blocking.
- Không lưu secret, token, PII, raw analytics, payload nhạy cảm hoặc toàn bộ lịch sử chat.
- Budget value đổi tại `policy/budgets.md`, capability đổi tại `policy/capabilities.yaml`;
  MEMORY chỉ tóm tắt trạng thái và lý do.
- Dọn transient notes; giữ context ngắn đủ để agent mới không phải suy đoán lại nền tảng.

## 10. Provenance của bản hợp nhất

| Nguồn đầu vào | Nội dung được giữ tại |
| --- | --- |
| `SYSTEM_DESIGN_SOUL.md` | `SOUL` mục 1, 4, 5, 7 và tác phong/claim boundaries ở mục 6–8 |
| `UX_SOUL.md` | `SOUL` mục 3 giữ đủ 12 principles; acceptance conditions ở mục 8 |
| `SYSTEM_DESIGN_SKILLS.md` | `SKILLS` mục 1–2, 5, 7, 9–12: bootstrap, feature/lifecycle/native, verification, templates và DoD |
| `UX_SKILLS.md` | `SKILLS` mục 2–6, 9–11: task design, components, loading, motion, input, data, recovery và UX measurement |
| `SYSTEM_DESIGN_MEMORY.md` | MEMORY mục 4–7: boundaries, state/lifecycle, performance, native/privacy, reliability và mini-app extension |
| `UX_MEMORY.md` | MEMORY mục 2, 6–9: confirmed UX intent, proposed defaults, budgets-as-unverified và memory maintenance |
| Existing project docs/policies/skills/source | MEMORY mục 1–5, 7–8; project invariants/routing/gates trong `SOUL` và `SKILLS` |

Việc “giữ” ở đây là giữ nguyên invariant, semantics và điều kiện áp dụng, đồng thời loại bỏ
duplicate wording. Project-specific facts thay thế các giả định generic; canonical values vẫn
ở `policy/*` để không sinh hai source of truth.

## 2026-10-04 — Native integration Test screen

Confirmed source/build change: common catalog adds `test` (Test) and category `other` (Khác) in all four tenants; root Swift/Kotlin hosts route it to a compiled Debug-only host test screen. Release shows an explanation and excludes diagnostic adapters/Android ML SDKs. Public capability registry unchanged; no generic debug broker grant. Contract/evidence: `native/TEST-CONTRACT.md`, `native/TEST-VERIFICATION.md`. Android Debug uses pinned ML Kit OCR and LiteRT ADD fixture; iOS uses system Vision OCR. Passkey RP/backend/app association and iOS ML Kit/TFLite SDK integration are still gaps. Simulator/build evidence is not physical NFC/biometric/product acceptance; no production readiness claim.


## 2026-10-04 — Bundled Split Bill in root native hosts

Repository now also has independent root `ios/` Swift and `android/` Kotlin hosts, documented in `native/README.md` (RN `app/` remains reference). The requested integration targets these two native hosts: bundle `split-bill` from `feat/expense-first-ux` through `native/tools/sync-miniapps.cjs`, then generate catalog/tenant registration via `native/tools/export-data.cjs`. Both mini-app source repos are read-only in this task. Native WebViews use the shared-platform host-bridge v1 protocol; frozen handshake advertises only existing manifest-declared storage.kv/scanner.scan/net.request. Persistent atomic KV is separate from SDK Demo's memory-only broker and scoped by tenant/app/local-preview-user. Camera/photo broker returns only decoded QR; Android uses ZXing core, iOS Vision. No extra public capability/policy values or RN dependency changed. Bundled asset hashes are checked before execution; they do not replace dual signatures or production external package admission. Canonical resource budgets and physical camera/a11y/device acceptance remain unverified. Contract/evidence and mini-app's existing delayed-save caveat are in `native/SPLIT-BILL-CONTRACT.md` and `native/SPLIT-BILL-VERIFICATION.md`.
