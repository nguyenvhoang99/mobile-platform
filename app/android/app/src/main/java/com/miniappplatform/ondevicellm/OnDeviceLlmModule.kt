package com.miniappplatform.ondevicellm

import com.miniappplatform.specs.NativeOnDeviceLlmSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod

/**
 * OnDeviceLlm TurboModule (pilot skeleton). Method signatures come from the
 * generated `NativeOnDeviceLlmSpec` (itself generated from
 * `src/native/specs/NativeOnDeviceLlm.ts`) — the module name included.
 * Do not redeclare signatures or names here; change the spec instead.
 *
 * Pilot status: bodies report `unavailable`. The device milestone wires
 * AICore + ML Kit GenAI (checkStatus/download, image picker → multimodal
 * Prompt with a host-owned bill schema, close() on teardown) here. No ML Kit
 * dependency is admitted for the pilot (mobile-simplicity: platform first,
 * no new native dep without a device milestone to justify it).
 * See docs/features/ai-extract-bill.md.
 */
class OnDeviceLlmModule(private val reactContext: ReactApplicationContext) :
    NativeOnDeviceLlmSpec(reactContext) {

  @ReactMethod
  override fun getAvailability(promise: Promise) {
    promise.resolve(result("unavailable", "On-device bill extraction is not implemented in this build."))
  }

  @ReactMethod
  override fun extractBill(requestJson: String, promise: Promise) {
    // Pilot: no picker, no inference yet. Resolve (never reject — the JS
    // facade maps this closed status) so callers always terminate.
    promise.resolve(result("unavailable", "On-device bill extraction is not implemented in this build."))
  }

  @ReactMethod
  override fun cancelBill(sessionId: String, promise: Promise) {
    // Idempotent no-op until sessions exist.
    promise.resolve(null)
  }

  private fun result(status: String, message: String) =
      Arguments.createMap().apply {
        putString("status", status)
        putString("message", message)
      }
}
