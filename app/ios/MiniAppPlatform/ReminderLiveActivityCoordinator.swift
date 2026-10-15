import ActivityKit
import Foundation
import UserNotifications

/// Generic reminder Live Activity + local-notification fallback.
/// Mechanism only: timing, persistence (via UNUserNotificationCenter),
/// presentation of RN-supplied copy, and teardown. Product copy, category,
/// and target routing all arrive in the payload from React Native.
private struct ReminderPayload: Decodable {
  let id: String
  let title: String
  let body: String
  let reminderAtMs: Double
  let startAtMs: Double
  let endAtMs: Double
  let category: String?
  let targetAppId: String?
  let entrypointId: String?
  let targetInput: TargetInput?

  enum CodingKeys: String, CodingKey {
    case id
    case title
    case body
    case location
    case reminderAtMs
    case startAtMs
    case endAtMs
    case category
    case targetAppId
    case entrypointId
    case targetInput
  }

  /// Small string map forwarded into the notification target input.
  /// Accepts either an object or a JSON-encoded string of one; anything else
  /// falls back to {"reminder_id": <id>} at use sites, never a failure.
  struct TargetInput: Decodable {
    let values: [String: String]

    init(from decoder: Decoder) throws {
      let container = try decoder.singleValueContainer()
      if let dict = try? container.decode([String: String].self) {
        values = dict
        return
      }
      if let raw = try? container.decode(String.self),
         let data = raw.data(using: .utf8),
         let dict = try? JSONDecoder().decode([String: String].self, from: data) {
        values = dict
        return
      }
      throw DecodingError.typeMismatch(
        [String: String].self,
        DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "targetInput must be a string map or JSON string map")
      )
    }

    init(values: [String: String]) {
      self.values = values
    }
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decodeIfPresent(String.self, forKey: .id) ?? ""
    title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
    let location = try container.decodeIfPresent(String.self, forKey: .location) ?? ""
    let explicitBody = try container.decodeIfPresent(String.self, forKey: .body) ?? ""
    if !explicitBody.isEmpty {
      body = explicitBody
    } else if let location, !location.isEmpty, !title.isEmpty {
      body = "\(title) · \(location)"
    } else {
      body = title
    }
    reminderAtMs = try container.decodeIfPresent(Double.self, forKey: .reminderAtMs) ?? 0
    startAtMs = try container.decodeIfPresent(Double.self, forKey: .startAtMs) ?? 0
    endAtMs = try container.decodeIfPresent(Double.self, forKey: .endAtMs) ?? 0
    category = try container.decodeIfPresent(String.self, forKey: .category)
    targetAppId = try container.decodeIfPresent(String.self, forKey: .targetAppId)
    entrypointId = try container.decodeIfPresent(String.self, forKey: .entrypointId)
    targetInput = try container.decodeIfPresent(TargetInput.self, forKey: .targetInput)
  }

  var reminderAt: Date { Date(timeIntervalSince1970: reminderAtMs / 1000) }
  var startAt: Date { Date(timeIntervalSince1970: startAtMs / 1000) }
  var endAt: Date { Date(timeIntervalSince1970: endAtMs / 1000) }

  var effectiveCategory: String { category?.isEmpty == false ? category! : "scheduled_reminder" }

  var isValid: Bool {
    let titleLength = (title as NSString).length
    let bodyLength = (body as NSString).length
    let identifier = id.range(
      of: #"^[A-Za-z0-9._:-]{1,160}$"#,
      options: .regularExpression
    ) != nil
    let categoryOk = effectiveCategory.range(
      of: #"^[A-Za-z0-9._:-]{1,80}$"#,
      options: .regularExpression
    ) != nil
    let targetOk: Bool = {
      switch (targetAppId, entrypointId) {
      case (nil, nil):
        return true
      case let (app?, entry?):
        return app.range(of: #"^[A-Za-z0-9._:-]{1,100}$"#, options: .regularExpression) != nil
          && entry.range(of: #"^[A-Za-z0-9._:-]{1,100}$"#, options: .regularExpression) != nil
      default:
        return false
      }
    }()
    return identifier &&
      categoryOk &&
      targetOk &&
      startAt > Date() &&
      endAt > startAt &&
      endAt.timeIntervalSinceNow <= 366 * 24 * 60 * 60 &&
      reminderAt < startAt &&
      !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && titleLength <= 100 &&
      !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && bodyLength <= 600
  }
}

enum ReminderLiveActivityCoordinator {
  private static let notificationPrefix = "reminder-"

  @available(iOS 16.2, *)
  private static func attributes(
    _ payload: ReminderPayload
  ) -> ReminderActivityAttributes {
    ReminderActivityAttributes(
      reminderId: payload.id,
      title: payload.title,
      body: payload.body
    )
  }

  @available(iOS 16.2, *)
  private static func content(
    _ payload: ReminderPayload
  ) -> ActivityContent<ReminderActivityAttributes.ContentState> {
    ActivityContent(
      state: .init(
        reminderAt: payload.reminderAt,
        startAt: payload.startAt,
        endAt: payload.endAt
      ),
      staleDate: payload.endAt,
      relevanceScore: 1
    )
  }

  static func schedule(
    requestJSON: String,
    resolve: @escaping ([String: Any]) -> Void
  ) {
    guard let data = requestJSON.data(using: .utf8),
          let payload = try? JSONDecoder().decode(ReminderPayload.self, from: data),
          payload.isValid else {
      resolve(result(status: "failed", reminderAtMs: 0))
      return
    }

    Task {
      await endActivity(reminderId: payload.id)
      if #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled {
        do {
          let activity: Activity<ReminderActivityAttributes>
          if #available(iOS 26.0, *) {
            activity = try Activity.request(
              attributes: attributes(payload),
              content: content(payload),
              pushType: nil,
              style: .standard,
              alertConfiguration: AlertConfiguration(
                title: LocalizedStringResource(stringLiteral: payload.title),
                body: LocalizedStringResource(stringLiteral: payload.body),
                sound: .default
              ),
              start: max(payload.reminderAt, Date())
            )
            resolve(result(
              status: payload.reminderAt <= Date() ? "active" : "scheduled",
              surface: "ios_live_activity",
              reminderAtMs: payload.reminderAtMs,
              activityId: activity.id
            ))
            return
          } else if payload.reminderAt <= Date() {
            if #available(iOS 18.0, *) {
              activity = try Activity.request(
                attributes: attributes(payload),
                content: content(payload),
                pushType: nil,
                style: .standard
              )
            } else {
              activity = try Activity.request(
                attributes: attributes(payload),
                content: content(payload),
                pushType: nil
              )
            }
            resolve(result(
              status: "active",
              surface: "ios_live_activity",
              reminderAtMs: payload.reminderAtMs,
              activityId: activity.id
            ))
            return
          }
        } catch {
          // A local notification remains the dependable fallback.
        }
      }

      let scheduled = await scheduleLocalNotification(payload)
      resolve(result(
        status: scheduled ? "scheduled" : "failed",
        surface: scheduled ? "local_notification" : nil,
        reminderAtMs: payload.reminderAtMs
      ))
    }
  }

  static func cancel(reminderId: String) async {
    let identifier = notificationPrefix + reminderId
    UNUserNotificationCenter.current().removePendingNotificationRequests(
      withIdentifiers: [identifier]
    )
    UNUserNotificationCenter.current().removeDeliveredNotifications(
      withIdentifiers: [identifier]
    )
    await endActivity(reminderId: reminderId)
  }

  /// Starts an activity from a delivered notification. The notification must
  /// carry the generic `live_activity` marker plus the reminder fields —
  /// the AppDelegate checks the marker, never a product category string.
  static func startFromNotification(_ userInfo: [AnyHashable: Any]) {
    guard #available(iOS 16.2, *),
          ActivityAuthorizationInfo().areActivitiesEnabled,
          userInfo["live_activity"] as? Bool == true,
          let id = userInfo["reminder_id"] as? String,
          let title = userInfo["reminder_title"] as? String,
          let body = userInfo["reminder_body"] as? String,
          let reminderAtMs = userInfo["reminder_at_ms"] as? Double,
          let startAtMs = userInfo["start_at_ms"] as? Double,
          let endAtMs = userInfo["end_at_ms"] as? Double else {
      return
    }
    guard let data = try? JSONSerialization.data(withJSONObject: [
      "id": id,
      "title": title,
      "body": body,
      "reminderAtMs": reminderAtMs,
      "startAtMs": startAtMs,
      "endAtMs": endAtMs,
      "category": userInfo["category"] as? String ?? "scheduled_reminder",
    ]),
          let payload = try? JSONDecoder().decode(ReminderPayload.self, from: data),
          payload.endAt > Date(),
          !Activity<ReminderActivityAttributes>.activities.contains(
            where: { $0.attributes.reminderId == id }
          ) else {
      return
    }
    do {
      if #available(iOS 18.0, *) {
        _ = try Activity.request(
          attributes: attributes(payload),
          content: content(payload),
          pushType: nil,
          style: .standard
        )
      } else {
        _ = try Activity.request(
          attributes: attributes(payload),
          content: content(payload),
          pushType: nil
        )
      }
    } catch {
      return
    }
  }

  static func validatesActivityLink(
    reminderId: String,
    title: String,
    body: String,
    startAtMs: Double,
    endAtMs: Double
  ) -> Bool {
    guard #available(iOS 16.2, *) else { return false }
    return Activity<ReminderActivityAttributes>.activities.contains { activity in
      let state = activity.content.state
      return activity.attributes.reminderId == reminderId &&
        activity.attributes.title == title &&
        activity.attributes.body == body &&
        abs(state.startAt.timeIntervalSince1970 * 1000 - startAtMs) < 1 &&
        abs(state.endAt.timeIntervalSince1970 * 1000 - endAtMs) < 1
    }
  }

  private static func scheduleLocalNotification(
    _ payload: ReminderPayload
  ) async -> Bool {
    let content = UNMutableNotificationContent()
    content.title = payload.title
    content.body = payload.body
    content.sound = .default
    content.categoryIdentifier = payload.effectiveCategory
    var userInfo: [AnyHashable: Any] = [
      "notification_id": notificationPrefix + payload.id,
      "dedupe_key": notificationPrefix + payload.id,
      "category": payload.effectiveCategory,
      "title": payload.title,
      "body": payload.body,
      "created_at_ms": Date().timeIntervalSince1970 * 1000,
      "expires_at_ms": payload.endAtMs,
      "live_activity": true,
      "reminder_id": payload.id,
      "reminder_title": payload.title,
      "reminder_body": payload.body,
      "reminder_at_ms": payload.reminderAtMs,
      "start_at_ms": payload.startAtMs,
      "end_at_ms": payload.endAtMs,
    ]
    if let appId = payload.targetAppId, let entry = payload.entrypointId {
      userInfo["target_app_id"] = appId
      userInfo["entrypoint_id"] = entry
      var input = payload.targetInput?.values ?? [:]
      if input.isEmpty {
        input = ["reminder_id": payload.id]
      }
      userInfo["target_input"] = input
    }
    content.userInfo = userInfo
    let delay = max(1, payload.reminderAt.timeIntervalSinceNow)
    let request = UNNotificationRequest(
      identifier: notificationPrefix + payload.id,
      content: content,
      trigger: UNTimeIntervalNotificationTrigger(
        timeInterval: delay,
        repeats: false
      )
    )
    do {
      try await UNUserNotificationCenter.current().add(request)
      return true
    } catch {
      return false
    }
  }

  private static func endActivity(reminderId: String) async {
    guard #available(iOS 16.2, *) else { return }
    for activity in Activity<ReminderActivityAttributes>.activities
      where activity.attributes.reminderId == reminderId {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  private static func result(
    status: String,
    surface: String? = nil,
    reminderAtMs: Double,
    activityId: String? = nil
  ) -> [String: Any] {
    [
      "status": status,
      "surface": surface ?? NSNull(),
      "reminderAtMs": reminderAtMs,
      "activityId": activityId ?? NSNull(),
    ]
  }
}
