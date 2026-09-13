package com.miniappplatform.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.miniappplatform.MainActivity
import com.miniappplatform.R

class MiniAppFirebaseMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val payload = NotificationPayload.fromRemoteMessage(message)
    val appState = if (MainActivity.isForeground) "foreground" else "background"
    NotificationEventStore.enqueue(
        applicationContext,
        "received",
        payload,
        appState,
        message.messageId)
    if (!MainActivity.isForeground) {
      showSystemNotification(payload, message.messageId)
    }
  }

  private fun showSystemNotification(payload: org.json.JSONObject, providerMessageId: String?) {
    val title = payload.optString("title")
    val body = payload.optString("body")
    val notificationId = payload.optString("notification_id")
    if (title.isBlank() || body.isBlank() || notificationId.isBlank()) {
      return
    }
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
          NotificationChannel(
              CHANNEL_ID,
              getString(R.string.notification_channel_name),
              NotificationManager.IMPORTANCE_DEFAULT))
    }
    val intent =
        Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(NotificationPayload.INTENT_PAYLOAD, payload.toString())
            .putExtra(NotificationPayload.INTENT_PROVIDER_MESSAGE_ID, providerMessageId)
            .putExtra(
                NotificationPayload.INTENT_AUTHENTICATOR,
                NotificationPayload.intentAuthenticator(applicationContext))
    val pendingIntent =
        PendingIntent.getActivity(
            this,
            notificationId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          android.app.Notification.Builder(this, CHANNEL_ID)
        } else {
          @Suppress("DEPRECATION")
          android.app.Notification.Builder(this)
        }
    builder
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(android.app.Notification.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
    manager.notify(notificationId.hashCode(), builder.build())
  }

  companion object {
    private const val CHANNEL_ID = "mini_app_platform_updates"
  }
}
