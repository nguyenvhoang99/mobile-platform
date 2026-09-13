package com.miniappplatform

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.miniappplatform.notifications.NotificationEventStore
import com.miniappplatform.notifications.NotificationPayload

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleNotificationIntent(intent, "terminated")
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleNotificationIntent(intent, if (isForeground) "foreground" else "background")
  }

  override fun onStart() {
    super.onStart()
    isForeground = true
  }

  override fun onStop() {
    isForeground = false
    super.onStop()
  }

  private fun handleNotificationIntent(intent: Intent?, appState: String) {
    val payload =
        NotificationPayload.fromIntentExtras(applicationContext, intent?.extras) ?: return
    val providerMessageId =
        intent?.getStringExtra(NotificationPayload.INTENT_PROVIDER_MESSAGE_ID)
            ?: intent?.getStringExtra("google.message_id")
    NotificationEventStore.enqueue(
        applicationContext,
        "opened",
        payload,
        appState,
        providerMessageId)
    intent?.removeExtra(NotificationPayload.INTENT_PAYLOAD)
    intent?.removeExtra(NotificationPayload.INTENT_PROVIDER_MESSAGE_ID)
    intent?.removeExtra(NotificationPayload.INTENT_AUTHENTICATOR)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MiniAppPlatform"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  companion object {
    @Volatile var isForeground: Boolean = false
  }
}
