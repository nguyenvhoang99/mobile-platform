import ActivityKit
import SwiftUI
import WidgetKit

/// Generic reminder Live Activity UI. All copy (title/body) arrives from
/// React Native via the activity attributes; the widget only renders it.
/// Tapping the activity deep-links back through the generic `reminder` host,
/// which the AppDelegate honors only for a currently live activity.
private func activityURL(
  _ context: ActivityViewContext<ReminderActivityAttributes>
) -> URL? {
  var components = URLComponents()
  components.scheme = "miniappplatform"
  components.host = "reminder"
  components.queryItems = [
    URLQueryItem(name: "reminder_id", value: context.attributes.reminderId),
    URLQueryItem(name: "reminder_title", value: context.attributes.title),
    URLQueryItem(name: "reminder_body", value: context.attributes.body),
    URLQueryItem(
      name: "reminder_at_ms",
      value: String(context.state.reminderAt.timeIntervalSince1970 * 1000)
    ),
    URLQueryItem(
      name: "start_at_ms",
      value: String(context.state.startAt.timeIntervalSince1970 * 1000)
    ),
    URLQueryItem(
      name: "end_at_ms",
      value: String(context.state.endAt.timeIntervalSince1970 * 1000)
    ),
  ]
  return components.url
}

@main
struct ReminderLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    ReminderLiveActivityWidget()
  }
}

struct ReminderLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ReminderActivityAttributes.self) { context in
      HStack(spacing: 14) {
        Text("🔔")
          .font(.title2)
          .frame(width: 40, height: 40)
          .background(.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 3) {
          Text(context.attributes.title)
            .font(.headline)
          Text(context.attributes.body)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        Text(
          timerInterval: context.state.reminderAt...context.state.startAt,
          countsDown: true
        )
          .font(.headline.monospacedDigit())
          .foregroundStyle(.tint)
      }
      .padding()
      .activityBackgroundTint(Color(.systemBackground))
      .activitySystemActionForegroundColor(.primary)
      .widgetURL(activityURL(context))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text("🔔")
            .font(.title2)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(
            timerInterval: context.state.reminderAt...context.state.startAt,
            countsDown: true
          )
            .font(.headline.monospacedDigit())
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title)
              .font(.subheadline.bold())
            Text(context.attributes.body)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      } compactLeading: {
        Text("🔔")
      } compactTrailing: {
        Text(
          timerInterval: context.state.reminderAt...context.state.startAt,
          countsDown: true
        )
          .monospacedDigit()
      } minimal: {
        Text("🔔")
      }
      .keylineTint(Color.accentColor)
      .widgetURL(activityURL(context))
    }
  }
}
