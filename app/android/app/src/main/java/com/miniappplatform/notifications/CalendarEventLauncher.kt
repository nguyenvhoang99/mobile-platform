package com.miniappplatform.notifications

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.CalendarContract
import org.json.JSONObject

/**
 * Generic calendar-insert mechanism. Title, location, description, and alarm
 * lead time arrive from React Native; the shell only fires the insert intent
 * at the receiving calendar app.
 */
data class CalendarEvent(
    val id: String,
    val title: String,
    val location: String,
    val description: String,
    val startAtMs: Long,
    val endAtMs: Long,
    val alarmMinutes: Int
) {
  companion object {
    private val identifier = Regex("^[A-Za-z0-9._:-]{1,160}$")

    fun fromJson(raw: String, now: Long = System.currentTimeMillis()): CalendarEvent? {
      return try {
        val value = JSONObject(raw)
        val alarmMinutes =
            if (value.has("alarmMinutes") && !value.isNull("alarmMinutes")) {
              value.optInt("alarmMinutes", DEFAULT_ALARM_MINUTES)
            } else {
              DEFAULT_ALARM_MINUTES
            }
        val event =
            CalendarEvent(
                id = value.optString("id", ""),
                title = value.optString("title", ""),
                location = value.optString("location", ""),
                description = value.optString("description", ""),
                startAtMs = value.optLong("startAtMs"),
                endAtMs = value.optLong("endAtMs"),
                alarmMinutes = alarmMinutes)
        event.takeIf {
          identifier.matches(it.id) &&
              it.startAtMs > now &&
              it.endAtMs > it.startAtMs &&
              it.endAtMs <= now + MAX_FUTURE_MS &&
              it.title.isNotBlank() &&
              it.title.length <= 100 &&
              it.location.length <= 180 &&
              it.description.length <= 1000 &&
              it.alarmMinutes in 0..1440
        }
      } catch (_: Exception) {
        null
      }
    }

    private const val MAX_FUTURE_MS = 366L * 24 * 60 * 60 * 1_000
    private const val DEFAULT_ALARM_MINUTES = 60
  }
}

object CalendarEventLauncher {
  fun present(activity: Activity, event: CalendarEvent): String {
    val intent =
        Intent(Intent.ACTION_INSERT)
            .setDataAndType(
                CalendarContract.Events.CONTENT_URI, "vnd.android.cursor.dir/event")
            .putExtra(CalendarContract.Events.TITLE, event.title)
            .putExtra(CalendarContract.Events.EVENT_LOCATION, event.location)
            .putExtra(CalendarContract.Events.DESCRIPTION, event.description)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, event.startAtMs)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, event.endAtMs)
            // These are best-effort hints. The receiving calendar owns the final
            // reminder UI, so the confirmation copy asks the user to verify it.
            .putExtra(CalendarContract.Events.HAS_ALARM, true)
            .putExtra(CalendarContract.Reminders.MINUTES, event.alarmMinutes)

    return try {
      if (intent.resolveActivity(activity.packageManager) == null) {
        "unavailable"
      } else {
        activity.startActivity(intent)
        // ACTION_INSERT has no portable saved/cancelled result contract.
        "presented"
      }
    } catch (_: ActivityNotFoundException) {
      "unavailable"
    } catch (_: SecurityException) {
      "failed"
    } catch (_: Exception) {
      "failed"
    }
  }
}
