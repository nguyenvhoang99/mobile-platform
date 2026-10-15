import SwiftUI
import UserNotifications
import EventKit
import EventKitUI
import ActivityKit

@MainActor final class NotificationService: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()
    @Published var registration = "Chưa đăng ký APNs"
    @Published var permission = "Chưa kiểm tra"
    weak var store: HostStore?
    private var pending: [(InboxItem, String, Bool)] = []
    private var pendingRemote: [(InboxItem, String?, Bool)] = []
    private var pendingActivityURL: URL?
    private var pendingExpenseTenant: String?
    private var epochs: [String: Int] = [:]
    private var liveEpochs: [String: Int] = [:]
    override init() { super.init(); UNUserNotificationCenter.current().delegate = self }
    func connect(_ store: HostStore) { self.store = store; UNUserNotificationCenter.current().delegate = self; for (item, tenant, opened) in pending { store.receive(item, tenantId: tenant); if opened { store.inboxOpen = true } }; pending = []; for (item, tenant, opened) in pendingRemote { applyRemote(item, tenant: tenant, opened: opened) }; pendingRemote = []; if let url = pendingActivityURL { pendingActivityURL = nil; openActivity(url) }; if let tenant = pendingExpenseTenant { pendingExpenseTenant = nil; openExpense(tenant) }; Task { await refreshPermission(); await ExpenseMonthlyDigestScheduler.refresh(tenants: store.catalog.tenants.map(\.id)) } }
    func refreshPermission() async { let settings = await UNUserNotificationCenter.current().notificationSettings(); permission = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional ? "Đã cho phép" : settings.authorizationStatus == .notDetermined ? "Chưa hỏi quyền" : "Đã từ chối — quản lý trong Cài đặt" }
    func requestPermission() async -> Bool { do { let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]); await refreshPermission(); return granted } catch { permission = "Không kiểm tra được quyền"; return false } }
    func schedule(slot: Slot, tenant: String) async -> String {
        guard let store, let interval = slot.interval(), interval.start > Date() else { return "Giờ mẫu đã qua. Chọn ngày khác." }
        let identifier = "\(tenant).\(slot.id)"; epochs[identifier, default: 0] += 1; let token = epochs[identifier]
        guard await requestPermission() else { return "Chưa có quyền thông báo. Bạn vẫn có thể thêm lịch." }
        let content = UNMutableNotificationContent(); content.title = "\(slot.courtName) · \(slot.startTime)"; content.body = slot.venue; content.sound = .default
        guard epochs[identifier] == token else { return "Đã hủy yêu cầu nhắc này." }; let fire = max(Date().addingTimeInterval(1), interval.start.addingTimeInterval(-Double(store.catalog.config.notification.reminderLeadMs) / 1000))
        content.userInfo = ["native_id": identifier, "tenant": tenant, "expires": interval.end.timeIntervalSince1970]
        do { try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: identifier, content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, fire.timeIntervalSinceNow), repeats: false))); if epochs[identifier] != token { UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier]); return "Đã hủy yêu cầu nhắc này." }; return "Đã đặt nhắc trên máy trước giờ chơi 1 giờ. Chưa phải xác nhận đã nhận thông báo." } catch { return "Chưa đặt được nhắc. Bạn có thể thêm lịch hệ thống." }
    }
    func registerAPNs() { UIApplication.shared.registerForRemoteNotifications(); registration = "Đang yêu cầu APNs; chưa có đăng ký backend." }
    func receiveRemote(_ userInfo: [AnyHashable: Any], opened: Bool) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: userInfo), let item = RemotePayload.parse(bytes) else { return }
        let tenant = userInfo["tenant_id"] as? String
        if let store, store.loaded { applyRemote(item, tenant: tenant, opened: opened) }
        else { pendingRemote.append((item, tenant, opened)); pendingRemote = Array(pendingRemote.suffix(200)) }
    }
    private func applyRemote(_ item: InboxItem, tenant: String?, opened: Bool) {
        guard let store else { return }; let targetTenant = tenant ?? store.snapshot.tenantId
        store.receive(item, tenantId: targetTenant)
        if opened { if targetTenant != store.snapshot.tenantId { store.message = "Thông báo thuộc khu vực khác. Chọn khu vực tương ứng để xem." }
            else if !store.navigator.notification(item, catalog: store.catalog, tenant: targetTenant) { store.inboxOpen = true } }
    }
    func openActivity(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false), components.scheme == "mobile-native", components.host == "reminder", components.path.isEmpty,
              let query = components.queryItems, query.count == 1, query[0].name == "reminder_id", let id = query[0].value, id.count <= 200 else { return }
        guard let store, store.loaded else { pendingActivityURL = url; return }
        // This fixed navigation-only shortcut stays useful if an expired widget remains visible.
        // It supplies no expense fields, grants, or arbitrary route; the current tenant owns the ledger.
        if id == store.snapshot.tenantId + ".manage-expense.quick", store.catalog.app("manage-expense") != nil {
            MiniAppWebController.launchAdvisorTenant = store.snapshot.tenantId; store.inboxOpen = false; store.open("manage-expense"); return
        }
        guard #available(iOS 16.2, *), let activity = Activity<ReminderActivityAttributes>.activities.first(where: { $0.attributes.reminderId == id && $0.activityState == .active }), activity.content.state.endAt > Date(),
              let tenant = store.catalog.tenants.first(where: { id.hasPrefix($0.id + ".") }) else { store.message = "Live Activity đã kết thúc hoặc không thuộc host hiện tại."; return }
        // OS-owned live activity supplies the content. URL never supplies title, time or authority.
        store.receive(InboxItem(id: id, title: activity.attributes.title, body: activity.attributes.body, expiresAt: activity.content.state.endAt), tenantId: tenant.id)
        if tenant.id == store.snapshot.tenantId { store.inboxOpen = true } else { store.message = "Lịch thuộc khu vực khác. Chọn khu vực tương ứng để xem." }
    }
    func expenseQuickAccess(tenant: String, enabled: Bool) async -> String {
        guard #available(iOS 16.2, *) else { return "Live Activity cần iOS 16.2 trở lên. Dùng nút Gợi ý thẻ trong app." }
        let id = tenant + ".manage-expense.quick"
        for activity in Activity<ReminderActivityAttributes>.activities where activity.attributes.reminderId == id { await activity.end(nil, dismissalPolicy: .immediate) }
        guard enabled else { return "Đã tắt lối tắt gợi ý thẻ." }
        guard let store, tenant == store.snapshot.tenantId, store.catalog.app("manage-expense") != nil, ActivityAuthorizationInfo().areActivitiesEnabled else { return "Live Activity chưa khả dụng. Dùng nút Gợi ý thẻ trong app." }
        let now = Date(); let end = now.addingTimeInterval(8 * 3600)
        do { _ = try Activity.request(attributes: ReminderActivityAttributes(reminderId: id, title: "Chọn thẻ trước khi thanh toán", body: "Chạm để nhập cửa hàng và số tiền"), content: ActivityContent(state: .init(reminderAt: now, startAt: now, endAt: end), staleDate: end), pushType: nil); return "Đã ghim lối tắt trong tối đa 8 giờ. Không hiển thị số tiền hoặc thông tin thẻ." } catch { return "Chưa tạo được Live Activity. Dùng nút Gợi ý thẻ trong app." }
    }
    func cancel(slot: Slot, tenant: String) async {
        let id = "\(tenant).\(slot.id)"; epochs[id, default: 0] += 1; liveEpochs[id, default: 0] += 1; UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id]); UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [id])
        if #available(iOS 16.2, *) { for activity in Activity<ReminderActivityAttributes>.activities where activity.attributes.reminderId == id { await activity.end(nil, dismissalPolicy: .immediate) } }
    }
    func live(slot: Slot, tenant: String) async -> String {
        guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled, let interval = slot.interval(), interval.end > Date() else { return "Live Activity chưa khả dụng hoặc giờ chơi đã qua. Dùng nhắc lịch." }
        let id = "\(tenant).\(slot.id)"; liveEpochs[id, default: 0] += 1; let token = liveEpochs[id]; for activity in Activity<ReminderActivityAttributes>.activities where activity.attributes.reminderId == id { await activity.end(nil, dismissalPolicy: .immediate) }
        guard liveEpochs[id] == token else { return "Đã hủy yêu cầu Live Activity này." }; do { _ = try Activity.request(attributes: ReminderActivityAttributes(reminderId: id, title: slot.courtName, body: slot.venue), content: ActivityContent(state: .init(reminderAt: Date(), startAt: interval.start, endAt: interval.end), staleDate: interval.end), pushType: nil); return "Đã mở Live Activity. Hoạt động có thể bị hệ thống giới hạn thời gian." } catch { return "Chưa mở được Live Activity. Dùng nhắc lịch." }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { Task { @MainActor in receive(notification.request, opened: false) }; completionHandler([.banner, .sound]) }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) { Task { @MainActor in receive(response.notification.request, opened: true) }; completionHandler() }
    private func openExpense(_ tenant: String) {
        guard let store, store.loaded else { pendingExpenseTenant = tenant; return }
        guard store.catalog.tenants.contains(where: { $0.id == tenant }) else { return }
        guard tenant == store.snapshot.tenantId else { store.message = "Báo cáo thuộc khu vực khác. Chọn khu vực tương ứng để xem."; return }
        store.inboxOpen = false; store.open("manage-expense")
    }
    private func receive(_ request: UNNotificationRequest, opened: Bool) {
        let content = request.content
        if content.userInfo["native_id"] == nil { receiveRemote(content.userInfo, opened: opened); return }
        guard let tenant = content.userInfo["tenant"] as? String, let id = content.userInfo["native_id"] as? String, id.count <= 200, content.title.count <= 100, content.body.count <= 600 else { return }
        if content.userInfo["app"] as? String == "manage-expense" { Task { await ExpenseMonthlyDigestScheduler.refresh(tenants: [tenant]) }; if opened { openExpense(tenant); return } }
        let item = InboxItem(id: id, title: content.title, body: content.body, expiresAt: (content.userInfo["expires"] as? Double).map { Date(timeIntervalSince1970: $0) })
        if let store, store.loaded { store.receive(item, tenantId: tenant); if opened { store.inboxOpen = true } } else { pending.append((item, tenant, opened)); pending = Array(pending.suffix(200)) }
    }
}
import PlatformCore
struct CalendarEditor: UIViewControllerRepresentable {
    let slot: Slot; let reminderLeadMs: Int; let completion: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion) }
    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let controller = EKEventEditViewController(); let store = EKEventStore(); controller.eventStore = store; controller.editViewDelegate = context.coordinator
        let event = EKEvent(eventStore: store); event.title = slot.courtName; event.location = slot.venue
        let interval = slot.interval(); event.startDate = interval?.start; event.endDate = interval?.end; event.addAlarm(EKAlarm(relativeOffset: -Double(reminderLeadMs) / 1000)); controller.event = event
        return controller
    }
    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}
    class Coordinator: NSObject, EKEventEditViewDelegate { let completion: (String) -> Void; init(_ completion: @escaping (String) -> Void) { self.completion = completion }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { completion(action == .saved ? "Đã lưu sự kiện bằng lịch hệ thống." : "Đã đóng lịch. Chưa lưu sự kiện mới.") }
    }
}

/** Replenish the OS month-end horizon whenever the host opens or receives a digest. */
@MainActor enum ExpenseMonthlyDigestScheduler {
    private static let key = "manage-expense-monthly-schedules-v1"
    static func remember(tenant: String, preferences: [String: Any]) {
        var values = UserDefaults.standard.dictionary(forKey: key) ?? [:]
        values[tenant] = preferences; UserDefaults.standard.set(values, forKey: key)
    }
    static func refresh(tenants: [String]) async {
        let center = UNUserNotificationCenter.current(); let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        let values = UserDefaults.standard.dictionary(forKey: key) ?? [:]
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        for tenant in tenants {
            guard let p = values[tenant] as? [String: Any], p["enabled"] as? Bool == true, (p["periods"] as? [String] ?? []).contains("month"), let hour = p["hour"] as? Int, let minute = p["minute"] as? Int, (0...23).contains(hour), (0...59).contains(minute) else { continue }
            let prefix = "expense-" + miniDigest(Data("\(tenant)/manage-expense".utf8))
            let old = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix(prefix + "-month-") }
            if old.count == 12 { continue }
            let ids = (0..<12).map { prefix + "-month-" + String($0) }
            do {
                let now = Date(); var added = 0; var offset = 0
                while added < 12 {
                    let month = calendar.date(byAdding: .month, value: offset, to: now)!; offset += 1
                    var last = calendar.dateComponents([.year, .month], from: month)
                    last.timeZone = calendar.timeZone; last.day = calendar.range(of: .day, in: .month, for: month)!.count; last.hour = hour; last.minute = minute
                    guard let fire = calendar.date(from: last), fire > now else { continue }
                    let content = UNMutableNotificationContent(); content.title = "Quản lý chi tiêu"; content.body = "Báo cáo tháng đã sẵn sàng. Mở sổ để xem."; content.sound = .default
                    content.userInfo = ["native_id": prefix + "-month", "tenant": tenant, "app": "manage-expense"]
                    try await center.add(UNNotificationRequest(identifier: ids[added], content: content, trigger: UNCalendarNotificationTrigger(dateMatching: last, repeats: false))); added += 1
                }
            } catch { center.removePendingNotificationRequests(withIdentifiers: ids); for request in old { try? await center.add(request) } }
        }
    }
}
