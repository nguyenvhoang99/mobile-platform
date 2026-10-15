import SwiftUI
import CoreLocation
import LocalAuthentication
import Network
import Speech
import AVFoundation

@MainActor final class DeviceServices: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published var status = "Chọn thao tác; host chỉ hỏi quyền khi bạn cần."
    @Published var busy = false
    private var generation = UUID()
    private var location: CLLocationManager?
    private var locationCompletion: ((Double, Double) -> Void)?
    private var deadline: Task<Void, Never>?
    private var auth: LAContext?
    private var monitor: NWPathMonitor?
    private var engine: AVAudioEngine?
    private var tapInstalled = false
    private var audioSessionActive = false
    private var recognition: SFSpeechRecognitionTask?
    private var speechRequest: SFSpeechAudioBufferRecognitionRequest?
    func cancel() {
        generation = UUID(); deadline?.cancel(); deadline = nil; location?.stopUpdatingLocation(); location?.delegate = nil; location = nil; locationCompletion = nil
        auth?.invalidate(); auth = nil; monitor?.cancel(); monitor = nil
        recognition?.cancel(); recognition = nil; speechRequest?.endAudio(); speechRequest = nil
        if let engine { engine.stop(); if tapInstalled { engine.inputNode.removeTap(onBus: 0) } }; engine = nil; tapInstalled = false
        if audioSessionActive { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation); audioSessionActive = false }; busy = false
    }
    private func finish(_ text: String) { cancel(); status = text }
    func network() {
        cancel(); busy = true; let token = generation; let m = NWPathMonitor(); monitor = m
        deadline = Task { try? await Task.sleep(nanoseconds: 8_000_000_000); guard !Task.isCancelled else { return }; finish("TIMEOUT · Không lấy được trạng thái mạng.") }
        m.pathUpdateHandler = { [weak self] path in Task { @MainActor in guard let self, self.generation == token else { return }; self.finish(path.status == .satisfied ? (path.usesInterfaceType(.wifi) ? "Đang dùng Wi-Fi." : "Có kết nối mạng.") : "Đang ngoại tuyến. Bạn vẫn dùng được danh mục mẫu.") } }; m.start(queue: DispatchQueue(label: "platform.network"))
    }
    func biometric(biometricsOnly: Bool = false) {
        cancel(); let context = LAContext(); auth = context; var error: NSError?
        let policy: LAPolicy = biometricsOnly ? .deviceOwnerAuthenticationWithBiometrics : .deviceOwnerAuthentication
        guard context.canEvaluatePolicy(policy, error: &error) else { finish("Thiết bị chưa thiết lập xác thực. Không có phiên đăng nhập server được tạo."); return }
        busy = true; let token = generation
        context.evaluatePolicy(policy, localizedReason: "Xác thực thao tác trong host") { [weak self] success, _ in Task { @MainActor in guard let self, self.generation == token else { return }; self.finish(success ? "Đã xác thực cục bộ. Chưa đăng nhập server; không phải chữ ký thanh toán." : "Xác thực chưa hoàn tất. Bạn có thể thử lại.") } }
    }
    func locate(_ completion: @escaping (Double, Double) -> Void) {
        cancel(); busy = true; locationCompletion = completion; let manager = CLLocationManager(); location = manager; manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
        deadline = Task { try? await Task.sleep(nanoseconds: 8_000_000_000); guard !Task.isCancelled else { return }; finish("Không lấy được vị trí gần đúng. Bạn có thể chọn khu vực thủ công.") }
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() } else { locationManagerDidChangeAuthorization(manager) }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { guard manager === location else { return }; switch manager.authorizationStatus { case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation(); case .denied, .restricted: finish("Chưa có quyền vị trí. Chọn khu vực thủ công hoặc đổi quyền trong Cài đặt."); default: break } }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) { guard manager === location, let value = locations.last, abs(value.timestamp.timeIntervalSinceNow) < 120, value.horizontalAccuracy >= 0 else { return }; let completion = locationCompletion; finish("Đã dùng vị trí gần đúng để chọn khu vực; không lưu tọa độ."); completion?(value.coordinate.latitude, value.coordinate.longitude) }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { guard manager === location else { return }; finish("Không lấy được vị trí. Chọn khu vực thủ công.") }
    func voice() {
        cancel(); busy = true; let token = generation
        SFSpeechRecognizer.requestAuthorization { [weak self] permission in Task { @MainActor in guard let self, self.generation == token else { return }; guard permission == .authorized else { self.finish("Chưa có quyền nhận dạng giọng nói."); return }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in Task { @MainActor in guard self.generation == token else { return }; guard granted else { self.finish("Chưa có quyền microphone."); return }; self.startSpeech(token: token) } }
        } }
    }
    private func startSpeech(token: UUID) {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "vi-VN")), recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else { finish("Thiết bị chưa hỗ trợ nhận dạng tiếng Việt trên máy."); return }
        do {
            let session = AVAudioSession.sharedInstance(); try session.setCategory(.record, mode: .measurement, options: .duckOthers); try session.setActive(true); audioSessionActive = true
            let engine = AVAudioEngine(); self.engine = engine; let request = SFSpeechAudioBufferRecognitionRequest(); speechRequest = request; request.requiresOnDeviceRecognition = true
            let input = engine.inputNode; let format = input.outputFormat(forBus: 0); guard format.sampleRate > 0 else { finish("Microphone chưa sẵn sàng."); return }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }; tapInstalled = true; engine.prepare(); try engine.start(); status = "Đang nghe trên máy… Chọn Dừng để hủy."
            recognition = recognizer.recognitionTask(with: request) { [weak self] result, error in Task { @MainActor in guard let self, self.generation == token else { return }; if let result, result.isFinal { self.finish("Đã nghe: \(result.bestTranscription.formattedString)") } else if error != nil { self.finish("Chưa nhận dạng được. Bạn có thể nhập hoặc thử lại.") } } }
            deadline = Task { try? await Task.sleep(nanoseconds: 15_000_000_000); guard !Task.isCancelled else { return }; finish("Đã dừng nghe. Bạn có thể thử lại.") }
        } catch { finish("Không mở được microphone. Bạn có thể nhập thủ công.") }
    }
}
