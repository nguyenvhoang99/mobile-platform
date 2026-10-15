package com.miniappplatform.nativehost

import android.app.*
import android.content.*
import android.net.Uri
import android.os.Build
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

/** Durable inexact reminders; open the current ledger rather than showing stale financial totals. */
internal object ExpenseDigests {
 private fun prefs(c:Context)=c.getSharedPreferences("expense-digests-v1",Context.MODE_PRIVATE)
 private fun pending(c:Context,id:String)=PendingIntent.getBroadcast(c,0,Intent(c,ExpenseDigestReceiver::class.java).setData(Uri.Builder().scheme("expense-digest").authority("host").appendPath(id).build()),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
 fun valid(args:JSONObject)=runCatching {
  require(args.keys().asSequence().toSet()==setOf("preferences","summaries")); val p=args.getJSONObject("preferences"); require(p.opt("enabled") is Boolean && p.opt("privacy") is Boolean && p.opt("hour") is Int && p.opt("minute") is Int && p.getInt("hour") in 0..23 && p.getInt("minute") in 0..59); val periods=p.getJSONArray("periods"); require(periods.length()<=3); val selected=(0 until periods.length()).map { periods.getString(it) }; require(selected.distinct().size==selected.size && selected.all { it in listOf("day","week","month") }); require(args.getJSONArray("summaries").length()<=18); true
 }.getOrDefault(false)
 private fun next(period:String,hour:Int,minute:Int):Long {
  val cal=Calendar.getInstance(TimeZone.getTimeZone("Asia/Ho_Chi_Minh")); cal.set(Calendar.HOUR_OF_DAY,hour);cal.set(Calendar.MINUTE,minute);cal.set(Calendar.SECOND,0);cal.set(Calendar.MILLISECOND,0)
  if(period=="week") { while(cal.get(Calendar.DAY_OF_WEEK)!=Calendar.SUNDAY) cal.add(Calendar.DATE,1) }
  if(period=="month") cal.set(Calendar.DAY_OF_MONTH,cal.getActualMaximum(Calendar.DAY_OF_MONTH))
  if(cal.timeInMillis<=System.currentTimeMillis()) { when(period) { "day" -> cal.add(Calendar.DATE,1); "week" -> cal.add(Calendar.DATE,7); else -> {cal.set(Calendar.DAY_OF_MONTH,1);cal.add(Calendar.MONTH,1);cal.set(Calendar.DAY_OF_MONTH,cal.getActualMaximum(Calendar.DAY_OF_MONTH))} } }
  return cal.timeInMillis
 }
 fun schedule(c:Context,tenant:String,args:JSONObject) {
  require(valid(args)); val p=args.getJSONObject("preferences"); val selected=p.getJSONArray("periods"); val enabled=p.getBoolean("enabled"); val periods=listOf("day","week","month"); val values=(0 until selected.length()).map {selected.getString(it)}
  val store=prefs(c); val before=periods.associate { period -> val id="$tenant.manage-expense.$period"; id to store.getString(id,null) }
  val staged=periods.associate { period -> val id="$tenant.manage-expense.$period"; id to if(enabled && period in values) JSONObject().put("id",id).put("tenant",tenant).put("period",period).put("hour",p.getInt("hour")).put("minute",p.getInt("minute")).toString() else null }
  val alarm=c.getSystemService(AlarmManager::class.java)
  fun persist(records:Map<String,String?>) { val edit=store.edit(); for((id,value) in records) if(value==null) edit.remove(id) else edit.putString(id,value); require(edit.commit()) }
  fun apply(records:Map<String,String?>) { for((id,value) in records) { alarm.cancel(pending(c,id)); if(value!=null) { val o=JSONObject(value); alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next(o.getString("period"),o.getInt("hour"),o.getInt("minute")),pending(c,id)) } } }
  try { persist(staged); apply(staged) } catch(e:Exception) { runCatching { persist(before); apply(before) }; throw e }
 }
 fun quickAccess(c:Context,tenant:String,enabled:Boolean):String {
  val manager=c.getSystemService(NotificationManager::class.java); val id="$tenant.manage-expense.quick"
  if(!enabled) { manager.cancel(id,0); return "Đã tắt lối tắt gợi ý thẻ." }
  if(!Reminders.permission(c)) return "Chưa có quyền thông báo. Dùng Gợi ý thẻ trong app."
  if(Build.VERSION.SDK_INT>=26) manager.createNotificationChannel(NotificationChannel("expense-quick","Gợi ý thẻ nhanh",NotificationManager.IMPORTANCE_LOW))
  val tap=PendingIntent.getActivity(c,0,Intent(c,MainActivity::class.java).setData(Uri.Builder().scheme("expense-quick").authority("host").appendPath(tenant).build()).setAction("OPEN_EXPENSE").putExtra("expense_tenant",tenant).putExtra("expense_advisor",true),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  val builder=if(Build.VERSION.SDK_INT>=26) Notification.Builder(c,"expense-quick").setTimeoutAfter(8*3600*1000L) else Notification.Builder(c)
  manager.notify(id,0,builder.setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle("Chọn thẻ trước khi thanh toán").setContentText("Chạm để nhập cửa hàng và số tiền").setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(tap).setOngoing(true).build())
  return "Đã ghim lối tắt. Android 8+ tự tắt sau 8 giờ; dùng Tắt để gỡ sớm."
 }
 fun restore(c:Context) {
  for((id,value) in prefs(c).all) runCatching { val o=JSONObject(value as String); require(id==o.getString("id")); c.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next(o.getString("period"),o.getInt("hour"),o.getInt("minute")),pending(c,id)) }
 }
 fun deliver(c:Context,intent:Intent) {
  val id=intent.data?.lastPathSegment ?: return; val value=prefs(c).getString(id,null)?:return; val o=JSONObject(value); require(id==o.getString("id") && id.matches(Regex("[A-Za-z0-9_-]+\\.manage-expense\\.(day|week|month)")))
  if(Reminders.permission(c)) {val m=c.getSystemService(NotificationManager::class.java);if(Build.VERSION.SDK_INT>=26)m.createNotificationChannel(NotificationChannel("expense-digests","Báo cáo chi tiêu",NotificationManager.IMPORTANCE_DEFAULT)); val b=if(Build.VERSION.SDK_INT>=26)Notification.Builder(c,"expense-digests") else Notification.Builder(c); val tap=PendingIntent.getActivity(c,0,Intent(c,MainActivity::class.java).setData(Uri.Builder().scheme("expense-report").authority("host").appendPath(id).build()).setAction("OPEN_EXPENSE").putExtra("expense_tenant",o.getString("tenant")),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT); m.notify(id,0,b.setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle("Quản lý chi tiêu").setContentText("Mở sổ để xem báo cáo chi tiêu đã xác nhận.").setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(tap).setAutoCancel(true).build()) }
  c.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next(o.getString("period"),o.getInt("hour"),o.getInt("minute")),pending(c,id))
 }
}
class ExpenseDigestReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){runCatching{ExpenseDigests.deliver(context,intent)}}}
