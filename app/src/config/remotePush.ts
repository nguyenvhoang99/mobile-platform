/**
 * Remote push feature flag — TEMPORARY.
 *
 * iOS remote push (APNs) requires a paid Apple Developer account to obtain
 * an APNs key / provisioning profile with `aps-environment` entitlement.
 * Until that account exists we disable remote push on iOS only.
 *
 * What this flag controls:
 *  - JS: `registerForRemoteNotifications()` returns `unavailable` on iOS,
 *    and `NotificationService.start()` skips the register+upload step.
 *  - Native iOS: `NotificationModule.registerForRemoteNotifications` and
 *    `AppDelegate.didRegister* / didReceiveRemoteNotification` become no-ops.
 *
 * Local notifications (UNUserNotificationCenter schedule, badminton reminders,
 * calendar presentation) remain enabled — they use a different permission
 * (`requestPermission`) and do not require APNs.
 *
 * Android (FCM) is unaffected — `android: true`.
 *
 * To re-enable:
 *  1. Set `ios: true` here.
 *  2. In `ios/MiniAppPlatform/NotificationModule.swift` set `remotePushEnabled = true`.
 *  3. In `ios/MiniAppPlatform/AppDelegate.swift` set `remotePushEnabled = true`.
 *  4. Restore `ios/MiniAppPlatform/MiniAppPlatform.entitlements` `aps-environment`.
 *  5. Add push capability in Xcode Signing & Capabilities.
 */
export const REMOTE_PUSH_ENABLED = {
  ios: false,
  android: true,
} as const;
