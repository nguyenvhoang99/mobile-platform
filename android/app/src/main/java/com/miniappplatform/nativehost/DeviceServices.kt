package com.miniappplatform.nativehost

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricPrompt
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.*
import android.speech.*

class DeviceServices(private val activity: Activity, private val report: (String) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var generation = 0
    private var cancellation: CancellationSignal? = null
    private var location: LocationListener? = null
    private var speech: SpeechRecognizer? = null
    private var pending: (() -> Unit)? = null
    private val deadline = Runnable { cancel(); report("Đã dừng thao tác quá thời gian. Chọn thủ công hoặc thử lại.") }
    var busy = false; private set
    fun cancel() { generation++; cancellation?.cancel(); cancellation = null; location?.let { runCatching { activity.getSystemService(LocationManager::class.java).removeUpdates(it) } }; location = null; speech?.cancel(); speech?.destroy(); speech = null; pending = null; main.removeCallbacks(deadline); busy = false }
    private fun begin(): Int { cancel(); busy = true; main.postDelayed(deadline, 15_000); return generation }
    private fun finish(message: String) { cancel(); report(message) }
    private fun withPermission(permission: String, work: () -> Unit) { if (activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) work() else { pending = work; activity.requestPermissions(arrayOf(permission), 42) } }
    fun permissionResult(request: Int, results: IntArray) { if (request != 42) return; val work = pending ?: return; pending = null; if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) work() else finish("Chưa có quyền. Bạn có thể nhập/chọn thủ công hoặc quản lý quyền trong Cài đặt.") }
    fun network() { val manager = activity.getSystemService(ConnectivityManager::class.java); val caps = manager.getNetworkCapabilities(manager.activeNetwork); report(if (caps == null || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) "Đang ngoại tuyến hoặc mạng chưa được xác thực." else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) "Đang dùng Wi-Fi." else "Có kết nối mạng.") }
    fun biometric(biometricsOnly: Boolean = false) {
        if (Build.VERSION.SDK_INT < 28) { report("Xác thực biometrics cần Android 9+. Chưa có đăng nhập server."); return }
        val token = begin(); val signal = CancellationSignal(); cancellation = signal
        val builder = BiometricPrompt.Builder(activity).setTitle("Xác thực trong host").setSubtitle("Xác thực cục bộ; chưa tạo phiên server")
        if (Build.VERSION.SDK_INT >= 29 && !biometricsOnly) builder.setDeviceCredentialAllowed(true) else builder.setNegativeButton("Hủy", activity.mainExecutor) { _, _ -> finish("Đã hủy xác thực.") }
        builder.build().authenticate(signal, activity.mainExecutor, object: BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { if (generation == token) finish("Đã xác thực cục bộ. Không phải chữ ký hay xác nhận thanh toán.") }
            override fun onAuthenticationError(code: Int, text: CharSequence) { if (generation == token) finish("Xác thực chưa hoàn tất. Kiểm tra thiết lập hoặc thử lại.") }
        })
    }
    fun locate(done: (Double, Double) -> Unit) {
        val token = begin()
        withPermission(Manifest.permission.ACCESS_COARSE_LOCATION) {
            if (generation != token) return@withPermission
            val manager = activity.getSystemService(LocationManager::class.java)
            if (!manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) { finish("Vị trí mạng chưa bật. Chọn khu vực thủ công."); return@withPermission }
            val listener = object: LocationListener {
                override fun onLocationChanged(value: Location) { if (generation != token || kotlin.math.abs(System.currentTimeMillis() - value.time) > 120_000) return; finish("Đã chọn khu vực bằng vị trí gần đúng; không lưu tọa độ."); done(value.latitude, value.longitude) }
                override fun onProviderDisabled(provider: String) { if (generation == token) finish("Vị trí bị tắt. Chọn khu vực thủ công.") }
                override fun onProviderEnabled(provider: String) {}
                @Deprecated("Platform callback") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            }; location = listener
            if (activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) { finish("Quyền vị trí đã bị thu hồi. Chọn khu vực thủ công."); return@withPermission }
            try { manager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.getMainLooper()) }
            catch (_: SecurityException) { finish("Quyền vị trí đã bị thu hồi. Chọn khu vực thủ công.") }
            catch (_: Exception) { finish("Không lấy được vị trí. Chọn khu vực thủ công.") }
        }
    }
    fun voice() {
        if (Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)) { report("Thiết bị chưa có nhận dạng giọng nói trên máy. Nhập thủ công."); return }
        val token = begin()
        withPermission(Manifest.permission.RECORD_AUDIO) {
            if (generation != token) return@withPermission
            try {
            val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(activity); speech = recognizer
            recognizer.setRecognitionListener(object: RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { if (generation == token) report("Đang nghe trên máy… Chọn Dừng để hủy.") }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) { if (generation == token) finish("Chưa nhận dạng được tiếng Việt. Nhập hoặc thử lại.") }
                override fun onResults(results: Bundle?) { if (generation == token) finish(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { "Đã nghe: $it" } ?: "Chưa nhận được văn bản.") }
                override fun onPartialResults(results: Bundle?) {}
                override fun onEvent(type: Int, params: Bundle?) {}
            }); recognizer.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE, "vi-VN").putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true))
            } catch (_: Exception) { finish("Không mở được nhận dạng trên máy. Kiểm tra quyền hoặc nhập thủ công.") }
        }
    }
}
