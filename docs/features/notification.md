# Feature — Notification (Push → Inbox → Activation)

> Inbox is host-owned, mini-app never sees `push token` or raw payload. Every deep link is an allowlisted entrypoint, not a URL.

## Native contract — `src/native/notification.ts:1`

`NativeNotificationModule` (TurboModule or JS fallback):

- `getPermissionStatus / requestPermission / registerForRemoteNotifications`
- `getPendingEvents: Promise<string>` JSON array of `NativeNotificationEvent {native_event_id, type: received|opened, payload, app_state, provider_message_id, occurred_at_ms}`
- `acknowledgeEvent(nativeEventId)`
- `scheduleReminder / cancelReminder / presentCalendarEvent` (generic reminder/calendar, optional)

Generic reminders share one host reminder lifecycle. The iOS implementation is an ActivityKit Live Activity; Android requests a Live Update when the platform can promote the ongoing notification and falls back to the standard notification presentation. See [Live Activity](live-activity.md). These reminder APIs are host module methods; adding ActivityKit support does not grant mini-apps a direct native capability.

`NATIVE ↔ JS` via `NativeEventEmitter` for `pendingEvents` while foregrounded.

## Service — `notification/notificationService.ts:246`

- **Enqueue:** `enqueueNativeEvent:606` chains `nativeEventQueue` promise to serialize native bursts.
- **Deduplicate:** `processingNativeEvents:559` Set — prevents double handling if native re-emits.
- **Parse:** `parseRemoteNotification:147` → `RemoteNotificationPayload` validates with `boundedString`, `identifierPattern /^[\w-]+$/`, trims `target.input` values ≤4096 JSON (`validLinkInput` style), `createdAt` bounded, `title/body/category/notification_id` validated. Returns `normalizedEnvelope {notification_id, title, body, category, created_at_ms, target: {mini_app_id, entrypoint_id, input}?}` or `null` (invalid/expired → acknowledge without inbox).
- **Inbox:** `receive:613` `[item, ...Inbox].sort(created_at).slice(250)` (`appConfig.notification:43` `maxInboxItems 250`) → `saveNotificationsJson` (`hostStorage.ts:104` serial queue iOS) → emit snapshot `{items, unreadCount, permissionStatus}` to `App.tsx:193`.
- **Tracking:** `notification_received:639` with `category/app_state/target_app_id/provider_message_id`; `received_tracked_at_ms` dedupes.
- **Foreground banner:** if `type received && wasInserted && app_state foreground && !isReminderCategory` → `foregroundListeners` → `App.tsx:198` `setForegroundNotification` → `ForegroundNotificationBanner`.
- **Activation:** `activate:665` (`activateFromInbox` inbox tap, `activateForeground` banner tap, `opened` push tap) sets `opened_at/seen_at`, `trackHost notification_clicked` with `target_app_id/entrypoint_id/interaction_source`, notifies `activationListeners` → `App.tsx:204` `openNotificationMiniApp:224` → `navigationBroker.ts:191` (find manifest, entrypoint `host_notification` in `allowedSources`, `allowedInputKeys` ≤4096, `isDeclaredRoute`).
- **Permission:** `requestPermission:332` `denied→openSettings` (`Linking.openSettings()`), `not_determined→requestPermission`, else emit. `refreshPermissionStatus` on `AppState active` `App.tsx:252`.
- **Inbox UX:** `HomeScreen:389` `NotificationSheet` bell → `setNotificationsOpen` + `recordInboxOpened` + `onSeen` `markSeen:491` (max 50 per event `maxSeenIdsPerEvent`).

## App wiring — `App.tsx:191`

```ts
useEffect: notification.subscribe → setNotificationSnapshot
         + onForegroundReceived → setForegroundNotification
         + onActivated → openNotificationMiniApp
         + tracking.start → notification.start
AppState active → refreshPermissionStatus else flush
```

`HomeScreen` `notificationPermissionStatus`/`notificationUnreadCount`/`onNotificationPress`/`onNotificationsOpened`/`onNotificationsSeen` flow through to service.

## Config

`appConfig.notification:43` `maxInboxItems 250`, `maxSeenIdsPerEvent 50`, `reminderLeadMs 1h`, `hostAppVersion`. `REMOTE_PUSH_ENABLED` flag gates `registerForRemoteNotifications`.

## Testing

- `notificationService.test.ts` covers parse (invalid/expired/oversized input → null), inbox insert/sort/cap 250, dedup, foreground vs background, activation → broker success/failure (`navigation_denied`), permission flows.
- Adversarial: malformed payload, oversized `input` (>4096), unknown `mini_app_id`/`entrypoint_id`, expired `created_at`, duplicate `native_event_id`.

## Adding a category

1. Add to `RemoteNotificationPayload` category union + `notification/types.ts:14` `InboxNotification` handling.
2. Ensure `catalog.ts` target mini-app has `publicEntrypoint` with `allowedSources: ['host_notification']` and `allowedInputKeys` allowlisted.
3. No token or raw payload reaches mini-app — it receives only `input` via `MiniAppFrame.input`.
