import SwiftUI
import PlatformCore
import EventKit
struct SampleView: View {
    @EnvironmentObject var host: HostStore
    @EnvironmentObject var notifications: NotificationService
    @Environment(\.scenePhase) var phase
    let sessionID: UUID
    @State private var slots: [Slot] = []
    @State private var date = "today"
    @State private var mine = false
    @State private var openBooking = true
    @State private var session: PreviewSession?
    @State private var note = "Ghi chú mẫu từ mini-app"
    @State private var amount = ""
    @State private var recipient = ""
    @State private var hint = ""
    @State private var status = "Chọn thao tác để gọi host."
    @State private var reviewed = false
    @State private var busy = false
    @State private var consent = false
    @State private var calendarSlot: Slot?
    @State private var cancelling: Int?
    var body: some View {
        List {
            Section { Text("SDK Demo · bản mẫu native").font(.title2.bold()); Text("Đặt sân chỉ thay đổi fixture trong phiên này, không gửi đặt chỗ tới sân. Đóng tiện ích sẽ khôi phục dữ liệu mẫu.").font(.caption).foregroundStyle(.secondary) }
            Section("Đặt sân mẫu") {
                Picker("Danh sách", selection: $mine) { Text("Tìm sân").tag(false); Text("Lịch của tôi").tag(true) }.pickerStyle(.segmented)
                Picker("Ngày", selection: $date) { Text("Hôm nay").tag("today"); Text("Ngày mai").tag("tomorrow"); Text("Cuối tuần").tag("weekend") }
                Toggle("Mở cho người khác tham gia", isOn: $openBooking)
                let indices = slots.indices.filter { mine ? slots[$0].includesMe : slots[$0].dateId == date }
                if indices.isEmpty { Text("Chưa có lịch phù hợp.") }
                ForEach(indices, id: \.self) { i in
                    let slot = slots[i]
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(slot.courtName) · \(slot.startTime)–\(slot.endTime)").font(.headline)
                        Text(slot.venue).foregroundStyle(.secondary)
                        Text("\(slot.priceVnd.formatted(.number)) ₫ · \(slot.participants.count)/\(slot.capacity) người")
                        if slot.owner == nil { Button("Đặt sân mẫu") { slots[i].book(open: openBooking); status = "Đã cập nhật fixture trong phiên. Chưa đặt sân thật." } }
                        else if slot.owner == "me" {
                            Toggle("Cho tham gia cùng", isOn: Binding(get: { slots[i].visibility == "open" }, set: { slots[i].visibility = $0 ? "open" : "private" }))
                            ForEach(slot.participants) { person in HStack { Text(person.displayName); if person.id != "me" { Button("Xóa \(person.displayName)") { slots[i].remove(person.id) } } } }
                            Button("Hủy đặt sân mẫu", role: .destructive) { cancelling = i }
                        } else if slot.includesMe { Text("Bạn đã tham gia phiên mẫu.") }
                        else if slot.visibility == "open" && slot.participants.count < slot.capacity { Button("Tham gia mẫu") { slots[i].join(); status = "Đã tham gia fixture; chưa có xác nhận từ sân." } }
                        else { Text("Đã kín chỗ hoặc sân riêng tư.").foregroundStyle(.secondary) }
                        if slot.includesMe {
                            Text("Công cụ của host — không phải API public cho mini-app.").font(.caption).foregroundStyle(.secondary)
                            Button("Nhắc trước 1 giờ") { let tenant = host.snapshot.tenantId; Task { let result = await notifications.schedule(slot: slot, tenant: tenant); if tenant == host.snapshot.tenantId { status = result } } }
                            Button("Mở lịch hệ thống") { showCalendar(slot) }
                            Button("Mở Live Activity") { let tenant = host.snapshot.tenantId; Task { let result = await notifications.live(slot: slot, tenant: tenant); if tenant == host.snapshot.tenantId { status = result } } }
                        }
                    }.padding(.vertical, 8)
                }
            }
            Section("Trạng thái") { Text(status).accessibilityLabel(status).accessibilityIdentifier("sample.status") }
            Section("Kho mẫu qua bridge") {
                Text("Bộ nhớ host theo khu vực/mini-app/người dùng mẫu; mất khi khởi động lại.").font(.caption)
                TextField("Ghi chú mẫu", text: $note)
                Button("Ghi mẫu") { storage("set") }.disabled(busy || session == nil)
                Button("Đọc mẫu") { storage("get") }.disabled(busy || session == nil)
                Button("Xóa mẫu") { storage("delete") }.disabled(busy || session == nil)
            }
            Section("Bản nháp hóa đơn") {
                Text("Chưa có mô hình AI hoặc bộ chọn ảnh trong PoC. Nhập thủ công; không có thanh toán hay lưu hóa đơn.").font(.caption)
                TextField("Gợi ý (tối đa 280 ký tự)", text: $hint)
                Button("Gửi yêu cầu AI tới host") { consent = true }.disabled(busy || session == nil)
                TextField("Tổng tiền VND", text: $amount).keyboardType(.numberPad).onChange(of: amount) { _ in reviewed = false }
                TextField("Người nhận / cửa hàng", text: $recipient).onChange(of: recipient) { _ in reviewed = false }
                Button("Xác nhận đã kiểm tra bản nháp") { if amount.range(of: "^[0-9]{1,12}$", options: .regularExpression) != nil && !recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && recipient.count <= 120 { reviewed = true; status = "Đã kiểm tra bản nháp trong phiên. Chưa lưu hóa đơn hoặc thanh toán." } else { status = "Nhập số tiền nguyên tối đa 12 chữ số và tên người nhận tối đa 120 ký tự." } }
                Text(reviewed ? "Đã đánh dấu kiểm tra." : "Bản nháp mất khi đóng tiện ích.").font(.caption)
            }
            Section("Giới hạn bridge") { Text("Quét mã, vị trí, ký bảo mật, network và đăng ký thông báo chưa có adapter public hoạt động. Không trả kết quả thiết bị giả.").font(.caption) }
        }
        .onAppear { if slots.isEmpty { slots = host.catalog.slots }; if session == nil { session = .sample(tenant: host.snapshot.tenantId) } }
        .onDisappear { revoke() }
        .onChange(of: status) { UIAccessibility.post(notification: .announcement, argument: $0) }
        .onChange(of: phase) { if $0 == .background { revoke() } else if $0 == .active && session == nil { session = .sample(tenant: host.snapshot.tenantId) } }
        .confirmationDialog("SDK Demo yêu cầu đọc hóa đơn trên máy. PoC hiện chưa có mô hình AI.", isPresented: $consent, titleVisibility: .visible) { Button("Đồng ý cho thao tác này") { extract() }; Button("Không đồng ý", role: .cancel) { status = "CONSENT_DENIED — Giữ bản nháp đang nhập." } }
        .alert("Hủy đặt sân mẫu?", isPresented: Binding(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } })) { Button("Hủy đặt sân", role: .destructive) { if let i = cancelling { let slot = slots[i]; let tenant = host.snapshot.tenantId; slots[i].cancel(); Task { await notifications.cancel(slot: slot, tenant: tenant) }; status = "Đã hủy fixture và yêu cầu xóa nhắc tương ứng." }; cancelling = nil }; Button("Giữ lại", role: .cancel) { cancelling = nil } }
        .sheet(item: $calendarSlot) { slot in CalendarEditor(slot: slot, reminderLeadMs: host.catalog.config.notification.reminderLeadMs) { message in status = message; calendarSlot = nil } }
    }
    private func revoke() { session?.invalidate(); session = nil; busy = false }
    private func storage(_ operation: String) {
        guard !busy, let session else { return }; busy = true; var args = ["key": "sample_note"]; if operation == "set" { args["value"] = String(note.prefix(500)) }
        Task { let reply = await host.broker.call(session: session, capability: "storage.kv", operation: operation, args: args); guard self.session === session else { return }; busy = false
            if let error = reply.error { status = error.rawValue + " — Nội dung vẫn được giữ." } else if operation == "get" { status = reply.data?["value"].map { "Ghi chú trong bộ nhớ: " + $0 } ?? "Chưa có ghi chú mẫu." } else { status = operation == "set" ? "Đã ghi vào bộ nhớ host. Chưa lưu bền." : "Đã xóa ghi chú mẫu." }
        }
    }
    private func extract() {
        guard !busy, let session else { return }; busy = true
        Task { let reply = await host.broker.call(session: session, capability: "ai.extract_bill", operation: "extract", args: ["locale": "vi", "idempotencyKey": UUID().uuidString, "hint": String(hint.prefix(280))], consent: true); guard self.session === session else { return }; busy = false; status = (reply.error?.rawValue ?? "UNAVAILABLE") + " — Chưa có bộ đọc hóa đơn. Tiếp tục nhập thủ công." }
    }
    private func showCalendar(_ slot: Slot) {
        if #available(iOS 17, *) { calendarSlot = slot }
        else { EKEventStore().requestAccess(to: .event) { granted, _ in DispatchQueue.main.async { guard host.navigator.frames.last?.id == sessionID, phase != .background else { return }; if granted { calendarSlot = slot } else { status = "Chưa có quyền lịch. Bạn vẫn giữ được fixture." } } } }
    }
}
