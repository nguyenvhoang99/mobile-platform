package com.miniappplatform.deviceaccess

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricPrompt
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.CancellationSignal
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.miniappplatform.specs.NativeDeviceAccessSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

/**
 * DeviceAccess TurboModule. Method signatures come from the generated
 * `NativeDeviceAccessSpec` (itself generated from
 * `src/native/specs/NativeDeviceAccess.ts`) — the module name included.
 * Do not redeclare signatures or names here; change the spec instead.
 */
class DeviceAccessModule(private val reactContext: ReactApplicationContext) :
    NativeDeviceAccessSpec(reactContext), PermissionListener {

  private enum class PendingRequest { WEATHER_LOCATION, VOICE_COMMAND }

  private var pendingPermission: PendingRequest? = null
  private var pendingPromise: Promise? = null
  private var speechRecognizer: SpeechRecognizer? = null

  @ReactMethod
  override fun getNetworkStatus(promise: Promise) {
    val manager = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val capabilities = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      manager.activeNetwork?.let(manager::getNetworkCapabilities)
    } else {
      null
    }
    val connected = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    val networkType = when {
      capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
      capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "cellular"
      else -> "unknown"
    }

    promise.resolve(result(if (connected) "available" else "offline", if (connected) "Network access is available." else "No active Wi-Fi or cellular network was found.", networkType = networkType))
  }

  @ReactMethod
  override fun authenticate(reason: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      promise.resolve(result("unavailable", "Biometric sign-in requires Android 9 or later."))
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null || activity.isFinishing) {
      promise.resolve(result("unavailable", "Biometric sign-in is unavailable while the host is not active."))
      return
    }

    val executor = ContextCompat.getMainExecutor(activity)
    val prompt = BiometricPrompt.Builder(activity)
        .setTitle("Confirm sign in")
        .setSubtitle(reason)
        .setNegativeButton("Cancel", executor) { _, _ ->
          promise.resolve(result("cancelled", "Sign-in was cancelled."))
        }
        .build()

    prompt.authenticate(CancellationSignal(), executor, object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        // This result remains host-owned. A mini-app integration must use a server-bound
        // assertion over a host-minted challenge, never this success signal.
        promise.resolve(this@DeviceAccessModule.result("authenticated", "Identity confirmed for the host."))
      }

      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
        // BIOMETRIC_ERROR_NEGATIVE_BUTTON is API 30+ and not available on all compile targets;
        // treat only USER_CANCELED as "cancelled" to keep the build green on all SDKs.
        val status = if (errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED) "cancelled" else "denied"
        promise.resolve(this@DeviceAccessModule.result(status, if (status == "cancelled") "Sign-in was cancelled." else "Identity could not be confirmed."))
      }
    })
  }

  @ReactMethod
  override fun requestWeatherLocation(promise: Promise) {
    requestPermission(Manifest.permission.ACCESS_COARSE_LOCATION, PendingRequest.WEATHER_LOCATION, promise)
  }

  @ReactMethod
  override fun startVoiceCommand(promise: Promise) {
    if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      promise.resolve(result("unavailable", "Speech recognition is unavailable on this device."))
      return
    }
    requestPermission(Manifest.permission.RECORD_AUDIO, PendingRequest.VOICE_COMMAND, promise)
  }

  private fun requestPermission(permission: String, request: PendingRequest, promise: Promise) {
    if (reactContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
      if (request == PendingRequest.VOICE_COMMAND) startSpeechRecognition(promise)
      else promise.resolve(result("granted", "Approximate location is available for weather."))
      return
    }

    val activity = reactContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      promise.resolve(result("unavailable", "The host is not active to show a permission prompt."))
      return
    }

    pendingPermission = request
    pendingPromise = promise
    activity.requestPermissions(arrayOf(permission), REQUEST_CODE, this)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray): Boolean {
    if (requestCode != REQUEST_CODE) return false

    val request = pendingPermission
    val promise = pendingPromise
    pendingPermission = null
    pendingPromise = null
    if (request == null || promise == null) return true

    val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.resolve(result("denied", "Permission was not granted."))
      return true
    }

    if (request == PendingRequest.VOICE_COMMAND) startSpeechRecognition(promise)
    else promise.resolve(result("granted", "Approximate location is available for weather."))
    return true
  }

  private fun startSpeechRecognition(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val recognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
      speechRecognizer?.destroy()
      speechRecognizer = recognizer
      recognizer.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: android.os.Bundle?) = Unit
        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onPartialResults(partialResults: android.os.Bundle?) = Unit
        override fun onEvent(eventType: Int, params: android.os.Bundle?) = Unit

        override fun onError(error: Int) {
          cleanupSpeechRecognizer()
          promise.resolve(result(if (error == SpeechRecognizer.ERROR_CLIENT) "cancelled" else "error", if (error == SpeechRecognizer.ERROR_CLIENT) "Voice command was cancelled." else "Voice command could not be recognized."))
        }

        override fun onResults(results: android.os.Bundle?) {
          val transcript = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
          cleanupSpeechRecognizer()
          if (transcript.isNullOrBlank()) promise.resolve(result("error", "No command was recognized."))
          else promise.resolve(result("recognized", "Voice command was recognized.", transcript))
        }
      })

      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
      }
      recognizer.startListening(intent)
    }
  }

  private fun cleanupSpeechRecognizer() {
    speechRecognizer?.destroy()
    speechRecognizer = null
  }

  private fun result(status: String, message: String, transcript: String? = null, networkType: String? = null) =
      Arguments.createMap().apply {
        putString("status", status)
        putString("message", message)
        transcript?.let { putString("transcript", it) }
        networkType?.let { putString("networkType", it) }
      }

  override fun invalidate() {
    // Fix: if a permission request is still pending when the bridge is torn down
    // (JS timeout, activity destroyed, or app backgrounded) the stored Promise
    // would never resolve and JS would keep loading forever. Resolve it here.
    pendingPromise?.let {
      try {
        it.resolve(result("unavailable", "Permission request was cancelled."))
      } catch (_: Exception) {
        // promise already settled — ignore
      }
    }
    pendingPromise = null
    pendingPermission = null
    cleanupSpeechRecognizer()
    super.invalidate()
  }

  companion object {
    const val REQUEST_CODE = 4401
  }
}
