package com.miniappplatform.hoststorage

import android.content.Context
import com.miniappplatform.specs.NativeHostStorageSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/**
 * HostStorage TurboModule. Method signatures come from the generated
 * `NativeHostStorageSpec` (itself generated from
 * `src/native/specs/NativeHostStorage.ts`) — the module name included.
 * Do not redeclare signatures or names here; change the spec instead.
 */
class HostStorageModule(private val reactContext: ReactApplicationContext) :
    NativeHostStorageSpec(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()
  private val trackingFile: File
    get() = File(reactContext.filesDir, TRACKING_FILE)
  private val notificationsFile: File
    get() = File(reactContext.filesDir, NOTIFICATIONS_FILE)
  private val cardDatasetFile: File
    get() = File(reactContext.filesDir, CARD_DATASET_FILE)

  @ReactMethod
  override fun loadDockSelection(promise: Promise) {
    promise.resolve(
        reactContext
            .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(DOCK_KEY, null))
  }

  @ReactMethod
  override fun saveDockSelection(selection: String, promise: Promise) {
    reactContext
        .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        .edit()
        .putString(DOCK_KEY, selection)
        .apply()
    promise.resolve(null)
  }

  @ReactMethod
  override fun loadHomePreferences(promise: Promise) {
    promise.resolve(
        reactContext
            .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(HOME_PREFERENCES_KEY, null))
  }

  @ReactMethod
  override fun saveHomePreferences(preferences: String, promise: Promise) {
    reactContext
        .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        .edit()
        .putString(HOME_PREFERENCES_KEY, preferences)
        .apply()
    promise.resolve(null)
  }

  @ReactMethod
  override fun loadTrackingEvents(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(if (trackingFile.exists()) trackingFile.readText() else "")
      } catch (_: Exception) {
        promise.resolve("")
      }
    }
  }

  @ReactMethod
  override fun appendTrackingEvent(event: String, promise: Promise) {
    executor.execute {
      try {
        trackingFile.appendText("$event\n")
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("HOST_STORAGE_APPEND_FAILED", "Could not persist the tracking event.", error)
      }
    }
  }

  @ReactMethod
  override fun replaceTrackingEvents(events: String, promise: Promise) {
    executor.execute {
      try {
        val temporary = File(reactContext.filesDir, "$TRACKING_FILE.tmp")
        temporary.writeText(if (events.isEmpty()) "" else "$events\n")
        if (trackingFile.exists() && !trackingFile.delete()) {
          throw IllegalStateException("Could not replace tracking queue")
        }
        if (!temporary.renameTo(trackingFile)) {
          throw IllegalStateException("Could not commit tracking queue")
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("HOST_STORAGE_REPLACE_FAILED", "Could not replace the tracking queue.", error)
      }
    }
  }

  @ReactMethod
  override fun getOrCreateAnonymousId(scope: String, promise: Promise) {
    val preferences =
        reactContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val key = "$ANONYMOUS_ID_KEY.$scope"
    val existing = preferences.getString(key, null)
    if (existing != null) {
      promise.resolve(existing)
      return
    }
    val created = UUID.randomUUID().toString()
    preferences.edit().putString(key, created).apply()
    promise.resolve(created)
  }

  @ReactMethod
  override fun loadNotifications(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(if (notificationsFile.exists()) notificationsFile.readText() else "[]")
      } catch (_: Exception) {
        promise.resolve("[]")
      }
    }
  }

  @ReactMethod
  override fun saveNotifications(notifications: String, promise: Promise) {
    executor.execute {
      try {
        val temporary = File(reactContext.filesDir, "$NOTIFICATIONS_FILE.tmp")
        temporary.writeText(notifications)
        if (notificationsFile.exists() && !notificationsFile.delete()) {
          throw IllegalStateException("Could not replace notification inbox")
        }
        if (!temporary.renameTo(notificationsFile)) {
          throw IllegalStateException("Could not commit notification inbox")
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
            "HOST_STORAGE_NOTIFICATIONS_FAILED",
            "Could not persist the notification inbox.",
            error)
      }
    }
  }

  @ReactMethod
  override fun loadCardDataset(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(if (cardDatasetFile.exists()) cardDatasetFile.readText() else "")
      } catch (_: Exception) {
        promise.resolve("")
      }
    }
  }

  @ReactMethod
  override fun saveCardDataset(json: String, promise: Promise) {
    executor.execute {
      try {
        val temporary = File(reactContext.filesDir, "$CARD_DATASET_FILE.tmp")
        temporary.writeText(json)
        if (cardDatasetFile.exists() && !cardDatasetFile.delete()) {
          throw IllegalStateException("Could not replace card dataset")
        }
        if (!temporary.renameTo(cardDatasetFile)) {
          throw IllegalStateException("Could not commit card dataset")
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
            "HOST_STORAGE_CARD_DATASET_FAILED",
            "Could not persist the card dataset.",
            error)
      }
    }
  }

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }

  companion object {
    private const val PREFERENCES = "mini_app_platform_host"
    private const val DOCK_KEY = "dock_selection"
    private const val HOME_PREFERENCES_KEY = "home_preferences"
    private const val ANONYMOUS_ID_KEY = "tracking_anonymous_id"
    private const val TRACKING_FILE = "tracking-events.jsonl"
    private const val NOTIFICATIONS_FILE = "notification-inbox.json"
    private const val CARD_DATASET_FILE = "card-dataset.json"
  }
}
