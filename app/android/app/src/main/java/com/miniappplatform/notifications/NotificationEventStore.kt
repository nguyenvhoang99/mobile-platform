package com.miniappplatform.notifications

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

object NotificationEventStore {
  private const val PREFERENCES = "mini_app_platform_notifications"
  private const val PENDING_EVENTS = "pending_events"
  private const val MAX_PENDING_EVENTS = 100

  @Synchronized
  fun enqueue(
      context: Context,
      type: String,
      payload: JSONObject,
      appState: String,
      providerMessageId: String?
  ): JSONObject {
    val event =
        JSONObject()
            .put("native_event_id", UUID.randomUUID().toString())
            .put("type", type)
            .put("payload", payload.toString())
            .put("app_state", appState)
            .put("provider_message_id", providerMessageId ?: JSONObject.NULL)
            .put("occurred_at_ms", System.currentTimeMillis())
    val events = pending(context)
    events.put(event)
    while (events.length() > MAX_PENDING_EVENTS) {
      events.remove(0)
    }
    save(context, events)
    NotificationModule.emit(event)
    return event
  }

  @Synchronized
  fun pending(context: Context): JSONArray {
    val raw =
        context
            .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(PENDING_EVENTS, "[]")
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  @Synchronized
  fun acknowledge(context: Context, nativeEventId: String) {
    val current = pending(context)
    val remaining = JSONArray()
    for (index in 0 until current.length()) {
      val event = current.optJSONObject(index) ?: continue
      if (event.optString("native_event_id") != nativeEventId) {
        remaining.put(event)
      }
    }
    save(context, remaining)
  }

  private fun save(context: Context, events: JSONArray) {
    context
        .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        .edit()
        .putString(PENDING_EVENTS, events.toString())
        .apply()
  }
}
