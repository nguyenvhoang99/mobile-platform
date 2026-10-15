package com.miniappplatform.nativehost

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import org.json.JSONObject
import java.util.concurrent.Executors

object Reminders {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private const val CHANNEL = "host-reminders"
    private const val ACTION = "com.miniappplatform.nativehost.REMINDER"
    fun permission(context: Context) = (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) && context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    private fun preferences(context: Context) = context.getSharedPreferences("host-reminders-v1", Context.MODE_PRIVATE)
    private fun identity(tenant: String, slot: Slot) = "$tenant.${slot.id}"
    private fun pending(context: Context, id: String) = PendingIntent.getBroadcast(context, 0, Intent(context, ReminderReceiver::class.java).setAction(ACTION).setData(Uri.Builder().scheme("native-reminder").authority("host").appendPath(id).build()), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun record(tenant: String, slot: Slot, start: Long, end: Long, fire: Long) = JSONObject().put("id", identity(tenant, slot)).put("tenant", tenant).put("title", "${slot.court} · ${slot.start}").put("body", slot.venue).put("start", start).put("end", end).put("fire", fire).toString()
    private fun valid(o: JSONObject): Boolean = runCatching { val id = o.getString("id"); val tenant = o.getString("tenant"); id.length in 1..200 && tenant in setOf("vn-hn", "vn-hcm", "vn-dn", "vn-fallback") && o.getString("title").length in 1..100 && o.getString("body").length <= 600 && o.getLong("end") > o.getLong("start") && o.getLong("fire") <= o.getLong("start") }.getOrDefault(false)
    fun schedule(context: Context, tenant: String, slot: Slot, done: (String) -> Unit) {
        val app = context.applicationContext
        worker.execute {
            val interval = slot.interval(); val result = when {
                interval == null || interval.first <= System.currentTimeMillis() -> "Giờ mẫu đã qua. Chọn ngày khác."
                !permission(app) -> "Chưa có quyền thông báo. Bạn vẫn có thể thêm lịch hệ thống."
                else -> runCatching {
                    val fire = (interval.first - HostRepository.get(app).catalog.reminderLeadMs).coerceAtLeast(System.currentTimeMillis() + 1000); val id = identity(tenant, slot); val data = record(tenant, slot, interval.first, interval.second, fire)
                    require(preferences(app).edit().putString(id, data).commit())
                    try { app.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fire, pending(app, id)) } catch (failure: Exception) { preferences(app).edit().remove(id).commit(); throw failure }
                    "Đã đặt nhắc trước 1 giờ. Android có thể trì hoãn báo thức không chính xác khi tiết kiệm pin."
                }.getOrElse { "Chưa đặt được nhắc. Kiểm tra quyền hoặc thêm lịch." }
            }; main.post { done(result) }
        }
    }
    fun cancel(context: Context, tenant: String, slot: Slot) { val app = context.applicationContext; worker.execute { val id = identity(tenant, slot); app.getSystemService(AlarmManager::class.java).cancel(pending(app, id)); app.getSystemService(NotificationManager::class.java).cancel(id, 0); preferences(app).edit().remove(id).commit() } }
    fun ongoing(context: Context, tenant: String, slot: Slot): String {
        val interval = slot.interval() ?: return "Giờ mẫu chưa hợp lệ."
        if (!permission(context) || interval.second <= System.currentTimeMillis()) return "Thông báo đang diễn ra chưa khả dụng. Kiểm tra quyền hoặc giờ chơi."
        return runCatching {
            val app = context.applicationContext; val o = JSONObject(record(tenant, slot, interval.first, interval.second, System.currentTimeMillis().coerceAtMost(interval.first)))
            HostRepository.get(app).receive(tenant, InboxItem(identity(tenant, slot), o.getString("title"), slot.venue, System.currentTimeMillis(), interval.second)) { runCatching { if (HostRepository.get(app).state.inbox[tenant].orEmpty().any { it.id == identity(tenant, slot) }) post(app, o, ongoing = true) } }
            "Đã yêu cầu thông báo đang diễn ra. Android quyết định có nâng thành Live Update hay không." }.getOrElse { "Chưa mở được thông báo đang diễn ra." }
    }
    private fun post(context: Context, o: JSONObject, ongoing: Boolean = false) {
        require(valid(o)); display(context, o.getString("id"), o.getString("title"), o.getString("body"), o.getLong("end"), ongoing, o.getLong("start"))
    }
    internal fun showRemote(context: Context, item: InboxItem) {
        if (!permission(context) || (item.expires != null && item.expires <= System.currentTimeMillis())) return
        display(context, item.id, item.title, item.body, item.expires)
    }
    private fun display(context: Context, id: String, title: String, body: String, expires: Long?, ongoing: Boolean = false, start: Long = 0) {
        require(id.length in 1..200 && title.length in 1..180 && body.length <= 600)
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "Nhắc lịch & thông báo host", NotificationManager.IMPORTANCE_DEFAULT))
        val intent = Intent(context, MainActivity::class.java).setAction("OPEN_INBOX").setData(Uri.Builder().scheme("native-inbox").authority("host").appendPath(id).build())
        val tap = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
        builder.setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle(title).setContentText(body).setStyle(Notification.BigTextStyle().bigText(body)).setContentIntent(tap).setAutoCancel(!ongoing).setOngoing(ongoing).setCategory(Notification.CATEGORY_EVENT)
        if (Build.VERSION.SDK_INT >= 26 && expires != null) builder.setTimeoutAfter((expires - System.currentTimeMillis()).coerceAtLeast(1))
        if (ongoing && Build.VERSION.SDK_INT >= 36) { runCatching { Notification.Builder::class.java.getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType).invoke(builder, true) } }
        if (ongoing && start > System.currentTimeMillis()) builder.setWhen(start).setUsesChronometer(true).setChronometerCountDown(true)
        manager.notify(id, 0, builder.build())
    }
    fun deliver(context: Context, intent: Intent, finish: () -> Unit) {
        val app = context.applicationContext
        worker.execute {
            try {
                val id = intent.data?.lastPathSegment
                if (intent.action != ACTION || id == null) { finish(); return@execute }
                val text = preferences(app).getString(id, null) ?: run { finish(); return@execute }; val o = JSONObject(text)
                if (!valid(o) || o.getLong("end") <= System.currentTimeMillis()) { preferences(app).edit().remove(id).commit(); finish(); return@execute }
                if (!permission(app)) { finish(); return@execute }
                post(app, o)
                HostRepository.get(app).receive(o.getString("tenant"), InboxItem(id, o.getString("title"), o.getString("body"), System.currentTimeMillis(), o.getLong("end")), finish)
                // Keep the ledger until expiry; dedupe prevents repeated inbox entries.
            } catch (_: Exception) { finish() }
        }
    }
    fun restore(context: Context, finish: () -> Unit) { val app = context.applicationContext; worker.execute {
        val prefs = preferences(app)
        for ((id, value) in prefs.all) runCatching { val o = JSONObject(value as String); if (!valid(o) || o.getLong("end") <= System.currentTimeMillis()) prefs.edit().remove(id).commit() else app.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, o.getLong("fire").coerceAtLeast(System.currentTimeMillis() + 1000), pending(app, id)) }
        finish()
    } }
    fun calendar(activity: Activity, slot: Slot): String { val interval = slot.interval() ?: return "Giờ mẫu chưa hợp lệ."; val intent = Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI).putExtra(CalendarContract.Events.TITLE, slot.court).putExtra(CalendarContract.Events.EVENT_LOCATION, slot.venue).putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, interval.first).putExtra(CalendarContract.EXTRA_EVENT_END_TIME, interval.second)
        return if (intent.resolveActivity(activity.packageManager) == null) "Chưa có ứng dụng lịch phù hợp." else runCatching { activity.startActivity(intent); "Đã mở trình chỉnh sửa lịch. Chưa xác nhận lưu sự kiện." }.getOrElse { "Không mở được lịch hệ thống." }
    }
}
class ReminderReceiver: BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) { val pending = goAsync(); Reminders.deliver(context, intent) { pending.finish() } } }
class BootReceiver: BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) { if (intent.action != Intent.ACTION_BOOT_COMPLETED) return; val pending = goAsync(); Reminders.restore(context) { runCatching { ExpenseDigests.restore(context) }; pending.finish() } } }
