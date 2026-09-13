import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?
  // TEMP: remote push disabled on iOS until Apple Developer account / APNs key exists.
  // Mirrors JS flag in src/config/remotePush.ts and NotificationModule.remotePushEnabled.
  // Local notifications (reminders, calendar) still route through
  // userNotificationCenter:willPresent/didReceive — only the APNs registration
  // and background remote delivery are gated here.
  private let remotePushEnabled = false
  private var launchedFromRemoteNotification = false

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    launchedFromRemoteNotification = launchOptions?[.remoteNotification] != nil
    UNUserNotificationCenter.current().delegate = self
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "MiniAppPlatform",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    guard remotePushEnabled else { return }
    NotificationModule.handleDeviceToken(deviceToken)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    guard remotePushEnabled else { return }
    NotificationModule.handleRegistrationFailure(error)
  }

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    guard remotePushEnabled else {
      completionHandler(.noData)
      return
    }
    let state = application.applicationState == .active ? "foreground" : "background"
    NotificationModule.enqueue(
      type: "received",
      userInfo: userInfo,
      appState: state,
      providerMessageId: userInfo["provider_message_id"] as? String
    )
    completionHandler(.newData)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let userInfo = notification.request.content.userInfo
    NotificationModule.enqueue(
      type: "received",
      userInfo: userInfo,
      appState: "foreground",
      providerMessageId: userInfo["provider_message_id"] as? String
    )
    if userInfo["live_activity"] as? Bool == true {
      ReminderLiveActivityCoordinator.startFromNotification(userInfo)
      completionHandler([.banner, .list, .sound])
    } else {
      // The React Native host renders the ordinary foreground banner.
      completionHandler([])
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    NotificationModule.enqueue(
      type: "opened",
      userInfo: userInfo,
      appState: launchedFromRemoteNotification ? "terminated" : "background",
      providerMessageId: userInfo["provider_message_id"] as? String
    )
    if userInfo["live_activity"] as? Bool == true {
      ReminderLiveActivityCoordinator.startFromNotification(userInfo)
    }
    launchedFromRemoteNotification = false
    completionHandler()
  }

  func application(
    _ application: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    guard url.scheme == "miniappplatform",
          url.host == "reminder",
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return false
    }
    let query = components.queryItems?.reduce(into: [String: String]()) {
      result, item in
      if let value = item.value {
        result[item.name] = value
      }
    } ?? [:]
    // All display copy and routing arrive in the URL from the activity widget,
    // which renders RN-supplied content. The link is only honored when it
    // matches a currently live activity — a forged URL ends here.
    guard let reminderId = query["reminder_id"],
          !reminderId.isEmpty,
          let title = query["reminder_title"],
          !title.isEmpty,
          let body = query["reminder_body"],
          !body.isEmpty,
          let reminderAtMs = Double(query["reminder_at_ms"] ?? ""),
          let startAtMs = Double(query["start_at_ms"] ?? ""),
          let endAtMs = Double(query["end_at_ms"] ?? ""),
          endAtMs > Date().timeIntervalSince1970 * 1000,
          ReminderLiveActivityCoordinator.validatesActivityLink(
            reminderId: reminderId,
            title: title,
            body: body,
            startAtMs: startAtMs,
            endAtMs: endAtMs
          ) else {
      return false
    }
    var userInfo: [AnyHashable: Any] = [
      "notification_id": "reminder-\(reminderId)",
      "dedupe_key": "reminder-\(reminderId)",
      "category": query["category"] ?? "scheduled_reminder",
      "title": title,
      "body": body,
      "created_at_ms": Date().timeIntervalSince1970 * 1000,
      "expires_at_ms": endAtMs,
      "live_activity": true,
      "reminder_id": reminderId,
      "reminder_title": title,
      "reminder_body": body,
      "reminder_at_ms": reminderAtMs,
      "start_at_ms": startAtMs,
      "end_at_ms": endAtMs,
    ]
    if let targetAppId = query["target_app_id"],
       let entrypointId = query["entrypoint_id"],
       !targetAppId.isEmpty, !entrypointId.isEmpty {
      userInfo["target_app_id"] = targetAppId
      userInfo["entrypoint_id"] = entrypointId
      if let rawInput = query["target_input"],
         let data = rawInput.data(using: .utf8),
         let input = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
        userInfo["target_input"] = input
      } else {
        userInfo["target_input"] = ["reminder_id": reminderId]
      }
    }
    NotificationModule.enqueue(
      type: "opened",
      userInfo: userInfo,
      appState: application.applicationState == .active ? "foreground" : "terminated"
    )
    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
