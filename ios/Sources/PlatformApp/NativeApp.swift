import SwiftUI
import PlatformCore
import EventKit

@main struct NativePlatformApp: App {
    @UIApplicationDelegateAdaptor(RemoteAppDelegate.self) private var appDelegate
    @StateObject private var host = HostStore()
    @StateObject private var notifications = NotificationService.shared
    var body: some Scene { WindowGroup { RootView().environmentObject(host).environmentObject(notifications).onChange(of: host.loaded) { loaded in if loaded { notifications.connect(host) } }.onAppear { if host.loaded { notifications.connect(host) } }.onOpenURL { notifications.openActivity($0) } } }
}
private extension Color { init(hex: String) { let n = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x3B5BDB; self.init(red: Double((n >> 16) & 255) / 255, green: Double((n >> 8) & 255) / 255, blue: Double(n & 255) / 255) } }
struct RootView: View {
    @EnvironmentObject var host: HostStore
    @EnvironmentObject var notifications: NotificationService
    @State private var explore = false
    @State private var tenants = false
    @State private var picker: Int?
    var body: some View {
        VStack(spacing: 0) {
            if host.loaded {
                NavigationView {
                    Group {
                        if host.account { AccountView() }
                        else if let frame = host.navigator.frames.last, let app = host.catalog.app(frame.appId) { MiniAppView(app: app, frame: frame).id(frame.id) }
                        else { HomeView() }
                    }
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) { if host.account || !host.navigator.frames.isEmpty { Button("Quay lại") { if host.account { host.account = false } else if MiniAppWebController.current?.back() != true { host.navigator.back() } }.accessibilityIdentifier("host.back") } else { Button(host.tenant.label) { tenants = true } } }
                        ToolbarItem(placement: .navigationBarTrailing) { if host.navigator.frames.last?.appId == "manage-expense" { Menu { Button("Ghim gợi ý thẻ trong 8 giờ") { let tenant = host.tenant.id; Task { host.message = await notifications.expenseQuickAccess(tenant: tenant, enabled: true) } }; Button("Tắt lối tắt") { let tenant = host.tenant.id; Task { host.message = await notifications.expenseQuickAccess(tenant: tenant, enabled: false) } } } label: { Image(systemName: "sparkles") }.accessibilityLabel("Lối tắt gợi ý thẻ") } }
                        ToolbarItem(placement: .navigationBarTrailing) { if !host.navigator.frames.isEmpty { Button("Đóng") { host.navigator.close() }.accessibilityIdentifier("host.close") } else { Button { host.inboxOpen = true } label: { Label("Thông báo \(host.unread)", systemImage: "bell") } } }
                    }
                }.navigationViewStyle(.stack)
                Divider()
                HStack(spacing: 8) {
                    Button { host.navigator.close(); host.account = false } label: { Label("Home", systemImage: "house") }.frame(maxWidth: .infinity)
                    ForEach(0..<2, id: \.self) { index in
                        let id = host.preferences.dock[index]
                        Menu {
                            if !id.isEmpty { Button("Mở \(host.catalog.app(id)?.name ?? id)") { host.open(id) } }
                            Button("Đổi lối tắt") { picker = index }
                            Button("Xóa lối tắt") { host.editPreferences { $0.dock[index] = "" } }
                        } label: { Text(host.catalog.app(id)?.shortName ?? "Lối tắt \(index + 1)").frame(maxWidth: .infinity).frame(minHeight: 48) }
                    }
                    Button { explore = true } label: { Label("Khám phá", systemImage: "square.grid.2x2") }.frame(maxWidth: .infinity)
                }.font(.caption).padding(.horizontal, 12)
            } else { ProgressView("Đang đọc dữ liệu trên máy…").frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .tint(Color(hex: host.tenant.accent))
        .sheet(isPresented: $explore) { ExploreView() }
        .sheet(isPresented: $tenants) { TenantPicker() }
        .sheet(isPresented: $host.inboxOpen) { InboxView() }
        .sheet(isPresented: Binding(get: { picker != nil }, set: { if !$0 { picker = nil } })) { NavigationView { List(host.apps) { app in Button(app.name) { if let index = picker { host.editPreferences { p in p.dock = p.dock.map { $0 == app.id ? "" : $0 }; p.dock[index] = app.id } }; picker = nil } }.navigationTitle("Chọn lối tắt").toolbar { Button("Đóng") { picker = nil } } } }
        .alert("Thông tin", isPresented: Binding(get: { host.message != nil }, set: { if !$0 { host.message = nil } })) { Button("Đóng") { host.message = nil } } message: { Text(host.message ?? "") }
    }
}
struct HomeView: View {
    @EnvironmentObject var host: HostStore
    @State private var customize = false
    var categories: [PlatformCore.Category] { let p = host.preferences; return host.catalog.categories.filter { c in !Set(c.miniAppIds).intersection(host.tenant.featuredAppIds).isEmpty && (!p.customized || p.categories.contains(c.id)) } }
    var body: some View {
        List {
            Section { Text("Ngày của bạn, nhẹ nhàng hơn").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader); Text("Tiện ích cho \(host.tenant.label)").foregroundStyle(.secondary) }
            Section("Bộ sưu tập của bạn") {
                if categories.isEmpty && host.preferences.apps.isEmpty { Text("Chưa có tiện ích ghim. Chọn Tùy chỉnh để thêm.") }
                ForEach(categories) { category in
                    DisclosureGroup { ForEach(host.apps.filter { category.miniAppIds.contains($0.id) }) { app in AppRow(app: app) } } label: { VStack(alignment: .leading) { Text(category.name).font(.headline); Text(category.description).font(.caption).foregroundStyle(.secondary) } }
                }
                ForEach(host.apps.filter { host.preferences.apps.contains($0.id) }) { app in AppRow(app: app) }
                Button("Tùy chỉnh Home") { customize = true }
            }
            Section("Dành cho bạn") { ForEach(host.apps) { app in AppRow(app: app) } }
            Section { Button("Tài khoản & truy cập thiết bị") { host.account = true }; Text("Danh mục và đặt sân là dữ liệu mẫu trên máy. Chưa có dịch vụ sản phẩm trực tuyến.").font(.caption).foregroundStyle(.secondary) }
        }.listStyle(.insetGrouped).navigationTitle("Home")
        .sheet(isPresented: $customize) { CustomizeView() }
    }
}
struct AppRow: View {
    @EnvironmentObject var host: HostStore
    let app: AppManifest
    var body: some View { Button { host.open(app.id) } label: { HStack { VStack(alignment: .leading) { Text(app.name).font(.headline); Text(app.id == "split-bill" ? "Chia tiền trong mini app" : app.id == "manage-expense" ? "Nhập, báo cáo và tối ưu chi tiêu" : app.id == "test" ? "Kiểm thử integration native" : app.id == "sample" ? "SDK & đặt sân mẫu" : app.id == "card" ? "Tìm quyền lợi thẻ" : "Bản xem trước tiện ích").font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "chevron.right") } }.frame(minHeight: 48).contextMenu { Button(host.preferences.apps.contains(app.id) ? "Bỏ ghim" : "Ghim vào Home") { host.editPreferences { p in if p.apps.contains(app.id) { p.apps.removeAll { $0 == app.id } } else { p.apps.append(app.id) } } } } }
}
struct CustomizeView: View {
    @EnvironmentObject var host: HostStore
    @Environment(\.dismiss) var dismiss
    var body: some View { NavigationView { Form {
        Section("Danh mục") { ForEach(host.catalog.categories.filter { !Set($0.miniAppIds).intersection(host.tenant.featuredAppIds).isEmpty }) { c in Toggle(c.name, isOn: Binding(get: { host.preferences.categories.contains(c.id) }, set: { on in host.editPreferences { p in p.categories.removeAll { $0 == c.id }; if on { p.categories.append(c.id) } } })) } }
        Section("Tiện ích") { ForEach(host.apps) { a in Toggle(a.name, isOn: Binding(get: { host.preferences.apps.contains(a.id) }, set: { on in host.editPreferences { p in p.apps.removeAll { $0 == a.id }; if on { p.apps.append(a.id) } } })) } }
        Button("Khôi phục gợi ý mặc định") { host.editPreferences { $0 = Preferences() }; host.snapshot.preferences[host.snapshot.tenantId]?.customized = false; host.persist() }
    }.navigationTitle("Tùy chỉnh Home").toolbar { Button("Xong") { dismiss() } } } }
}
struct ExploreView: View {
    @EnvironmentObject var host: HostStore
    @Environment(\.dismiss) var dismiss
    @State private var query = ""
    var body: some View { NavigationView { List {
        let filtered = host.apps.filter { TextSearch.matches($0.name, query: query) }
        if filtered.isEmpty { Text("Không tìm thấy tiện ích. Thử từ khóa khác.") }
        ForEach(filtered) { app in Button(app.name) { host.open(app.id); dismiss() }.frame(minHeight: 48) }
    }.searchable(text: $query, prompt: "Tìm tiện ích").navigationTitle("Khám phá").toolbar { Button("Đóng") { dismiss() } } } }
}
struct TenantPicker: View {
    @Environment(\.scenePhase) var phase
    @EnvironmentObject var host: HostStore
    @Environment(\.dismiss) var dismiss
    @StateObject private var device = DeviceServices()
    var body: some View { NavigationView { List {
        ForEach(host.catalog.tenants) { t in Button { device.cancel(); host.switchTenant(t.id); dismiss() } label: { VStack(alignment: .leading) { Text(t.label + (host.snapshot.tenantId == t.id ? " ✓" : "")); Text(t.description).font(.caption).foregroundStyle(.secondary) } }.frame(minHeight: 48) }
        Button("Chọn từ vị trí gần đúng") { device.locate { lat, lon in host.switchTenant(host.catalog.resolve(latitude: lat, longitude: lon)); dismiss() } }.disabled(device.busy)
        Text(device.status).font(.caption)
    }.navigationTitle("Khu vực").toolbar { Button("Đóng") { dismiss() } } }.onDisappear { device.cancel() }.onChange(of: phase) { if $0 == .background { device.cancel() } } }
}
struct MiniAppView: View {
    @EnvironmentObject var host: HostStore
    let app: AppManifest; let frame: Frame
    var body: some View { Group {
        if app.id == "card" { CardsView(path: frame.path) }
        else if app.id == "sample" { SampleView(sessionID: frame.id) }
        else if app.id == "test" { NativeTestView() }
        else if ["split-bill", "manage-expense"].contains(app.id) { MiniAppWebScreen(tenant: host.snapshot.tenantId, rules: host.catalog.capabilities, appId: app.id) }
        else { List {
            Section { Text(app.name).font(.title.bold()); Text("Bản xem trước trên máy. Chưa tải hoặc thực thi gói mini-app bên ngoài.").foregroundStyle(.secondary); Text("Đường dẫn: \(frame.path)").font(.caption) }
            Section("Trang đã khai báo") { ForEach(app.routes, id: \.self) { route in let path = route.replacingOccurrences(of: ":day", with: "tomorrow").replacingOccurrences(of: ":routeId", with: "42").replacingOccurrences(of: ":noteId", with: "welcome").replacingOccurrences(of: ":itemId", with: "featured"); Button(path) { host.navigate(path) } } }
            if !app.crossAppLinks.isEmpty { Section("Liên kết đã khai báo") { ForEach(app.crossAppLinks) { link in Button(link.label) { host.cross(link.id) } } } }
        } }
    }.navigationTitle(app.name) }
}
struct CardsView: View {
    @EnvironmentObject var host: HostStore
    let path: String
    @State private var query = ""
    var body: some View {
        List {
            Section { Text("Dữ liệu minh họa trên máy, không phải ưu đãi ngân hàng hiện hành.").font(.caption).foregroundStyle(.secondary) }
            if path.hasPrefix("/card/"), let card = host.catalog.cards.first(where: { $0.id == String(path.dropFirst(6)) }) {
                Section { Text(card.bankName).font(.headline); Text(card.cardName).font(.title2.bold()); Text(card.cardBrand.uppercased()); Text("Phí năm: \(card.annualFeeVnd.formatted(.number)) ₫"); if card.firstYearFree { Text("Miễn phí năm đầu (mẫu)") } }
                Section("Quyền lợi") { ForEach(card.benefits.indices, id: \.self) { i in VStack(alignment: .leading, spacing: 6) { Text(card.benefits[i].title).font(.headline); Text(card.benefits[i].detail) } } }
            } else {
                let cards = host.catalog.cards.filter { TextSearch.matches($0.searchable, query: query) }
                if cards.isEmpty { Text("Không có thẻ phù hợp. Thử từ khóa khác.") }
                ForEach(cards) { card in Button { host.navigate("/card/" + card.id) } label: { VStack(alignment: .leading, spacing: 4) { Text(card.bankName).font(.caption); Text(card.cardName).font(.headline); Text(card.headline?.title ?? "").font(.subheadline) }.frame(minHeight: 48) } }
            }
        }.searchable(text: $query, prompt: "Tìm ngân hàng, thẻ hoặc quyền lợi")
    }
}
struct InboxView: View {
    @EnvironmentObject var host: HostStore
    @EnvironmentObject var notifications: NotificationService
    @Environment(\.dismiss) var dismiss
    var body: some View { NavigationView { List {
        Section { Text(notifications.permission); Button("Cho phép thông báo") { Task { _ = await notifications.requestPermission() } } }
        if host.inbox.isEmpty { Text("Chưa có thông báo. Nhắc lịch đã đặt sẽ xuất hiện khi được nhận.") }
        ForEach(host.inbox) { item in VStack(alignment: .leading) { Text(item.title).font(.headline); Text(item.body); Text(item.createdAt, style: .date).font(.caption); if item.appId != nil { Button("Mở tiện ích") { host.activate(item) } } }.frame(minHeight: 48) }
    }.navigationTitle("Thông báo").toolbar { Button("Đóng") { dismiss() } } }.onAppear { host.markSeen() } }
}
struct AccountView: View {
    @EnvironmentObject var host: HostStore
    @EnvironmentObject var notifications: NotificationService
    @Environment(\.scenePhase) var phase
    @StateObject private var device = DeviceServices()
    var body: some View { Form {
        Section("Truy cập thiết bị") {
            Text("Quyền host không tự cấp cho mini-app. Chưa có tài khoản server.").font(.caption)
            Button("Kiểm tra mạng") { device.network() }.disabled(device.busy)
            Button("Xác thực bằng Face ID / mật mã") { device.biometric() }.disabled(device.busy)
            Button("Dùng vị trí gần đúng chọn khu vực") { device.locate { lat, lon in host.switchTenant(host.catalog.resolve(latitude: lat, longitude: lon)) } }.disabled(device.busy)
            Button("Lệnh thoại trên máy") { device.voice() }.disabled(device.busy)
            if device.busy { Button("Dừng") { device.cancel(); device.status = "Đã dừng thao tác." } }
            Text(device.status).accessibilityLabel(device.status)
        }
        Section("Thông báo") { Text(notifications.permission); Text(notifications.registration); Button("Đăng ký APNs trên máy") { notifications.registerAPNs() }; Button("Yêu cầu quyền thông báo") { Task { _ = await notifications.requestPermission() } }; Button("Cài đặt hệ thống") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } } }
        Section("Dữ liệu") { Text("Tùy chọn và hộp thư lưu theo khu vực trên máy. SDK Demo và ghi chú bridge là dữ liệu mẫu. Backend đăng ký token chưa cấu hình.") }
    }.navigationTitle("Tài khoản").onDisappear { device.cancel() }.onChange(of: phase) { if $0 == .background { device.cancel() } } }
}
