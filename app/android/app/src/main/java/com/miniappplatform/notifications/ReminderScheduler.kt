package com.miniappplatform.notifications

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.miniappplatform.MainActivity
import com.miniappplatform.R
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Generic scheduled-reminder mechanism. The shell owns timing, persistence,
 * delivery, and teardown — never product copy or routing. Title, body,
 * channel, category, and target routing all arrive from React Native;
 * unknown/oversized fields fail validation and schedule nothing.
 */
data class ScheduledReminder(
    val id: String,
    val reminderAtMs: Long,
    val startAtMs: Long,
    val endAtMs: Long,
    val title: String,
    val body: String,
    val channelId: String,
    val channelName: String,
    val category: String,
    val targetAppId: String?,
    val entrypointId: String?,
    val targetInputJson: String?
) {
  fun toJson(): JSONObject {
    val value =
        JSONObject()
            .put("id", id)
            .put("reminderAtMs", reminderAtMs)
            .put("startAtMs", startAtMs)
            .put("endAtMs", endAtMs)
            .put("title", title)
            .put("body", body)
            .put("channelId", channelId)
            .put("channelName", channelName)
            .put("category", category)
    if (targetAppId != null) value.put("targetAppId", targetAppId)
    if (entrypointId != null) value.put("entrypointId", entrypointId)
    if (targetInputJson != null) value.put("targetInput", targetInputJson)
    return value
  }

  companion object {
    private val identifier = Regex("^[A-Za-z0-9._:-]{1,160}$")
    private val channelIdentifier = Regex("^[A-Za-z0-9._:-]{1,100}$")
    private const val MAX_FUTURE_MS = 366L * 24 * 60 * 60 * 1_000

    private fun optText(value: JSONObject, vararg keys: String): String {
      for (key in keys) {
        val candidate = value.optString(key, "")
        if (candidate.isNotEmpty()) return candidate
      }
      return ""
    }

    fun fromJson(raw: String, now: Long = System.currentTimeMillis()): ScheduledReminder? {
      return try {
        val value = JSONObject(raw)
        val targetAppId = optText(value, "targetAppId").ifEmpty { null }
        val entrypointId = optText(value, "entrypointId").ifEmpty { null }
        val reminder =
            ScheduledReminder(
                // Legacy keys (bookingId/courtName/venue) stay readable so
                // reminders persisted by older builds still restore.
                id = optText(value, "id", "bookingId"),
                reminderAtMs = value.optLong("reminderAtMs"),
                startAtMs = value.optLong("startAtMs"),
                endAtMs = value.optLong("endAtMs"),
                title = optText(value, "title", "courtName"),
                body =
                    optText(value, "body").ifEmpty {
                      val location = optText(value, "location", "venue")
                      val fallbackTitle = optText(value, "title", "courtName")
                      if (location.isEmpty()) fallbackTitle
                      else "$fallbackTitle · $location"
                    },
                channelId = optText(value, "channelId").ifEmpty { DEFAULT_CHANNEL_ID },
                channelName = optText(value, "channelName").ifEmpty { DEFAULT_CHANNEL_NAME },
                category = optText(value, "category").ifEmpty { DEFAULT_CATEGORY },
                targetAppId = targetAppId,
                entrypointId = entrypointId,
                targetInputJson =
                    if (value.has("targetInput") && !value.isNull("targetInput")) {
                      val input = value.opt("targetInput")
                      when (input) {
                        is JSONObject -> input.toString()
                        is String ->
                            try {
                              JSONObject(input)
                              input
                            } catch (_: Exception) {
                              return null
                            }
                        else -> return null
                      }
                    } else null)
        reminder.takeIf {
          identifier.matches(it.id) &&
              (now == 0L || it.startAtMs > now) &&
              it.endAtMs > it.startAtMs &&
              (now == 0L || it.endAtMs <= now + MAX_FUTURE_MS) &&
              it.reminderAtMs < it.startAtMs &&
              it.title.isNotBlank() &&
              it.title.length <= 100 &&
              it.body.isNotBlank() &&
              it.body.length <= 600 &&
              channelIdentifier.matches(it.channelId) &&
              it.channelName.isNotBlank() &&
              it.channelName.length <= 100 &&
              identifier.matches(it.category) &&
              it.category.length <= 80 &&
              (it.targetAppId == null ||
                  (identifier.matches(it.targetAppId) && it.targetAppId.length <= 100)) &&
              (it.entrypointId == null ||
                  (identifier.matches(it.entrypointId) && it.entrypointId.length <= 100)) &&
              // Target routing is all-or-nothing: a half-declared target is rejected.
              ((it.targetAppId == null) == (it.entrypointId == null))
        }
      } catch (_: Exception) {
        null
      }
    }

    private const val DEFAULT_CHANNEL_ID = "scheduled_reminders"
    private const val DEFAULT_CHANNEL_NAME = "Reminders"
    private const val DEFAULT_CATEGORY = "scheduled_reminder"
  }
}

object ReminderScheduler {
  private const val PREFERENCES = "scheduled_reminders"
  private const val ACTION_SHOW = "com.miniappplatform.REMINDER_SHOW"
  private const val ACTION_END = "com.miniappplatform.REMINDER_END"
  private const val EXTRA_REMINDER = "scheduled_reminder"

  fun schedule(context: Context, reminder: ScheduledReminder): Map<String, Any?> {
    save(context, reminder)
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    scheduleAlarm(
        manager,
        reminder.reminderAtMs.coerceAtLeast(System.currentTimeMillis()),
        alarmIntent(context, reminder, ACTION_SHOW))
    scheduleAlarm(manager, reminder.endAtMs, alarmIntent(context, reminder, ACTION_END))
    val active = reminder.reminderAtMs <= System.currentTimeMillis()
    return mapOf(
        "status" to if (active) "active" else "scheduled",
        "surface" to
            if (Build.VERSION.SDK_INT >= 36) "android_live_update"
            else "ongoing_notification",
        "reminderAtMs" to reminder.reminderAtMs.toDouble(),
        "activityId" to reminder.id)
  }

  fun cancel(context: Context, id: String) {
    val raw = preferences(context).getString(id, null)
    val reminder = raw?.let { ScheduledReminder.fromJson(it, 0) }
    if (reminder != null) {
      val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      manager.cancel(alarmIntent(context, reminder, ACTION_SHOW))
      manager.cancel(alarmIntent(context, reminder, ACTION_END))
    }
    notificationManager(context).cancel(id.hashCode())
    preferences(context).edit().remove(id).apply()
  }

  fun restore(context: Context) {
    val now = System.currentTimeMillis()
    preferences(context).all.forEach { (id, value) ->
      val reminder = (value as? String)?.let { ScheduledReminder.fromJson(it, 0) }
      when {
        reminder == null || reminder.endAtMs <= now ->
            preferences(context).edit().remove(id).apply()
        else -> schedule(context, reminder)
      }
    }
  }

  fun handle(context: Context, intent: Intent) {
    val reminder =
        intent.getStringExtra(EXTRA_REMINDER)?.let { ScheduledReminder.fromJson(it, 0) } ?: return
    if (intent.action?.startsWith(ACTION_END) == true ||
        reminder.endAtMs <= System.currentTimeMillis()) {
      cancel(context, reminder.id)
      return
    }
    show(context, reminder)
  }

  private fun show(context: Context, reminder: ScheduledReminder) {
    if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED) {
      return
    }
    val manager = notificationManager(context)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
          NotificationChannel(
              reminder.channelId, reminder.channelName, NotificationManager.IMPORTANCE_HIGH))
    }

    val payload = notificationPayload(reminder)
    val appState = if (MainActivity.isForeground) "foreground" else "background"
    NotificationEventStore.enqueue(context, "received", payload, appState, null)
    val openIntent =
        Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(NotificationPayload.INTENT_PAYLOAD, payload.toString())
            .putExtra(
                NotificationPayload.INTENT_AUTHENTICATOR,
                NotificationPayload.intentAuthenticator(context))
    val contentIntent =
        PendingIntent.getActivity(
            context,
            reminder.id.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Notification.Builder(context, reminder.channelId)
        } else {
          @Suppress("DEPRECATION") Notification.Builder(context)
        }
    builder
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(reminder.title)
        .setContentText(reminder.body)
        .setContentIntent(contentIntent)
        .setCategory(Notification.CATEGORY_EVENT)
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setWhen(reminder.startAtMs)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)

    if (Build.VERSION.SDK_INT >= 36) {
      val duration = (reminder.startAtMs - reminder.reminderAtMs).coerceAtLeast(1)
      val progress =
          (((System.currentTimeMillis() - reminder.reminderAtMs).coerceAtLeast(0) * 100.0) /
                  duration)
              .roundToInt()
              .coerceIn(0, 100)
      builder.setStyle(Notification.ProgressStyle().setProgress(progress))
    } else {
      builder.setStyle(Notification.BigTextStyle().bigText(reminder.body))
    }
    manager.notify(reminder.id.hashCode(), builder.build())
  }

  private fun notificationPayload(reminder: ScheduledReminder): JSONObject {
    val payload =
        JSONObject()
            .put("notification_id", "reminder-${reminder.id}")
            .put("dedupe_key", "reminder-${reminder.id}")
            .put("category", reminder.category)
            .put("title", reminder.title)
            .put("body", reminder.body)
            .put("created_at_ms", System.currentTimeMillis())
            .put("expires_at_ms", reminder.endAtMs)
    if (reminder.targetAppId != null && reminder.entrypointId != null) {
      payload.put("target_app_id", reminder.targetAppId)
      payload.put("entrypoint_id", reminder.entrypointId)
      val input =
          reminder.targetInputJson?.let {
            try {
              JSONObject(it)
            } catch (_: Exception) {
              JSONObject()
            }
          } ?: JSONObject().put("reminder_id", reminder.id)
      payload.put("target_input", input)
    }
    return payload
  }

  private fun scheduleAlarm(manager: AlarmManager, atMs: Long, intent: PendingIntent) {
    manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, intent)
  }

  private fun alarmIntent(
      context: Context,
      reminder: ScheduledReminder,
      action: String
  ): PendingIntent {
    val intent =
        Intent(context, ReminderReceiver::class.java)
            .setAction("$action.${reminder.id}")
            .putExtra(EXTRA_REMINDER, reminder.toJson().toString())
    val requestCode = reminder.id.hashCode() xor action.hashCode()
    return PendingIntent.getBroadcast(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun save(context: Context, reminder: ScheduledReminder) {
    preferences(context).edit().putString(reminder.id, reminder.toJson().toString()).apply()
  }

  private fun preferences(context: Context) =
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun notificationManager(context: Context) =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    ReminderScheduler.handle(context.applicationContext, intent)
  }
}

class ReminderBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
      ReminderScheduler.restore(context.applicationContext)
    }
  }
}
