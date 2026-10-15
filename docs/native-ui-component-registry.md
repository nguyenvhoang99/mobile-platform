# Native UI Component Registry

**Status:** baseline inventory from source scan 2026-10-03  
**Scope:** native Swift app under `ios/` and native Kotlin app under `android/`.  
**Out of scope:** React Native host and bridge modules under `app/ios/` and `app/android/`.

This registry gives each cross-platform UI responsibility a stable ID and points to the
current implementation on each platform. IDs describe product meaning, not Swift/Kotlin
type names or visible copy. Keep an ID when implementation or copy changes; create a new ID
only when a distinct UI responsibility is introduced. One entry represents a screen or a
meaningful UI region, not every text label or system control.

The registry is a documentation baseline. It is not currently checked against the source by
CI and does not establish runtime parity. A `present` mapping means the implementation is
visible in source; it does not certify behavior, accessibility, or visual equivalence.

## Registry

| ID | Shared name / responsibility | iOS implementation | Android implementation | Mapping |
|---|---|---|---|---|
| `shell.root` | App root, initial loading, surface selection, modal routing | [`RootView`](../ios/Sources/PlatformApp/NativeApp.swift#L12) | [`MainActivity.onCreate` / `render`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L58) | present; platform composition differs |
| `shell.header` | Back, current title/tenant, close or inbox actions | [`RootView` toolbar](../ios/Sources/PlatformApp/NativeApp.swift#L26) | [`MainActivity.onCreate`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L67) | present; action placement differs |
| `shell.navigation.dock` | Home, two configurable shortcuts, Explore | [`RootView` bottom `HStack`](../ios/Sources/PlatformApp/NativeApp.swift#L35) | [`MainActivity.render`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L110) | present; shortcut editing gestures differ |
| `home.landing` | Home greeting, curated categories, pinned/recommended apps, account entry | [`HomeView`](../ios/Sources/PlatformApp/NativeApp.swift#L56) | [`MainActivity.homeRows`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L142) | present; information hierarchy differs |
| `home.app_row` | Launch a mini-app preview; pin/unpin affordance | [`AppRow`](../ios/Sources/PlatformApp/NativeApp.swift#L77) | [`MainActivity.appRow` / `RowsAdapter`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L94) | present; iOS uses context menu, Android uses row options |
| `home.customize` | Choose Home categories/apps and restore defaults | [`CustomizeView`](../ios/Sources/PlatformApp/NativeApp.swift#L82) | [`MainActivity.customize` / `toggleApp` / `toggleCategory`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L152) | present; form versus dialogs |
| `shell.dock_picker` | Select or remove one of the two dock shortcuts | [`RootView` shortcut picker sheet](../ios/Sources/PlatformApp/NativeApp.swift#L48) | [`MainActivity.dockPicker`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L161) | present; picker presentation differs |
| `explore.search` | Search available mini-app previews and show empty state | [`ExploreView`](../ios/Sources/PlatformApp/NativeApp.swift#L91) | [`MainActivity.explore`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L163) | present |
| `tenant.picker` | Pick a region manually or resolve from approximate location | [`TenantPicker`](../ios/Sources/PlatformApp/NativeApp.swift#L101) | [`MainActivity.tenantPicker`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L162) | present; selection UI differs |
| `miniapp.preview` | Display declared routes/links for a local mini-app preview | [`MiniAppView`](../ios/Sources/PlatformApp/NativeApp.swift#L112) | [`MainActivity.preview`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L167) | present; no external mini-app execution implied |
| `cards.search` | Search sample cards and benefits | [`CardsView`](../ios/Sources/PlatformApp/NativeApp.swift#L125) | [`MainActivity.cards`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L173) | present |
| `cards.detail` | Show one sample card and its benefit details | [`CardsView` detail branch](../ios/Sources/PlatformApp/NativeApp.swift#L125) | [`MainActivity.cards`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L173) | present |
| `notifications.inbox` | Notification permission state, inbox items, launch target | [`InboxView`](../ios/Sources/PlatformApp/NativeApp.swift#L143) | [`MainActivity.inbox`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L181) | present; date/permission detail differs |
| `account.device_access` | Host-only device access demos and notification settings | [`AccountView`](../ios/Sources/PlatformApp/NativeApp.swift#L153) | [`MainActivity.account`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L178) | present; controls differ by OS capability |
| `sample.booking` | Sample court list, date/filter controls, booking and participant actions | [`SampleView` booking section](../ios/Sources/PlatformApp/SampleView.swift#L4) | [`MainActivity.sample` / `slotActions`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L184) | present; interaction pattern differs |
| `sample.host_actions` | Host reminder, calendar, and live/ongoing activity actions for a sample booking | [`SampleView` booking actions / `showCalendar`](../ios/Sources/PlatformApp/SampleView.swift#L47) | [`MainActivity.slotActions`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L203) | platform-specific affordances; Android/iOS behavior is not identical |
| `sample.bridge_storage` | Sample note input and bridge storage read/write/delete controls | [`SampleView` storage section](../ios/Sources/PlatformApp/SampleView.swift#L57) | [`MainActivity.sample` / `storage`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L184) | present |
| `sample.bill_draft` | Manual bill draft inputs, consent prompt, review action | [`SampleView` bill section / `extract`](../ios/Sources/PlatformApp/SampleView.swift#L64) | [`MainActivity.sample` / `extract`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L184) | present; underlying AI extraction is unavailable in this PoC |
| `sample.status` | User-facing status and bridge/action feedback | [`SampleView` status section](../ios/Sources/PlatformApp/SampleView.swift#L43) | [`MainActivity.report`](../android/app/src/main/java/com/miniappplatform/nativehost/MainActivity.kt#L84) | present; Android status is shared at shell level |
| `calendar.editor` | System calendar event editor presented for a sample booking | [`CalendarEditor`](../ios/Sources/PlatformApp/Notifications.swift#L73) | System calendar UI launched through [`Reminders.calendar`](../android/app/src/main/java/com/miniappplatform/nativehost/Reminders.kt#L90) | platform-owned UI; not a shared in-app component |
| `reminder.live_activity` | Live reminder surface outside the app | [`NativeReminderWidget`](../ios/Sources/LiveActivityExtension/Widget.swift#L6) | Android notification surface in [`Reminders.display`](../android/app/src/main/java/com/miniappplatform/nativehost/Reminders.kt#L57) | platform-specific; no Android Live Activity counterpart |

## Cross-platform maintenance rules

- Before changing a native screen, find its registry ID and review both implementation links.
- When adding/removing a visible screen or meaningful region, update this table in the same
  change and classify the mapping as `present`, `platform-specific`, `gap`, or `not
  applicable` with a short reason.
- Keep product intent, key states, actions, and accessibility purpose aligned. The layouts
  may follow platform conventions; a visual difference alone is not a parity defect.
- Treat labels and Swift/Kotlin symbol names as implementation details. Do not derive stable
  IDs from either.
- If a source symbol moves, update its link. Android's current screen composition lives
  largely in `MainActivity.kt`; split it into dedicated views only when a product or
  maintenance change warrants that scope.
- Use `app/docs/ai-foundation/SKILLS.md` component contracts for behavior changes that affect
  state, actions, loading, accessibility, motion, recovery, or evidence. This inventory does
  not replace those contracts or policy sources.

## Test integration addition — 2026-10-04

| ID | Shared name / responsibility | iOS implementation | Android implementation | Mapping |
|---|---|---|---|---|
| `test.integration` | Test entry in Khác; Debug-only native integration hub | [`NativeTestView`](../ios/Sources/PlatformApp/NativeTestView.swift) | [`NativeTestScreen` Debug](../android/app/src/debug/java/com/miniappplatform/nativehost/NativeTestScreen.kt), [Release explanation](../android/app/src/release/java/com/miniappplatform/nativehost/NativeTestScreen.kt) | present; Test is a compiled host surface, not an external mini-app bridge |
| `test.integration.results` | Per-feature run/results/cancel, OS prerequisites and missing configuration | [`NativeTestDebugView` / `NativeTestServices`](../ios/Sources/PlatformApp/NativeTestView.swift) | [`NativeTestScreen`](../android/app/src/debug/java/com/miniappplatform/nativehost/NativeTestScreen.kt) | platform SDK availability differs; hardware acceptance pending |

Behavior, lifecycle and integration limits: [Test contract](../native/TEST-CONTRACT.md). The prior design-board snapshot predates these two IDs and is not an approved Test design.

## Scan limits

- The scan covered Swift/Kotlin application source and the iOS Live Activity widget in the
  root `ios/` and `android/` folders. It did not treat old React Native native modules under
  `app/` as part of these two native apps.
- The source files show mappings, but no device screenshots or manual platform acceptance
  were collected for this registry change.
- This baseline does not prove production readiness or machine-enforced cross-platform
  consistency.
