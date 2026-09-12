# Feature — Tracking

> **Host core, not mini-app business.** Mini-app supplies `name/version/allowedData` only; host derives everything sensitive. `catalog.ts:11` declarations are the allowlist — `allowedDataKeys` missing = drop, not warn.

## Contract

- **Mini-app declares** `trackingEvents: {name, version, priority (critical|operational|product|diagnostic), allowedDataKeys}[]` `catalog.ts:11` per app, plus `hostEvents` 15 entries `trackingService.ts:26` (`app_started`, `screen_viewed`, `mini_app_opened`, `notification_received`, etc.).
- **Payload cap** `singleEvent 16KB` `policy/budgets.md:122`, **journal** `8MB` with reservation `budgets.ts:44` + `appConfig.tracking:21` (`maxQueueBytes 8MB`, `maxBatchBytes 512`, `cellular 256`, `maxBatchEvents 200`, `maxWaitMs critical 1s → diagnostic 300s`, `retention 1h → 7d`).
- **Host-owned envelope** `tracking/types.ts:14` `TrackingEventEnvelope` — host derives `event_id, session_id, mini_app_session_id, anonymous_id (per host/per mini-app via `hostStorage.ts:117` `getOrCreateAnonymousId`), user_id (if provided), platform, host_app_version, privacy_class, consent_version, network_at_event, trace_id`. Mini-app cannot set these (C3 analogue).

## Flow

```
declare (catalog) → enqueue (validData + anonymousId) → journal (appendTrackingEventLine) → enforceQueueLimit (retention + 8MB drop diagnostic→product→operational) → schedule (min maxWaitMs) → createBatch (priorityOrder + queue_sequence, wifi 512/cellular 256, ≤200) → chooseTransport (wifi+len≥20 → gRPC else HTTP) → flushOnce (send → accepted/permanentlyRejected removed, throw → bump attempt_count) → persist (replaceTrackingEventLines)
```

- **Validation:** `validData:283` checks `Object.keys(data) ⊆ allowedDataKeys` **and** `serializedBytes ≤16KB` — `trackMiniApp:391` returns `null` if manifest/event not found.
- **Network:** `networkSnapshot:547` cached 5s, throttled via `requestDeviceAccess('network')`. `eligible:520` drops `diagnostic` on cellular, `critical|operational` only on roaming/constrained.
- **Persistence:** journal `hostStorage.ts:85` (`tracking-events.jsonl`, serial queue iOS, executor Android) survives kills; `sequence` monotonic for ordering.

## Host API

`trackingService.ts:297` `TrackingService(config, deps)`:

- `trackHost(name: HostTrackingEventName, data, context)` `375` — `app_started`, `screen_viewed`, `mini_app_*`, `notification_*`, `home_preference_changed`, `device_access_*`
- `trackMiniApp({appId, appVersion, sessionId}, name, version, data)` `391` — returns `null` if not declared
- `start/stop`, `flush(reason)`, `getBufferedEventsForDebug`, `getDroppedCriticalCountForDebug` — `App.tsx:254` `tracking.start()` → `app_started` → `notification.start()`.

Config from `appConfig.tracking:21` (`hostAppVersion 0.0.1`, `consentVersion 1`, `endpoint` undefined → stays in journal).

## Testing

- `trackingService.test.ts` + `hostStorage.test.ts` cover enqueue, `validData`, retention, 8MB drop, batch limits, transport choice, offline.
- Adversarial: oversized `>16KB`, unknown `allowedDataKeys`, burst flood, offline → queue, storage full → drop.

## Adding an event

1. Add to `catalog.ts` `trackingEvents` or `trackingService.ts` `hostEvents` with `allowedDataKeys` (no PII, no raw payload) and `priority`.
2. Call `tracking.trackHost/trackMiniApp` from the UI/domain layer — never from native or WebView.
3. Add unit test for `validData` and priority.

*Telemetry never logs secrets — bridge audit already carries `argsDigest` not args (`audit.ts:37`).*
