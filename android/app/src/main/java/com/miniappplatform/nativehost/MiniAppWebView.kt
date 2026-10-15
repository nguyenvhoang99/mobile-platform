package com.miniappplatform.nativehost

import android.app.Activity
import android.app.AlertDialog
import android.content.*
import android.database.Cursor
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.*
import android.provider.MediaStore
import android.util.AtomicFile
import android.webkit.*
import android.widget.FrameLayout
import com.google.zxing.*
import com.google.zxing.common.HybridBinarizer
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
private val miniStorageLock = Any()
private const val CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

internal fun decodeQrBitmap(bitmap: android.graphics.Bitmap): String {
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    return MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(bitmap.width, bitmap.height, pixels))), mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE), DecodeHintType.TRY_HARDER to true)).text
}

/** The sole WebView factory for the native Android host. No raw JS/native interface. */
class MiniAppWebView(private val activity: Activity, private val tenant: String, private val catalog: Catalog, private val report: (String) -> Unit, private val appId: String = "split-bill", private val initialAdvisor: Boolean = false) {
    private val ORIGIN = "https://$appId.miniapp.platform.local"
    private val PACKAGE = "miniapps/$appId/"
    val view = FrameLayout(activity)
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newFixedThreadPool(2)
    private val assets = mutableMapOf<String, ByteArray>()
    private val manifest: JSONObject
    private val web: WebView
    private var port: WebMessagePort? = null
    @Volatile private var destroyed = false
    @Volatile private var foreground = true
    private val pending = mutableMapOf<String, JSONObject>()
    private val completed = linkedMapOf<String, JSONObject>()
    private val buckets = mutableMapOf<String, Pair<Double, Long>>()
    private val audit = ArrayDeque<String>()
    private val completedOrder = ArrayDeque<String>()
    private val fingerprints = mutableMapOf<String,String>()
    @Volatile private var connection: HttpURLConnection? = null
    @Volatile private var networkId: String? = null
    private var scanId: String? = null
    private var expenseId: String? = null
    private val expenseModel = ExpenseLocalModel(activity)
    private var notificationId: String? = null
    private var scanUri: Uri? = null
    private var dialog: AlertDialog? = null
    var externalPicker = false; private set
    init {
        require(appId in setOf("split-bill", "manage-expense"))
        val index = JSONObject(activity.assets.open(PACKAGE + "package.json").bufferedReader().use { it.readText() })
        require(index.getString("appId") == appId)
        val files = index.getJSONObject("files")
        require(files.keys().asSequence().toSet() == setOf("index.html", "bundle.js", "host.js", "manifest.json"))
        files.keys().forEach { name -> val bytes = activity.assets.open(PACKAGE + name).use { it.readBytes() }; require(digest(bytes) == files.getString(name)); assets["/$name"] = bytes }
        manifest = JSONObject(String(assets.getValue("/manifest.json")))
        require(manifest.getString("id") == appId)
        assets["/"] = assets.getValue("/index.html")
        web = WebView(activity)
        WebView.setWebContentsDebuggingEnabled((activity.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
        web.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = false; databaseEnabled = false
            allowFileAccess = false; allowContentAccess = false; allowFileAccessFromFileURLs = false; allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW; javaScriptCanOpenWindowsAutomatically = false; setSupportMultipleWindows(true)
            mediaPlaybackRequiresUserGesture = true; cacheMode = WebSettings.LOAD_NO_CACHE; setGeolocationEnabled(false)
        }
        CookieManager.getInstance().setAcceptCookie(false); CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
            override fun onCreateWindow(view: WebView?, dialog: Boolean, gesture: Boolean, message: Message?) = false
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val uri = request.url
                if (uri.scheme != "https" || uri.host != "$appId.miniapp.platform.local" || uri.port != -1 || uri.query != null || uri.userInfo != null || request.method != "GET") return response(null)
                val path = uri.encodedPath ?: "/"
                val bytes = assets[path] ?: if (allowedPage(uri)) assets["/"] else null
                return response(bytes, if (path.endsWith(".js")) "application/javascript" else "text/html")
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = !request.isForMainFrame || !allowedPage(request.url)
            @Suppress("DEPRECATION") override fun shouldOverrideUrlLoading(view: WebView, url: String) = !allowedPage(Uri.parse(url))
            override fun onPageFinished(view: WebView, url: String) {
                if (destroyed || !allowedPage(Uri.parse(url))) return
                port?.close()
                val channels = web.createWebMessageChannel(); port = channels[0]
                channels[0].setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
                    override fun onMessage(port: WebMessagePort, message: WebMessage) { if (!destroyed) receive(message.data ?: "") }
                }, main)
                web.postWebMessage(WebMessage("miniapp-port-v1", arrayOf(channels[1])), Uri.parse(ORIGIN))
                report("mini app · lưu nháp qua host.")
            }
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean { close(); report("Mini app đã dừng. Đóng và mở lại mini app; nháp đã lưu vẫn còn."); return true }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) { if (request.isForMainFrame) report("Không mở được mini app. Đóng và thử lại.") }
        }
        view.addView(web, FrameLayout.LayoutParams(-1, -1)); report("Đang mở mini app…")
        main.postDelayed({ if (!destroyed && port == null) report("Mini app chưa phản hồi. Bạn có thể đóng và mở lại.") }, 8000)
        web.loadUrl("$ORIGIN/" + if(appId == "manage-expense" && initialAdvisor) "#advisor" else "")
    }
    private fun response(bytes: ByteArray?, mime: String = "text/plain") = WebResourceResponse(mime, "UTF-8", if (bytes == null) 403 else 200, if (bytes == null) "Forbidden" else "OK", mapOf("Content-Security-Policy" to CSP, "Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff"), ByteArrayInputStream(bytes ?: byteArrayOf()))
    private fun allowedPage(uri: Uri): Boolean {
        if (uri.scheme != "https" || uri.host != "$appId.miniapp.platform.local" || uri.port != -1 || uri.userInfo != null || uri.query != null) return false
        val path = uri.encodedPath ?: "/"; if (path.contains('%') || path.contains("..")) return false
        return path == "/index.html" || (0 until manifest.getJSONArray("routes").length()).any { Regex("^" + manifest.getJSONArray("routes").getString(it).split('/').joinToString("/") { p -> if (p.startsWith(':')) "[A-Za-z0-9_-]+" else Regex.escape(p) } + "$").matches(path) }
    }
    private fun error(code: String) = JSONObject().put("ok", false).put("error", code).put("data", JSONObject.NULL)
    private fun success(data: Any? = null) = JSONObject().put("ok", true).put("data", data ?: JSONObject.NULL)
    private fun finish(id: String, result: JSONObject) {
        val request = pending.remove(id) ?: return
        val entry = "${request.optString("capability")}/${request.optString("operation")}:${result.optString("error", "OK")}:${digest(request.toString().toByteArray())}"
        if (audit.size >= 128) audit.removeFirst(); audit.addLast(entry)
        result.put("id", id); completed[id] = result; completedOrder.addLast(id)
        if (completedOrder.size > 256) { val old=completedOrder.removeFirst(); completed.remove(old); fingerprints.remove(old) }
        if (!destroyed) runCatching { port?.postMessage(WebMessage(result.toString())) }
    }
    private fun reject(id: String, code: String) { pending[id] = JSONObject(); finish(id, error(code)) }
    private fun receive(raw: String) {
        if (raw.toByteArray().size > 1000000) return
        val request = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val id = request.optString("id"); if (!Regex("[A-Za-z0-9_-]{1,100}").matches(id)) return
        val fingerprint = digest(request.toString().toByteArray())
        completed[id]?.let { port?.postMessage(WebMessage((if(fingerprints[id]==fingerprint) it else error("INVALID_ARGUMENT").put("id",id)).toString())); return }
        if (pending.containsKey(id)) return
        if (pending.size >= 32) { port?.postMessage(WebMessage(error("RATE_LIMITED").put("id", id).toString())); return }
        pending[id] = request; fingerprints[id] = fingerprint
        val keys = request.keys().asSequence().toSet()
        if (raw.toByteArray().size > catalog.capabilities.maxOf { it.payloadCap } + 512 || keys != setOf("id", "capability", "operation", "version", "args") || request.opt("version") != 1 || !foreground) { finish(id, error(if (!foreground) "REVOKED" else "INVALID_ARGUMENT")); return }
        val cap = request.optString("capability"); val rule = catalog.capabilities.find { it.name == cap && it.version == 1 }
        val declarations = manifest.getJSONArray("capabilities")
        if (rule == null || (0 until declarations.length()).none { declarations.getJSONObject(it).getString("name") == cap } || (cap !in setOf("storage.kv", "scanner.scan", "net.request") && !(appId == "manage-expense" && cap in setOf("ai.extract_expenses", "notifications.schedule_digest")))) { finish(id, error("CAPABILITY_NOT_GRANTED")); return }
        val args = request.optJSONObject("args") ?: run { finish(id, error("INVALID_ARGUMENT")); return }
        if (args.toString().toByteArray().size > rule.payloadCap) { finish(id, error("INVALID_ARGUMENT")); return }
        val now = SystemClock.elapsedRealtime(); val bucket = buckets[cap] ?: (rule.burst.toDouble() to now)
        val tokens = minOf(rule.burst.toDouble(), bucket.first + (now - bucket.second) * rule.sustained / 60000.0)
        buckets[cap] = (if (tokens >= 1) tokens - 1 else tokens) to now
        if (tokens < 1) { finish(id, error("RATE_LIMITED")); return }
        main.postDelayed({ if (pending.containsKey(id)) { if (scanId == id) stopScan(); if (expenseId == id) stopExpense(); if (networkId == id) { connection?.disconnect(); networkId = null }; finish(id, error("TIMEOUT")) } }, if (cap == "ai.extract_expenses") 120000 else if (cap == "scanner.scan") 60000 else 15000)
        when (cap) {
            "ai.extract_expenses" -> if (request.optString("operation") == "extract" && args.keys().asSequence().toSet() == setOf("locale", "idempotencyKey") && args.optString("locale") == "vi" && args.optString("idempotencyKey").length in 1..100) extractExpense(id) else finish(id, error("INVALID_ARGUMENT"))
            "notifications.schedule_digest" -> if (request.optString("operation") == "schedule") scheduleDigest(id,args) else finish(id,error("INVALID_ARGUMENT"))
            "storage.kv" -> if (request.optString("operation") == "kv") storage(id, args, rule.payloadCap) else finish(id, error("INVALID_ARGUMENT"))
            "net.request" -> if (request.optString("operation") == "request") network(id, args, rule.payloadCap) else finish(id, error("INVALID_ARGUMENT"))
            "scanner.scan" -> if (request.optString("operation") == "scan" && args.keys().asSequence().all { it in setOf("mode", "formats", "purpose", "timeoutMs") } && args.optString("mode") in setOf("qr", "once") && (!args.has("formats") || args.optJSONArray("formats")?.toString() == "[\"qr\"]")) scan(id) else finish(id, error("INVALID_ARGUMENT"))
        }
    }
    private fun storage(id: String, args: JSONObject, limit: Int) {
        val op = args.optString("op"); val key = args.opt("key") as? String
        if (op !in setOf("get", "set", "delete") || key == null || key.length !in 1..128 || args.keys().asSequence().any { it !in setOf("op", "key", "value") } || (op == "set" && args.opt("value") !is String)) { finish(id, error("INVALID_ARGUMENT")); return }
        val capacity = if(appId == "manage-expense") 24 * 1024 * 1024 else limit
        worker.execute {
            val result = runCatching { synchronized(miniStorageLock) {
                val file = AtomicFile(File(activity.filesDir, "mini-kv-${digest("$tenant/$appId/local-preview-user".toByteArray())}.json"))
                val values = if (file.baseFile.exists()) { require(file.baseFile.length() <= capacity); JSONObject(String(file.readFully())) } else JSONObject()
                require(values.keys().asSequence().all { it.length in 1..128 && values.opt(it) is String })
                if (op == "get") return@runCatching success(JSONObject().put("value", values.opt(key) ?: JSONObject.NULL))
                if (op == "delete") values.remove(key) else values.put(key, args.getString("value"))
                val bytes = values.toString().toByteArray(); require(bytes.size <= capacity)
                if (!foreground || destroyed) return@runCatching error("REVOKED")
                var stream: FileOutputStream? = null
                try { stream = file.startWrite(); stream.write(bytes); file.finishWrite(stream) } catch (e: Exception) { stream?.let(file::failWrite); throw e }
                success()
            } }.getOrElse { error("UNAVAILABLE") }
            main.post { finish(id, result) }
        }
    }
    private fun network(id: String, args: JSONObject, limit: Int) {
        val url = args.opt("url") as? String
        val hosts = manifest.getJSONArray("egressHosts")
        if (url != "https://vietqr.net/api/banks" || args.optString("method") != "GET" || args.keys().asSequence().any { it !in setOf("url", "method") } || (0 until hosts.length()).none { hosts.getString(it) == "vietqr.net" } || networkId != null) { finish(id, error("INVALID_ARGUMENT")); return }
        networkId = id
        worker.execute {
            val result = runCatching {
                if (networkId != id || destroyed || !foreground) return@runCatching error("REVOKED")
                val conn = URL(url).openConnection() as HttpURLConnection; connection = conn
                conn.instanceFollowRedirects = false; conn.connectTimeout = 8000; conn.readTimeout = 8000; conn.useCaches = false
                conn.setRequestProperty("Accept", "application/json")
                try {
                    val status = conn.responseCode; if (status !in 200..299) return@runCatching error("UNAVAILABLE")
                    require(conn.contentLengthLong <= limit)
                    val output = ByteArrayOutputStream(); val buffer = ByteArray(4096)
                    conn.inputStream.use { input -> while (true) { val n = input.read(buffer); if (n < 0) break; require(output.size() + n <= limit); output.write(buffer, 0, n) } }
                    success(JSONObject().put("status", status).put("body", output.toString("UTF-8")))
                } finally { conn.disconnect(); connection = null }
            }.getOrElse { error(if (it is java.net.SocketTimeoutException) "TIMEOUT" else "UNAVAILABLE") }
            main.post { if (networkId == id) networkId = null; finish(id, result) }
        }
    }
    private fun scan(id: String) {
        if (scanId != null) { finish(id, error("UNAVAILABLE")); return }; scanId = id
        dialog = AlertDialog.Builder(activity).setTitle("mini app · Quét VietQR").setMessage("Chọn camera hoặc một ảnh QR. Chỉ mã QR được trả về mini app.")
            .setPositiveButton("Camera") { _, _ -> launchPicker(true) }.setNeutralButton("Chọn ảnh") { _, _ -> launchPicker(false) }
            .setNegativeButton("Hủy") { _, _ -> finish(id, error("CONSENT_DENIED")); stopScan() }.setOnCancelListener { finish(id, error("CONSENT_DENIED")); stopScan() }.show()
    }
    private fun launchPicker(camera: Boolean) {
        try {
            val intent = if (camera) {
                val name = UUID.randomUUID().toString() + ".jpg"; val dir = File(activity.cacheDir, "qr-capture").apply { mkdirs() }
                dir.listFiles()?.filter { it.lastModified() < System.currentTimeMillis() - 120000 }?.forEach { it.delete() }
                val uri = Uri.parse("content://${activity.packageName}.scan/$name"); scanUri = uri
                Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri).apply { addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION); clipData = ClipData.newRawUri("QR capture", uri) }
            } else Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
            externalPicker = true; activity.startActivityForResult(intent, 701)
        } catch (_: Exception) { val id = scanId; stopScan(); id?.let { finish(it, error("UNAVAILABLE")) } }
    }
    fun activityResult(code: Int, result: Int, data: Intent?): Boolean {
        if (code == 702 || code == 703) {
            val id = expenseId ?: return true; externalPicker = false
            val uri = data?.data
            if (result != Activity.RESULT_OK || uri == null) { finish(id,error("CONSENT_DENIED")); stopExpense(); return true }
            worker.execute {
                val reply = runCatching {
                    if (code == 703) { expenseModel.importModel(uri) { destroyed || expenseId != id }; error("UNAVAILABLE") }
                    else success(expenseModel.extract(uri) { destroyed || expenseId != id })
                }.getOrElse { error("UNAVAILABLE") }
                main.post { if (expenseId == id) { finish(id,reply); stopExpense(); if (code == 703) report("Đã nhập model local. Chọn Đọc từ ảnh để bắt đầu; chưa có giao dịch được ghi.") } }
            }; return true
        }

        if (code != 701) return false
        externalPicker = false
        val id = scanId ?: return true; val uri = scanUri ?: data?.data
        if (result != Activity.RESULT_OK || uri == null) { stopScan(); finish(id, error("CONSENT_DENIED")); return true }
        worker.execute {
            val reply = runCatching {
                val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                activity.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, options) }
                require(options.outWidth > 0 && options.outHeight > 0)
                options.inSampleSize = 1; while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > 1600) options.inSampleSize *= 2
                options.inJustDecodeBounds = false
                val bitmap = activity.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, options) } ?: throw IOException("No image")
                try {
                    val qr = decodeQrBitmap(bitmap)
                    require(qr.toByteArray().size <= catalog.capabilities.first { it.name == "scanner.scan" }.payloadCap)
                    success(JSONObject().put("value", qr).put("format", "qr"))
                } finally { bitmap.recycle() }
            }.getOrElse { error("UNAVAILABLE") }
            main.post { if (scanId == id) { stopScan(); finish(id, reply) } }
        }; return true
    }
    private fun extractExpense(id: String) {
        if (expenseId != null || scanId != null) { finish(id,error("UNAVAILABLE")); return }; expenseId = id
        val modelReady = expenseModel.available()
        dialog = AlertDialog.Builder(activity).setTitle(if(modelReady) "Đọc ảnh trên thiết bị" else "Cần model local")
            .setMessage(if(modelReady) "Chỉ ảnh bạn chọn được model đọc trên máy. Kiểm tra từng giao dịch nháp trước khi lưu." else "Chọn model multimodal .litertlm đã tải từ nguồn tin cậy. Host giữ model trong bộ nhớ riêng; không tự tải model hoặc gửi ảnh lên mạng.")
            .setPositiveButton(if(modelReady) "Chọn ảnh" else "Nhập model") { _, _ ->
                try { externalPicker = true; activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(if(modelReady) "image/*" else "*/*"), if(modelReady) 702 else 703) }
                catch (_: Exception) { externalPicker = false; finish(id,error("UNAVAILABLE")); stopExpense() }
            }.setNegativeButton("Hủy") { _, _ -> finish(id,error("CONSENT_DENIED")); stopExpense() }
            .setOnCancelListener { finish(id,error("CONSENT_DENIED")); stopExpense() }.create()
        dialog?.show()
    }
    private fun stopExpense() { expenseModel.cancel(); expenseId = null; externalPicker = false; dialog?.dismiss(); dialog = null }
    private fun scheduleDigest(id: String, args: JSONObject) {
        if (!ExpenseDigests.valid(args)) { finish(id,error("INVALID_ARGUMENT")); return }
        val enabled = args.getJSONObject("preferences").getBoolean("enabled")
        if (enabled && !Reminders.permission(activity)) {
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) { notificationId = id; activity.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),704); return }
            finish(id,error("CONSENT_DENIED")); return
        }
        worker.execute { val result = runCatching { ExpenseDigests.schedule(activity,tenant,args); success() }.getOrElse { error("UNAVAILABLE") }; main.post { finish(id,result) } }
    }
    fun permissionResult(grants: IntArray) {
        val id = notificationId ?: return; notificationId = null
        val args = pending[id]?.optJSONObject("args") ?: return
        if (grants.firstOrNull() != android.content.pm.PackageManager.PERMISSION_GRANTED) { finish(id,error("CONSENT_DENIED")); return }; scheduleDigest(id,args)
    }
    private fun stopScan() { dialog?.dismiss(); dialog = null; scanUri?.let { activity.revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION); File(activity.cacheDir, "qr-capture/${it.lastPathSegment}").delete() }; scanUri = null; scanId = null; externalPicker = false }
    fun pause() { foreground = false; if (!externalPicker) stopExpense(); web.onPause(); connection?.disconnect(); networkId = null; if (!externalPicker) { val id = scanId; stopScan(); id?.let { finish(it, error("CONSENT_DENIED")) } }; pending.keys.toList().filter { it != scanId && !(externalPicker && it == expenseId) && it != notificationId }.forEach { finish(it, error("REVOKED")) } }
    fun resume() { foreground = true; web.onResume() }
    fun back(): Boolean { if (destroyed) return false; if (web.canGoBack()) { web.goBack(); return true }; return false }
    fun close() { if (destroyed) return; foreground = false; connection?.disconnect(); networkId = null; stopExpense(); stopScan(); pending.keys.toList().forEach { finish(it, error("REVOKED")) }; destroyed = true; main.removeCallbacksAndMessages(null); port?.close(); port = null; view.removeAllViews(); web.stopLoading(); web.destroy(); worker.shutdownNow() }
}

/** Only random temporary capture files, accessed via OS-issued URI grants. */
class ScanCaptureProvider : ContentProvider() {
    override fun onCreate() = true
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val name = uri.lastPathSegment ?: throw FileNotFoundException()
        if (!Regex("[a-f0-9-]{36}\\.jpg").matches(name)) throw FileNotFoundException()
        val dir = File(context!!.cacheDir, "qr-capture").apply { mkdirs() }
        return ParcelFileDescriptor.open(File(dir, name), ParcelFileDescriptor.parseMode(mode))
    }
    override fun getType(uri: Uri) = "image/jpeg"
    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?) = 0
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?) = 0
}
