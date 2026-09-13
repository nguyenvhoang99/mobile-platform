// Banks are the VietQR-registered BIN table.
// Source of truth: https://vietqr.net (Napas). IDs are bank BINs (9704xx).
// This file is the seed; remote refresh via net.request to vietqr.net is
// gated behind egressHosts: ['vietqr.net'] in the manifest.

export type BankInfo = {
  bin: string; // e.g. 970415 for VietinBank
  shortName: string; // e.g. VietinBank
  name: string; // e.g. Ngân hàng TMCP Công Thương Việt Nam
};

export const VIETQR_BANKS: readonly BankInfo[] = [
  { bin: '970415', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công Thương Việt Nam' },
  { bin: '970403', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970423', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970432', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970422', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân Đội' },
  { bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970407', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ Thương Việt Nam' },
  { bin: '970405', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970418', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970416', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970409', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970431', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam' },
  { bin: '970437', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM' },
  { bin: '970426', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { bin: '970428', shortName: 'NamABank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970414', shortName: 'OceanBank', name: 'Ngân hàng TMCP Đại Dương' },
  { bin: '970419', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970424', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970400', shortName: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt' },
  { bin: '970412', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc Tế Việt Nam' },
  { bin: '970421', shortName: 'VRB', name: 'Ngân hàng Liên doanh Việt - Nga' },
  { bin: '970427', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á' },
  { bin: '970433', shortName: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { bin: '970434', shortName: 'Indovina', name: 'Ngân hàng TNHH Indovina' },
  { bin: '970443', shortName: 'SHBFC', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam' },
  { bin: '970444', shortName: 'CBBank', name: 'Ngân hàng TMCP Xây Dựng' },
  { bin: '970408', shortName: 'GPBank', name: 'Ngân hàng TMCP Dầu khí Toàn cầu' },
  { bin: '970410', shortName: 'StandardChartered', name: 'Ngân hàng TNHH MTV Standard Chartered VN' },
  { bin: '970401', shortName: 'VietCapital', name: 'Ngân hàng TMCP Bản Việt' },
  { bin: '970429', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { bin: '970430', shortName: 'PG Bank', name: 'Ngân hàng TMCP Xăng dầu Petrolimex' },
  { bin: '970441', shortName: 'Vikki Bank', name: 'Ngân hàng TMCP Đông Nam Á' },
  // E-wallets map via BIN-like virtual codes used inside VietQR 38 payloads
  { bin: '970454', shortName: 'MoMo', name: 'Ví MoMo' },
  { bin: '970457', shortName: 'ZaloPay', name: 'Ví ZaloPay' },
  { bin: '970455', shortName: 'ViettelPay', name: 'Viettel Money' },
] as const;

const BANKS_BY_BIN = new Map(VIETQR_BANKS.map(b => [b.bin, b] as const));
const BANKS_BY_SHORT = new Map(VIETQR_BANKS.map(b => [fold(b.shortName), b] as const));
const BANKS_BY_NAME_FOLD = new Map(VIETQR_BANKS.map(b => [fold(b.name), b] as const));

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function findBankByBin(bin: string): BankInfo | undefined {
  return BANKS_BY_BIN.get(bin);
}

export function findBankByName(raw: string): BankInfo | undefined {
  const f = fold(raw);
  return (
    BANKS_BY_SHORT.get(f) ??
    BANKS_BY_NAME_FOLD.get(f) ??
    VIETQR_BANKS.find(b => f.includes(fold(b.shortName))) ??
    VIETQR_BANKS.find(b => fold(b.shortName).includes(f))
  );
}

export function allBankShortNames(): readonly string[] {
  return VIETQR_BANKS.map(b => b.shortName);
}
