package com.miniappplatform.nativehost

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

private fun JSONArray.strings() = (0 until length()).map { getString(it) }
private fun <T> JSONArray.mapObjects(block: (JSONObject) -> T) = (0 until length()).map { block(getJSONObject(it)) }
private fun JSONObject.nullable(key: String): String? = if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
object CatalogReader {
    fun read(context: Context): Catalog {
        val text = context.assets.open("platform.json").bufferedReader().use { it.readText() }; require(text.toByteArray().size < 2_000_000); val o = JSONObject(text); require(o.getInt("schemaVersion") == 1)
        val result = Catalog(
            o.getJSONArray("apps").mapObjects { a -> MiniApp(a.getString("id"), a.getString("name"), a.getString("shortName"), a.getJSONArray("routes").strings(), a.getString("rootRoute"), a.getJSONArray("publicEntrypoints").mapObjects { Entry(it.getString("name"), it.getString("path"), it.getJSONArray("allowedSources").strings(), it.getJSONArray("allowedInputKeys").strings()) }, a.getJSONArray("crossAppLinks").mapObjects { Link(it.getString("id"), it.getString("label"), it.getString("targetAppId"), it.getString("targetEntrypoint"), it.getJSONArray("allowedInputKeys").strings()) }) },
            o.getJSONArray("tenants").mapObjects { Tenant(it.getString("id"), it.getString("label"), it.getString("description"), it.getJSONArray("featuredAppIds").strings(), it.getString("accent"), it.getJSONObject("centre").getDouble("lat"), it.getJSONObject("centre").getDouble("lon")) },
            o.getJSONArray("categories").mapObjects { Category(it.getString("id"), it.getString("name"), it.getString("description"), it.getJSONArray("miniAppIds").strings(), it.getString("audience")) },
            o.getJSONArray("cards").mapObjects { BankCard(it.getString("id"), it.getString("bankName"), it.getString("cardName"), it.getString("cardBrand"), it.getLong("annualFeeVnd"), it.getBoolean("firstYearFree"), it.getJSONArray("benefits").mapObjects { b -> Benefit(b.getString("title"), b.getString("detail"), b.getString("type")) }) },
            o.getJSONArray("slots").mapObjects { Slot(it.getString("id"), it.getString("dateId"), it.getString("courtName"), it.getString("venue"), it.getString("startTime"), it.getString("endTime"), it.getLong("priceVnd"), it.getInt("capacity"), it.nullable("owner"), it.getString("visibility"), it.getJSONArray("participants").mapObjects { p -> Person(p.getString("id"), p.getString("displayName")) }) },
            o.getJSONArray("capabilities").mapObjects { Capability(it.getString("name"), it.getInt("version"), it.getString("risk"), it.getString("consent"), it.getString("min_tier"), it.getInt("payload_cap"), it.getJSONObject("quota").getInt("sustained"), it.getJSONObject("quota").getInt("burst")) },
            o.getJSONObject("config").getJSONObject("notification").getInt("maxInboxItems"),
            o.getJSONObject("config").getJSONObject("notification").getLong("reminderLeadMs")
        ); require(result.apps.map { it.id }.distinct().size == result.apps.size); require(result.tenants.any { it.id == "vn-fallback" }); return result
    }
}
data class HostSnapshot(val tenant: String = "vn-fallback", val preferences: Map<String, Preferences> = emptyMap(), val inbox: Map<String, List<InboxItem>> = emptyMap())
object SnapshotCodec {
    fun decode(text: String, catalog: Catalog): HostSnapshot {
        require(text.toByteArray().size < 4_000_000); val o = JSONObject(text); require(o.getInt("version") == 1)
        val p = o.optJSONObject("preferences") ?: JSONObject(); val prefs = p.keys().asSequence().associateWith { id -> val v = p.getJSONObject(id); Preferences(v.optBoolean("customized"), (v.optJSONArray("categories") ?: JSONArray()).strings(), (v.optJSONArray("apps") ?: JSONArray()).strings(), (v.optJSONArray("dock") ?: JSONArray()).strings()).normalized(catalog, id) }
        val inbox = o.optJSONObject("inbox") ?: JSONObject(); val items = inbox.keys().asSequence().associateWith { id -> inbox.getJSONArray(id).mapObjects(::decodeItem).take(catalog.maxInboxItems) }
        return HostSnapshot(catalog.tenant(o.optString("tenant")).id, prefs, items)
    }
    fun decodeItem(o: JSONObject): InboxItem {
        val input = o.optJSONObject("input") ?: JSONObject(); val item = InboxItem(o.getString("id"), o.getString("title"), o.getString("body"), o.getLong("created"), if (o.isNull("expires")) null else o.getLong("expires"), o.nullable("app"), o.nullable("entry"), input.keys().asSequence().associateWith { input.getString(it) }, o.optBoolean("seen")); require(item.id.length <= 200 && item.title.length <= 180 && item.body.length <= 600); return item
    }
    fun encodeItem(item: InboxItem) = JSONObject().put("id", item.id).put("title", item.title).put("body", item.body).put("created", item.created).put("expires", item.expires ?: JSONObject.NULL).put("app", item.app ?: JSONObject.NULL).put("entry", item.entry ?: JSONObject.NULL).put("input", JSONObject(item.input)).put("seen", item.seen)
    fun encode(state: HostSnapshot): String {
        val prefs = JSONObject(); state.preferences.forEach { (id, p) -> prefs.put(id, JSONObject().put("customized", p.customized).put("categories", JSONArray(p.categories)).put("apps", JSONArray(p.apps)).put("dock", JSONArray(p.dock))) }
        val inbox = JSONObject(); state.inbox.forEach { (id, items) -> inbox.put(id, JSONArray(items.map(::encodeItem))) }
        return JSONObject().put("version", 1).put("tenant", state.tenant).put("preferences", prefs).put("inbox", inbox).toString()
    }
}
class HostRepository private constructor(context: Context) {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val file = AtomicFile(File(context.filesDir, "native-host-v1.json"))
    val catalog = CatalogReader.read(context)
    val broker = PreviewBroker(catalog.capabilities)
    val journal = LocalJournal(context)
    @Volatile var state = HostSnapshot(); private set
    @Volatile var loaded = false; private set
    @Volatile var error: String? = null; private set
    private var writable = true
    private val listeners = mutableSetOf<() -> Unit>()
    init { worker.execute {
        if (file.baseFile.exists()) runCatching { require(file.baseFile.length() < 4_000_000); state = SnapshotCodec.decode(file.openRead().bufferedReader().use { it.readText() }, catalog) }.onFailure {
            writable = runCatching { file.baseFile.copyTo(File(context.filesDir, "native-host-recovery-${System.currentTimeMillis()}.json")); true }.getOrDefault(false)
            error = if (writable) "Không đọc được dữ liệu cũ. Đã giữ bản khôi phục trên máy." else "Không đọc được dữ liệu; chưa ghi đè bản gốc."
        }; loaded = true; journal.record("app_started", state.tenant); notifyChanged()
    } }
    @Synchronized fun listen(listener: () -> Unit) { listeners.add(listener) }
    @Synchronized fun unlisten(listener: () -> Unit) { listeners.remove(listener) }
    private fun notifyChanged() { main.post { val copy = synchronized(this) { listeners.toList() }; copy.forEach { it() } } }
    fun update(completion: (() -> Unit)? = null, transform: (HostSnapshot) -> HostSnapshot) { worker.execute {
        val next = transform(state); if (!writable) { notifyChanged(); completion?.invoke(); return@execute }
        var stream: java.io.FileOutputStream? = null
        try { stream = file.startWrite(); stream.write(SnapshotCodec.encode(next).toByteArray()); file.finishWrite(stream); state = next; error = null }
        catch (_: Exception) { file.failWrite(stream); error = "Thay đổi chưa lưu được trên máy. Kiểm tra dung lượng và thử lại." }; notifyChanged(); completion?.invoke()
    } }
    fun switchTenant(id: String) = update { it.copy(tenant = catalog.tenant(id).id) }
    fun preferences(tenant: String = state.tenant) = state.preferences[tenant] ?: Preferences()
    fun editPreferences(tenant: String, transform: (Preferences) -> Preferences) = update { s -> s.copy(preferences = s.preferences + (tenant to transform(s.preferences[tenant] ?: Preferences()).normalized(catalog, tenant))) }
    fun receive(tenant: String, item: InboxItem, completion: (() -> Unit)? = null) = update(completion) { s -> if (catalog.tenants.none { it.id == tenant } || s.inbox[tenant].orEmpty().any { it.id == item.id }) s else s.copy(inbox = s.inbox + (tenant to (listOf(item) + s.inbox[tenant].orEmpty()).take(catalog.maxInboxItems))) }
    fun seen(tenant: String) = update { s -> s.copy(inbox = s.inbox + (tenant to s.inbox[tenant].orEmpty().map { it.copy(seen = true) })) }
    companion object { @Volatile private var instance: HostRepository? = null; fun get(context: Context): HostRepository = instance ?: synchronized(this) { instance ?: HostRepository(context.applicationContext).also { instance = it } } }
}
