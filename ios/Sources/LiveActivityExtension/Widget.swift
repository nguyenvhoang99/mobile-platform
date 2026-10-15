import SwiftUI
import WidgetKit
import ActivityKit
@main struct NativeReminderWidgets: WidgetBundle { var body: some Widget { NativeReminderWidget() } }
private func reminderURL(_ id: String) -> URL? { var components = URLComponents(); components.scheme = "mobile-native"; components.host = "reminder"; components.queryItems = [URLQueryItem(name: "reminder_id", value: id)]; return components.url }
struct NativeReminderWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ReminderActivityAttributes.self) { context in
            VStack(alignment: .leading) { Text(context.attributes.title).font(.headline); Text(context.attributes.body).font(.subheadline); Text(context.state.startAt, style: .relative).monospacedDigit() }.padding().activityBackgroundTint(Color(.systemBackground)).widgetURL(reminderURL(context.attributes.reminderId))
        } dynamicIsland: { context in
            DynamicIsland { DynamicIslandExpandedRegion(.leading) { Image(systemName: "bell") }; DynamicIslandExpandedRegion(.trailing) { Text(context.state.startAt, style: .relative) }; DynamicIslandExpandedRegion(.bottom) { Text(context.attributes.title + " · " + context.attributes.body) } } compactLeading: { Image(systemName: "bell") } compactTrailing: { Text(context.state.startAt, style: .relative).monospacedDigit() } minimal: { Image(systemName: "bell") }.widgetURL(reminderURL(context.attributes.reminderId))
        }
    }
}
