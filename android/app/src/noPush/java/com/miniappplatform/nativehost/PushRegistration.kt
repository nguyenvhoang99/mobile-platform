package com.miniappplatform.nativehost
import android.app.Activity
object PushRegistration { fun register(activity: Activity, result: (String) -> Unit) { result("FCM chưa được bật trong build này. Danh mục và nhắc lịch vẫn dùng được.") } }
