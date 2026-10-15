# Feature — Live Activity (Generic Reminder)

> One generic reminder lifecycle, with platform-native live surfaces: ActivityKit on iOS 16.2+, and a promoted ongoing notification (Android Live Update) where Android API level 36.1+ supports the promotion API. Older platforms use the standard notification fallback. Promotion remains subject to OS and user settings.

## Domain

Generic reminder mechanism. Product copy and routing arrive from React Native; the shell only owns timing, delivery, and teardown. The badminton mini-app (`catalog.ts` `id: badminton`) is one example consumer — it requests a booking outcome, never direct alarm/notification/ActivityKit access. The Live Activity mirrors the reminder countdown, not the mini-app's WebView.

## Native — iOS

- `ReminderActivityAttributes.swift` `struct ReminderActivityAttributes: ActivityAttributes` with `ContentState { reminderAt, startAt, endAt }` plus `reminderId/title/body`. All display copy arrives from React Native.
- `ReminderLiveActivityCoordinator.swift` owns the ActivityKit lifecycle:
  - `schedule(requestJSON:resolve:)` → `Activity.request(...)` when `areActivitiesEnabled`, else local-notification fallback via `UNUserNotificationCenter`
  - `cancel(reminderId:)` → removes pending/delivered notifications and ends the matching activity
  - `startFromNotification(_:)` → starts an activity from a delivered notification carrying the generic `live_activity` marker
  - `validatesActivityLink(...)` → deep-link guard: only a currently live activity is honored
  - `areActivitiesEnabled` is the gate — no prompt, user controls in Settings.
- `LiveActivityExtension/ReminderLiveActivityWidget.swift` renders Lock Screen and Dynamic Island countdown from the attributes. Tapping deep-links via `miniappplatform://reminder?...`, validated by `AppDelegate` against the live activity.
- `AppDelegate.swift` `didFinishLaunching` does **not** auto-start activities — they start on explicit schedule or on foreground/background delivery of a `live_activity` notification.
- `NotificationModule.swift` (TurboModule) methods `scheduleReminder` / `cancelReminder` / `presentCalendarEvent` (JS entry points in `native/notification.ts`). `presentCalendarEvent` presents a generic `EventKitUI` editor; title/location/description/alarm arrive from React Native.
- iOS 16.2–25 can start ActivityKit when the reminder time is already reached; future reminder times use a scheduled local notification and create the activity only if the host receives that notification while foregrounded or the user opens it. iOS 26+ can schedule the ActivityKit start time directly, with an alert configuration. A background guarantee for older iOS versions is not claimed.

## Native — Android

`ReminderScheduler.kt` schedules a host-owned alarm and then posts one ongoing notification for the reminder. On Android 16 it uses `ProgressStyle`; where `Notification.Builder.setRequestPromotedOngoing(true)` is available (Android API 36.1+), it requests system promotion so eligible devices can present the notification as a Live Update. The manifest declares `POST_PROMOTED_NOTIFICATIONS`; this is not a runtime permission. Android API 36.0 and earlier use the ordinary ongoing-notification presentation. OS eligibility, notification permission, user settings, and OEM policy can still prevent promotion, so the API result reports the requested surface rather than guaranteeing system presentation.

`ReminderReceiver` / `ReminderBootReceiver` (manifest) deliver and restore alarms across reboot. The notification expires at the event end and cancellation removes both alarms, notification, and stored reminder metadata. `CalendarEventLauncher.kt` remains a separate generic calendar insert intent (`CalendarContract`); title/location/description/alarm arrive from React Native.

The public reminder and calendar request uses generic `id`, `title`, and optional `location` fields. Product-specific names are not part of the native contract. The JS adapter maps public `input` to the native `targetInput` field so both native parsers receive the same routing payload.

## JS contract — `src/native/specs/NativeNotification.ts` + `src/native/notification.ts` + `src/notification/types.ts`

```ts
ReminderRequest { id, title, body?, startAtMs, endAtMs, location?, channelId?, channelName?, category?, targetAppId?, entrypointId?, input? }
NativeReminderRequest = ReminderRequest & { reminderAtMs } // reminderAtMs = startAtMs - reminderLeadMs
ReminderResult { status: scheduled|active|permission_denied|unavailable|failed, surface: ios_live_activity|android_live_update|ongoing_notification|local_notification|null, reminderAtMs, activityId }
CalendarEventRequest = ReminderRequest & { description?, alarmMinutes? } → CalendarEventResult { status: presented|unavailable|failed }
```

- `NotificationModule.scheduleReminder(requestJson)` — iOS checks `areActivitiesEnabled`; iOS 26+ can schedule a future ActivityKit start, while earlier versions start immediately or use the local-notification path above. Android schedules an alarm and reports `android_live_update` only when it can request promotion, otherwise `ongoing_notification` (POST_NOTIFICATIONS gate on Android 13+).
- `cancelReminder(id)` ends the activity / cancels the alarm and removes stored state.
- `presentCalendarEvent` uses `EventKitUI` (iOS) or `CalendarContract` (Android) — separate from Live Activity, user confirms in the calendar app. Both platforms resolve `presented` once the host has launched the editor; they do not report whether the user later saves or cancels.
- `NotificationService.scheduleReminder` composes copy/routing in React Native (`body` defaults to `<title> · <location>`), validates bounds, checks/requests permission, then calls native. `reminderLeadMs` (default 1h) lives in `appConfig.notification` so signed host config can change it.

Tracking: badminton example emits `booking_reminder_scheduled` / `booking_reminder_cancelled` and `calendar_add_requested` / `calendar_add_completed` (allowlisted mini-app events, no PII).

## Flow

```
User books slot in example mini-app → host creates booking (host-mediated, no mini-app token)
  → JS calls scheduleReminder({id, startAtMs, endAtMs, title, location}) → native starts/schedules the iOS Live Activity or schedules the Android reminder alarm
  → system shows the iOS Lock Screen / Dynamic Island countdown; Android posts a promoted Live Update when supported and eligible, with an ongoing-notification fallback
  → on cancel (e.g. booking_cancelled) → JS calls cancelReminder(id) → native ends activity / cancels alarm
  → reminder delivery flows through notification receive/click pipeline; iOS Live Activity tap uses host-owned validated URL into the same click/inbox path
```

## Testing

- `notificationService.test.ts` covers `scheduleReminder` → `scheduled` with exact `reminderAtMs`, generic copy composition, oversized-body rejection, idempotent cancel, and `presentCalendarEvent` validation before native.
- Manual: schedule → lock screen shows countdown → background/foreground → update → cancel → activity dismissed. Test on iOS 16.2+ device (simulator supports Live Activity but not Dynamic Island) and Android 13+ (notification permission) / Android 16+ (Live Update treatment).

## Adding a new Live Activity type

1. New `ActivityAttributes` struct for the new domain — do not overload `ReminderActivityAttributes` with product fields.
2. Coordinator per type — do not share `ReminderLiveActivityCoordinator` singletons across domains.
3. JS port `schedule<New>Reminder` in `native/notification.ts` + `notification/types.ts` — keep payload bounded and validated on both sides.
4. Gate via `areActivitiesEnabled` and `human-gate` — Live Activity is a native capability per `mobile-architecture` (unspoofable surface, gesture-critical lifecycle).

*This is a host-owned reminder surface; mini-app code does not call ActivityKit or Android notification APIs directly. Platform Live Activity support does not itself create a mini-app bridge capability.*
