package com.miniappplatform.nativehost
import android.app.Instrumentation
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.*
import org.json.JSONObject

// Platform-only instrumentation: exercises real Activity/widgets and Android JSON/AtomicFile adapters.
class SmokeInstrumentation: Instrumentation() {
    private var lastAction = "launch"
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
    override fun onStart() {
        val result = Bundle()
        try {
            val catalog = CatalogReader.read(targetContext)
            check(catalog.apps.size == 9 && catalog.cards.size == 12 && catalog.slots.size == 7)
            val decoded = SnapshotCodec.decode(SnapshotCodec.encode(HostSnapshot(preferences = mapOf("vn-hn" to Preferences(apps = listOf("weather", "weather", "evil"))))), catalog)
            check(decoded.preferences["vn-hn"]!!.apps == listOf("weather")); check(decoded.preferences["vn-hcm"] == null)
            val payload = JSONObject().put("notification_id", "synthetic").put("category", "demo").put("title", "T").put("body", "B").put("created_at_ms", System.currentTimeMillis()).put("target_app_id", "weather").put("entrypoint_id", "forecast").put("target_input", JSONObject().put("area", "current"))
            check(RemotePayload.parse(payload.toString()) != null)
            check(RemotePayload.parse(JSONObject(payload.toString()).put("target_input", "{\"area\":\"current\"}").toString())?.input?.get("area") == "current")
            check(RemotePayload.parse(JSONObject(payload.toString()).put("expires_at_ms", "invalid").toString()) == null)
            check(RemotePayload.parse(payload.put("target_input", JSONObject().put("area", JSONObject())).toString()) == null)
            val activity = startActivitySync(Intent(Intent.ACTION_MAIN).setClassName(targetContext.packageName, "${targetContext.packageName}.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            onUI { activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
            await { activity.hasWindowFocus() && activity.window.decorView.width > 0 && activity.window.decorView.height > 0 && text(activity, "Home · ") != null }
            click(activity, "Khám phá"); clickText(activity, "Thẻ")
            val search = edit(activity, "Tìm ngân hàng, thẻ hoặc quyền lợi") ?: error("Missing search")
            onUI { search.setText("an uong") }; await { text(activity, "Hoàn tiền 7% ăn uống", partial = true) != null }
            click(activity, "Quay lại"); await { text(activity, "Tùy chỉnh Home") != null }
            click(activity, "Khám phá"); clickText(activity, "SDK Demo"); await { edit(activity, "Ghi chú mẫu") != null }
            click(activity, "Ghi mẫu"); await { text(activity, "Đã ghi trong bộ nhớ host. Chưa lưu bền.") != null }
            click(activity, "Đọc mẫu"); await { text(activity, "Ghi chú trong bộ nhớ: Ghi chú mẫu từ mini-app") != null }
            val note = edit(activity, "Ghi chú mẫu")!!; onUI { note.setText("synthetic retained draft") }
            click(activity, "Ghi mẫu"); await { text(activity, "Đã ghi trong bộ nhớ host. Chưa lưu bền.") != null }
            click(activity, "Đọc mẫu"); await { text(activity, "Ghi chú trong bộ nhớ: synthetic retained draft") != null }
            click(activity, "Đóng"); click(activity, "Khám phá"); clickText(activity, "Test")
            await { text(activity, "Test · Khác") != null }
            click(activity, "Chạy ML Kit OCR"); await { text(activity, "PASS · ML Kit nhận đúng fixture NATIVE TEST 123.") != null }
            click(activity, "Chạy TFLite"); await { text(activity, "PASS · LiteRT Interpreter trả 6 cho toàn bộ tensor y = x + x + x (x = 2).") != null }
            click(activity, "Chạy Crypto"); await { text(activity, "PASS · Đã ký và verify bằng khóa EC tạm. Không phải crypto.sign broker/keystore attestation.") != null }
            click(activity, "Chạy Passkey"); await { text(activity, "NEEDS_CONFIG", partial = true) != null || text(activity, "UNAVAILABLE · Cần Android 14+", partial = true) != null }
            click(activity, "Chạy ML Kit OCR"); click(activity, "Đóng"); await { text(activity, "Tùy chỉnh Home") != null }
            onUI { activity.finish() }
            result.putString("stream", "PASS: bundled parity, snapshot roundtrip/isolation, malformed push rejection, card search/back, SDK bridge write/read and retained input; Test OCR, LiteRT inference, crypto, passkey prerequisite, cancel/close.\n")
            result.putInt("passed", 12); finish(Activity.RESULT_OK, result)
        } catch (failure: Throwable) { result.putString("stream", "FAIL: ${failure.javaClass.simpleName}: ${failure.message}\n"); finish(Activity.RESULT_CANCELED, result) }
    }
    private fun onUI(work: () -> Unit) { var failure: Throwable? = null; runOnMainSync { try { work() } catch (error: Throwable) { failure = error } }; failure?.let { throw it } }
    private fun await(condition: () -> Boolean) { repeat(300) { var success = false; onUI { success = condition() }; if (success) return; Thread.sleep(50) }; error("UI condition timed out after $lastAction") }
    private fun views(activity: Activity): List<View> {
        fun flatten(view: View): List<View> = listOf(view) + if (view is ViewGroup) (0 until view.childCount).flatMap { flatten(view.getChildAt(it)) } else emptyList()
        return flatten(activity.window.decorView)
    }
    private fun text(activity: Activity, value: String, partial: Boolean = false) = views(activity).filterIsInstance<TextView>().find { if (partial || value == "Home · ") it.text.toString().contains(value) else it.text.toString() == value }
    private fun edit(activity: Activity, hint: String) = views(activity).filterIsInstance<EditText>().find { it.hint?.toString() == hint }
    private fun click(activity: Activity, label: String) { lastAction = label; onUI { val button = views(activity).filterIsInstance<Button>().find { it.text.toString() == label } ?: error("Missing button $label"); button.performClick() }; waitForIdleSync() }
    private fun clickText(activity: Activity, label: String) {
        lastAction = label
        var found = false; onUI { found = text(activity, label) != null }
        if (!found) {
            await { views(activity).filterIsInstance<ListView>().firstOrNull()?.let { it.count > 0 && it.width > 0 && it.height > 0 } == true }
            var count = 0; onUI { count = views(activity).filterIsInstance<ListView>().firstOrNull()?.count ?: 0 }
            for (i in 0 until count) { onUI { views(activity).filterIsInstance<ListView>().firstOrNull()?.setSelection(i) }; Thread.sleep(100); waitForIdleSync(); onUI { found = text(activity, label) != null }; if (found) break }
        }
        onUI { val value = text(activity, label) ?: error("Missing row $label; visible=${views(activity).filterIsInstance<TextView>().map { it.text.toString().take(60) }}; dimensions=${views(activity).filterIsInstance<ViewGroup>().map { "${it.javaClass.simpleName}:${it.width}x${it.height}" }}"); var target: View = value; while (!target.isClickable) target = target.parent as? View ?: error("Missing row action"); target.performClick() }; waitForIdleSync() }
}
