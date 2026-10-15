import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { BillExtraction, BridgeClient } from '../../bridge/client';
import type { BridgeErrorCode, BridgeResult } from '../../bridge/types';
import { createPalette, miniAppPaletteFrom } from '../../config/palette';
import { layoutTokens, typographyTokens } from '../../config/layout';

const palette = miniAppPaletteFrom(createPalette());

function errorCopy(code: BridgeErrorCode): string {
  switch (code) {
    case 'UNAVAILABLE': return 'Thiết bị hoặc host chưa hỗ trợ thao tác này. Bạn có thể nhập thủ công.';
    case 'CONSENT_REQUIRED': return 'Bản preview chưa nối hộp thoại đồng ý của host. Bạn có thể nhập thủ công.';
    case 'CONSENT_DENIED': return 'Bạn chưa đồng ý. Dữ liệu đang nhập được giữ lại.';
    case 'CONSENT_DENIED_PERMANENTLY': return 'Quyền đã bị từ chối lâu dài. Dùng nhập thủ công hoặc quản lý quyền trong host.';
    case 'OS_DENIED': return 'Hệ điều hành chưa cấp quyền cho thao tác này.';
    case 'OS_DENIED_PERMANENTLY': return 'Quyền hệ điều hành bị chặn. Kiểm tra Cài đặt nếu muốn dùng tính năng.';
    case 'CAPABILITY_NOT_DECLARED':
    case 'CAPABILITY_NOT_GRANTED': return 'Host chưa cấp tính năng này cho mini-app.';
    case 'REVOKED': return 'Phiên hoặc quyền đã hết hiệu lực. Đóng và mở lại mini-app.';
    case 'RATE_LIMITED': return 'Đã đạt giới hạn thao tác. Chờ một lúc rồi thử lại.';
    case 'TIMEOUT':
    case 'UNCERTAIN': return 'Chưa xác định kết quả. Kiểm tra trạng thái trước khi thử lại.';
    case 'INVALID_ARGUMENT': return 'Thông tin chưa hợp lệ. Kiểm tra nội dung rồi thử lại.';
    default: return 'Chưa hoàn tất thao tác. Nội dung đang nhập được giữ lại.';
  }
}

function Action({ title, disabled, onPress }: {
  title: string; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, (disabled || pressed) && styles.dimmed]}>
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}

/** Bundled RN preview. The host owns the bound client; no native imports or authority here. */
export function HostFeatureDemos({ bridge }: { bridge?: BridgeClient }) {
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('Chọn một thao tác để gọi host.');
  const [note, setNote] = useState('Ghi chú mẫu từ mini-app');
  const [hint, setHint] = useState('');
  const [extraction, setExtraction] = useState<BillExtraction | null>(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [draftError, setDraftError] = useState('');
  const draftRevision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function run<T>(label: string, operation: () => Promise<BridgeResult<T>>,
    onResult: (data: T) => string) {
    if (inFlight.current) return;
    if (!bridge) {
      setStatus('Chưa có phiên bridge từ host. Các thao tác thiết bị chưa khả dụng.');
      return;
    }
    inFlight.current = true;
    setBusy(label);
    setStatus(`${label}…`);
    try {
      const result = await operation();
      if (!mounted.current) return;
      setStatus(result.ok ? onResult(result.data) : `${errorCopy(result.error)} (${result.error})`);
    } catch {
      if (mounted.current) setStatus('Kết nối tới host bị gián đoạn. Kết quả chưa xác định.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function extract() {
    if (!bridge) return;
    const revision = draftRevision.current;
    // The key identifies this user gesture, never caller identity or a file path.
    const idempotencyKey = `sample_bill_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    void run<BillExtraction>('Đọc hóa đơn', () => bridge.extractBill(
      { locale: 'vi', idempotencyKey, ...(hint.trim() ? { hint: hint.trim() } : {}) }), data => {
        if (draftRevision.current !== revision) {
          return 'Đã có kết quả, nhưng bản nháp đã được sửa trong lúc chờ. Giữ nội dung bạn vừa nhập.';
        }
        setExtraction(data);
        setAmount(data.totalVnd === null ? '' : String(data.totalVnd));
        setRecipient(data.recipient.name ?? '');
        setReviewed(false);
        return 'Đã nhận bản nháp từ host. Kiểm tra và sửa thông tin trước khi xác nhận.';
      });
  }

  const disabled = busy !== null || !bridge;
  return <View style={[styles.stack, { backgroundColor: palette.canvas, padding: layoutTokens.spacing.sm, borderRadius: layoutTokens.radius.md }]}>
    <Text style={styles.heading}>Thử tính năng host</Text>
    <Text style={styles.copy}>Bản mẫu RN trong host (PoC). Mọi thao tác dưới đây đi qua bridge; kết quả trên thiết bị còn phụ thuộc quyền và khả năng hỗ trợ.</Text>
    {!bridge && <Text style={styles.copy}>Chưa kết nối bridge. Bạn vẫn có thể nhập bản nháp hóa đơn.</Text>}
    <View accessibilityLiveRegion="polite" style={styles.status}>
      <Text style={styles.copy}>{status}</Text>
      {busy && <Text style={styles.copy}>Bạn có thể tiếp tục sửa bản nháp hoặc đóng mini-app.</Text>}
    </View>

    <View style={styles.card}>
      <Text style={styles.heading}>Đọc hóa đơn bằng AI trên máy</Text>
      <Text style={styles.copy}>Bản build này chưa có bộ chọn ảnh và mô hình AI hoạt động. Bạn có thể gửi yêu cầu để xem trạng thái chưa khả dụng, rồi nhập thủ công. Hợp đồng API chỉ trả trường đã trích xuất, không trả ảnh hoặc đường dẫn.</Text>
      <Text style={styles.label}>Gợi ý cho hóa đơn (không bắt buộc)</Text>
      <TextInput accessibilityLabel="Gợi ý cho hóa đơn" value={hint} onChangeText={setHint}
        maxLength={280} style={styles.input} placeholder="Ví dụ: tiền thuê sân" placeholderTextColor={palette.mutedText} />
      <Action title={busy === 'Đọc hóa đơn' ? 'Đang đọc hóa đơn…' : 'Gửi yêu cầu đọc hóa đơn'} disabled={disabled} onPress={extract} />
      {extraction && <View style={styles.stack}>
        <Text style={styles.copy}>Nguồn: {extraction.model} · Độ tin cậy: {extraction.confidence}</Text>
        <Text style={styles.copy}>Ngày: {extraction.paidAt ?? 'Chưa đọc được'} · Tài khoản: {extraction.recipient.accountMasked ?? 'Chưa đọc được'}</Text>
        {extraction.items.map((item, index) => <Text key={index} style={styles.copy}>
          {item.label}: {item.amountVnd === null ? 'Cần nhập lại' : `${item.amountVnd.toLocaleString('vi-VN')} ₫`}
        </Text>)}
        {extraction.needsReview.length > 0 && <Text style={styles.copy}>Cần kiểm tra: {extraction.needsReview.join(', ')}</Text>}
      </View>}
      <Text style={styles.label}>Tổng tiền (VND, số nguyên)</Text>
      <TextInput accessibilityLabel="Tổng tiền VND" value={amount} keyboardType="number-pad"
        onChangeText={value => { draftRevision.current += 1; setAmount(value); setReviewed(false); setDraftError(''); }}
        maxLength={12} style={styles.input} placeholder="Nhập số tiền" placeholderTextColor={palette.mutedText} />
      <Text style={styles.label}>Người nhận / cửa hàng</Text>
      <TextInput accessibilityLabel="Người nhận hoặc cửa hàng" value={recipient}
        onChangeText={value => { draftRevision.current += 1; setRecipient(value); setReviewed(false); setDraftError(''); }}
        maxLength={120} style={styles.input} placeholder="Nhập tên" placeholderTextColor={palette.mutedText} />
      <Action title="Xác nhận đã kiểm tra bản nháp" onPress={() => {
        if (!/^\d{1,12}$/.test(amount) || !recipient.trim()) {
          setDraftError('Nhập tổng tiền bằng số nguyên và tên người nhận.');
          return;
        }
        draftRevision.current += 1;
        setReviewed(true);
        setDraftError('');
      }} />
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{draftError || (reviewed
        ? 'Đã kiểm tra bản nháp trong màn hình này. Chưa lưu hóa đơn hoặc thực hiện thanh toán.'
        : 'Bản nháp chỉ nằm trong màn hình và mất khi đóng mini-app. Không dùng kết quả AI làm xác nhận thanh toán.')}</Text>
    </View>

    <View style={styles.card}>
      <Text style={styles.heading}>Lưu trữ theo mini-app</Text>
      <Text style={styles.copy}>Kho PoC trong bộ nhớ host, chưa bền qua khởi động lại. Chỉ dùng ghi chú mẫu, không lưu dữ liệu nhạy cảm.</Text>
      <TextInput accessibilityLabel="Ghi chú mẫu" value={note} onChangeText={setNote} maxLength={500} style={styles.input} />
      <View style={styles.actions}>
        <Action title="Ghi mẫu" disabled={disabled} onPress={() => { if (!bridge) return; void run('Ghi mẫu', () => bridge.storageSet('sample_note', note), () => 'Đã ghi vào bộ nhớ host của mini-app. Chưa phải lưu bền.'); }} />
        <Action title="Đọc mẫu" disabled={disabled} onPress={() => { if (!bridge) return; void run('Đọc mẫu', () => bridge.storageGet('sample_note'), data => data.value === null ? 'Chưa có ghi chú mẫu.' : `Ghi chú đã lưu: ${data.value}`); }} />
        <Action title="Xóa mẫu" disabled={disabled} onPress={() => { if (!bridge) return; void run('Xóa mẫu', () => bridge.storageDelete('sample_note'), () => 'Đã xóa ghi chú mẫu khỏi bộ nhớ host.'); }} />
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.heading}>Giới hạn hiện tại</Text>
      <Text style={styles.copy}>Nhắc lịch, lịch hệ thống và Live Activity chưa có API public cho mini-app. Các phần này không thể gọi trực tiếp từ mẫu.</Text>
      <Text style={styles.copy}>Quét mã, vị trí và ký bảo mật cần adapter thật. Mẫu không hiển thị dữ liệu giả như kết quả thiết bị.</Text>
      <Text style={styles.copy}>Đăng ký thông báo và network chưa có adapter bridge hoàn chỉnh. Các thao tác này chưa khả dụng từ mẫu.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: layoutTokens.spacing.sm },
  card: { backgroundColor: palette.surface, borderRadius: layoutTokens.radius.md, padding: layoutTokens.spacing.md, gap: layoutTokens.spacing.sm },
  heading: { color: palette.text, fontSize: typographyTokens.size.heading, fontWeight: typographyTokens.weight.bold },
  copy: { color: palette.mutedText, fontSize: typographyTokens.size.label, lineHeight: typographyTokens.lineHeight.body },
  label: { color: palette.text, fontSize: typographyTokens.size.label, fontWeight: typographyTokens.weight.semibold },
  input: { minHeight: layoutTokens.size.touchTarget, borderWidth: 1, borderColor: palette.border, borderRadius: layoutTokens.radius.sm, padding: layoutTokens.spacing.sm, color: palette.text, backgroundColor: palette.canvas },
  button: { minHeight: layoutTokens.size.touchTarget, borderRadius: layoutTokens.radius.sm, backgroundColor: palette.primary, padding: layoutTokens.spacing.sm, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: palette.onPrimary, fontSize: typographyTokens.size.label, fontWeight: typographyTokens.weight.bold },
  actions: { gap: layoutTokens.spacing.xs, flexDirection: 'row', flexWrap: 'wrap' },
  status: { backgroundColor: palette.surface, padding: layoutTokens.spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: layoutTokens.radius.sm },
  dimmed: { opacity: 0.5 },
});
