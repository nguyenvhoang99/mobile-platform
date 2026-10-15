package com.miniappplatform.nativehost
import android.app.Activity
import android.view.View
import android.widget.TextView
@Suppress("UNUSED_PARAMETER")
class NativeTestScreen(activity: Activity, device: DeviceServices, report: (String) -> Unit, permission: (() -> Unit) -> Unit, demo: () -> Unit) {
    val view: View = TextView(activity).apply { text = "Test · Khác\nBộ kiểm thử integration chỉ được compile trong bản Debug. Cài bản Debug để chạy."; textSize = 18f; setPadding(32,32,32,32) }
    fun close() {}
    fun deviceReport(message: String) {}
}
