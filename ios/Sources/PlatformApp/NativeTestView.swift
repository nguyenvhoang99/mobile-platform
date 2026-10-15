import SwiftUI

struct NativeTestView: View {
    var body: some View {
#if DEBUG
        NativeTestDebugView()
#else
        List { Text("Test · Khác").font(.headline); Text("Bộ kiểm thử integration chỉ được compile trong bản Debug. Mở scheme MobileNative với cấu hình Debug để chạy.") }
#endif
    }
}

#if DEBUG
import CoreNFC
import Vision
import CryptoKit
import UIKit

@MainActor private final class NativeTestServices: NSObject, ObservableObject, @preconcurrency NFCNDEFReaderSessionDelegate {
    @Published var results: [String: String] = [:]
    @Published var busy = false
    private var generation = UUID()
    private var reader: NFCNDEFReaderSession?
    private var timeout: Task<Void, Never>?
    private var active: String?
    func cancel() {
        generation = UUID(); timeout?.cancel(); timeout = nil
        reader?.invalidate(); reader = nil; busy = false
        if let active { results[active] = "CANCELLED · Đã dừng thao tác." }; active = nil
    }
    private func begin(_ id: String, seconds: UInt64) -> UUID {
        cancel(); active = id; busy = true; results[id] = "RUNNING · Đang xử lý…"; let token = generation
        timeout = Task { try? await Task.sleep(nanoseconds: seconds * 1_000_000_000); guard !Task.isCancelled, generation == token else { return }; complete(id, token: token, "TIMEOUT · Chưa nhận được kết quả.") }
        return token
    }
    private func complete(_ id: String, token: UUID, _ message: String) {
        guard token == generation, active == id else { return }
        active = nil; cancel(); results[id] = message
    }
    func nfc() {
        guard NFCNDEFReaderSession.readingAvailable else { results["NFC"] = "UNAVAILABLE · Thiết bị này không có đầu đọc NDEF khả dụng."; return }
        _ = begin("NFC", seconds: 30)
        let session = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: false); reader = session
        session.alertMessage = "Đưa thẻ NDEF tới iPhone. Test chỉ hiển thị số record."; session.begin()
    }
    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        guard session === reader else { return }; complete("NFC", token: generation, "PASS · Đã đọc \(messages.reduce(0) { $0 + $1.records.count }) record NDEF; không lưu dữ liệu thẻ.")
    }
    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        guard session === reader else { return }; complete("NFC", token: generation, "ERROR / CANCELLED · Reader đã đóng. Kiểm tra quyền NFC/signing và entitlement trên thiết bị thật.")
    }
    func ocr() {
        let token = begin("OCR", seconds: 15)
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 800, height: 200))
        let image = renderer.image { ctx in UIColor.white.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 800, height: 200)); ("NATIVE TEST 123" as NSString).draw(at: CGPoint(x: 30, y: 60), withAttributes: [.font: UIFont.systemFont(ofSize: 64), .foregroundColor: UIColor.black]) }.cgImage!
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.recognitionLanguages = ["en-US"]; request.usesLanguageCorrection = false
            let result: String
            do { try VNImageRequestHandler(cgImage: image).perform([request]); let found = request.results?.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ") ?? ""; result = found.contains("NATIVE TEST 123") ? "PASS · Vision OCR nhận đúng fixture NATIVE TEST 123. Đây không phải ML Kit." : "FAIL · Vision OCR trả kết quả khác fixture." }
            catch { result = "ERROR · Không chạy được Vision OCR." }
            Task { @MainActor in self?.complete("OCR", token: token, result) }
        }
    }
}

private struct NativeTestDebugView: View {
    @EnvironmentObject var host: HostStore
    @Environment(\.scenePhase) var phase
    @EnvironmentObject var notifications: NotificationService
    @StateObject private var device = DeviceServices()
    @StateObject private var tests = NativeTestServices()
    @State private var activeDevice: String?
    @State private var deviceResults: [String: String] = [:]
    @State private var permissionTask: Task<Void, Never>?
    @State private var epoch = UUID()
    private func stop() { epoch = UUID(); permissionTask?.cancel(); permissionTask = nil; device.cancel(); tests.cancel(); if let activeDevice { deviceResults[activeDevice] = "CANCELLED · Đã dừng thao tác." }; activeDevice = nil }
    private func run(_ id: String, _ work: () -> Void) { stop(); activeDevice = id; deviceResults[id] = "RUNNING · Đang xử lý…"; work() }
    private func row(_ id: String, _ description: String, _ work: @escaping () -> Void) -> some View {
        Section(id) { Text(description).font(.caption); Button("Chạy \(id)", action: work).frame(minHeight: 48).accessibilityIdentifier("native-test-\(id)"); Text(tests.results[id] ?? deviceResults[id] ?? "NOT_RUN · Chưa chạy").font(.caption).accessibilityIdentifier("native-test-result-\(id)").accessibilityLabel("Kết quả \(id): \(tests.results[id] ?? deviceResults[id] ?? "Chưa chạy")") }
    }
    var body: some View {
        List {
            Section { Text("Test · Khác").font(.title2.bold()); Text("Host native · Debug. Mỗi lần chạy dùng API hệ thống thật. Kết quả chỉ ở trong phiên; kiểm thử public SDK nằm trong SDK Demo.").font(.caption); Button("Dừng thao tác") { stop() }.frame(minHeight: 48) }
            row("Mạng", "Kiểm tra đường mạng hiện tại, không gửi request.") { run("Mạng") { device.network() } }
            row("Location", "Vị trí gần đúng; không đổi khu vực hoặc lưu tọa độ.") { run("Location") { device.locate { _, _ in deviceResults["Location"] = "PASS · Nhận được vị trí gần đúng; không lưu tọa độ."; activeDevice = nil } } }
            row("Face ID / Touch ID", "Chỉ biometrics; không fallback sang mật mã.") { run("Face ID / Touch ID") { device.biometric(biometricsOnly: true) } }
            row("Mật mã dự phòng", "Xác thực local bằng biometrics hoặc mật mã; chưa đăng nhập server.") { run("Mật mã dự phòng") { device.biometric() } }
            row("Giọng nói", "Nhận dạng tiếng Việt trên máy; cần mic và model OS.") { run("Giọng nói") { device.voice() } }
            row("NFC", "Đọc NDEF trên thiết bị thật; cần signing với entitlement NFC.") { stop(); tests.nfc() }
            row("OCR", "Vision nhận chữ từ ảnh fixture; không truy cập camera/album.") { stop(); tests.ocr() }
            row("Crypto", "Khóa P256 tạm trong RAM; ký và verify fixture, không xuất khóa riêng.") { run("Crypto") {
                do { let key = P256.Signing.PrivateKey(); let data = Data("native-test-fixture".utf8); let signature = try key.signature(for: data); deviceResults["Crypto"] = key.publicKey.isValidSignature(signature, for: data) ? "PASS · Đã ký/verify fixture; không phải crypto.sign broker hoặc Secure Enclave attestation." : "FAIL · Chữ ký không hợp lệ." } catch { deviceResults["Crypto"] = "ERROR · Chưa ký được fixture." }; activeDevice = nil
            } }
            Section("ML Kit / TFLite") { Text("NEEDS_SDK · iOS đang dùng Vision, chưa tích hợp ML Kit hoặc LiteRT/TFLite. Chưa có inference TFLite trên iOS; xem native/TEST-CONTRACT.md.").font(.caption) }
            Section("Passkey") { Text("NEEDS_CONFIG · Cần RP domain, Associated Domains và backend cấp challenge/verify. \(ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 16 ? "OS đạt baseline iOS 16+." : "Cần iOS 16+.") Chưa tạo credential hoặc đăng nhập.").font(.caption) }
            row("Thông báo", "Xin quyền hiển thị thông báo hệ thống khi bạn chọn chạy.") { stop(); let token = epoch; permissionTask = Task { let allowed = await NotificationService.shared.requestPermission(); guard !Task.isCancelled, token == epoch else { return }; deviceResults["Thông báo"] = allowed ? "PASS · OS đã cho phép thông báo; chưa xác nhận delivery." : "DENIED · Chưa có quyền thông báo." } }
            Section("APNs") { Button("Đăng ký APNs") { stop(); NotificationService.shared.registerAPNs(); deviceResults["APNs"] = "RUNNING · Xem trạng thái trong Tài khoản; chưa có backend token registration." }; Text(notifications.registration).font(.caption) }
            Section("Lịch, reminder, Live Activity, broker") { Button("Mở SDK Demo để kiểm thử fixture") { stop(); host.open("sample") }.frame(minHeight: 48); Text("Đặt/join một slot mẫu rồi mở lịch, nhắc hoặc Live Activity. Storage KV và AI extraction dùng broker hiện có; AI chưa có model và trả UNAVAILABLE.").font(.caption) }
        }
        .onChange(of: device.status) { status in if let activeDevice { deviceResults[activeDevice] = status; if !device.busy { self.activeDevice = nil } } }
        .onDisappear { stop() }
        .onChange(of: phase) { if $0 == .background { stop() } }
    }
}
#endif
