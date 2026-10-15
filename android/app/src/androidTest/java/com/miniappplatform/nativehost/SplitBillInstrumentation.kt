package com.miniappplatform.nativehost

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.os.Bundle
import android.webkit.WebView
import android.widget.*
import android.view.*
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.json.JSONTokener

/** Real page/transport/native broker regression tests, with synthetic private data. */
class SplitBillInstrumentation : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
    private lateinit var activity: Activity
    override fun onStart() {
        val output = Bundle()
        try {
            activity = startActivitySync(Intent(Intent.ACTION_MAIN).setClassName(targetContext.packageName, "${targetContext.packageName}.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            onUI { activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
            await { activity.hasWindowFocus() && views().filterIsInstance<TextView>().any { it.text.toString().startsWith("Home · ") } && views().filterIsInstance<ListView>().any { it.width > 0 && it.height > 0 && it.count > 0 } }
            open()
            await { views().filterIsInstance<WebView>().isNotEmpty() }
            awaitJS("document.getElementById('persist-badge').getAttribute('data-mode') === 'bridge'")
            check(js("document.documentElement.getAttribute('data-mode')") == "miniapp")
            check(js("Object.isFrozen(window.__MINIAPP_CAPS__) && Object.isFrozen(window.MiniAppBridge)") == true)
            onUI { val settings = web().settings; check(!settings.domStorageEnabled && !settings.allowFileAccess && !settings.allowContentAccess && !settings.javaScriptCanOpenWindowsAutomatically) }
            val matrix = com.google.zxing.qrcode.QRCodeWriter().encode("native-qr-fixture", com.google.zxing.BarcodeFormat.QR_CODE, 256, 256)
            val bitmap = android.graphics.Bitmap.createBitmap(256, 256, android.graphics.Bitmap.Config.ARGB_8888)
            for (y in 0 until 256) for (x in 0 until 256) bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            check(decodeQrBitmap(bitmap) == "native-qr-fixture"); bitmap.recycle()
            val fixture = "synthetic-${System.nanoTime()}"
            fun call(cap: String, op: String, args: JSONObject, version: Int = 1, extra: Boolean = false, id: String = "test-${System.nanoTime()}"): JSONObject {
                val request = JSONObject().put("id", id).put("capability", cap).put("operation", op).put("version", version).put("args", args)
                if (extra) request.put("appId", "another-app")
                js("window.testResult=null; MiniAppBridge.request($request).then(function(r){window.testResult=r;}); true")
                awaitJS("window.testResult !== null")
                return JSONObject(js("JSON.stringify(window.testResult)") as String)
            }
            check(call("storage.kv", "kv", JSONObject().put("op", "set").put("key", "native-fixture").put("value", fixture)).getBoolean("ok"))
            val duplicate = "test-duplicate"
            check(call("storage.kv", "kv", JSONObject().put("op", "set").put("key", "dedupe-fixture").put("value", "first"), id = duplicate).getBoolean("ok"))
            check(call("storage.kv", "kv", JSONObject().put("op", "set").put("key", "dedupe-fixture").put("value", "second"), id = duplicate).getBoolean("ok"))
            check(call("storage.kv", "kv", JSONObject().put("op", "get").put("key", "dedupe-fixture")).getJSONObject("data").getString("value") == "first")
            check(call("storage.kv", "kv", JSONObject().put("op", "get").put("key", "native-fixture"), extra = true).getString("error") == "INVALID_ARGUMENT")
            check(call("storage.kv", "kv", JSONObject().put("op", "get").put("key", "native-fixture"), version = 2).getString("error") == "INVALID_ARGUMENT")
            check(call("crypto.sign", "sign", JSONObject()).getString("error") == "CAPABILITY_NOT_GRANTED")
            check(call("net.request", "request", JSONObject().put("url", "https://evil.example/api").put("method", "GET")).getString("error") == "INVALID_ARGUMENT")
            check(call("storage.kv", "kv", JSONObject().put("op", "set").put("key", "big").put("value", "x".repeat(70000))).getString("error") == "INVALID_ARGUMENT")
            js("window.persistBlocked=false; try { window.localStorage.setItem('x','bad') } catch(e) { window.persistBlocked=true }; window.persistBlocked") .let { check(it == true) }
            js("window.directBlocked=false; fetch('https://example.org').then(function(){window.directBlocked='bad'},function(){window.directBlocked=true});true")
            awaitJS("window.directBlocked === true")
            js("window.location.href='https://example.org';true"); Thread.sleep(400)
            onUI { check(web().url == "https://split-bill.miniapp.platform.local/") }
            // Use actual author UI to create an expense, rather than only testing a synthetic KV key.
            js("var i=document.getElementById('item-input');i.value='Bữa tối 45k An trả';i.dispatchEvent(new Event('input',{bubbles:true}));i.parentElement.querySelector('button').click();var sheet=document.getElementById('sheet-overlay');if(!sheet.hidden){Array.from(sheet.querySelectorAll('button')).find(function(b){return b.textContent==='Xác nhận'}).click()};true")
            awaitJS("document.getElementById('persist-badge').getAttribute('data-mode') === 'bridge' && document.getElementById('step-body').textContent.includes('45.000')")
            Thread.sleep(700) // Mini-app coalesces saves; closing is not itself a durable-write acknowledgement.
            check(call("storage.kv", "kv", JSONObject().put("op", "get").put("key", "splitbill:bill")).getJSONObject("data").getString("value").contains("45000"))
            click("Đóng"); open(); awaitJS("document.getElementById('step-body').textContent.includes('45.000')")
            check(call("storage.kv", "kv", JSONObject().put("op", "get").put("key", "native-fixture")).getJSONObject("data").getString("value") == fixture)
            check(call("storage.kv", "kv", JSONObject().put("op", "delete").put("key", "native-fixture")).getBoolean("ok"))
            check(call("storage.kv", "kv", JSONObject().put("op", "delete").put("key", "dedupe-fixture")).getBoolean("ok"))
            js("window.scanResult=null;MiniAppBridge.request({id:'test-scan',capability:'scanner.scan',operation:'scan',version:1,args:{mode:'qr',formats:['qr']}}).then(function(r){window.scanResult=r});true")
            await { uiAutomation.rootInActiveWindow?.findAccessibilityNodeInfosByText("Hủy")?.isNotEmpty() == true }; check(uiAutomation.rootInActiveWindow.findAccessibilityNodeInfosByText("Hủy").first().performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)); awaitJS("window.scanResult && window.scanResult.error === 'CONSENT_DENIED'")
            js("window.floodDenied=null;Promise.all(Array.from({length:25},function(_,i){return MiniAppBridge.request({id:'flood-'+Date.now()+'-'+i,capability:'storage.kv',operation:'kv',version:1,args:{op:'get',key:'flood-fixture'}})})).then(function(r){window.floodDenied=r.filter(function(x){return x.error==='RATE_LIMITED'}).length});true")
            awaitJS("window.floodDenied > 0")
            click("Đóng")
            output.putString("stream", "PASS: real WebView boot, shared bridge, durable draft/reopen, dedupe, malformed/forged/version/unknown/oversized, egress/navigation/storage isolation, scanner cancel, quota flood rejection.\n")
            finish(Activity.RESULT_OK, output)
        } catch (e: Throwable) { output.putString("stream", "FAIL: ${e.javaClass.simpleName}: ${e.message}\n"); finish(Activity.RESULT_CANCELED, output) }
    }
    private fun onUI(work: () -> Unit) { var failure: Throwable? = null; runOnMainSync { try { work() } catch (e: Throwable) { failure=e } }; failure?.let { throw it } }
    private fun views(): List<View> { fun flatten(v: View): List<View> = listOf(v) + if (v is ViewGroup) (0 until v.childCount).flatMap { flatten(v.getChildAt(it)) } else emptyList()
        return flatten(activity.window.decorView) }
    private fun web() = views().filterIsInstance<WebView>().first()
    private fun js(code: String): Any? { val latch = CountDownLatch(1); var result: Any? = null; onUI { web().evaluateJavascript(code) { result = JSONTokener(it).nextValue(); latch.countDown() } }; check(latch.await(5, TimeUnit.SECONDS)); return result }
    private fun awaitJS(code: String) { repeat(100) { if (runCatching { js(code) == true }.getOrDefault(false)) return; Thread.sleep(100) }; error("Page condition timed out: $code") }
    private fun await(work: () -> Boolean) { repeat(100) { var ready=false; onUI { ready=work() }; if(ready) return; Thread.sleep(100) }; error("Native condition timed out") }
    private fun click(label: String) { onUI { views().filterIsInstance<Button>().firstOrNull { it.text == label }?.performClick() ?: run { error("Button $label missing") } }; waitForIdleSync() }
    private fun open() { click("Khám phá"); await { views().filterIsInstance<ListView>().any { it.width > 0 && it.height > 0 && it.count > 0 } }; var count=0; onUI { count=views().filterIsInstance<ListView>().first().count }; for (i in 0 until count) { onUI { views().filterIsInstance<ListView>().first().setSelection(i) }; Thread.sleep(150); waitForIdleSync(); var found=false; onUI { val text=views().filterIsInstance<TextView>().firstOrNull { it.text == "Chia tiền" }; if(text != null) { var v: View=text; while(!v.isClickable) v=v.parent as View; v.performClick(); found=true } }; if(found) return }; error("Missing Chia tiền") }
}
