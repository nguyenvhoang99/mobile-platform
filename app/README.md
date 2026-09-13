# Native shell

This is the React Native host for the mini-app platform. It intentionally starts with a
small, host-owned surface: a configurable home page, a customizable glass navigation
bar, manifest-aware navigation contracts, and a durable host tracking plane.

## What is implemented

- iOS and Android React Native projects with the New Architecture enabled by the starter.
- A translucent, dependency-free navigation bar with a permanent Explore entry point.
  The left and right slots start empty: swipe Explore toward a side to choose a mini-app,
  then long press a populated slot to replace or remove it. Selections persist natively.
  The raised Explore entry always uses the `primary` palette token.
- Account is host-owned and opens from the top-right avatar rather than occupying a dock
  slot.
- Home begins with a profile-ordered category selector when age/sex data is available and
  a shuffled selector otherwise. A long press pins a category; after the first choice,
  Home shows only pinned mini-apps and categories plus an add-more action. Category taps
  open their mini-app list, where a long press pins an app above the category list. Home
  preferences persist in native storage, and profile fields never enter tracking data.
- `HomeCollection` and `HomeCollectionPickerModal` provide the shared constellation, rail,
  list, long-press, selected, and remove affordances for categories and mini-apps.
- A bilingual `Cầu lông / Badminton` mini-app is listed under `Thể thao / Sport`. Its demo
  flow supports filtering court slots by day, private or open bookings, joining games
  hosted by other players, and managing an owned booking's visibility and participants.
  Booking state is intentionally session-local until the platform has an authenticated
  mini-app backend/storage contract; the visible venues, people, prices, and slots are
  sample data.
- A deny-by-default navigation broker for declared mini-app routes and reviewed cross-app
  links. The current screens exercise the contract with verified-package placeholders;
  the future native WebView factory must enforce the same decisions at its boundary.
- A shared tracking collector for host and mini-app event declarations. Events receive
  host-derived identity and priority, append to a native JSONL journal, and are drained
  priority-first through an adaptive HTTP publisher. A gRPC streaming transport can be
  supplied through the same transport interface when sustained foreground volume makes
  it more efficient.
- Semantic app-wide palette tokens in `src/config/palette.ts`. Supply signed remote-config
  values through `appConfig` when product direction is settled; do not bake product copy or
  policy into native code.
- Shared layout, typography, and motion tokens for the host and future mini-app SDK. The
  safe mini-app snapshot excludes Liquid Glass, status-bar, scrim, and shadow tokens so
  untrusted content cannot imitate trusted shell chrome, and it can collapse motion when
  the system Reduce Motion preference is active.
- Host-native device access for Wi-Fi/cellular status, Face ID or fingerprint confirmation,
  coarse weather location, and microphone-backed speech-to-text. Requests are explicitly
  user-triggered from Account and raw values never reach a mini-app.
- A host-owned remote-notification pipeline: APNs on iOS, FCM on Android, a persisted
  inbox and unread badge, an in-app foreground banner, validated notification-to-mini-app
  routing, and durable receipt/click/visible-impression tracking.
- Host-owned live notification surfaces for confirmed badminton bookings: an ActivityKit
  Live Activity on iOS, a promoted ongoing Live Update on Android 16+, and ordinary local
  notification/countdown fallbacks. When a live surface is unavailable, the host offers a
  confirmed “Add to Calendar” handoff with the booking details and a one-hour reminder.
  The booking flow defaults to a one-hour reminder, exposes its state in “Lịch của tôi,”
  and cancels host-managed native work with the booking.
- Mini-app frame and account placeholders that make no promise of executable third-party
  content before the package, bridge, and admission layers are implemented.

## Mini-app standards

The [mini-app platform standard](docs/mini-app-platform-standard.md) defines the shared
privacy request lifecycle, trusted-host boundaries, semantic palette, component behavior,
motion vocabulary, accessibility, localization, data handling, review, and enforcement
rollout. It is an implementation standard rather than a published SDK contract: the
capability registry is intentionally empty until the origin-bound native container and
three-gate enforcement ship.

## Tracking configuration

`src/config/appConfig.ts` owns the local seam for signed remote configuration. Set the
tracking endpoint there to enable publishing; without an endpoint the durable queue stays
local. Size, count, and wait thresholds follow `policy/budgets.md` and should move through
signed remote config rather than mini-app input.

Mini-app event names, versions, priorities, and permitted data keys are declared in
`src/miniapps/catalog.ts`. Callers never provide `user_id`, `mini_app_id`, priority, or
network state. Anonymous identifiers are separately persisted per mini-app so the client
does not create a cross-tenant identifier.

The shell emits host-owned interaction events for `app_started`, `screen_viewed`,
`navigation_opened`, `navigation_bar_clicked`, `navigation_customization_requested`,
`dock_slot_changed`, `entrypoint_clicked`, `mini_app_opened`, `mini_app_closed`,
`mini_app_route_viewed`, and device-access request/result transitions. Home, the mini-app
picker, notification inbox, and mini-app pages emit `screen_scroll_depth` or
`mini_app_scroll_depth` only at 25/50/75/100% milestones once per view; no per-frame scroll
events are queued. All event payload keys are allowlisted in
`src/tracking/trackingService.ts`, and the host never records location values, voice
transcripts, notification content, or network identifiers in these interaction events.

## Remote notification configuration

The native shell owns push tokens and payload handling. Mini-apps never receive a token or
an unvalidated push payload.

For iOS, select the `MiniAppPlatform` target in Xcode, choose your Apple development team,
and ensure the **Push Notifications** capability and **Remote notifications** background
mode are enabled for the target's App ID. The source already contains the APNs registration,
foreground delegate, tap delegate, and entitlement wiring. Validate production token
registration with a signed physical-device build; the simulator remains useful for
injected notification payload tests.

For Android, add the Firebase project's `google-services.json` to `android/app/`. The
Google Services plugin is applied only when that file exists, so contributors without
production Firebase configuration can still work on the project. Android uses data
messages so the native host can persist every received item and decide between an in-app
banner and a system notification. Include `title` and `body` in the data payload rather
than relying only on FCM's notification block. Background notification-block messages use
Firebase's launcher intent and therefore do not carry the host's per-install tap
authenticator; use data messages for notification-to-mini-app routing.

Set `notifications.registrationEndpoint` in `src/config/appConfig.ts` from signed remote
configuration. The host posts `{ provider, token, host_app_version }` to that endpoint;
the authenticated backend should associate the token with the current user and replace
stale tokens.

The shared payload contract is:

```json
{
  "notification_id": "weather-alert-123",
  "dedupe_key": "rain-district-1-2026-08-06",
  "category": "weather_update",
  "title": "Rain nearby",
  "body": "Rain is expected in 20 minutes.",
  "created_at_ms": 1785983400000,
  "expires_at_ms": 1785987000000,
  "target_app_id": "weather",
  "entrypoint_id": "forecast",
  "target_input": { "area": "current" }
}
```

Android FCM data values are strings, so send `target_input` as a JSON-encoded string. iOS
may include it as a dictionary alongside `aps`. Unknown, oversized, expired, partially
declared, or undeclared navigation targets never enter a mini-app and are rejected before
navigation.

Tracking emits these host-owned events:

- `notification_received` when the shell first observes a validated notification ID.
- `notification_clicked` for system-notification, foreground-banner, or inbox taps.
- `notification_inbox_seen` with the deduplicated `notification_ids` that stayed at least
  60% visible for 500 ms while scrolling, batched by the configured limit.
- `notification_inbox_opened` with the unread count at open time.

`notification_received` means the application observed the payload. Neither APNs nor FCM
guarantees an app callback at the moment a visible notification is delivered while the app
is terminated, so provider delivery reporting remains a backend metric; a later tap still
causes the host to persist and track the item before tracking the click.

## Badminton live reminder

The badminton mini-app requests a booking-specific outcome from the host; it does not get
generic access to alarms, notifications, or ActivityKit. The host validates the booking ID,
court copy, and future timestamps, requests notification permission from the user gesture,
then schedules the reminder for exactly 60 minutes before play. The lead time lives in
`src/config/appConfig.ts` so signed host configuration can change it later.

On iOS 26+, ActivityKit schedules the Live Activity and its alert even when the app is no
longer running. On iOS 16.2–18, a future booking uses a local notification because those OS
versions cannot locally schedule a future Live Activity; opening or foreground-receiving
that reminder starts the Live Activity when the device permits it. Older iOS versions keep
the local-notification fallback. The `BadmintonLiveActivityExtension` target renders the
Lock Screen and Dynamic Island countdown, and `NSSupportsLiveActivities` is enabled in the
host Info.plist.

On Android, `AlarmManager.setAndAllowWhileIdle` schedules an intentionally inexact reminder
without requesting the restricted exact-alarm permission. Android 16 uses `ProgressStyle`
and requests promoted ongoing treatment; earlier versions render the same chronometer as an
ongoing notification. The future booking metadata is host-private, survives reboot, and is
removed at play end or when the user disables/cancels the reminder. Android still requires
a valid local SDK (`ANDROID_HOME` or `android/local.properties`) to compile.

Scheduling and cancellation emit allowlisted badminton events. Android and iOS fallback
reminder delivery flows through the existing notification receive/click pipeline. Tapping
an iOS Live Activity uses a host-owned, validated URL to enter the same click, inbox
deduplication, and mini-app target-validation path.

When the native schedule result is not an iOS Live Activity or Android Live Update, the
host asks whether to add the booking to the device calendar. Nothing is written silently.
On iOS, EventKitUI opens a prefilled editor with a 60-minute alarm and reports Save or
Cancel. On Android, the standard calendar insert intent opens a compatible calendar with
the booking prefilled; because that intent has no portable completion result and calendar
apps may ignore reminder extras, the UI reports only that Calendar was opened and asks the
user to verify the one-hour alert before saving. No broad calendar read/write permission is
requested. Calendar events are user-owned and therefore are not automatically removed when
the booking is cancelled. The mini-app emits `calendar_add_requested` and
`calendar_add_completed` without calendar account or event contents.

## Run

Install dependencies, then use one of the normal React Native commands:

```sh
npm install
npm run ios
# or
npm run android
```

Run `npm run typecheck`, `npm run lint`, and `npm test` before changing the shell.

## Next boundary

The next implementation unit remains the single native mini-app container, not a WebView
added to a screen. Follow the repository's `mini-app-runtime` and `container-wiring` guidance:
one factory, signed package verification before script execution, no WebView storage or
cookies, and native-owned navigation/splash/lifecycle. Only after that boundary exists
should `navigation.openMiniApp` and `analytics.track` be registered as mini-app bridge
capabilities; exposing them before a native origin-bound handler exists would violate the
registry-to-handler conformance rule.
