package com.miniappplatform.notifications

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import com.miniappplatform.specs.NativeNotificationSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * NotificationModule TurboModule. Method signatures come from the generated
 * `NativeNotificationSpec` (itself generated from
 * `src/native/specs/NativeNotification.ts`) — the module name included.
 * Do not redeclare signatures or names here; change the spec instead.
 */
class NotificationModule(private val reactContext: ReactApplicationContext) :
    NativeNotificationSpec(reactContext) {

  private var listenerCount = 0

  init {
    activeModule = WeakReference(this)
  }

  @ReactMethod
  override fun getPermissionStatus(promise: Promise) {
    promise.resolve(permissionStatus())
  }

  @ReactMethod
  override fun requestPermission(promise: Promise) {
    // Android 13+ prompting is initiated through React Native's PermissionsAndroid
    // so the result remains tied to the user gesture that opened the inbox.
    promise.resolve(permissionStatus())
  }

  @ReactMethod
  override fun registerForRemoteNotifications(promise: Promise) {
    if (FirebaseApp.getApps(reactContext).isEmpty()) {
      promise.resolve(registration("unavailable", null))
      return
    }
    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
      if (task.isSuccessful && task.result != null) {
        promise.resolve(registration("registered", task.result))
      } else {
        promise.resolve(registration("failed", null))
      }
    }
  }

  @ReactMethod
  override fun getPendingEvents(promise: Promise) {
    promise.resolve(NotificationEventStore.pending(reactContext).toString())
  }

  @ReactMethod
  override fun acknowledgeEvent(nativeEventId: String, promise: Promise) {
    NotificationEventStore.acknowledge(reactContext, nativeEventId)
    promise.resolve(null)
  }

  @ReactMethod
  override fun scheduleReminder(requestJson: String, promise: Promise) {
    val reminder = ScheduledReminder.fromJson(requestJson)
    if (reminder == null) {
      promise.resolve(
          mapOf(
              "status" to "failed",
              "surface" to null,
              "reminderAtMs" to 0,
              "activityId" to null))
      return
    }
    promise.resolve(ReminderScheduler.schedule(reactContext, reminder))
  }

  @ReactMethod
  override fun cancelReminder(id: String, promise: Promise) {
    ReminderScheduler.cancel(reactContext, id)
    promise.resolve(null)
  }

  @ReactMethod
  override fun presentCalendarEvent(requestJson: String, promise: Promise) {
    val event = CalendarEvent.fromJson(requestJson)
    if (event == null) {
      promise.resolve(mapOf("status" to "failed"))
      return
    }
    reactContext.runOnUiQueueThread {
      val activity = reactContext.currentActivity
      if (activity == null) {
        promise.resolve(mapOf("status" to "unavailable"))
      } else {
        promise.resolve(
            mapOf("status" to CalendarEventLauncher.present(activity, event)))
      }
    }
  }

  @ReactMethod
  override fun addListener(eventName: String) {
    listenerCount += 1
  }

  @ReactMethod
  override fun removeListeners(count: Double) {
    listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0)
  }

  private fun permissionStatus(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return "authorized"
    }
    return if (
        reactContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED) {
      "authorized"
    } else {
      "not_determined"
    }
  }

  private fun send(event: JSONObject) {
    if (listenerCount == 0 || !reactContext.hasActiveReactInstance()) {
      return
    }
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_NAME, event.toString())
  }

  companion object {
    private const val EVENT_NAME = "notificationEvent"
    private var activeModule: WeakReference<NotificationModule>? = null

    fun emit(event: JSONObject) {
      activeModule?.get()?.send(event)
    }

    private fun registration(status: String, token: String?): Map<String, Any?> =
        mapOf("status" to status, "provider" to "fcm", "token" to token)
  }
}
