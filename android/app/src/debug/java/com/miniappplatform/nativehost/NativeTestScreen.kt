package com.miniappplatform.nativehost

import android.app.Activity
import android.graphics.*
import android.nfc.NfcAdapter
import android.nfc.tech.Ndef
import android.os.*
import android.view.View
import android.widget.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

class NativeTestScreen(private val activity: Activity, private val device: DeviceServices, private val report: (String) -> Unit, private val permission: (() -> Unit) -> Unit, private val demo: () -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var epoch = 0
    @Volatile private var closed = false
    private val ocrBusy = java.util.concurrent.atomic.AtomicBoolean(false)
    private val workerBusy = java.util.concurrent.atomic.AtomicBoolean(false)
    private var reader: NfcAdapter? = null
    private var active: String? = null
    private var deviceResult: TextView? = null
    private val results = mutableMapOf<String, TextView>()
    private val layout = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setPadding(24,8,24,24) }
    val view: View = ScrollView(activity).apply { addView(layout) }
    private val deadline = Runnable { val id = active ?: return@Runnable; cancel(); result(id, "TIMEOUT · Chưa có kết quả; thử lại.") }
    init {
        text("Test · Khác", 24f)
        text("Host native · Debug. Kết quả trong phiên; không lưu tọa độ, ảnh, âm thanh hoặc dữ liệu thẻ. Các phép thử public SDK nằm trong SDK Demo.")
        button("Dừng thao tác") { cancel(); report("CANCELLED · Đã dừng thao tác Test.") }
        row("Mạng", "Kiểm tra mạng đã được OS xác thực; không gửi request.") { runDevice("Mạng") { device.network() } }
        row("Location", "Vị trí gần đúng; không đổi khu vực hoặc lưu tọa độ.") { runDevice("Location") { device.locate { _, _ -> result("Location", "PASS · Nhận được vị trí gần đúng; không lưu tọa độ.") } } }
        row("Biometrics", "Chỉ vân tay/khuôn mặt theo OS, không fallback mật mã.") { runDevice("Biometrics") { device.biometric(biometricsOnly = true) } }
        row("Mật mã dự phòng", "Biometrics hoặc mật mã OS; chưa tạo phiên server.") { runDevice("Mật mã dự phòng") { device.biometric() } }
        row("Giọng nói", "Nhận dạng tiếng Việt trên máy; cần mic và model của OS.") { runDevice("Giọng nói") { device.voice() } }
        row("NFC", "Đọc NDEF, chỉ số record; không lưu UID/payload. Đưa thẻ tới điện thoại.") { nfc() }
        row("ML Kit OCR", "Nhận đúng chữ NATIVE TEST 123 từ ảnh fixture, không dùng camera/album.") { ocr() }
        row("TFLite", "LiteRT CPU Interpreter: model ADD, y = x + x + x; tensor đầu vào 2 phải cho kết quả 6.") { tflite() }
        row("Crypto", "Khóa EC tạm trong RAM; ký và kiểm tra chữ ký fixture, không xuất khóa riêng.") { crypto() }
        row("Passkey", "Kiểm tra điều kiện OS; chưa có RP domain/backend challenge/verify và Digital Asset Links.") {
            cancel()
            val available = Build.VERSION.SDK_INT >= 34 && activity.getSystemService(android.credentials.CredentialManager::class.java) != null
            result("Passkey", if (available) "NEEDS_CONFIG · Có CredentialManager; cần RP/backend/app association để tạo và xác minh passkey." else "UNAVAILABLE · Cần Android 14+ cho adapter platform này; chưa tích hợp backport.")
        }
        row("Thông báo", "Xin quyền hệ thống; không khẳng định delivery.") { val token = begin("Thông báo"); permission { finish("Thông báo", token, "PASS · OS cho phép thông báo; chưa kiểm thử delivery.") } }
        row("FCM", "Đăng ký provider tùy chọn; cần Firebase project/backend để nhận push.") { cancel(); val token = begin("FCM"); PushRegistration.register(activity) { main.post { finish("FCM", token, it) } } }
        row("Lịch / nhắc / Live Update / broker", "Mở SDK Demo, đặt/join một slot rồi chạy lịch/nhắc/live. KV storage và AI extraction dùng broker hiện có; AI chưa có model.") { cancel(); demo() }
    }
    private fun text(value: String, size: Float = 14f): TextView = TextView(activity).apply { text = value; textSize = size; setPadding(8,12,8,12); this@NativeTestScreen.layout.addView(this) }
    private fun button(label: String, work: () -> Unit) { layout.addView(Button(activity).apply { text = label; minHeight = (48 * resources.displayMetrics.density).toInt(); setOnClickListener { if (!closed) work() } }) }
    private fun row(id: String, detail: String, work: () -> Unit) { text(id, 18f); text(detail); results[id] = text("NOT_RUN · Chưa chạy").apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE; tag = "native-test-$id" }; button("Chạy $id", work) }
    private fun result(id: String, message: String) { if (!closed) { results[id]?.text = message; report("$id · $message") } }
    fun deviceReport(message: String) { deviceResult?.text = message; if (active == "Thông báo" && (message.startsWith("Chưa có quyền thông báo") || message.startsWith("Thông báo đang tắt"))) finish("Thông báo", epoch, "DENIED · OS chưa cho phép thông báo.") }
    private fun runDevice(id: String, work: () -> Unit) { cancel(); deviceResult = results[id]; result(id, "RUNNING · Đang xử lý…"); work() }
    private fun begin(id: String): Int { cancel(); active = id; result(id, "RUNNING · Đang xử lý…"); main.postDelayed(deadline, if (id == "NFC") 30_000 else 15_000); return epoch }
    private fun finish(id: String, token: Int, message: String) { if (closed || epoch != token || active != id) return; active = null; cancel(); result(id, message) }
    private fun cancel() {
        epoch++; main.removeCallbacks(deadline); reader?.let { runCatching { it.disableReaderMode(activity) } }; reader = null; device.cancel(); deviceResult = null
        active?.let { result(it, "CANCELLED · Đã dừng thao tác.") }; active = null
    }
    fun close() { cancel(); closed = true; worker.shutdownNow() }
    private fun nfc() {
        val adapter = NfcAdapter.getDefaultAdapter(activity)
        if (adapter == null || !adapter.isEnabled) { cancel(); result("NFC", "UNAVAILABLE · Thiếu NFC hoặc NFC đang tắt trong Cài đặt."); return }
        val token = begin("NFC"); reader = adapter
        try { adapter.enableReaderMode(activity, { tag ->
            val message = runCatching { val ndef = Ndef.get(tag) ?: return@runCatching "UNSUPPORTED · Thẻ không hỗ trợ NDEF."; val records = ndef.cachedNdefMessage?.records?.size ?: return@runCatching "FAIL · Thẻ chưa có NDEF message."; "PASS · Đọc $records record NDEF; không lưu dữ liệu thẻ." }.getOrDefault("ERROR · Không đọc được thẻ.")
            main.post { finish("NFC", token, message) }
        }, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V, null) }
        catch (_: Exception) { finish("NFC", token, "ERROR · Reader chưa khả dụng.") }
    }
    private fun ocr() {
        if (!ocrBusy.compareAndSet(false, true)) { result("ML Kit OCR", "BUSY · Chờ recognizer trước kết thúc."); return }
        val token = begin("ML Kit OCR")
        val image = Bitmap.createBitmap(800,200,Bitmap.Config.ARGB_8888)
        Canvas(image).apply { drawColor(Color.WHITE); drawText("NATIVE TEST 123",30f,125f,Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 64f }) }
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(InputImage.fromBitmap(image,0)).addOnCompleteListener { task ->
            val message = if (!task.isSuccessful) "ERROR · ML Kit không nhận dạng được fixture." else if (task.result.text.contains("NATIVE TEST 123")) "PASS · ML Kit nhận đúng fixture NATIVE TEST 123." else "FAIL · OCR trả kết quả khác fixture."
            recognizer.close(); image.recycle(); ocrBusy.set(false); finish("ML Kit OCR", token, message)
        }
    }
    private fun tflite() {
        if (!workerBusy.compareAndSet(false, true)) { result("TFLite", "BUSY · Chờ phép thử CPU trước kết thúc."); return }
        val token = begin("TFLite")
        worker.execute {
            val message = runCatching {
                val bytes = activity.assets.open("add.bin").use { it.readBytes() }
                val model = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).put(bytes); model.rewind()
                Interpreter(model, Interpreter.Options().setNumThreads(1)).use { interpreter ->
                    check(interpreter.inputTensorCount == 1 && interpreter.outputTensorCount == 1)
                    check(interpreter.getInputTensor(0).shape().contentEquals(intArrayOf(1,8,8,3)))
                    check(interpreter.getInputTensor(0).dataType() == org.tensorflow.lite.DataType.FLOAT32)
                    val input = ByteBuffer.allocateDirect(192 * 4).order(ByteOrder.nativeOrder())
                    repeat(192) { input.putFloat(2f) }; input.rewind()
                    val output = ByteBuffer.allocateDirect(192 * 4).order(ByteOrder.nativeOrder())
                    interpreter.run(input, output); output.rewind()
                    if ((0 until 192).all { kotlin.math.abs(output.float - 6f) < 0.0001f }) "PASS · LiteRT Interpreter trả 6 cho toàn bộ tensor y = x + x + x (x = 2)." else "FAIL · Tensor output khác kết quả 6."
                }
            }.getOrDefault("ERROR · Thiếu model hoặc không chạy được LiteRT Interpreter.")
            workerBusy.set(false); main.post { finish("TFLite", token, message) }
        }
    }
    private fun crypto() {
        if (!workerBusy.compareAndSet(false, true)) { result("Crypto", "BUSY · Chờ phép thử CPU trước kết thúc."); return }
        val token = begin("Crypto")
        worker.execute {
            val message = runCatching {
                val generator = java.security.KeyPairGenerator.getInstance("EC"); generator.initialize(java.security.spec.ECGenParameterSpec("secp256r1")); val pair = generator.generateKeyPair()
                val data = "native-test-fixture".toByteArray(); val signature = java.security.Signature.getInstance("SHA256withECDSA"); signature.initSign(pair.private); signature.update(data); val signed = signature.sign(); signature.initVerify(pair.public); signature.update(data)
                if (signature.verify(signed)) "PASS · Đã ký và verify bằng khóa EC tạm. Không phải crypto.sign broker/keystore attestation." else "FAIL · Chữ ký fixture không hợp lệ."
            }.getOrDefault("ERROR · Không tạo/kiểm tra được chữ ký fixture.")
            workerBusy.set(false); main.post { finish("Crypto", token, message) }
        }
    }
}
