package com.miniappplatform.notifications

import android.content.Context
import android.os.Bundle
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.util.UUID

object NotificationPayload {
  const val INTENT_PAYLOAD = "mini_app_notification_payload"
  const val INTENT_PROVIDER_MESSAGE_ID = "mini_app_notification_provider_message_id"
  const val INTENT_AUTHENTICATOR = "mini_app_notification_authenticator"
  private const val PREFERENCES = "mini_app_platform_notifications"
  private const val AUTHENTICATOR_KEY = "notification_intent_authenticator"

  fun fromRemoteMessage(message: RemoteMessage): JSONObject {
    val embedded = message.data["payload"]
    val payload =
        if (!embedded.isNullOrBlank()) {
          try {
            JSONObject(embedded)
          } catch (_: Exception) {
            JSONObject()
          }
        } else {
          JSONObject()
        }
    message.data.forEach { (key, value) ->
      if (key != "payload") {
        if ((key == "target_input" || key == "input") && value.startsWith("{")) {
          try {
            payload.put(key, JSONObject(value))
          } catch (_: Exception) {
            payload.put(key, value)
          }
        } else {
          payload.put(key, value)
        }
      }
    }
    message.notification?.title?.let { if (!payload.has("title")) payload.put("title", it) }
    message.notification?.body?.let { if (!payload.has("body")) payload.put("body", it) }
    return payload
  }

  fun fromIntentExtras(context: Context, extras: Bundle?): JSONObject? {
    if (
        extras == null ||
            extras.getString(INTENT_AUTHENTICATOR) != intentAuthenticator(context)) {
      return null
    }
    val rawPayload = extras.getString(INTENT_PAYLOAD) ?: return null
    return try {
      JSONObject(rawPayload)
    } catch (_: Exception) {
      null
    }
  }

  fun intentAuthenticator(context: Context): String {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val existing = preferences.getString(AUTHENTICATOR_KEY, null)
    if (existing != null) {
      return existing
    }
    val created = UUID.randomUUID().toString()
    synchronized(this) {
      val raced = preferences.getString(AUTHENTICATOR_KEY, null)
      if (raced != null) {
        return raced
      }
      preferences.edit().putString(AUTHENTICATOR_KEY, created).apply()
    }
    return created
  }
}
