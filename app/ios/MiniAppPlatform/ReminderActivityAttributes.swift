import ActivityKit
import Foundation

/// Generic reminder Live Activity attributes. All display copy arrives from
/// React Native; the shell only starts, updates, and ends the activity.
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
