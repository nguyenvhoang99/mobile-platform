import EventKit
import EventKitUI
import Foundation
import React
import UIKit
import UserNotifications

/// Generic calendar-insert payload. Title, location, description, and alarm
/// lead time arrive from React Native; the shell only presents the editor.
private struct CalendarEventPayload: Decodable {
  let id: String
  let title: String
  let location: String
  let eventDescription: String
  let startAtMs: Double
  let endAtMs: Double
  let alarmMinutes: Int

  enum CodingKeys: String, CodingKey {
    case id
    case bookingId
    case title
    case courtName
    case location
    case venue
    case description
    case startAtMs
    case endAtMs
    case alarmMinutes
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    // Legacy keys (bookingId/courtName/venue) stay readable so payloads
    // composed by older RN builds keep working.
    id = (try container.decodeIfPresent(String.self, forKey: .id)
      ?? container.decodeIfPresent(String.self, forKey: .bookingId)) ?? ""
    title = (try container.decodeIfPresent(String.self, forKey: .title)
      ?? container.decodeIfPresent(String.self, forKey: .courtName)) ?? ""
    location = (try container.decodeIfPresent(String.self, forKey: .location)
      ?? container.decodeIfPresent(String.self, forKey: .venue)) ?? ""
    eventDescription = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
    startAtMs = try container.decodeIfPresent(Double.self, forKey: .startAtMs) ?? 0
    endAtMs = try container.decodeIfPresent(Double.self, forKey: .endAtMs) ?? 0
    alarmMinutes = try container.decodeIfPresent(Int.self, forKey: .alarmMinutes) ?? 60
  }

  var startAt: Date { Date(timeIntervalSince1970: startAtMs / 1000) }
  var endAt: Date { Date(timeIntervalSince1970: endAtMs / 1000) }

  var isValid: Bool {
    let identifier = id.range(
      of: #"^[A-Za-z0-9._:-]{1,160}$"#,
      options: .regularExpression
    ) != nil
    return identifier &&
      startAt > Date() &&
      endAt > startAt &&
      endAt.timeIntervalSinceNow <= 366 * 24 * 60 * 60 &&
      !title.isEmpty && title.count <= 100 &&
      !location.isEmpty && location.count <= 180 &&
      eventDescription.count <= 1000 &&
      (0...1440).contains(alarmMinutes)
  }
}

@objc(NotificationModule)
class NotificationModule: RCTEventEmitter, EKEventEditViewDelegate {
  // TEMP: remote push disabled on iOS until Apple Developer account / APNs key exists.
  // Mirrors JS flag in src/config/remotePush.ts. Local notifications remain enabled.
  // To re-enable: set to true and restore entitlements + Xcode push capability.
  private static let remotePushEnabled = false
  private static let pendingEventsKey = "notification.pending_events"
  private static let maxPendingEvents = 100
  private static weak var activeModule: NotificationModule?
  private static var registrationResolvers: [RCTPromiseResolveBlock] = []
  private static var currentToken: String?
  private var observing = false
  private var calendarEventResolver: RCTPromiseResolveBlock?
  private var calendarEventEditor: EKEventEditViewController?

  override init() {
    super.init()
    NotificationModule.activeModule = self
  }

  @objc
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["notificationEvent"]
  }

  override func startObserving() {
    observing = true
  }

  override func stopObserving() {
    observing = false
  }

  @objc(getPermissionStatus:reject:)
  func getPermissionStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      resolve(Self.permissionStatus(settings.authorizationStatus))
    }
  }

  @objc(requestPermission:reject:)
  func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound]
    ) { _, error in
      if let error {
        reject("NOTIFICATION_PERMISSION_FAILED", "Could not request notification permission.", error)
        return
      }
      UNUserNotificationCenter.current().getNotificationSettings { settings in
        resolve(Self.permissionStatus(settings.authorizationStatus))
      }
    }
  }

  @objc(registerForRemoteNotifications:reject:)
  func registerForRemoteNotifications(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    // TEMP: short-circuit — do not call UIApplication.registerForRemoteNotifications()
    // until APNs is configured. Returning unavailable prevents the OS prompt
    // and the "no valid aps-environment" code-signing error.
    if !Self.remotePushEnabled {
      resolve(Self.registration(status: "unavailable", token: nil))
      return
    }
    if let token = Self.currentToken {
      resolve(Self.registration(status: "registered", token: token))
      return
    }
    Self.registrationResolvers.append(resolve)
    DispatchQueue.main.async {
      UIApplication.shared.registerForRemoteNotifications()
    }
  }

  @objc(getPendingEvents:reject:)
  func getPendingEvents(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let events = Self.pendingEvents()
    guard JSONSerialization.isValidJSONObject(events),
          let data = try? JSONSerialization.data(withJSONObject: events),
          let json = String(data: data, encoding: .utf8) else {
      resolve("[]")
      return
    }
    resolve(json)
  }

  @objc(acknowledgeEvent:resolve:reject:)
  func acknowledgeEvent(
    _ nativeEventId: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let events = Self.pendingEvents().filter {
      ($0["native_event_id"] as? String) != nativeEventId
    }
    UserDefaults.standard.set(events, forKey: Self.pendingEventsKey)
    resolve(nil)
  }

  @objc(scheduleReminder:resolve:reject:)
  func scheduleReminder(
    _ requestJSON: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    ReminderLiveActivityCoordinator.schedule(requestJSON: requestJSON) { result in
      resolve(result)
    }
  }

  @objc(cancelReminder:resolve:reject:)
  func cancelReminder(
    _ id: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      await ReminderLiveActivityCoordinator.cancel(reminderId: id)
      resolve(nil)
    }
  }

  @objc(presentCalendarEvent:resolve:reject:)
  func presentCalendarEvent(
    _ requestJSON: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let data = requestJSON.data(using: .utf8),
          let payload = try? JSONDecoder().decode(
            CalendarEventPayload.self,
            from: data
          ),
          payload.isValid else {
      resolve(["status": "failed"])
      return
    }

    DispatchQueue.main.async {
      guard self.calendarEventResolver == nil else {
        resolve(["status": "failed"])
        return
      }
      guard let presenter = RCTPresentedViewController() else {
        resolve(["status": "unavailable"])
        return
      }

      let store = EKEventStore()
      let event = EKEvent(eventStore: store)
      event.title = payload.title
      event.startDate = payload.startAt
      event.endDate = payload.endAt
      event.location = payload.location
      event.notes = payload.eventDescription
      event.calendar = store.defaultCalendarForNewEvents
      event.addAlarm(EKAlarm(relativeOffset: Double(-60 * payload.alarmMinutes)))

      let editor = EKEventEditViewController()
      editor.eventStore = store
      editor.event = event
      editor.editViewDelegate = self
      // Keep the promise terminal: Save and Cancel both reach the delegate,
      // while an interactive swipe dismissal would not be portable across OS versions.
      editor.isModalInPresentation = true
      self.calendarEventResolver = resolve
      self.calendarEventEditor = editor
      presenter.present(editor, animated: true)
    }
  }

  func eventEditViewController(
    _ controller: EKEventEditViewController,
    didCompleteWith action: EKEventEditViewAction
  ) {
    let status: String
    switch action {
    case .saved:
      status = "saved"
    case .canceled, .deleted:
      status = "cancelled"
    @unknown default:
      status = "failed"
    }
    let resolve = calendarEventResolver
    calendarEventResolver = nil
    calendarEventEditor = nil
    controller.dismiss(animated: true) {
      resolve?(["status": status])
    }
  }

  static func handleDeviceToken(_ data: Data) {
    let token = data.map { String(format: "%02x", $0) }.joined()
    currentToken = token
    let resolvers = registrationResolvers
    registrationResolvers.removeAll()
    resolvers.forEach { $0(registration(status: "registered", token: token)) }
  }

  static func handleRegistrationFailure(_ error: Error) {
    let resolvers = registrationResolvers
    registrationResolvers.removeAll()
    resolvers.forEach { $0(registration(status: "failed", token: nil)) }
  }

  static func enqueue(
    type: String,
    userInfo: [AnyHashable: Any],
    appState: String,
    providerMessageId: String? = nil
  ) {
    let stringKeys = userInfo.reduce(into: [String: Any]()) { result, pair in
      result[String(describing: pair.key)] = pair.value
    }
    guard JSONSerialization.isValidJSONObject(stringKeys),
          let payloadData = try? JSONSerialization.data(withJSONObject: stringKeys),
          let payload = String(data: payloadData, encoding: .utf8) else {
      return
    }
    var event: [String: Any] = [
      "native_event_id": UUID().uuidString,
      "type": type,
      "payload": payload,
      "app_state": appState,
      "occurred_at_ms": Date().timeIntervalSince1970 * 1000,
    ]
    if let providerMessageId {
      event["provider_message_id"] = providerMessageId
    }
    var events = pendingEvents()
    events.append(event)
    if events.count > maxPendingEvents {
      events.removeFirst(events.count - maxPendingEvents)
    }
    UserDefaults.standard.set(events, forKey: pendingEventsKey)
    if let module = activeModule, module.observing {
      module.sendEvent(withName: "notificationEvent", body: event)
    }
  }

  private static func pendingEvents() -> [[String: Any]] {
    UserDefaults.standard.array(forKey: pendingEventsKey) as? [[String: Any]] ?? []
  }

  private static func permissionStatus(
    _ status: UNAuthorizationStatus
  ) -> String {
    switch status {
    case .authorized, .ephemeral:
      return "authorized"
    case .provisional:
      return "provisional"
    case .denied:
      return "denied"
    case .notDetermined:
      return "not_determined"
    @unknown default:
      return "unavailable"
    }
  }

  private static func registration(status: String, token: String?) -> [String: Any] {
    [
      "status": status,
      "provider": "apns",
      "token": token ?? NSNull(),
    ]
  }
}
