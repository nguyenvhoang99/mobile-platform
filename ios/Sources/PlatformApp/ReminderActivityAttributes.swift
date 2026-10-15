import ActivityKit
import Foundation

/// Generic reminder Live Activity attributes. Display copy is supplied by
/// the native host; the widget shares this immutable attributes type.
@available(iOS 16.1, *)
struct ReminderActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    let reminderAt: Date
    let startAt: Date
    let endAt: Date
  }

  let reminderId: String
  let title: String
  let body: String
}
