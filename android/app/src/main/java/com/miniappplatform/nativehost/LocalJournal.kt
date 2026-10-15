package com.miniappplatform.nativehost
import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

// No network transport is enabled until signed configuration and backend provisioning exist.
class LocalJournal(context: Context) {
    private val directory = File(context.filesDir, "native-telemetry")
    private val worker = Executors.newSingleThreadExecutor()
    private val bundled = JSONObject(context.assets.open("platform.json").bufferedReader().use { it.readText() })
    private val definitions = bundled.getJSONObject("hostEvents")
    private val config = bundled.getJSONObject("config").getJSONObject("tracking")
    private val tenants = (0 until bundled.getJSONArray("tenants").length()).map { bundled.getJSONArray("tenants").getJSONObject(it).getString("id") }.toSet()
    private var session = EventIdentity.uuidV7()
    private var lastActive = System.currentTimeMillis()
    private var index = 0
    private val queues = mutableMapOf<String, List<JSONObject>>()
    private val blocked = mutableSetOf<String>()
    fun record(name: String, tenant: String, data: Map<String, String> = emptyMap()) { worker.execute {
        if (tenant !in tenants || !definitions.has(name) || "host" in blocked) return@execute
        val definition = definitions.getJSONObject(name); val allowed = definition.getJSONArray("allowedDataKeys"); val keys = (0 until allowed.length()).map { allowed.getString(it) }.toSet()
        if (!keys.containsAll(data.keys) || data.values.any { it.toByteArray().size > 512 }) return@execute
        val scope = "host"; val file = AtomicFile(File(directory, "host.json")); val maxBytes = config.getInt("maxQueueBytes")
        if (scope !in queues) {
            try { queues[scope] = if (file.baseFile.exists()) { require(file.baseFile.length() <= maxBytes); val text = file.openRead().bufferedReader().use { it.readText() }; require(text.toByteArray().size <= maxBytes); val array = JSONArray(text); (0 until array.length()).map { array.getJSONObject(it) } } else emptyList() } catch (_: Exception) { blocked.add(scope); return@execute }
        }
        val now = System.currentTimeMillis(); if (now - lastActive > config.getLong("sessionRenewMs")) { session = EventIdentity.uuidV7(); index = 0 }; lastActive = now; val retention = config.getJSONObject("retentionMs")
        val queue = queues[scope].orEmpty().filter { row -> retention.has(row.optString("priority")) && now - row.optLong("occurred_at_ms") <= retention.optLong(row.optString("priority")) }.toMutableList()
        val sequence = (queues[scope].orEmpty().maxOfOrNull { it.optLong("queue_sequence", -1) } ?: -1) + 1
        val anonymous = queues[scope].orEmpty().firstOrNull()?.optString("anonymous_id")?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
        val event = JSONObject().put("tenant_id", tenant).put("event_id", "$session:$index").put("event_index", index).put("queue_sequence", sequence).put("event_name", name).put("event_version", definition.getInt("version")).put("event_data", JSONObject(data)).put("occurred_at_ms", now).put("source_type", "native").put("mini_app_id", JSONObject.NULL).put("mini_app_version", JSONObject.NULL).put("host_app_version", "1.0").put("platform", "android").put("session_id", session).put("mini_app_session_id", JSONObject.NULL).put("user_id", JSONObject.NULL).put("anonymous_id", anonymous).put("priority", definition.getString("priority")).put("trace_id", JSONObject.NULL).put("privacy_class", definition.getString("privacyClass")).put("consent_version", config.getInt("consentVersion")).put("sdk_version", 1).put("network_at_event", "unknown").put("attempt_count", 0)
        if (event.toString().toByteArray().size > config.getInt("maxEventBytes")) return@execute
        index++; queue.add(event)
        while (JSONArray(queue).toString().toByteArray().size > maxBytes) { val eviction = listOf("diagnostic", "product", "operational", "critical").firstNotNullOfOrNull { p -> queue.indexOfFirst { it.optString("priority") == p }.takeIf { it >= 0 } } ?: return@execute; queue.removeAt(eviction) }
        var output: java.io.FileOutputStream? = null
        try { directory.mkdirs(); output = file.startWrite(); output.write(JSONArray(queue).toString().toByteArray()); file.finishWrite(output); queues[scope] = queue } catch (_: Exception) { file.failWrite(output); blocked.add(scope) }
    } }
}
