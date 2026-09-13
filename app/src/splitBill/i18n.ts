// Host-provided i18n store for split-bill.
// Per decision: options live in host app, host provides values, mini-app
// consumes them with no local fallback branching besides vi default.

export type SplitBillLang = 'vi' | 'en';

export type SplitBillStrings = {
  appName: string;
  participants: string;
  participantPlaceholder: string;
  participantHint: string;
  addParticipant: string;
  remove: string;
  maxHint: string;
  items: string;
  itemInputPlaceholder: string;
  voiceUnavailable: string;
  imageUnavailable: string;
  askBackTitle: string;
  amount: string;
  payer: string;
  sharedWith: string;
  confirmItem: string;
  cancel: string;
  addItem: string;
  doneCalculate: string;
  bankInfo: string;
  pasteVietqr: string;
  uploadVietqr: string;
  scanVietqr: string;
  bankAccountDetected: string;
  settlement: string;
  filterBy: string;
  debtor: string;
  creditor: string;
  amountToPay: string;
  qrForTransfer: string;
  noTransfers: string;
  maskNote: string;
  errors: {
    needMin2: string;
    needItem: string;
    invalidAmount: string;
    invalidParticipant: string;
    invalidBank: string;
    invalidVietqr: string;
  };
};

const VI_STRINGS: SplitBillStrings = {
  appName: 'Chia tiền',
  participants: 'Người tham gia (tối đa 10)',
  participantPlaceholder: 'Nhập tên + email hoặc SĐT — vd: Lan 0912345678',
  participantHint: 'Tên bắt buộc; email/SĐT được tự nhận diện theo định dạng.',
  addParticipant: 'Thêm người',
  remove: 'Xóa',
  maxHint: 'Đã đủ 10 người.',
  items: 'Khoản chi',
  itemInputPlaceholder: 'Nhập mô tả — vd: An trả 200k tiền phở cho 3 người',
  voiceUnavailable: 'Ghi âm giọng nói dùng AI của hệ điều hành — chưa khả dụng trên thiết bị này.',
  imageUnavailable: 'Quét hóa đơn bằng AI hệ điều hành — chưa khả dụng trên thiết bị này.',
  askBackTitle: 'Bổ sung thông tin cho khoản chi',
  amount: 'Số tiền (VND)',
  payer: 'Người trả',
  sharedWith: 'Chia cho',
  confirmItem: 'Xác nhận khoản chi',
  cancel: 'Hủy',
  addItem: 'Thêm khoản chi',
  doneCalculate: 'Xong — Tính toán',
  bankInfo: 'Tài khoản nhận tiền',
  pasteVietqr: 'Dán mã VietQR (chuỗi EMVCo)',
  uploadVietqr: 'Tải ảnh VietQR',
  scanVietqr: 'Quét VietQR',
  bankAccountDetected: 'Đã nhận diện',
  settlement: 'Kết toán — chuyển khoản cần thực hiện',
  filterBy: 'Lọc theo người',
  debtor: 'Người trả',
  creditor: 'Người nhận',
  amountToPay: 'Số tiền cần trả',
  qrForTransfer: 'Mã QR chuyển khoản',
  noTransfers: 'Không có khoản phải trả — đã cân bằng.',
  maskNote: 'Số tài khoản được che trong giao diện, vẫn lưu đủ trong bộ nhớ.',
  errors: {
    needMin2: 'Cần ít nhất 2 người để chia tiền.',
    needItem: 'Thêm ít nhất 1 khoản chi trước khi tính.',
    invalidAmount: 'Số tiền không hợp lệ.',
    invalidParticipant: 'Nhập tên và (tuỳ chọn) email/SĐT đúng định dạng.',
    invalidBank: 'Không nhận diện được ngân hàng hoặc số tài khoản.',
    invalidVietqr: 'Mã VietQR không hợp lệ hoặc CRC sai.',
  },
};

const EN_STRINGS: SplitBillStrings = {
  appName: 'Split Bill',
  participants: 'Participants (max 10)',
  participantPlaceholder: 'Enter name + email or phone — e.g. Lan 0912345678',
  participantHint: 'Name required; email/phone auto-detected.',
  addParticipant: 'Add person',
  remove: 'Remove',
  maxHint: 'Limit of 10 reached.',
  items: 'Expenses',
  itemInputPlaceholder: 'Describe — e.g. An paid 200k pho for 3 people',
  voiceUnavailable: 'Voice uses on-device AI — unavailable on this device.',
  imageUnavailable: 'Receipt scan uses on-device AI — unavailable on this device.',
  askBackTitle: 'Complete expense details',
  amount: 'Amount (VND)',
  payer: 'Payer',
  sharedWith: 'Shared with',
  confirmItem: 'Confirm expense',
  cancel: 'Cancel',
  addItem: 'Add expense',
  doneCalculate: 'Done — Calculate',
  bankInfo: 'Payout account',
  pasteVietqr: 'Paste VietQR (EMVCo string)',
  uploadVietqr: 'Upload VietQR image',
  scanVietqr: 'Scan VietQR',
  bankAccountDetected: 'Detected',
  settlement: 'Settlement — transfers required',
  filterBy: 'Filter by person',
  debtor: 'Debtor',
  creditor: 'Creditor',
  amountToPay: 'Amount to pay',
  qrForTransfer: 'Transfer QR',
  noTransfers: 'No transfers needed — all settled.',
  maskNote: 'Account numbers are masked in UI, stored in full.',
  errors: {
    needMin2: 'At least 2 people required.',
    needItem: 'Add at least 1 expense before calculating.',
    invalidAmount: 'Invalid amount.',
    invalidParticipant: 'Enter a name and optional valid email/phone.',
    invalidBank: 'Could not detect bank or account number.',
    invalidVietqr: 'Invalid VietQR or CRC mismatch.',
  },
};

export const STRINGS: Record<SplitBillLang, SplitBillStrings> = {
  vi: VI_STRINGS,
  en: EN_STRINGS,
};

// Host injection point: host app sets this before mounting.
// Mini-app never branches on locale itself beyond reading here.
let currentLang: SplitBillLang = 'vi';
export function setSplitBillLang(lang: SplitBillLang) {
  currentLang = lang;
}
export function getStrings(): SplitBillStrings {
  return STRINGS[currentLang];
}
export function t<K extends keyof SplitBillStrings>(key: K): SplitBillStrings[K] {
  return STRINGS[currentLang][key];
}
