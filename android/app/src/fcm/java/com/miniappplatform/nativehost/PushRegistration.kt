package com.miniappplatform.nativehost
import android.app.Activity
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
object PushRegistration {
    fun register(activity: Activity, result: (String) -> Unit) {
        if (FirebaseApp.getApps(activity).isEmpty()) { result("FCM SDK có trong build; Firebase project chưa được cấu hình. Chưa đăng ký backend."); return }
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task -> if (!activity.isDestroyed) result(if (task.isSuccessful) "FCM đã cấp token trên máy. Chưa đăng ký backend; token không được log hoặc đưa cho mini-app." else "Chưa lấy được token FCM. Bạn vẫn dùng được nhắc lịch trên máy.") }
    }
}
class HostMessagingService: FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val payload = JSONObject(message.data as Map<*, *>); val item = RemotePayload.parse(payload.toString()) ?: return
        val repository = HostRepository.get(this); val tenant = message.data["tenant_id"] ?: return // Background push needs explicit tenant routing.
        val committed = java.util.concurrent.CountDownLatch(1)
        repository.receive(tenant, item) { if (repository.state.inbox[tenant].orEmpty().any { it.id == item.id }) runCatching { Reminders.showRemote(this, item) }; committed.countDown() }
        committed.await(5, java.util.concurrent.TimeUnit.SECONDS) // Firebase callback is a worker thread; wait for bounded durable handoff.
    }
    override fun onNewToken(token: String) { /* No backend endpoint configured; never log or expose the token. */ }
}
