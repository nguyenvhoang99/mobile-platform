package com.miniappplatform.nativehost
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object RemotePayload {
    fun parse(text: String, now: Long = System.currentTimeMillis()): InboxItem? = runCatching {
        require(text.toByteArray().size <= 4096); val base = JSONObject(text); val root = JSONObject(base.toString()); base.optJSONObject("data")?.let { data -> data.keys().forEach { root.put(it, data.get(it)) } }
        fun string(value: Any?, max: Int) = (value as? String)?.takeIf { it.isNotEmpty() && it.length <= max }
        fun timestamp(value: Any?): Long? { if (value is Number) return value.toDouble().takeIf { it.isFinite() && it > 0 }?.toLong(); if (value is String) { value.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 }?.let { return it.toLong() }; for (format in listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX")) { val date = runCatching { SimpleDateFormat(format, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }.parse(value) }.getOrNull(); if (date != null) return date.time } }; return null }
        val identifier = Regex("[A-Za-z0-9._:-]{1,160}"); val alert = root.optJSONObject("aps")?.optJSONObject("alert")
        val id = string(root.opt("notification_id"), 160) ?: return null; require(identifier.matches(id)); val category = string(root.opt("category"), 80) ?: return null; require(identifier.matches(category))
        val title = string(root.opt("title"), 180) ?: string(alert?.opt("title"), 180) ?: return null; val body = string(root.opt("body"), 600) ?: string(alert?.opt("body"), 600) ?: return null
        val created = timestamp(root.opt("created_at_ms") ?: root.opt("created_at")) ?: return null; val rawExpiry = root.opt("expires_at_ms") ?: root.opt("expires_at"); val expires = timestamp(rawExpiry); require(rawExpiry == null || expires != null); require(expires == null || expires > now)
        val app = string(root.opt("target_app_id"), 100); val entry = string(root.opt("entrypoint_id"), 100); require((app == null) == (entry == null))
        val encoded = root.opt("target_input") ?: root.opt("input"); val raw = if (encoded is String) JSONObject(encoded) else encoded; require(raw == null || raw is JSONObject); val input = (raw as? JSONObject)?.let { value -> value.keys().asSequence().associateWith { key -> value.get(key) as? String ?: error("Invalid input") } }.orEmpty()
        InboxItem(id, title, body, created, expires, app, entry, input)
    }.getOrNull()
}
