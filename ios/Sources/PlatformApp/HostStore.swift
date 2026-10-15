import SwiftUI
import PlatformCore
import os

@MainActor final class HostStore: ObservableObject {
    @Published var snapshot = Snapshot()
    @Published var navigator = Navigator()
    @Published var loaded = false
    @Published var message: String?
    @Published var account = false
    @Published var inboxOpen = false
    let catalog: Catalog
    let broker: PreviewBroker
    let journal: LocalJournal
    private let writer = DispatchQueue(label: "platform.snapshot", qos: .utility)
    private let file: URL
    private var revision = 0
    private var writable = true
    private let logger = Logger(subsystem: "com.miniappplatform.native", category: "performance")
    init() {
        logger.notice("process_start")
        do { catalog = try Catalog.load(Data(contentsOf: Bundle.main.url(forResource: "platform", withExtension: "json")!)) } catch { fatalError("Bundled native catalog is invalid") }
        broker = PreviewBroker(registry: catalog.capabilities)
        journal = LocalJournal(catalog: catalog)
        file = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("native-host-v1.json")
        logger.notice("native_init_done")
        let file = self.file
        writer.async {
            var restored = Snapshot(); var failureMessage: String?; var canWrite = true
            if FileManager.default.fileExists(atPath: file.path) {
                do { let size = try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber; guard (size?.intValue ?? Int.max) < 4_000_000 else { throw CocoaError(.fileReadCorruptFile) }; let data = try Data(contentsOf: file); guard data.count < 4_000_000 else { throw CocoaError(.fileReadCorruptFile) }; restored = try JSONDecoder().decode(Snapshot.self, from: data); guard restored.version == 1 else { throw CocoaError(.fileReadCorruptFile) } }
                catch { do { try FileManager.default.copyItem(at: file, to: file.appendingPathExtension("recovery-\(UUID().uuidString)")); failureMessage = "Dữ liệu cũ không đọc được; đã giữ bản khôi phục trên máy." } catch { canWrite = false; failureMessage = "Không đọc được dữ liệu cũ. Chưa ghi đè bản gốc." } }
            }
            let state = restored; let failure = failureMessage; let writable = canWrite
            DispatchQueue.main.async { var normalized = state; normalized.normalize(catalog: self.catalog); self.snapshot = normalized; self.writable = writable; self.message = failure; self.loaded = true; self.track("app_started"); self.logger.notice("first_meaningful_frame") }
        }
    }
    var tenant: Tenant { catalog.tenant(snapshot.tenantId) }
    var apps: [AppManifest] { tenant.featuredAppIds.compactMap(catalog.app) }
    var preferences: Preferences { snapshot.preferences[snapshot.tenantId] ?? Preferences() }
    var inbox: [InboxItem] { snapshot.inbox[snapshot.tenantId] ?? [] }
    var unread: Int { inbox.filter { !$0.seen }.count }
    func persist() {
        guard writable else { message = "Chưa ghi đè dữ liệu cũ. Cần khôi phục bản gốc trước khi lưu."; return }; revision += 1; let current = revision; let state = snapshot; let file = self.file
        writer.async {
            do { try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true); let data = try JSONEncoder().encode(state); try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
            catch { DispatchQueue.main.async { if current == self.revision { self.message = "Thay đổi chưa lưu được trên máy. Kiểm tra dung lượng và thử lại." } } }
        }
    }
    func editPreferences(_ edit: (inout Preferences) -> Void) { var p = preferences; edit(&p); p.customized = true; p.normalize(catalog: catalog, tenant: snapshot.tenantId); snapshot.preferences[snapshot.tenantId] = p; persist() }
    func switchTenant(_ id: String) { navigator.close(); account = false; snapshot.tenantId = catalog.tenant(id).id; persist() }
    func track(_ name: String, _ data: [String: String] = [:]) { let tenant = snapshot.tenantId; Task { await journal.record(name, tenant: tenant, data: data) } }
    func open(_ id: String) { logger.notice("miniapp_tap"); track("mini_app_opened", ["mini_app_id": id, "entrypoint_id": "root", "source": "native_host"]); account = false; if !navigator.open(id, catalog: catalog, tenant: snapshot.tenantId) { message = "Tiện ích chưa có ở khu vực này." } }
    func navigate(_ path: String) { if !navigator.navigate(path, catalog: catalog) { message = "Trang chưa được khai báo." } }
    func cross(_ id: String) { if !navigator.cross(id, catalog: catalog, tenant: snapshot.tenantId) { message = "Liên kết chưa được cấp quyền." } }
    func activate(_ item: InboxItem) { inboxOpen = false; if !navigator.notification(item, catalog: catalog, tenant: snapshot.tenantId) { message = "Thông báo không có đích hợp lệ hoặc đã hết hạn." } }
    func markSeen() { snapshot.inbox[snapshot.tenantId] = inbox.map { var item = $0; item.seen = true; return item }; persist() }
    func receive(_ item: InboxItem, tenantId: String) {
        guard catalog.tenants.contains(where: { $0.id == tenantId }) else { return }
        var items = snapshot.inbox[tenantId, default: []]; guard !items.contains(where: { $0.id == item.id }) else { return }; items.insert(item, at: 0); snapshot.inbox[tenantId] = Array(items.prefix(catalog.config.notification.maxInboxItems)); persist(); Task { await journal.record("notification_received", tenant: tenantId, data: ["notification_id": item.id, "category": "host", "app_state": "unknown"]) }
    }
}
