# Tracking — Backend Implementation Spec

**Status:** Handoff for backend AI agent  
**Scope:** `app/src/tracking/*` host + mini-app event ingestion. Not push, not card, not mini-app runtime.  
**Sources:** `app/src/tracking/trackingService.ts:1`, `app/src/tracking/types.ts:1`, `app/src/config/appConfig.ts:19`, `app/src/miniapps/catalog.ts:44`, `policy/budgets.md:110`, `app/src/native/hostStorage.ts:85`, `app/App.tsx:206`

---

## 1. Goal / Non-Goal

**Goal:** Durable ingestion of events produced by `TrackingService:297` on iOS/Android, honoring delivery budgets in `policy/budgets.md:110` without trusting client-supplied priority, limits, or identity.

**Non-Goal:** Product analytics UI, warehouse visualization, mini-app container, push (`src/notification/*`), card dataset (`src/cards/*`). Mini-apps never set priority/limit — server must ignore any client-supplied values (`policy/budgets.md:112`).

---

## 2. Client Contract (must not be broken)

### 2.1 Envelope `src/tracking/types.ts:12`

```ts
type TrackingEventEnvelope = {
  event_id: string                // client-generated `event-{n}` via generatedId:208 e.g. "event-2" in test
  event_name: string              // declared name e.g. "forecast_viewed"
  event_version: number           // declared version e.g. 1
  event_data: Record<string, unknown> // allowlisted keys only, ≤ maxEventBytes
  occurred_at_ms: number          // client now() at enqueue, or HostTrackingContext.occurredAtMs:165
  queue_sequence: number          // monotonic per device, drives batch order:358
  source_type: 'native'|'react_native'|'mini_app'|'bridge'|'runtime' // 5 values types.ts:5
  mini_app_id: string | null      // null for host events, non-null for mini-app
  mini_app_version: number | null
  host_app_version: string        // from config appConfig.tracking.hostAppVersion:23 "0.0.1"
  platform: 'ios' | 'android'     // Platform.OS
  session_id: string              // app session id('session'):331
  mini_app_session_id: string | null // from MiniAppTrackingContext:195
  user_id: string | null          // via userIdProvider, null today (config:191)
  anonymous_id: string            // getOrCreateAnonymousId('host') or `mini-app-{id}` trackingService.ts:349,541 via hostStorage.ts:117
  priority: 'critical'|'operational'|'product'|'diagnostic' // declared, server should re-derive
  trace_id: string | null
  privacy_class: 'essential'|'analytics'|'sensitive'|'restricted' // essential vs analytics only today
  consent_version: number         // appConfig.tracking.consentVersion:24
  sdk_version: 1
  network_at_event: 'offline'|'wifi'|'cellular'|'roaming'|'constrained'|'unknown' // TrackingNetworkKind:37
  attempt_count: number           // incremented per batch inclusion createBatch:592, flushOnce:659
}
```

### 2.2 Host Declarations `src/tracking/trackingService.ts:27` (16 events)

| name | version | priority | privacy_class | allowedDataKeys |
|---|---|---|---|---|
| `app_started` | 1 | `operational` | `essential` | `[]` |
| `screen_viewed` | 1 | `product` | `analytics` | `[screen, source]` |
| `screen_scroll_depth` | 1 | `product` | `analytics` | `[screen, depth_percent]` |
| `navigation_opened` | 1 | `product` | `analytics` | `[destination, source]` |
| `navigation_bar_clicked` | 1 | `product` | `analytics` | `[destination, mini_app_id, slot]` |
| `navigation_customization_requested` | 1 | `product` | `analytics` | `[slot, gesture, current_mini_app_id]` |
| `navigation_denied` | 1 | `operational` | `essential` | `[operation, reason]` |
| `dock_slot_changed` | 1 | `product` | `analytics` | `[slot, mini_app_id]` |
| `entrypoint_clicked` | 1 | `product` | `analytics` | `[entrypoint_id, surface, destination, mini_app_id]` |
| `home_preference_changed` | 1 | `product` | `analytics` | `[item_type, item_id, action, source]` |
| `mini_app_opened` | 1 | `product` | `analytics` | `[mini_app_id, entrypoint_id, source]` |
| `mini_app_closed` | 1 | `product` | `analytics` | `[mini_app_id, reason]` |
| `mini_app_route_viewed` | 1 | `product` | `analytics` | `[mini_app_id, route, source]` |
| `mini_app_scroll_depth` | 1 | `product` | `analytics` | `[mini_app_id, route, depth_percent]` |
| `device_access_requested` | 1 | `product` | `analytics` | `[access_kind]` |
| `device_access_completed` | 1 | `product` | `analytics` | `[access_kind, status]` |
| `notification_received` | 1 | `operational` | `essential` | `[notification_id, category, app_state, target_app_id, provider_message_id]` |
| `notification_clicked` | 1 | `operational` | `analytics` | `[notification_id, category, app_state, target_app_id, entrypoint_id, interaction_source]` |
| `notification_inbox_seen` | 1 | `product` | `analytics` | `[notification_ids, visible_count]` |
| `notification_inbox_opened` | 1 | `product` | `analytics` | `[unread_count]` |

See `trackingService.ts:28-161`. All `version:1`, `privacy_class` is `analytics` except `app_started`, `navigation_denied`, `notification_received` which are `essential`.

### 2.3 Mini-App Declarations `src/miniapps/catalog.ts:70`

Per `MiniAppManifest.trackingEvents:41` (`name/version/priority/allowedDataKeys`). Current catalog `catalog.ts:44`:

- `badminton` (10): `slot_list_viewed(product,[date_id,source])`, `slot_booked(operational,[slot_id,court_id,start_time,visibility])`, `open_match_joined(product,[slot_id,participant_count])`, `booking_visibility_changed(product,[slot_id,visibility])`, `booking_participant_removed(operational,[slot_id,participant_count])`, `booking_cancelled(operational,[slot_id])`, `booking_reminder_scheduled(operational,[slot_id,status,surface,reminder_offset_minutes])`, `booking_reminder_cancelled(operational,[slot_id,reason])`, `calendar_add_requested(product,[slot_id,source])`, `calendar_add_completed(operational,[slot_id,source,status])`
- `weather`: `forecast_viewed(product,[day,source])`
- `transit`: `route_viewed(product,[route_id,source])`
- `notes`: `note_opened(product,[source])`
- `market`: `item_viewed(product,[item_id,source])`
- `card`: `benefit_search_performed(product,[query_length,result_count])`, `card_detail_viewed(product,[card_id,source])`

Client rejects undeclared `name+version` or extra keys → `trackMiniApp:398` returns `null` (`trackingService.test.ts:67,101`). Server must independently reject the same.

### 2.4 Config `src/config/appConfig.ts:19` (provisional — Budgets own numbers)

```ts
tracking: {
  endpoint: undefined,            // to be supplied — backend URL
  hostAppVersion: '0.0.1',
  consentVersion: 1,
  maxEventBytes: 16*1024,         // single event, uncompressed budgets.md:124
  maxQueueBytes: 8*1024*1024,     // durable journal 8MB budgets.md:126
  maxBatchBytes: 512*1024,        // single request 512KB budgets.md:125
  cellularBatchBytes: 256*1024,   // cellular target 256KB appConfig.ts:26
  maxBatchEvents: 200,            // budgets.md:125
  maxWaitMs: { critical: 1_000, operational: 5_000, product: 30_000, diagnostic: 300_000 }, // budgets.md:110
  retentionMs: { critical: 7*24*60*60*1000, operational:72*60*60*1000, product:24*60*60*1000, diagnostic:60*60*1000 }, // 7d/72h/24h/1h
}
```

`policy/budgets.md:110` target sizes also list: critical `32–64KB`, operational `128KB`, product `256KB cellular / 512KB WiFi`, diagnostic `512KB unmetered preferred`. Client uses `appConfig` numbers as actual limits.

### 2.5 Client State Machine `src/tracking/trackingService.ts:297`

- `start():334` loads `anonymousId` + `loadTrackingEventLines():350` (newline-delimited JSON from `hostStorage.ts:85`), rebuilds `sequence:358` as `max(queue_sequence)`, `enforceQueueLimit:362`, `schedule:364`.
- `enqueue:419` gates `validData:282` (`Object.keys(data) ⊆ allowedDataKeys` && `serializedBytes(JSON.stringify(data)) ≤ maxEventBytes` via UTF-8 counting `serializedBytes:265`), builds envelope `trackingService.ts:444`, `appendTrackingEventLine:472`, `enforceQueueLimit:473`, then `critical → flush('critical_event'):475` else `schedule:477`.
- `enforceQueueLimit:483` drops expired per `retentionMs` (`now - occurred_at_ms > retentionMs[priority]`), then if `serializedBytes(queue) > maxQueueBytes` drops `diagnostic→product→operational` one-by-one `trackingService.ts:498`, then FIFO dropping `critical` counted in `droppedCriticalEvents:510`.
- `eligible:520` → `!reachable → false`; `roaming|constrained → only critical|operational`; `diagnostic → wifi only`; else true. Controls `createBatch` filtering.
- `createBatch:567` filters by `eligible`, sorts by `priorityOrder:173` (`critical 0, operational 1, product 2, diagnostic 3`) then `queue_sequence`, caps by `network.kind==='wifi' ? maxBatchBytes : min(maxBatchBytes, cellularBatchBytes)` and `maxBatchEvents`, bumps `attempt_count:592`.
- `chooseTransport:606` → `wifi && queue.length>=20 && grpc.isAvailable → grpc` else `http if reachable`. So backend must expose both transports.
- `flushOnce:634` → `networkSnapshot(true):638`, `transport.send(batch):649`, on 2xx removes `accepted+permanentlyRejected:650` from queue, persists `replaceTrackingEventLines:655`; on throw/`!response.ok` bumps `attempt_count:658` for attempted ids, persists.
- Lifecycle in `App.tsx:253` `tracking.start()` before `notification.start()`, `flush('app_background')` on `AppState !== 'active'`, `stop()` `App.tsx:280` on unmount, `schedule:667` sets timer to earliest `occurred_at + maxWaitMs - now:676`. `enqueue` awaits `initializing` `trackingService.test.ts:162` to avoid losing first `app_started`.

---

## 3. Backend Endpoint Contract

### 3.1 Transport

**HTTP** `HttpTrackingTransport:214`
```
POST {appConfig.tracking.endpoint}
Headers: Accept: application/json, Content-Type: application/json
Body: JSON.stringify(TrackingBatch)
```

**gRPC** `TrackingTransport:62` — same shape, selected only when `wifi && queue.length>=20` `trackingService.ts:610`. Agent to define:
```proto
service Tracking {
  rpc SendBatch(TrackingBatch) returns (TrackingResult);
}
message TrackingBatch { string batch_id=1; int64 sent_at_ms=2; string reason=3; repeated TrackingEventEnvelope events=4; }
message TrackingResult { repeated string accepted_event_ids=1; repeated string permanently_rejected_event_ids=2; }
```

Non-2xx HTTP or gRPC error → client throws `Tracking upload failed with {status}` `trackingService.ts:233` and retries with `attempt_count+1`. No partial retry — whole batch retried except `permanentlyRejected`.

### 3.2 Request `TrackingBatch:50` / `trackingService.ts:598`

```json
{
  "batch_id": "batch-abc123",
  "sent_at_ms": 1717000000000,
  "reason": "critical_event | max_wait | app_background | test",
  "events": [ TrackingEventEnvelope, ... ]
}
```
`reason` values observed: `critical_event` `trackingService.ts:475`, `max_wait` `trackingService.ts:686`, `app_background` `App.tsx:270`, `test` `trackingService.test.ts:209`.

### 3.3 Response `TrackingTransportResult:57`

```json
{
  "accepted_event_ids": ["event-1", "event-2"],
  "permanently_rejected_event_ids": ["event-3"]
}
```

- `accepted_event_ids` = durably stored, client deletes `trackingService.ts:654`.
- `permanently_rejected_event_ids` = schema/allowlist/version violation — also deleted `trackingService.ts:650-654` (no retry).
- Missing field fallback: `accepted_event_ids ?? batch.events.map(id)` `trackingService.ts:242`. Invalid JSON fallback: treat all as accepted `trackingService.ts:249`.
- Any `event_id` not in either set stays queued and will be resent.

**Idempotency:** duplicate `event_id` must be treated as `accepted` (client may retry after 5xx where server did store). Use `event_id` PK.

### 3.4 Server Must Enforce (do not trust client)

| Check | Action on violation |
|---|---|
| `event_data` keys ⊆ `allowedDataKeys` per registry (§2.2/2.3) | `permanentlyRejected` |
| `event_name+version` declared for `mini_app_id` (or host) | `permanentlyRejected` |
| `serializedBytes(event)` or `event_data` > `maxEventBytes` | `permanentlyRejected` |
| Batch `> maxBatchEvents` or `> maxBatchBytes`/`cellularBatchBytes` | `permanentlyRejected` for oversized members, or 413 |
| Unknown `event_id` format | `permanentlyRejected` |
| `priority` client-supplied — re-derive from server registry, override | store with server priority |
| Duplicate `event_id` | return `accepted` (idempotent) |
| `platform`, `host_app_version`, `consent_version` | store, allow future filtering, not rejected |

Never log `event_data` raw in prod; follow `App.tsx` privacy pattern — log `event_name`, `priority`, counts only.

---

## 4. Storage & Pipeline

**Recommended minimal (small scope — single Postgres, no microservices):**

```sql
-- raw, append-only, idempotent
CREATE TABLE tracking_events (
  event_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id TEXT NOT NULL,
  envelope JSONB NOT NULL,
  event_name TEXT NOT NULL,
  event_version INT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical','operational','product','diagnostic')),
  mini_app_id TEXT,
  platform TEXT,
  host_app_version TEXT,
  anonymous_id TEXT NOT NULL,
  occurred_at_ms BIGINT NOT NULL
);
CREATE INDEX ON tracking_events (received_at);
CREATE INDEX ON tracking_events (priority, received_at);
```

- Partition by `received_at` DAY, 30d hot then archive to S3 Parquet → warehouse (ClickHouse/BigQuery) partitioned by `priority/day`. Apply client `retentionMs` only on client; server retains per data policy (e.g., 90d raw + aggregated).
- Dedup cache: Redis `SETNX event_id EX 7d` before DB insert for fast path.
- Metrics: `tracking_batches_total{reason, priority}`, `tracking_events_total{event_name, priority, permanently_rejected}`, `tracking_queue_age_seconds`.
- Debug: `GET /debug/tracking` behind auth for `getBufferedEventsForDebug:696` parity.

---

## 5. Validation Detail — Replicate These Tests Server-Side

Mirror `src/tracking/trackingService.test.ts` as backend contract tests:

- **Derives mini-app identity and priority** `test.ts:42` → `weather forecast_viewed v1 product` with `mini_app_id=weather mini_app_version=1 user_id=pseudonym-weather priority=product`.
- **Accepts only declared Badminton fields** `test.ts:67` → `slot_booked` with `[slot_id,court_id,start_time,visibility]` ok; same plus `player_name` → `permanentlyRejected`.
- **Rejects undeclared events/fields** `test.ts:101` → `not_declared` → `permanentlyRejected`; `forecast_viewed` with `secret` → `permanentlyRejected`.
- **Host allowlist** `test.ts:123` → `mini_app_opened [mini_app_id,entrypoint_id,source]` ok; plus `raw_location` → `permanentlyRejected`; `home_preference_changed` extra `age` → `permanentlyRejected`.
- **Priority ordering** `test.ts:181` → batch sorts `operational` before `product` — server should not rely on client order, but verify sorting logic if re-batching.

Run these via `supertest` HTTP + grpc client against ephemeral DB.

---

## 6. Network / Battery Nuance

- `eligible:520` already filtered client-side; server stores regardless (diagnostic on cellular still stored if client sent — client only sends diagnostic on `wifi`).
- `networkSnapshot` cached 5s `trackingService.ts:546`, `isAvailable:219` is `reachable` only. Backend health independent — return 503 with `Retry-After` if overloaded, client will bump `attempt_count` and retry on next `schedule`.

---

## 7. Security & Privacy

- No auth today — `anonymous_id` is the join key (`hostStorage.ts:117` per-scope `anonymous-{scope}-{random}`). Future: HMAC device attestation header.
- `user_id` null; `viewerProfile` (`appConfig.viewerProfile`) explicitly never added to tracking `appConfig.ts:16`.
- Rate-limit per `anonymous_id` + IP: suggest `120 req/min` (mirrors `storage.kv` quota) + global 5k/min.
- Input caps per `appConfig` are also DoS protection — enforce before JSON parse where possible.

---

## 8. Implementation Tasks

1. **Scaffold** `api/src/tracking` module with Zod schemas from `types.ts:12` + allowlist registry generated from `trackingService.ts:27` + `catalog.ts:44` (codegen or manual sync; CI fails drift).
2. **Implement** `POST /v1/tracking/batches` + gRPC `SendBatch` — idempotent upsert, return `accepted/permanentlyRejected` per §3.3, persist `tracking_events`.
3. **Pipeline** to warehouse + metrics + `GET /health` and optional `GET /v1/tracking/config` exposing `maxEventBytes` etc. for remote tuning.
4. **Contract tests** mirroring `trackingService.test.ts` via HTTP + gRPC.
5. **Wire** `appConfig.tracking.endpoint` to new URL and verify `App.tsx:253` `start → app_started → flush('app_background')` e2e with `hostStorage` fallback `replaceTrackingEventLines:100`.

---

## 9. Acceptance Criteria

- [ ] `trackingService.test.ts` suite passes pointing at mock transport that mirrors backend validation logic.
- [ ] `curl POST {endpoint}` with batch from `test.ts:181` returns `200 {accepted_event_ids:[...]}` and second identical POST returns same `accepted` with no duplicate rows (idempotent).
- [ ] Unknown `event_name` (e.g. `not_declared`) returns `permanently_rejected_event_ids:["event-*"]`; client deletes it after `flushOnce:650`.
- [ ] `event_data` exceeding `maxEventBytes` (16KB) returns `permanentlyRejected`, not retried.
- [ ] Batch with `event_data` extra key (e.g. `forecast_viewed` + `secret`) → `permanentlyRejected` for that event only, other events accepted.
- [ ] Sorting invariant: `operational` events returned before `product` in batch (or at least not rejected for ordering).
- [ ] p95 ingestion < 200ms for 200-event / 512KB batch (budget derived from `policy/budgets.md` soft budget; measure on low-tier analog).
- [ ] No `event_data` logged at `info` level.

---

## 10. Open Questions for Reviewer (block before code)

1. Confirm `endpoint` path (`/v1/tracking/batches` vs `/v1/tracking`) and whether `hostAppVersion`/`consentVersion` should be header vs envelope.
2. Whether `user_id` pseudonymization stays client-side (`userIdProvider`) or moves server-side.
3. Warehouse destination and retention policy beyond client `retentionMs`.
4. Whether to sign `allowlist registry` and distribute via remote config (like tenants).

---

**Refs:** `app/src/tracking/trackingService.ts:27,173,282,419,483,520,567,606,634,667` · `app/src/tracking/types.ts:12,50` · `app/src/miniapps/catalog.ts:44` · `app/src/config/appConfig.ts:19` · `policy/budgets.md:110` · `app/src/native/hostStorage.ts:85` · `app/src/tracking/trackingService.test.ts:42,67,101,123,181` · `app/App.tsx:253,270`
