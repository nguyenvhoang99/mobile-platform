package com.miniappplatform.nativehost

import java.text.Normalizer
import java.util.Calendar
import java.util.UUID
import java.security.MessageDigest

 data class Entry(val name: String, val path: String, val sources: List<String>, val keys: List<String>)
 data class Link(val id: String, val label: String, val app: String, val entry: String, val keys: List<String>)
 data class MiniApp(val id: String, val name: String, val shortName: String, val routes: List<String>, val root: String, val entries: List<Entry>, val links: List<Link>)
 data class Tenant(val id: String, val label: String, val description: String, val apps: List<String>, val accent: String, val lat: Double, val lon: Double)
 data class Category(val id: String, val name: String, val description: String, val apps: List<String>, val audience: String)
 data class Benefit(val title: String, val detail: String, val type: String)
 data class BankCard(val id: String, val bank: String, val name: String, val brand: String, val fee: Long, val firstFree: Boolean, val benefits: List<Benefit>) {
    val searchable = fold((listOf(bank, name) + benefits.flatMap { listOf(it.title, it.detail) }).joinToString(" "))
    val headline get() = benefits.minByOrNull { listOf("cashback", "discount", "interest_free", "lounge", "other").indexOf(it.type).let { rank -> if (rank < 0) 4 else rank } }?.title.orEmpty()
 }
 fun fold(text: String) = Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").replace('đ', 'd').replace('Đ', 'D').lowercase(java.util.Locale.ROOT)
 fun matches(text: String, query: String): Boolean = fold(query).split(Regex("\\s+")).filter { it.isNotEmpty() }.all { fold(text).contains(it) }
 data class Person(val id: String, val name: String)
 data class Slot(val id: String, val date: String, val court: String, val venue: String, val start: String, val end: String, val price: Long, val capacity: Int, val owner: String?, val visibility: String, val people: List<Person>) {
    val includesMe get() = people.any { it.id == "me" }
    fun book(open: Boolean) = if (owner == null) copy(owner = "me", visibility = if (open) "open" else "private", people = listOf(Person("me", "Bạn"))) else this
    fun join() = if (owner == "other" && visibility == "open" && people.size < capacity && !includesMe) copy(people = people + Person("me", "Bạn")) else this
    fun cancel() = if (owner == "me") copy(owner = null, visibility = "private", people = emptyList()) else this
    fun remove(id: String) = if (owner == "me" && id != "me") copy(people = people.filter { it.id != id }) else this
    fun interval(now: Calendar = Calendar.getInstance()): Pair<Long, Long>? = runCatching {
        fun clock(text: String): Pair<Int, Int> { require(Regex("[0-9]{2}:[0-9]{2}").matches(text)); val p = text.split(':').map(String::toInt); require(p[0] in 0..23 && p[1] in 0..59); return p[0] to p[1] }
        val s = clock(start); val e = clock(end); val begin = now.clone() as Calendar
        if (date == "tomorrow") begin.add(Calendar.DAY_OF_MONTH, 1)
        if (date == "weekend") { var delta = (Calendar.SATURDAY - begin.get(Calendar.DAY_OF_WEEK) + 7) % 7; val today = begin.clone() as Calendar; today.set(Calendar.HOUR_OF_DAY, s.first); today.set(Calendar.MINUTE, s.second); if (delta == 0 && today.timeInMillis <= now.timeInMillis) delta = 7; begin.add(Calendar.DAY_OF_MONTH, delta) }
        begin.set(Calendar.HOUR_OF_DAY, s.first); begin.set(Calendar.MINUTE, s.second); begin.set(Calendar.SECOND, 0); begin.set(Calendar.MILLISECOND, 0)
        val finish = begin.clone() as Calendar; finish.set(Calendar.HOUR_OF_DAY, e.first); finish.set(Calendar.MINUTE, e.second); if (finish.timeInMillis <= begin.timeInMillis) finish.add(Calendar.DAY_OF_MONTH, 1)
        begin.timeInMillis to finish.timeInMillis
    }.getOrNull()
 }
 data class Capability(val name: String, val version: Int, val risk: String, val consent: String, val minTier: String, val payloadCap: Int, val sustained: Int, val burst: Int)
 data class Catalog(val apps: List<MiniApp>, val tenants: List<Tenant>, val categories: List<Category>, val cards: List<BankCard>, val slots: List<Slot>, val capabilities: List<Capability>, val maxInboxItems: Int, val reminderLeadMs: Long) {
    fun app(id: String) = apps.find { it.id == id }
    fun tenant(id: String) = tenants.find { it.id == id } ?: tenants.first { it.id == "vn-fallback" }
    fun resolve(lat: Double, lon: Double): String {
        if (!lat.isFinite() || !lon.isFinite() || kotlin.math.abs(lat) > 90 || kotlin.math.abs(lon) > 180) return "vn-fallback"
        fun distance(t: Tenant): Double { val rad = Math.PI / 180; val a = kotlin.math.sin((t.lat - lat) * rad / 2).let { it * it } + kotlin.math.cos(lat * rad) * kotlin.math.cos(t.lat * rad) * kotlin.math.sin((t.lon - lon) * rad / 2).let { it * it }; return 6371 * 2 * kotlin.math.asin(kotlin.math.sqrt(a.coerceIn(0.0, 1.0))) }
        return tenants.filter { it.id != "vn-fallback" }.minByOrNull(::distance)?.let { if (distance(it) <= 350) it.id else "vn-fallback" } ?: "vn-fallback"
    }
 }
 object Routes {
    private fun segments(path: String): List<String>? {
        if (!path.startsWith('/') || path.startsWith("//") || path.toByteArray().size > 512 || path.contains("://") || path.contains('\\')) return null
        val segments = path.substringBefore('?').substringBefore('#').split('/').filter { it.isNotEmpty() }
        return runCatching { segments.onEach { part -> val decoded = java.net.URLDecoder.decode(part.replace("+", "%2B"), "UTF-8"); require(decoded != "." && decoded != ".." && !decoded.contains('/') && !decoded.contains('\\')) } }.getOrNull()
    }
    fun allows(path: String, app: MiniApp): Boolean { val parts = segments(path) ?: return false; return app.routes.any { pattern -> val declared = segments(pattern); declared != null && parts.size == declared.size && declared.zip(parts).all { (a, b) -> a.startsWith(':') || a == b } } }
 }
 data class Frame(val app: String, val session: String = UUID.randomUUID().toString(), val history: List<String> = listOf("/")) { val path get() = history.last() }
 class Navigator {
    var frames: List<Frame> = emptyList(); private set
    fun close() { frames = emptyList() }
    fun open(id: String, catalog: Catalog, tenant: String): Boolean { val app = catalog.app(id) ?: return false; if (id !in catalog.tenant(tenant).apps) return false; val index = frames.indexOfFirst { it.app == id }; frames = if (index >= 0) frames.take(index + 1) else frames + Frame(id, history = listOf(app.root)); return true }
    fun navigate(path: String, catalog: Catalog): Boolean { val frame = frames.lastOrNull() ?: return false; val app = catalog.app(frame.app) ?: return false; if (!Routes.allows(path, app) || frame.history.size >= 100) return false; if (frame.path != path) frames = frames.dropLast(1) + frame.copy(history = frame.history + path); return true }
    fun back() { val frame = frames.lastOrNull() ?: return; frames = if (frame.history.size > 1) frames.dropLast(1) + frame.copy(history = frame.history.dropLast(1)) else frames.dropLast(1) }
    fun cross(id: String, catalog: Catalog, tenant: String): Boolean { val source = frames.lastOrNull()?.app?.let(catalog::app) ?: return false; val link = source.links.find { it.id == id } ?: return false; val target = catalog.app(link.app) ?: return false; val entry = target.entries.find { it.name == link.entry && source.id in it.sources } ?: return false; if (!Routes.allows(entry.path, target) || !open(target.id, catalog, tenant)) return false; frames = frames.dropLast(1) + Frame(target.id, history = listOf(entry.path)); return true }
    fun notification(item: InboxItem, catalog: Catalog, tenant: String, now: Long = System.currentTimeMillis()): Boolean { if (item.expires != null && item.expires <= now) return false; val target = item.app?.let(catalog::app) ?: return false; val entry = target.entries.find { it.name == item.entry && "host_notification" in it.sources } ?: return false; if (!item.input.keys.all { it in entry.keys } || item.input.entries.sumOf { it.key.toByteArray().size + it.value.toByteArray().size + 8 } > 4096 || !Routes.allows(entry.path, target) || !open(target.id, catalog, tenant)) return false; frames = frames.dropLast(1) + Frame(target.id, history = listOf(entry.path)); return true }
 }
 data class Preferences(val customized: Boolean = false, val categories: List<String> = emptyList(), val apps: List<String> = emptyList(), val dock: List<String> = listOf("", "")) {
    fun normalized(catalog: Catalog, tenant: String): Preferences { val available = catalog.tenant(tenant).apps; val slots = (0..1).map { dock.getOrNull(it)?.takeIf { id -> id in available }.orEmpty() }.toMutableList(); if (slots[0] == slots[1]) slots[1] = ""; return copy(categories = categories.filter { id -> catalog.categories.any { it.id == id } }.distinct().take(24), apps = apps.filter { it in available }.distinct().take(24), dock = slots) }
 }
 data class InboxItem(val id: String, val title: String, val body: String, val created: Long, val expires: Long? = null, val app: String? = null, val entry: String? = null, val input: Map<String, String> = emptyMap(), val seen: Boolean = false)
 enum class BridgeCode { CAPABILITY_NOT_DECLARED, CAPABILITY_NOT_GRANTED, CONSENT_REQUIRED, CONSENT_DENIED, RATE_LIMITED, INVALID_ARGUMENT, REVOKED, UNAVAILABLE }
 data class Reply(val data: Map<String, String> = emptyMap(), val error: BridgeCode? = null)
 class PreviewSession internal constructor(val tenant: String, val app: String, val user: String, val tier: String, val grants: Set<String>, val id: String = UUID.randomUUID().toString()) { @Volatile internal var revoked = false; companion object { fun sample(tenant: String) = PreviewSession(tenant, "sample", "local-preview-user", "first_party", setOf("storage.kv", "ai.extract_bill")) } }
 data class Audit(val capability: String, val operation: String, val error: BridgeCode?, val digest: String, val previousHash: String, val hash: String)
 class PreviewBroker(private val registry: List<Capability>) {
    private val values = mutableMapOf<List<String>, MutableMap<String, String>>()
    private val buckets = mutableMapOf<Pair<List<String>, String>, Pair<Double, Long>>()
    val audit = ArrayDeque<Audit>()
    fun revoke(session: PreviewSession) { session.revoked = true }
    @Synchronized fun call(session: PreviewSession, capability: String, operation: String, args: Map<String, String>, version: Int = 1, consent: Boolean = false, now: Long = System.nanoTime() / 1_000_000): Reply {
        val scope = listOf(session.tenant, session.app, session.user); val rule = registry.find { it.name == capability && it.version == version }
        val bytes = args.toSortedMap().entries.joinToString("|") { "${it.key.length}:${it.key}${it.value.length}:${it.value}" }.toByteArray()
        val tiers = listOf("sandbox", "self_serve", "partner_verified", "first_party")
        var error = when {
            session.revoked -> BridgeCode.REVOKED
            capability !in session.grants -> BridgeCode.CAPABILITY_NOT_DECLARED
            rule == null -> BridgeCode.UNAVAILABLE
            tiers.indexOf(session.tier) < tiers.indexOf(rule.minTier) || (session.tier == "sandbox" && rule.risk != "low") -> BridgeCode.CAPABILITY_NOT_GRANTED
            bytes.size > rule.payloadCap || args.keys.any { it in setOf("appId", "tenantId", "userId", "origin", "path", "token") } -> BridgeCode.INVALID_ARGUMENT
            capability == "storage.kv" && (!args.keys.all { it in setOf("key", "value") } || operation !in setOf("get", "set", "delete", "keys") || (operation != "keys" && (args["key"].isNullOrBlank() || args["key"]!!.length > 128 || ':' in args["key"]!!)) || (operation == "set" && args["value"] == null)) -> BridgeCode.INVALID_ARGUMENT
            capability == "ai.extract_bill" && (operation != "extract" || !args.keys.all { it in setOf("locale", "idempotencyKey", "hint") } || args["locale"] != "vi" || args["idempotencyKey"].isNullOrBlank() || args["idempotencyKey"]!!.length > 128 || args["hint"].orEmpty().length > 280) -> BridgeCode.INVALID_ARGUMENT
            rule.consent != "none" && !consent -> BridgeCode.CONSENT_REQUIRED
            else -> null
        }
        var data = emptyMap<String, String>()
        if (error == null && rule != null) {
            val bucketKey = scope to capability; val old = buckets[bucketKey] ?: (rule.burst.toDouble() to now); val tokens = (old.first + (now - old.second).coerceAtLeast(0) * rule.sustained / 60_000.0).coerceAtMost(rule.burst.toDouble()); buckets[bucketKey] = (tokens - 1).coerceAtLeast(0.0) to now
            if (tokens < 1) error = BridgeCode.RATE_LIMITED
            else if (capability == "storage.kv") { val bucket = values.getOrPut(scope) { mutableMapOf() }; val key = args["key"].orEmpty(); when (operation) {
                "get" -> data = bucket[key]?.let { mapOf("value" to it) } ?: emptyMap()
                "set" -> if (key !in bucket && bucket.size >= 200) error = BridgeCode.INVALID_ARGUMENT else { bucket[key] = args["value"]!!; data = mapOf("ok" to "true") }
                "delete" -> { bucket.remove(key); data = mapOf("ok" to "true") }
                else -> data = mapOf("keys" to bucket.keys.sorted().joinToString(","))
            } } else error = BridgeCode.UNAVAILABLE
        }
        fun hash(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
        val digest = hash(bytes); val previous = audit.lastOrNull()?.hash.orEmpty(); val hashed = hash(listOf(previous, capability, operation, error?.name ?: "SUCCESS", digest).joinToString("|").toByteArray()); audit.addLast(Audit(capability, operation, error, digest, previous, hashed)); if (audit.size > 200) audit.removeFirst()
        return Reply(data, error)
    }
 }

object EventIdentity {
    fun uuidV7(milliseconds: Long = System.currentTimeMillis()): String {
        val bytes = ByteArray(16); java.security.SecureRandom().nextBytes(bytes)
        for (i in 0..5) bytes[5 - i] = (milliseconds ushr (8 * i)).toByte()
        bytes[6] = ((bytes[6].toInt() and 15) or 112).toByte(); bytes[8] = ((bytes[8].toInt() and 63) or 128).toByte()
        val hex = bytes.joinToString("") { "%02x".format(it) }; return listOf(hex.substring(0, 8), hex.substring(8, 12), hex.substring(12, 16), hex.substring(16, 20), hex.substring(20)).joinToString("-")
    }
}
