import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ShellPalette } from '../config/palette';
import {
  Bill,
  BillItem,
  MAX_PARTICIPANTS,
  PendingItemDraft,
  PayoutAccount,
  createEmptyBill,
  extractBankAccountFromText,
  extractFromVietQRString,
  finalizeBillItem,
  maskAccountNo,
  parseParticipantLine,
  settleBill,
  tryParseItemText,
} from '../splitBill/model';
import { getStrings } from '../splitBill/i18n';
import { loadBill, saveBill } from '../splitBill/storage';

type Props = {
  palette: ShellPalette;
  onTrackEvent: (name: string, version: number, data: Record<string, unknown>) => void;
};

function formatVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
}

export function SplitBillBody({ palette, onTrackEvent }: Props) {
  const s = getStrings();
  const [bill, setBill] = useState<Bill>(() => createEmptyBill());
  const [loaded, setLoaded] = useState(false);
  const [participantInput, setParticipantInput] = useState('');
  const [participantError, setParticipantError] = useState<string | null>(null);

  // Item input
  const [itemInput, setItemInput] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'voice' | 'image'>('text');
  const [pendingDraft, setPendingDraft] = useState<PendingItemDraft | null>(null);
  const [askBackDesc, setAskBackDesc] = useState('');
  const [askBackAmount, setAskBackAmount] = useState('');
  const [askBackPayer, setAskBackPayer] = useState('');
  const [askBackShared, setAskBackShared] = useState<string[]>([]);

  // Bank / VietQR — per participant text inputs
  const [bankTextByPid, setBankTextByPid] = useState<Record<string, string>>({});
  const [vietqrPaste, setVietqrPaste] = useState('');
  const [vietqrPastePid, setVietqrPastePid] = useState<string>('');
  const [bankError, setBankError] = useState<string | null>(null);

  // Settlement filter
  const [filterPid, setFilterPid] = useState<string | null>(null);
  const [phase, setPhase] = useState<'edit' | 'accounts' | 'settle'>('edit');

  useEffect(() => {
    let cancelled = false;
    loadBill().then(stored => {
      if (!cancelled && stored) {
        setBill(stored);
        if (stored.items.length > 0 && stored.payoutAccounts.length > 0) setPhase('settle');
        else if (stored.items.length > 0) setPhase('accounts');
      }
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: Bill) => {
    setBill(next);
    saveBill(next).catch(() => undefined);
  }, []);

  const transfers = useMemo(() => (phase === 'settle' ? settleBill(bill) : []), [bill, phase]);
  const filteredTransfers = useMemo(() => {
    if (!filterPid) return transfers;
    return transfers.filter(t => t.fromId === filterPid || t.toId === filterPid);
  }, [transfers, filterPid]);

  const handleAddParticipant = useCallback(() => {
    if (bill.participants.length >= MAX_PARTICIPANTS) {
      setParticipantError(s.maxHint);
      return;
    }
    const res = parseParticipantLine(participantInput);
    if (res.error || !res.participant) {
      setParticipantError(s.errors.invalidParticipant);
      return;
    }
    if (bill.participants.some(p => p.id === res.participant!.id)) {
      setParticipantError('Người này đã có trong danh sách.');
      return;
    }
    const next: Bill = { ...bill, participants: [...bill.participants, res.participant] };
    persist(next);
    setParticipantInput('');
    setParticipantError(null);
    onTrackEvent('bill_created', 1, { participant_count: next.participants.length });
  }, [bill, participantInput, persist, onTrackEvent, s]);

  const handleRemoveParticipant = useCallback(
    (id: string) => {
      const next: Bill = {
        ...bill,
        participants: bill.participants.filter(p => p.id !== id),
        items: bill.items.filter(it => it.payerId !== id),
        payoutAccounts: bill.payoutAccounts.filter(a => a.participantId !== id),
      };
      persist(next);
      if (filterPid === id) setFilterPid(null);
    },
    [bill, persist, filterPid],
  );

  const handleSubmitItemText = useCallback(() => {
    if (!itemInput.trim()) return;
    const fallbackPayer = bill.participants[0]?.id ?? '';
    const { draft } = tryParseItemText(itemInput, bill.participants);
    // If missing fields, open ask-back
    if (draft.missing.length > 0) {
      setPendingDraft(draft);
      setAskBackDesc(draft.description ?? itemInput.replace(/\d[\d.,]*\s*k?\b/gi, '').trim());
      setAskBackAmount(draft.amountVnd ? String(draft.amountVnd) : '');
      setAskBackPayer(draft.payerId ?? fallbackPayer);
      setAskBackShared(draft.sharedWithIds ?? bill.participants.map(p => p.id));
      return;
    }
    const res = finalizeBillItem(draft, fallbackPayer, bill.participants.map(p => p.id));
    if (!res.item) {
      setPendingDraft(draft);
      setAskBackDesc(draft.description ?? '');
      setAskBackAmount(draft.amountVnd ? String(draft.amountVnd) : '');
      setAskBackPayer(draft.payerId ?? fallbackPayer);
      setAskBackShared(draft.sharedWithIds ?? bill.participants.map(p => p.id));
      return;
    }
    const withMode: BillItem = { ...res.item, inputMode };
    persist({ ...bill, items: [...bill.items, withMode] });
    setItemInput('');
    setPendingDraft(null);
    onTrackEvent('bill_item_added', 1, { input_mode: inputMode, has_ask_back: false });
  }, [bill, itemInput, inputMode, persist, onTrackEvent]);

  const handleConfirmAskBack = useCallback(() => {
    if (!pendingDraft) return;
    const amt = Number(askBackAmount.replace(/[^\d]/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) return;
    const draft: PendingItemDraft = {
      description: askBackDesc.trim() || pendingDraft.description,
      amountVnd: amt,
      payerId: askBackPayer || bill.participants[0]?.id,
      sharedWithIds: askBackShared.length > 0 ? askBackShared : bill.participants.map(p => p.id),
      missing: [],
    };
    const fallback = bill.participants[0]?.id ?? '';
    const res = finalizeBillItem(draft, fallback, bill.participants.map(p => p.id));
    if (!res.item) return;
    const withMode: BillItem = { ...res.item, inputMode };
    persist({ ...bill, items: [...bill.items, withMode] });
    setPendingDraft(null);
    setItemInput('');
    setAskBackDesc('');
    setAskBackAmount('');
    onTrackEvent('bill_item_added', 1, { input_mode: inputMode, has_ask_back: true });
  }, [pendingDraft, askBackDesc, askBackAmount, askBackPayer, askBackShared, bill, inputMode, persist, onTrackEvent]);

  const handleDoneCalculate = useCallback(() => {
    if (bill.participants.length < 2) {
      setParticipantError(s.errors.needMin2);
      return;
    }
    if (bill.items.length === 0) {
      setParticipantError(s.errors.needItem);
      return;
    }
    setPhase('accounts');
  }, [bill, s]);

  const handleCollectAccountsDone = useCallback(() => {
    setPhase('settle');
    onTrackEvent('bill_settled', 1, {
      participant_count: bill.participants.length,
      item_count: bill.items.length,
      transfer_count: settleBill(bill).length,
    });
  }, [bill, onTrackEvent]);

  const upsertPayout = useCallback(
    (pid: string, patch: Partial<PayoutAccount>) => {
      const existing = bill.payoutAccounts.find(a => a.participantId === pid);
      const nextAcc: PayoutAccount = {
        participantId: pid,
        source: 'text',
        ...existing,
        ...patch,
      } as PayoutAccount;
      const others = bill.payoutAccounts.filter(a => a.participantId !== pid);
      persist({ ...bill, payoutAccounts: [...others, nextAcc] });
    },
    [bill, persist],
  );

  const handleBankTextSubmit = useCallback(
    (pid: string) => {
      const txt = bankTextByPid[pid] ?? '';
      if (!txt.trim()) {
        setBankError(s.errors.invalidBank);
        return;
      }
      const extracted = extractBankAccountFromText(txt);
      if (!extracted.accountNo || !extracted.bankBin) {
        setBankError(s.errors.invalidBank);
        return;
      }
      upsertPayout(pid, {
        bankBin: extracted.bankBin,
        bankName: extracted.bankName,
        accountNo: extracted.accountNo,
        source: 'text',
      });
      setBankError(null);
      setBankTextByPid(prev => ({ ...prev, [pid]: '' }));
    },
    [bankTextByPid, upsertPayout, s],
  );

  const handleVietqrPaste = useCallback(() => {
    if (!vietqrPastePid) {
      setBankError('Chọn người nhận trước khi dán VietQR.');
      return;
    }
    const res = extractFromVietQRString(vietqrPaste);
    if (res.error || !res.bankBin || !res.accountNo) {
      setBankError(s.errors.invalidVietqr);
      return;
    }
    upsertPayout(vietqrPastePid, {
      bankBin: res.bankBin,
      bankName: res.bankBin,
      accountNo: res.accountNo,
      vietqrRaw: res.vietqrRaw,
      source: 'vietqr_paste',
    });
    setBankError(null);
    setVietqrPaste('');
    onTrackEvent('vietqr_parsed', 1, { has_amount: false, bank_bin: res.bankBin });
  }, [vietqrPaste, vietqrPastePid, upsertPayout, onTrackEvent, s]);

  const handleScanMock = useCallback(() => {
    // In host, this would call scanner.scan bridge (once consent, host_scanner UI).
    // Here we surface as text input to keep single-bundle and no native dep.
    setBankError('Quét VietQR dùng camera hệ điều hành — gọi scanner.scan (chưa khả dụng trong preview). Dùng dán chuỗi hoặc tải ảnh thay thế.');
  }, []);

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.muted, { color: palette.mutedText }]}>Đang tải…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Participants */}
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{s.participants}</Text>
      <Text style={[styles.hint, { color: palette.mutedText }]}>{s.participantHint}</Text>

      <View style={styles.row}>
        <TextInput
          accessibilityLabel="participant input"
          placeholder={s.participantPlaceholder}
          placeholderTextColor={palette.mutedText}
          value={participantInput}
          onChangeText={setParticipantInput}
          onSubmitEditing={handleAddParticipant}
          returnKeyType="done"
          style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
        />
        <Pressable
          onPress={handleAddParticipant}
          style={[styles.smallBtn, { backgroundColor: palette.primary }]}
        >
          <Text style={[styles.smallBtnText, { color: palette.onPrimary }]}>{s.addParticipant}</Text>
        </Pressable>
      </View>
      {participantError ? <Text style={[styles.error, { color: palette.danger }]}>{participantError}</Text> : null}
      {bill.participants.length >= MAX_PARTICIPANTS ? (
        <Text style={[styles.hint, { color: palette.warning }]}>{s.maxHint}</Text>
      ) : null}

      <View style={styles.chipWrap}>
        {bill.participants.map(p => (
          <View key={p.id} style={[styles.chip, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
              {p.name}
              {p.email ? ` · ${p.email}` : p.phone ? ` · ${p.phone}` : ''}
            </Text>
            <Pressable onPress={() => handleRemoveParticipant(p.id)} hitSlop={8}>
              <Text style={[styles.chipRemove, { color: palette.danger }]}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {/* Items — phase edit */}
      {phase === 'edit' ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.text, marginTop: 18 }]}>{s.items}</Text>

          <View style={styles.modeRow}>
            {(['text', 'voice', 'image'] as const).map(m => (
              <Pressable
                key={m}
                onPress={() => setInputMode(m)}
                style={[styles.modeChip, { backgroundColor: inputMode === m ? palette.primarySoft : palette.surface, borderColor: palette.border }]}
              >
                <Text style={[styles.modeText, { color: inputMode === m ? palette.primary : palette.mutedText }]}>
                  {m === 'text' ? 'Văn bản' : m === 'voice' ? 'Giọng nói' : 'Hình ảnh'}
                </Text>
              </Pressable>
            ))}
          </View>

          {inputMode !== 'text' ? (
            <Text style={[styles.hint, { color: palette.warning, marginTop: 8 }]}>
              {inputMode === 'voice' ? s.voiceUnavailable : s.imageUnavailable}
            </Text>
          ) : null}

          <TextInput
            accessibilityLabel="item input"
            placeholder={s.itemInputPlaceholder}
            placeholderTextColor={palette.mutedText}
            value={itemInput}
            onChangeText={setItemInput}
            multiline
            style={[styles.inputMultiline, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
          />
          <View style={styles.ctaRow}>
            <Pressable
              onPress={handleSubmitItemText}
              style={[styles.cta, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Text style={[styles.ctaText, { color: palette.text }]}>{s.addItem}</Text>
            </Pressable>
            <Pressable
              onPress={handleDoneCalculate}
              style={[styles.ctaPrimary, { backgroundColor: palette.primary }]}
            >
              <Text style={[styles.ctaText, { color: palette.onPrimary }]}>{s.doneCalculate}</Text>
            </Pressable>
          </View>

          {bill.items.length > 0 ? (
            <View style={styles.cardList}>
              {bill.items.map(it => {
                const payer = bill.participants.find(p => p.id === it.payerId);
                return (
                  <View key={it.id} style={[styles.itemCard, { backgroundColor: palette.surface }]}>
                    <Text style={[styles.itemDesc, { color: palette.text }]}>{it.description}</Text>
                    <Text style={[styles.itemMeta, { color: palette.mutedText }]}>
                      {formatVnd(it.amountVnd)} · {payer?.name ?? it.payerId} trả · chia {it.sharedWithIds.length} người · {it.inputMode}
                    </Text>
                    <Pressable
                      onPress={() => persist({ ...bill, items: bill.items.filter(x => x.id !== it.id) })}
                      style={styles.itemDelete}
                    >
                      <Text style={[styles.smallLink, { color: palette.danger }]}>{s.remove}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Ask-back sheet */}
          {pendingDraft ? (
            <View style={[styles.sheet, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
              <Text style={[styles.sheetTitle, { color: palette.text }]}>{s.askBackTitle}</Text>
              <Text style={[styles.hint, { color: palette.mutedText }]}>Thiếu: {pendingDraft.missing.join(', ')}</Text>

              <Text style={[styles.label, { color: palette.text }]}>Mô tả</Text>
              <TextInput
                value={askBackDesc}
                onChangeText={setAskBackDesc}
                style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
              />
              <Text style={[styles.label, { color: palette.text }]}>{s.amount}</Text>
              <TextInput
                value={askBackAmount}
                onChangeText={setAskBackAmount}
                keyboardType="numeric"
                placeholder="200000"
                placeholderTextColor={palette.mutedText}
                style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
              />
              <Text style={[styles.label, { color: palette.text }]}>{s.payer}</Text>
              <View style={styles.chipWrap}>
                {bill.participants.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => setAskBackPayer(p.id)}
                    style={[styles.chip, { backgroundColor: askBackPayer === p.id ? palette.primarySoft : palette.surface, borderColor: palette.border }]}
                  >
                    <Text style={[styles.chipText, { color: askBackPayer === p.id ? palette.primary : palette.text }]}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.label, { color: palette.text }]}>{s.sharedWith}</Text>
              <View style={styles.chipWrap}>
                {bill.participants.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      setAskBackShared(prev => (prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]))
                    }
                    style={[styles.chip, { backgroundColor: askBackShared.includes(p.id) ? palette.primarySoft : palette.surface, borderColor: palette.border }]}
                  >
                    <Text style={[styles.chipText, { color: askBackShared.includes(p.id) ? palette.primary : palette.text }]}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.ctaRow}>
                <Pressable onPress={() => setPendingDraft(null)} style={[styles.cta, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  <Text style={[styles.ctaText, { color: palette.text }]}>{s.cancel}</Text>
                </Pressable>
                <Pressable onPress={handleConfirmAskBack} style={[styles.ctaPrimary, { backgroundColor: palette.primary }]}>
                  <Text style={[styles.ctaText, { color: palette.onPrimary }]}>{s.confirmItem}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Accounts — phase accounts */}
      {phase !== 'edit' ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.text, marginTop: 22 }]}>{s.bankInfo}</Text>
          <Text style={[styles.hint, { color: palette.mutedText }]}>{s.maskNote}</Text>

          {/* VietQR paste — higher priority, wider */}
          <View style={[styles.vietqrWide, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.label, { color: palette.text }]}>{s.pasteVietqr} (ưu tiên)</Text>
            <View style={styles.row}>
              <View style={[styles.pickerWrap, { backgroundColor: palette.canvas, borderColor: palette.border }]}>
                <Text style={[styles.pickerLabel, { color: palette.mutedText }]}>Cho:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                  {bill.participants.map(p => (
                    <Pressable
                      key={p.id}
                      onPress={() => setVietqrPastePid(p.id)}
                      style={[styles.pickerChip, { backgroundColor: vietqrPastePid === p.id ? palette.primary : palette.surface }]}
                    >
                      <Text style={[styles.pickerChipText, { color: vietqrPastePid === p.id ? palette.onPrimary : palette.text }]}>{p.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
            <TextInput
              placeholder="0002010102123856...6304XXXX"
              placeholderTextColor={palette.mutedText}
              value={vietqrPaste}
              onChangeText={setVietqrPaste}
              multiline
              style={[styles.inputMultiline, { backgroundColor: palette.canvas, borderColor: palette.border, color: palette.text, minHeight: 56 }]}
            />
            <View style={styles.row}>
              <Pressable onPress={handleVietqrPaste} style={[styles.smallBtn, { backgroundColor: palette.primary, flex: 1 }]}>
                <Text style={[styles.smallBtnText, { color: palette.onPrimary }]}>Áp dụng VietQR cho người đã chọn</Text>
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: palette.mutedText, marginTop: 6 }]}>Ảnh VietQR tải lên sẽ được giải mã thành chuỗi trên — dán chuỗi tại đây.</Text>
          </View>

          {/* Scan CTA — smaller, lower priority */}
          <Pressable onPress={handleScanMock} style={[styles.scanCta, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <Text style={[styles.scanCtaText, { color: palette.primary }]}>◫ {s.scanVietqr} (nhỏ — dùng scanner.scan)</Text>
          </Pressable>

          {bankError ? <Text style={[styles.error, { color: palette.danger }]}>{bankError}</Text> : null}

          {/* Per-participant bank text (auto-extract) */}
          <View style={styles.accountList}>
            {bill.participants.map(p => {
              const acct = bill.payoutAccounts.find(a => a.participantId === p.id);
              return (
                <View key={p.id} style={[styles.accountCard, { backgroundColor: palette.surface }]}>
                  <Text style={[styles.accountName, { color: palette.text }]}>{p.name}</Text>
                  {acct?.accountNo ? (
                    <Text style={[styles.accountDetected, { color: palette.success }]}>
                      {s.bankAccountDetected}: {acct.bankName ?? acct.bankBin} · {maskAccountNo(acct.accountNo)} · {acct.source}
                    </Text>
                  ) : (
                    <Text style={[styles.hint, { color: palette.mutedText }]}>Chưa có tài khoản nhận</Text>
                  )}
                  <View style={styles.row}>
                    <TextInput
                      placeholder="Nhập: Vietcombank 0123456789"
                      placeholderTextColor={palette.mutedText}
                      value={bankTextByPid[p.id] ?? ''}
                      onChangeText={v => setBankTextByPid(prev => ({ ...prev, [p.id]: v }))}
                      style={[styles.input, { flex: 1, backgroundColor: palette.canvas, borderColor: palette.border, color: palette.text }]}
                    />
                    <Pressable onPress={() => handleBankTextSubmit(p.id)} style={[styles.smallBtn, { backgroundColor: palette.primarySoft }]}>
                      <Text style={[styles.smallBtnText, { color: palette.primary }]}>Lưu</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          {phase === 'accounts' ? (
            <Pressable onPress={handleCollectAccountsDone} style={[styles.ctaPrimary, { backgroundColor: palette.primary, marginTop: 16 }]}>
              <Text style={[styles.ctaText, { color: palette.onPrimary }]}>Xem kết toán</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {/* Settlement */}
      {phase === 'settle' ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.text, marginTop: 22 }]}>{s.settlement}</Text>

          {/* Filter — only if >0 amounts, per spec hide zero? We show filter only when transfers exist */}
          {transfers.length > 0 ? (
            <View style={styles.filterRow}>
              <Text style={[styles.label, { color: palette.text }]}>{s.filterBy}:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                <Pressable
                  onPress={() => setFilterPid(null)}
                  style={[styles.filterChip, { backgroundColor: !filterPid ? palette.primary : palette.surface, borderColor: palette.border }]}
                >
                  <Text style={[styles.filterText, { color: !filterPid ? palette.onPrimary : palette.text }]}>Tất cả</Text>
                </Pressable>
                {bill.participants
                  .filter(p => transfers.some(t => t.fromId === p.id || t.toId === p.id))
                  .map(p => (
                    <Pressable
                      key={p.id}
                      onPress={() => setFilterPid(p.id)}
                      style={[styles.filterChip, { backgroundColor: filterPid === p.id ? palette.primary : palette.surface, borderColor: palette.border }]}
                    >
                      <Text style={[styles.filterText, { color: filterPid === p.id ? palette.onPrimary : palette.text }]}>{p.name}</Text>
                    </Pressable>
                  ))}
              </ScrollView>
            </View>
          ) : null}

          {filteredTransfers.length === 0 ? (
            <Text style={[styles.muted, { color: palette.mutedText, marginTop: 12 }]}>{s.noTransfers}</Text>
          ) : (
            <View style={styles.transferList}>
              {filteredTransfers.map((t, idx) => {
                const from = bill.participants.find(p => p.id === t.fromId);
                const to = bill.participants.find(p => p.id === t.toId);
                const acct = bill.payoutAccounts.find(a => a.participantId === t.toId);
                return (
                  <View key={idx} style={[styles.transferCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={styles.transferHeader}>
                      <Text style={[styles.transferTitle, { color: palette.text }]}>
                        {from?.name ?? t.fromId} → {to?.name ?? t.toId}
                      </Text>
                      <Text style={[styles.transferAmount, { color: palette.primary }]}>{formatVnd(t.amountVnd)}</Text>
                    </View>
                    {acct?.accountNo ? (
                      <Text style={[styles.hint, { color: palette.mutedText }]}>
                        {acct.bankName} · {maskAccountNo(acct.accountNo)}
                      </Text>
                    ) : null}
                    <View style={[styles.qrBox, { backgroundColor: palette.canvas, borderColor: palette.border }]}>
                      <Text style={[styles.qrLabel, { color: palette.mutedText }]}>{s.qrForTransfer}</Text>
                      {t.vietqrPayload ? (
                        <>
                          <View style={[styles.qrPlaceholder, { backgroundColor: palette.text }]}>
                            <Text style={[styles.qrPlaceholderText, { color: palette.surface }]}>QR</Text>
                          </View>
                          <Text selectable style={[styles.qrPayload, { color: palette.text }]} numberOfLines={2}>
                            {t.vietqrPayload.slice(0, 48)}…{t.vietqrPayload.slice(-8)}
                          </Text>
                          <Text style={[styles.hint, { color: palette.mutedText, fontSize: 10 }]}>Payload đầy đủ đã lưu · CRC hợp lệ</Text>
                        </>
                      ) : (
                        <Text style={[styles.hint, { color: palette.warning }]}>Thiếu tài khoản nhận — không tạo được VietQR. Yêu cầu người nhận bổ sung.</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={() => setPhase('edit')}
            style={[styles.cta, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 18 }]}
          >
            <Text style={[styles.ctaText, { color: palette.text }]}>← Quay lại chỉnh sửa</Text>
          </Pressable>
        </>
      ) : null}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 8,
    textAlignVertical: 'top',
  },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 13, fontWeight: '800' },
  error: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  muted: { fontSize: 13, lineHeight: 19 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600', maxWidth: 160 },
  chipRemove: { fontSize: 16, fontWeight: '800', paddingHorizontal: 2 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  modeText: { fontSize: 12, fontWeight: '800' },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cta: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  ctaPrimary: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  ctaText: { fontSize: 14, fontWeight: '800' },
  cardList: { gap: 10, marginTop: 14 },
  itemCard: { borderRadius: 14, padding: 12 },
  itemDesc: { fontSize: 14, fontWeight: '700' },
  itemMeta: { fontSize: 12, marginTop: 4 },
  itemDelete: { alignSelf: 'flex-end', marginTop: 6 },
  smallLink: { fontSize: 12, fontWeight: '700' },
  sheet: { marginTop: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  sheetTitle: { fontSize: 15, fontWeight: '800' },
  vietqrWide: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  pickerWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, gap: 8 },
  pickerLabel: { fontSize: 12, fontWeight: '700' },
  pickerScroll: { gap: 6, alignItems: 'center' },
  pickerChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  pickerChipText: { fontSize: 12, fontWeight: '700' },
  scanCta: { marginTop: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  scanCtaText: { fontSize: 12, fontWeight: '800' },
  accountList: { gap: 10, marginTop: 12 },
  accountCard: { borderRadius: 14, padding: 12 },
  accountName: { fontSize: 14, fontWeight: '800' },
  accountDetected: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  filterScroll: { gap: 8, paddingLeft: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '700' },
  transferList: { gap: 12, marginTop: 12 },
  transferCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  transferHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  transferTitle: { fontSize: 14, fontWeight: '800', flex: 1 },
  transferAmount: { fontSize: 15, fontWeight: '800' },
  qrBox: { marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 6 },
  qrLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  qrPlaceholder: { width: 96, height: 96, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  qrPlaceholderText: { fontSize: 22, fontWeight: '800' },
  qrPayload: { fontSize: 10, fontFamily: 'monospace' as const, textAlign: 'center' },
});
