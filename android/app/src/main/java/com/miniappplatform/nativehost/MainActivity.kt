package com.miniappplatform.nativehost

import android.Manifest
import android.app.*
import android.content.Intent
import android.graphics.Color
import android.os.*
import android.provider.Settings
import android.text.*
import android.view.*
import android.view.accessibility.AccessibilityEvent
import android.widget.*
import java.text.NumberFormat
import java.util.Locale
import java.util.concurrent.Executors

private data class Row(val title: String, val detail: String = "", val action: (() -> Unit)? = null, val more: (() -> Unit)? = null)
private class UIState {
    val navigation = Navigator()
    var surface = "home"
    var expenseAdvisor = false
    var query = ""
    var cardQuery = ""
    var slots: List<Slot>? = null
    var date = "today"
    var mine = false
    var openBooking = true
    var note = "Ghi chú mẫu từ mini-app"
    var hint = ""
    var amount = ""
    var recipient = ""
    var reviewed = false
}
class MainActivity: Activity() {
    private lateinit var repository: HostRepository
    private lateinit var device: DeviceServices
    private lateinit var root: LinearLayout
    private lateinit var body: FrameLayout
    private lateinit var status: TextView
    private lateinit var title: TextView
    private lateinit var state: UIState
    private var adapter: RowsAdapter? = null
    private var session: PreviewSession? = null
    private var testScreen: NativeTestScreen? = null
    private var miniWeb: MiniAppWebView? = null
    private var miniWebFrame: String? = null
    private var busy = false
    private var active = false
    private var generation = 0
    private val worker = Executors.newSingleThreadExecutor()
    private var lastTenant = ""
    private var permissionWork: (() -> Unit)? = null
    private val listener: () -> Unit = {
        if (repository.state.tenant != lastTenant) { lastTenant = repository.state.tenant; device.cancel(); closeSample(); state.navigation.close(); state.surface = "home"; render() }
        else if (state.navigation.frames.isEmpty() && state.surface != "account") render()
        repository.error?.let(::report)
    }
    private val catalog get() = repository.catalog
    private val tenant get() = catalog.tenant(repository.state.tenant)
    private val apps get() = tenant.apps.mapNotNull(catalog::app)
    private val preferences get() = repository.preferences()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        trace("process_start")
        state = lastNonConfigurationInstance as? UIState ?: UIState()
        repository = HostRepository.get(this); lastTenant = repository.state.tenant
        device = DeviceServices(this, ::report)
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.setOnApplyWindowInsetsListener { view, insets -> if (Build.VERSION.SDK_INT >= 30) { val system = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime()); view.setPadding(system.left, system.top, system.right, system.bottom) } else view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom); insets }
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12), 0, dp(12), 0) }
        header.addView(button("Quay lại") { back() }); title = label("Mobile Native", 20f); header.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)); header.addView(button("Đóng") { home() }); root.addView(header)
        status = label("Đang đọc dữ liệu trên máy…", 14f).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE; setPadding(dp(16), dp(8), dp(16), dp(8)) }; root.addView(status)
        body = FrameLayout(this); root.addView(body, LinearLayout.LayoutParams(-1, 0, 1f)); setContentView(root)
        if (Build.VERSION.SDK_INT >= 33) onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT) { back() }
        trace("native_init_done")
        render(); handleNotificationIntent(intent)
    }
    override fun onStart() { super.onStart(); active = true; repository.listen(listener); if (state.navigation.frames.lastOrNull()?.app == "sample") session = PreviewSession.sample(repository.state.tenant); render() }
    override fun onStop() { miniWeb?.pause(); testScreen?.close(); testScreen = null; active = false; generation++; permissionWork = null; device.cancel(); session?.let(repository.broker::revoke); session = null; busy = false; repository.unlisten(listener); super.onStop() }
    override fun onDestroy() { closeMiniWeb(); testScreen?.close(); device.cancel(); worker.shutdownNow(); super.onDestroy() }
    override fun onRetainNonConfigurationInstance(): Any = state
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handleNotificationIntent(intent) }
    private fun handleNotificationIntent(intent: Intent?) {
        if (intent?.action == "OPEN_INBOX") { home(); state.surface="inbox"; render() }
        if (intent?.action == "OPEN_EXPENSE") {
            val target=intent.getStringExtra("expense_tenant") ?: return
            if(catalog.tenants.none { it.id==target }) return
            if(target!=repository.state.tenant) { report("Báo cáo thuộc khu vực khác. Chọn khu vực tương ứng để xem."); return }
            home(); state.expenseAdvisor = intent.getBooleanExtra("expense_advisor",false); open("manage-expense")
        }
    }
    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (Build.VERSION.SDK_INT < 33 && keyCode == KeyEvent.KEYCODE_BACK) { back(); return true }
        return super.onKeyUp(keyCode, event)
    }
    private fun trace(marker: String) { android.os.Trace.beginSection(marker); android.os.Trace.endSection() }
    private fun report(text: String) { testScreen?.deviceReport(text); if (!isDestroyed) { status.text = text; status.sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) } }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun label(text: String, size: Float = 16f) = TextView(this).apply { this.text = text; textSize = size; setPadding(dp(16), dp(10), dp(16), dp(10)) }
    private fun button(text: String, action: () -> Unit) = Button(this).apply { this.text = text; minHeight = dp(48); setOnClickListener { action() } }
    private fun input(title: String, value: String, max: Int, numeric: Boolean = false, changed: (String) -> Unit): EditText = EditText(this).apply { hint = title; contentDescription = title; setText(value); minHeight = dp(48); filters = arrayOf(InputFilter.LengthFilter(max)); if (numeric) inputType = android.text.InputType.TYPE_CLASS_NUMBER; addTextChangedListener(object: TextWatcher { override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}; override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { changed(s.toString()) }; override fun afterTextChanged(s: Editable?) {} }) }
    private fun list(rows: List<Row>, header: View? = null) {
        body.removeAllViews(); val view = ListView(this).apply { dividerHeight = 0; clipToPadding = false; setPadding(dp(8), 0, dp(8), dp(12)) }
        if (header != null) view.addHeaderView(header, null, false)
        val a = RowsAdapter(rows); adapter = a; view.adapter = a; body.addView(view)
    }
    private inner class RowsAdapter(var rows: List<Row>): BaseAdapter() {
        override fun getCount() = rows.size
        override fun getItem(position: Int) = rows[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getView(position: Int, convert: View?, parent: ViewGroup): View {
            val layout = convert as? LinearLayout ?: LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; minimumHeight = dp(56)
                val copy = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; addView(label("", 18f)); addView(label("", 14f)) }; addView(copy, LinearLayout.LayoutParams(0, -2, 1f)); addView(button("Tùy chọn") {})
            }
            val row = rows[position]; val copy = layout.getChildAt(0) as LinearLayout; (copy.getChildAt(0) as TextView).text = row.title; (copy.getChildAt(1) as TextView).apply { text = row.detail; visibility = if (row.detail.isEmpty()) View.GONE else View.VISIBLE }
            val more = layout.getChildAt(1) as Button; more.visibility = if (row.more == null) View.GONE else View.VISIBLE; more.contentDescription = "Tùy chọn cho ${row.title}"; more.setOnClickListener { row.more?.invoke() }
            layout.isClickable = row.action != null; layout.isFocusable = row.action != null; layout.setOnClickListener { row.action?.invoke() }; layout.contentDescription = row.title + ". " + row.detail
            return layout
        }
        fun update(value: List<Row>) { rows = value; notifyDataSetChanged() }
    }
    private fun render() {
        testScreen?.close(); testScreen = null
        if (!repository.loaded) { title.text = "Mobile Native"; list(emptyList()); return }
        root.findViewWithTag<View>("dock")?.let(root::removeView)
        val dock = LinearLayout(this).apply { tag = "dock"; gravity = Gravity.CENTER; setPadding(dp(8), 0, dp(8), 0) }
        dock.addView(button("Home") { home() }, LinearLayout.LayoutParams(0, -2, 1f))
        (0..1).forEach { index -> val id = preferences.dock[index]; val b = button(catalog.app(id)?.shortName ?: "Lối tắt ${index + 1}") { if (id.isEmpty()) dockPicker(index) else open(id) }; b.setOnLongClickListener { dockPicker(index); true }; b.contentDescription = "${b.text}. Nhấn giữ để đổi; có thể đổi trong Tùy chỉnh Home."; dock.addView(b, LinearLayout.LayoutParams(0, -2, 1f)) }
        dock.addView(button("Khám phá") { state.surface = "explore"; state.navigation.close(); closeSample(); render() }, LinearLayout.LayoutParams(0, -2, 1f)); root.addView(dock)
        val frame = state.navigation.frames.lastOrNull()
        if (frame?.app !in setOf("split-bill", "manage-expense") || frame?.session != miniWebFrame) closeMiniWeb()
        val header=title.parent as LinearLayout
        header.findViewWithTag<View>("expense-quick")?.let(header::removeView)
        if(frame?.app == "manage-expense") header.addView(button("☆") {
            AlertDialog.Builder(this).setTitle("Lối tắt gợi ý thẻ").setMessage("Ghim lời nhắc chung. Chạm thông báo để nhập cửa hàng và số tiền trong app; không hiển thị thông tin thẻ.")
                .setPositiveButton("Ghim") { _,_ -> val selected=tenant.id; notificationPermission { if(selected==tenant.id) report(ExpenseDigests.quickAccess(this,selected,true)) } }
                .setNeutralButton("Tắt") { _,_ -> report(ExpenseDigests.quickAccess(this,tenant.id,false)) }.setNegativeButton("Hủy",null).show()
        }.apply { tag="expense-quick"; contentDescription="Lối tắt gợi ý thẻ" },2)
        when {
            frame?.app in setOf("split-bill", "manage-expense") -> {
                title.text = catalog.app(frame!!.app)?.name ?: "Mini app"; adapter = null
                if (miniWeb == null) { body.removeAllViews(); try { miniWeb = MiniAppWebView(this, tenant.id, catalog, ::report, frame!!.app, state.expenseAdvisor); state.expenseAdvisor=false; miniWebFrame = frame.session; body.addView(miniWeb!!.view) } catch (_: Exception) { report("Gói mini app không hợp lệ. Chưa chạy mã mini app.") } }
                if (active) miniWeb?.resume()
            }
            frame?.app == "sample" -> sample()
            frame?.app == "test" -> { title.text = "Test"; adapter = null; body.removeAllViews(); val screen = NativeTestScreen(this, device, ::report, { work -> notificationPermission(work) }, { open("sample") }); testScreen = screen; body.addView(screen.view) }
            frame?.app == "card" -> cards(frame)
            frame != null -> preview(frame)
            state.surface == "explore" -> explore()
            state.surface == "account" -> account()
            state.surface == "inbox" -> inbox()
            else -> homeRows()
        }
        trace("first_meaningful_frame")
    }
    private fun home() { device.cancel(); closeSample(); state.navigation.close(); state.surface = "home"; render() }
    private fun closeMiniWeb() { miniWeb?.close(); miniWeb = null; miniWebFrame = null }
    @Deprecated("Platform callback") override fun onActivityResult(code: Int, result: Int, data: Intent?) { super.onActivityResult(code, result, data); miniWeb?.activityResult(code, result, data) }
    private fun back() {
        if (miniWeb?.back() == true) return
        device.cancel()
        if (state.navigation.frames.isNotEmpty()) { val wasSample = state.navigation.frames.last().app == "sample"; state.navigation.back(); if (wasSample) closeSample(); render() }
        else if (state.surface != "home") { state.surface = "home"; render() }
        else finish()
    }
    private fun open(id: String) {
        device.cancel(); val previous = state.navigation.frames.lastOrNull()?.app; if (previous == "sample" && id != "sample") closeSample()
        trace("miniapp_tap"); repository.journal.record("mini_app_opened", tenant.id, mapOf("mini_app_id" to id, "entrypoint_id" to "root", "source" to "native_host")); if (!state.navigation.open(id, catalog, tenant.id)) { report("Tiện ích chưa có ở khu vực này."); return }; state.surface = "home"
        if (id == "sample" && session == null) { state.slots = catalog.slots; session = PreviewSession.sample(tenant.id) }; render()
    }
    private fun closeSample() { generation++; session?.let(repository.broker::revoke); session = null; busy = false; state.slots = null; state.amount = ""; state.recipient = ""; state.hint = ""; state.reviewed = false }
    private fun homeRows() {
        title.text = "Home · ${tenant.label}"
        val rows = mutableListOf(Row("Ngày của bạn, nhẹ nhàng hơn", "Tiện ích mẫu trên máy; chưa có dịch vụ trực tuyến."), Row("Khu vực: ${tenant.label}", "Chọn thủ công hoặc dùng vị trí gần đúng", ::tenantPicker), Row("Tùy chỉnh Home", "Ghim danh mục, tiện ích và đổi hai lối tắt", ::customize))
        catalog.categories.filter { c -> c.apps.any { it in tenant.apps } && (!preferences.customized || c.id in preferences.categories) }.forEach { c -> rows += Row(c.name, c.description, { val selected = apps.filter { it.id in c.apps }; choose(c.name, selected.map { it.name }) { open(selected[it].id) } }, { toggleCategory(c.id) }) }
        val pinned = apps.filter { it.id in preferences.apps }; if (preferences.customized && pinned.isEmpty() && preferences.categories.isEmpty()) rows += Row("Chưa ghim tiện ích", "Chọn Tùy chỉnh Home để thêm.")
        (pinned + apps).distinctBy { it.id }.forEach { app -> rows += appRow(app) }
        val unread = repository.state.inbox[tenant.id].orEmpty().count { !it.seen }; rows += Row("Thông báo ($unread chưa đọc)", action = { state.surface = "inbox"; render() }); rows += Row("Tài khoản & quyền thiết bị", action = { state.surface = "account"; render() }); list(rows); report("Danh mục mẫu cho ${tenant.label}.")
    }
    private fun appRow(app: MiniApp) = Row(app.name, if (app.id == "split-bill") "Chia tiền trong mini app" else if (app.id == "test") "Kiểm thử integration native" else if (app.id == "sample") "SDK & đặt sân mẫu" else if (app.id == "card") "Tìm quyền lợi thẻ" else "Bản xem trước tiện ích", { open(app.id) }, { toggleApp(app.id) })
    private fun choose(title: String, options: List<String>, done: (Int) -> Unit) { AlertDialog.Builder(this).setTitle(title).setItems(options.toTypedArray()) { _, index -> done(index) }.setNegativeButton("Đóng", null).show() }
    private fun toggleApp(id: String) { val tenantId = tenant.id; repository.editPreferences(tenantId) { p -> p.copy(customized = true, apps = if (id in p.apps) p.apps - id else p.apps + id) } }
    private fun toggleCategory(id: String) { val tenantId = tenant.id; repository.editPreferences(tenantId) { p -> p.copy(customized = true, categories = if (id in p.categories) p.categories - id else p.categories + id) } }
    private fun customize() { choose("Tùy chỉnh Home", listOf("Danh mục", "Tiện ích", "Đổi lối tắt trái", "Đổi lối tắt phải", "Khôi phục gợi ý mặc định")) { option ->
        when(option) { 2 -> dockPicker(0); 3 -> dockPicker(1); 4 -> repository.editPreferences(tenant.id) { Preferences() }; else -> {
            val ids = if (option == 0) catalog.categories.filter { c -> c.apps.any { it in tenant.apps } }.map { it.id to it.name } else apps.map { it.id to it.name }
            val selected = (if (option == 0) preferences.categories else preferences.apps).toMutableSet(); val tenantId = tenant.id
            AlertDialog.Builder(this).setTitle("Ghim vào Home").setMultiChoiceItems(ids.map { it.second }.toTypedArray(), ids.map { it.first in selected }.toBooleanArray()) { _, i, on -> if(on) selected.add(ids[i].first) else selected.remove(ids[i].first) }.setPositiveButton("Lưu") { _, _ -> repository.editPreferences(tenantId) { p -> if (option == 0) p.copy(customized = true, categories = selected.toList()) else p.copy(customized = true, apps = selected.toList()) } }.setNegativeButton("Hủy", null).show()
        } }
    } }
    private fun dockPicker(index: Int) { val options = apps; val tenantId = tenant.id; choose("Chọn lối tắt", listOf("Xóa lối tắt") + options.map { it.name }) { i -> repository.editPreferences(tenantId) { p -> val id = if (i == 0) "" else options[i - 1].id; val slots = p.dock.map { if (it == id) "" else it }.toMutableList(); slots[index] = id; p.copy(dock = slots) } } }
    private fun tenantPicker() { val choices = catalog.tenants; choose("Khu vực", choices.map { it.label } + "Dùng vị trí gần đúng") { i -> if (i == choices.size) device.locate { lat, lon -> repository.switchTenant(catalog.resolve(lat, lon)) } else repository.switchTenant(choices[i].id) } }
    private fun explore() {
        title.text = "Khám phá"; val search = input("Tìm tiện ích", state.query, 120) { state.query = it; adapter?.update(apps.filter { a -> matches(a.name, it) }.map(::appRow).ifEmpty { listOf(Row("Không tìm thấy tiện ích", "Thử từ khóa khác.")) }) }
        list(apps.filter { matches(it.name, state.query) }.map(::appRow), search)
    }
    private fun preview(frame: Frame) { val app = catalog.app(frame.app) ?: return; title.text = app.name
        val rows = mutableListOf(Row(app.name, "Bản xem trước trên máy. Chưa tải hoặc thực thi gói mini-app bên ngoài."), Row("Đường dẫn: ${frame.path}"))
        app.routes.forEach { route -> val path = route.replace(":day", "tomorrow").replace(":routeId", "42").replace(":noteId", "welcome").replace(":itemId", "featured"); rows += Row(path, action = { if (state.navigation.navigate(path, catalog)) render() else report("Trang chưa được khai báo.") }) }
        app.links.forEach { link -> rows += Row(link.label, action = { if (state.navigation.cross(link.id, catalog, tenant.id)) render() else report("Liên kết chưa được cấp quyền.") }) }; list(rows)
    }
    private fun money(amount: Long) = NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN")).format(amount) + " ₫"
    private fun cards(frame: Frame) { title.text = "Thẻ"; val card = if (frame.path.startsWith("/card/")) catalog.cards.find { it.id == frame.path.removePrefix("/card/") } else null
        if (card != null) { list(listOf(Row(card.bank, card.name), Row(card.brand.uppercase(), "Phí năm: ${money(card.fee)} · ${if (card.firstFree) "Miễn năm đầu (mẫu)" else "Có phí"}")) + card.benefits.map { Row(it.title, it.detail) }); return }
        fun results(query: String) = catalog.cards.filter { matches(it.searchable, query) }.map { c -> Row(c.name, "${c.bank} · ${c.headline}", { state.navigation.navigate("/card/${c.id}", catalog); render() }) }.ifEmpty { listOf(Row("Không có thẻ phù hợp", "Thử từ khóa khác.")) }
        val header = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; addView(label("Dữ liệu minh họa trên máy; không phải ưu đãi ngân hàng hiện hành.", 14f)); addView(input("Tìm ngân hàng, thẻ hoặc quyền lợi", state.cardQuery, 120) { state.cardQuery = it; adapter?.update(results(it)) }) }; list(results(state.cardQuery), header)
    }
    private fun account() { title.text = "Tài khoản"
        list(listOf(Row("Truy cập thiết bị", "Quyền host không tự cấp cho mini-app. Chưa có tài khoản server."), Row("Kiểm tra mạng", action = { device.network() }), Row("Xác thực biometrics / mật mã", action = { if (!device.busy) device.biometric() }), Row("Vị trí gần đúng chọn khu vực", action = { if (!device.busy) device.locate { lat, lon -> repository.switchTenant(catalog.resolve(lat, lon)) } }), Row("Lệnh thoại trên máy", action = { if (!device.busy) device.voice() }), Row("Dừng thao tác", action = { device.cancel(); report("Đã dừng thao tác.") }), Row("Cho phép thông báo", action = { notificationPermission { report("Đã cho phép thông báo.") } }), Row("Đăng ký FCM trên máy", action = { PushRegistration.register(this, ::report) }), Row("Cài đặt hệ thống", action = { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(android.net.Uri.parse("package:$packageName"))) }), Row("Dữ liệu trên máy", "Home, dock, hộp thư lưu theo khu vực. Chưa nối FCM/backend đăng ký token.")))
    }
    private fun inbox() { title.text = "Thông báo"; val items = repository.state.inbox[tenant.id].orEmpty(); val rows = listOf(Row(if (Reminders.permission(this)) "Thông báo đã cho phép" else "Thông báo chưa cho phép", action = { notificationPermission { render() } })) + if (items.isEmpty()) listOf(Row("Chưa có thông báo", "Nhắc lịch sẽ xuất hiện khi được nhận.")) else items.map { item -> Row(item.title, item.body, item.app?.let { { if (!state.navigation.notification(item, catalog, tenant.id)) report("Đích thông báo chưa hợp lệ hoặc đã hết hạn.") else render() } }) }; list(rows); if (items.any { !it.seen }) repository.seen(tenant.id) }
    private fun notificationPermission(work: () -> Unit) { if (Reminders.permission(this)) work() else if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) { permissionWork = work; requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 43) } else report("Thông báo đang tắt. Bạn có thể đổi trong Cài đặt hệ thống.") }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, grants: IntArray) { super.onRequestPermissionsResult(code, permissions, grants); if (code == 704) { miniWeb?.permissionResult(grants) } else if (code == 43) { val work = permissionWork; permissionWork = null; if (work == null || !active) return; if (grants.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) work.invoke() else report("Chưa có quyền thông báo. Nội dung được giữ.") } else device.permissionResult(code, grants) }
    private fun sample() {
        title.text = "SDK Demo"; if (state.slots == null) state.slots = catalog.slots; if (active && session == null) session = PreviewSession.sample(tenant.id)
        val header = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL
            addView(label("Đặt sân là fixture trong phiên. Chưa gửi đặt chỗ thật. Đóng tiện ích sẽ khôi phục mẫu.", 14f))
            addView(button(if (state.mine) "Lịch của tôi · Xem tất cả" else "Tìm sân · Xem lịch của tôi") { state.mine = !state.mine; sample() })
            addView(button("Ngày: ${state.date}") { choose("Chọn ngày", listOf("Hôm nay", "Ngày mai", "Cuối tuần")) { state.date = listOf("today", "tomorrow", "weekend")[it]; sample() } })
            addView(Switch(this@MainActivity).apply { text = "Mở cho người khác tham gia"; isChecked = state.openBooking; minHeight = dp(48); setOnCheckedChangeListener { _, checked -> state.openBooking = checked } })
            addView(label("Kho mẫu qua bridge · bộ nhớ theo khu vực; mất khi khởi động lại.", 14f))
            addView(input("Ghi chú mẫu", state.note, 500) { state.note = it }); addView(button("Ghi mẫu") { storage("set") }); addView(button("Đọc mẫu") { storage("get") }); addView(button("Xóa mẫu") { storage("delete") })
            addView(label("Bản nháp hóa đơn · chưa có AI/bộ chọn ảnh. Nhập thủ công; chưa lưu hóa đơn hoặc thanh toán.", 14f))
            addView(input("Gợi ý hóa đơn", state.hint, 280) { state.hint = it }); addView(button("Yêu cầu đọc hóa đơn") { if (!busy) AlertDialog.Builder(this@MainActivity).setTitle("Đồng ý cho SDK Demo đọc hóa đơn trên máy?").setMessage("PoC chưa có mô hình AI. Bản nháp được giữ lại.").setPositiveButton("Đồng ý") { _, _ -> extract() }.setNegativeButton("Không đồng ý") { _, _ -> report("CONSENT_DENIED — giữ bản nháp.") }.show() })
            addView(input("Tổng tiền VND", state.amount, 12, true) { state.amount = it; state.reviewed = false }); addView(input("Người nhận / cửa hàng", state.recipient, 120) { state.recipient = it; state.reviewed = false })
            addView(button("Xác nhận đã kiểm tra bản nháp") { if (!Regex("[0-9]{1,12}").matches(state.amount) || state.recipient.isBlank()) report("Nhập số tiền nguyên và tên người nhận.") else { state.reviewed = true; report("Đã kiểm tra bản nháp trong phiên. Chưa lưu hóa đơn hoặc thanh toán.") } })
            addView(label("Scanner, location, crypto.sign, network và notify.subscribe chưa có adapter public. Công cụ lịch/nhắc dưới đây thuộc host.", 14f))
        }
        val slots = state.slots.orEmpty().filter { if (state.mine) it.includesMe else it.date == state.date }
        list(slots.map { slot -> Row("${slot.court} · ${slot.start}–${slot.end}", "${slot.venue}\n${money(slot.price)} · ${slot.people.size}/${slot.capacity} người · ${if (slot.includesMe) "Bạn đã tham gia" else slot.visibility}", { slotActions(slot) }) }.ifEmpty { listOf(Row("Chưa có lịch phù hợp")) }, header)
    }
    private fun mutate(slot: Slot, change: (Slot) -> Slot) { state.slots = state.slots.orEmpty().map { if (it.id == slot.id) change(it) else it }; sample() }
    private fun slotActions(slot: Slot) {
        val actions = mutableListOf<Pair<String, () -> Unit>>()
        if (slot.owner == null) actions += "Đặt sân mẫu" to { mutate(slot) { it.book(state.openBooking) }; report("Đã cập nhật fixture. Chưa đặt sân thật.") }
        if (slot.owner == "other" && slot.visibility == "open" && slot.people.size < slot.capacity && !slot.includesMe) actions += "Tham gia mẫu" to { mutate(slot, Slot::join) }
        if (slot.owner == "me") {
            actions += "Đổi công khai / riêng tư" to { mutate(slot) { it.copy(visibility = if (it.visibility == "open") "private" else "open") } }
            slot.people.filter { it.id != "me" }.forEach { p -> actions += "Xóa ${p.name}" to { mutate(slot) { it.remove(p.id) } } }
            actions += "Hủy đặt sân mẫu" to { AlertDialog.Builder(this).setTitle("Hủy đặt sân mẫu?").setPositiveButton("Hủy đặt sân") { _, _ -> Reminders.cancel(this, tenant.id, slot); mutate(slot, Slot::cancel); report("Đã hủy fixture và yêu cầu xóa nhắc tương ứng.") }.setNegativeButton("Giữ lại", null).show() }
        }
        if (slot.includesMe) {
            actions += "Host: nhắc trước 1 giờ" to { val tenantId = tenant.id; val token = generation; notificationPermission { Reminders.schedule(this, tenantId, slot) { if (active && token == generation) report(it) } } }
            actions += "Host: mở lịch hệ thống" to { report(Reminders.calendar(this, slot)) }
            actions += "Host: thông báo đang diễn ra" to { notificationPermission { report(Reminders.ongoing(this, tenant.id, slot)) } }
        }
        if (actions.isEmpty()) report("Sân đã kín hoặc riêng tư.") else choose(slot.court, actions.map { it.first }) { actions[it].second() }
    }
    private fun bridge(capability: String, operation: String, args: Map<String, String>, consent: Boolean = false) {
        val current = session ?: return; if (busy) return; busy = true; val token = generation; report("Đang xử lý… Bạn vẫn có thể nhập hoặc đóng tiện ích.")
        worker.execute { val reply = repository.broker.call(current, capability, operation, args, consent = consent); runOnUiThread { if (!active || token != generation || session !== current) return@runOnUiThread; busy = false; report(if (reply.error != null) "${reply.error} — tiếp tục nhập thủ công; nội dung được giữ." else if (operation == "get") reply.data["value"]?.let { "Ghi chú trong bộ nhớ: $it" } ?: "Chưa có ghi chú mẫu." else if (operation == "set") "Đã ghi trong bộ nhớ host. Chưa lưu bền." else "Đã xóa ghi chú mẫu.") } }
    }
    private fun storage(operation: String) { bridge("storage.kv", operation, if (operation == "set") mapOf("key" to "sample_note", "value" to state.note) else mapOf("key" to "sample_note")) }
    private fun extract() { bridge("ai.extract_bill", "extract", mapOf("locale" to "vi", "idempotencyKey" to java.util.UUID.randomUUID().toString(), "hint" to state.hint), consent = true) }
}
