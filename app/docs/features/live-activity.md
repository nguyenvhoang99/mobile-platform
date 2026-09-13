# Feature — Live Activity (Badminton Booking)

> iOS 16.1+ `ActivityKit` — host-owned, not mini-app UI. One booking = one Activity. Android shows a foreground notification instead (no `ActivityKit`).

## Domain — `app/src/splitBill/` is unrelated; badminton lives in `app/src/cards/` + native coordinators

Example booking flow uses the badminton mini-app (`catalog.ts:44` `id: badminton` `routes: [/, /bookings]`) and host card `cards/model.test.ts` as the dataset. The Live Activity mirrors the booking's countdown, not the mini-app's WebView.

## Native — iOS

- `BadmintonActivityAttributes.swift:1` `struct BadmintonActivityAttributes: ActivityAttributes` with `ContentState { bookingId, slotId, courtId, startAt, status: scheduled|live|completed, participantCount }`. `activityID = "badminton-\(bookingId)"`.
- `BadmintonLiveActivityCoordinator.swift:1` owns the lifecycle:
  - `start(booking:)` → `Activity.request(attributes:content:pushType:)` (pushType nil for local, `.token` if remote updates planned)
  - `update(bookingId, state)` → `activity.update(using: ContentState)` — must be called from main, throttled by the system (no spam)
  - `end(bookingId, dismissalPolicy: .immediate/.after)` → `activity.end(dismissalPolicy:)`
  - `areActivitiesEnabled` check before start; `ActivityAuthorizationInfo.areActivitiesEnabled` is the gate — no prompt, user controls in Settings.
- `AppDelegate.swift` `didFinishLaunching` does **not** auto-start activities — they are started on explicit user booking.

Exported to JS via `NotificationModule.swift:1` (TurboModule) methods `scheduleBadmintonReminder` / `cancelBadmintonReminder` / `presentBadmintonCalendarEvent` (the JS entry points in `native/notification.ts:1`). The Live Activity itself is started from Swift when the host handles `ReminderRequest` of type `badminton` — not from JS.

## Native — Android

No `ActivityKit`. `BadmintonReminderScheduler.kt` schedules an exact alarm via `AlarmManager` + `NotificationEventStore` + `MiniAppFirebaseMessagingService` foreground notification with countdown. Same JS API `scheduleReminder` resolves to a notification, not an activity. `app/src/config/tenants.ts:32` tenancy does not affect the activity — booking is per user, not per tenant.

## JS contract — `src/native/notification.ts:1` + `notification/types.ts:14`

```ts
ReminderRequest { id, title, body, category: "badminton", bookingId, slotId, triggerAtMs }
ReminderResult { status: "scheduled" | "denied" | "unavailable", message }
CalendarEventRequest { title, startAt, endAt, bookingId } → CalendarEventResult
```

- `NotificationModule: scheduleBadmintonReminder(requestJson): Promise<ReminderResult>` — iOS checks `areActivitiesEnabled` else returns `unavailable` (no prompt, no crash); Android always schedules alarm (exact alarm permission may be `denied` on Android 13+).
- `cancelBadmintonReminder(bookingId)` ends the activity / cancels the alarm.
- `presentBadmintonCalendarEvent` uses `EventKit` (iOS) or `CalendarContract` (Android) — separate from Live Activity, user can add to calendar.

Tracking: `trackingService.ts:26` `booking_reminder_scheduled` / `booking_reminder_cancelled` with `slot_id/status/surface` (no PII).

## Flow

```
User books slot in badminton mini-app (WebView) → host bridge `net.request` creates booking (host-mediated, no mini-app token)
  → JS calls scheduleBadmintonReminder({bookingId, startAt, title}) → native starts Live Activity (iOS) or exact alarm (Android)
  → system shows Lock Screen / Dynamic Island countdown (iOS) or heads-up notification (Android)
  → on `participant_removed` / `booking_cancelled` → JS calls cancelBadmintonReminder → native ends activity / cancels alarm
  → on `booking_reminder_scheduled` tracking → backend may also push update via `MiniAppFirebaseMessagingService` → `notificationService.ts:246` handles as `reminder` category (no foreground banner)
```

## Testing

- Swift unit test for `BadmintonActivityAttributes` `ContentState` Codable round-trip.
- `notificationService.test.ts` covers `scheduleReminder` → `scheduled` / `denied` / `unavailable` and idempotent cancel.
- Manual: book → lock screen shows countdown → background/foreground → update → cancel → activity dismissed. Test on iOS 16.1+ device (simulator supports Live Activity but not Dynamic Island) and Android 13+ (exact alarm permission).

## Adding a new Live Activity type

1. New `ActivityAttributes` struct (do not reuse badminton's) — one activity per domain.
2. Coordinator per type (do not share `BadmintonLiveActivityCoordinator` singletons).
3. JS port `schedule<New>Reminder` in `native/notification.ts` + `notification/types.ts` — keep payload bounded (no `bookingId` reuse across types).
4. Gate via `areActivitiesEnabled` and `human-gate` — Live Activity is a native capability per `mobile-architecture:40` (unspoofable surface, gesture-critical lifecycle).

*Live Activity is host UI — mini-app code never directly starts an activity. The bridge is not involved; the host's `ReminderRequest` is.*
