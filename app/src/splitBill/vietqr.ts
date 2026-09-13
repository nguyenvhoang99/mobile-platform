// VietQR — EMVCo Merchant-Presented (MP) payload parser / generator.
// Single-file, no dependencies. Implements TLV (TTLLVV) + CRC16/CCITT-FALSE.

export type VietQRParsed = {
  raw: string;
  acqBin?: string; // NAPAS acquirer BIN from 38 → 01 → 00
  accountNo?: string; // 38 → 01 → 01
  bankBin?: string; // alias for acqBin (bank owning account)
  amount?: number; // 54
  currency: string; // 53, expect 704
  isDynamic: boolean; // 01 = 12
  merchantName?: string; // 59
  addData?: Record<string, string>; // 62 children
};

// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF)
function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

type Tlv = { tag: string; len: number; value: string; raw: string; children?: Tlv[] };

function parseTlvs(payload: string): Tlv[] {
  const out: Tlv[] = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) break;
    const len = parseInt(lenStr, 10);
    if (i + 4 + len > payload.length) break;
    const value = payload.slice(i + 4, i + 4 + len);
    const raw = payload.slice(i, i + 4 + len);
    const tlv: Tlv = { tag, len, value, raw };
    // Templates that contain nested TLVs
    if (['26', '38', '62', '64'].includes(tag) || (tag >= '80' && tag <= '99')) {
      try {
        const children = parseTlvs(value);
        if (children.length > 0) tlv.children = children;
      } catch {
        // value not TLV-structured, keep as leaf
      }
    }
    // 38 → 01 inner template (BIN/Acct/Service) is itself a TLV container
    // but tag '01' is not in the template list, so try nested parse for it
    if (!tlv.children && tag === '01' && value.length >= 4 && /^\d{4}/.test(value)) {
      try {
        const nested = parseTlvs(value);
        const consumed = nested.reduce((s, c) => s + c.raw.length, 0);
        if (nested.length > 0 && consumed === value.length) tlv.children = nested;
      } catch {
        // not TLV
      }
    }
    out.push(tlv);
    i += 4 + len;
  }
  return out;
}

function findTlv(tlvs: Tlv[], tag: string): Tlv | undefined {
  return tlvs.find(t => t.tag === tag);
}

export function parseVietQR(payload: string): VietQRParsed | { error: string } {
  const trimmed = payload.trim();
  if (trimmed.length < 10 || trimmed.length > 512) return { error: 'INVALID_LENGTH' };
  if (!trimmed.startsWith('000201')) return { error: 'INVALID_PFI' };
  // Verify CRC
  const crcTagIdx = trimmed.lastIndexOf('6304');
  if (crcTagIdx === -1) return { error: 'MISSING_CRC' };
  const withoutCrc = trimmed.slice(0, crcTagIdx + 4); // includes '6304'
  const expectedCrc = crc16CcittFalse(withoutCrc);
  const actualCrc = trimmed.slice(crcTagIdx + 4, crcTagIdx + 8);
  if (actualCrc.toUpperCase() !== expectedCrc) return { error: 'CRC_MISMATCH' };

  const tlvs = parseTlvs(trimmed);
  const pim = findTlv(tlvs, '01')?.value; // 11 static, 12 dynamic
  const currency = findTlv(tlvs, '53')?.value ?? '704';
  const amountStr = findTlv(tlvs, '54')?.value;
  const merchantName = findTlv(tlvs, '59')?.value;
  const field38 = findTlv(tlvs, '38');
  let acqBin: string | undefined;
  let accountNo: string | undefined;
  if (field38?.children) {
    // GUID check
    const guid = field38.children.find(c => c.tag === '00')?.value;
    if (guid && guid !== 'A000000727') {
      // Not NAPAS but may still be VietQR via 26 (VNPAY). For now only support 38.
      // Return what we have but flag_guid.
    }
    const template01 = field38.children.find(c => c.tag === '01');
    if (template01?.children) {
      acqBin = template01.children.find(c => c.tag === '00')?.value;
      accountNo = template01.children.find(c => c.tag === '01')?.value;
    } else if (template01) {
      // Fallback: value may directly contain BIN+Account concatenation
      acqBin = template01.value.slice(0, 6);
    }
  }

  const field62 = findTlv(tlvs, '62');
  const addData: Record<string, string> | undefined = field62?.children
    ? Object.fromEntries(field62.children.map(c => [c.tag, c.value]))
    : undefined;

  return {
    raw: trimmed,
    acqBin,
    accountNo,
    bankBin: acqBin,
    amount: amountStr ? Number(amountStr) : undefined,
    currency,
    isDynamic: pim === '12',
    merchantName,
    addData,
  };
}

function encodeTlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

// Build a dynamic VietQR (01=12) with amount.
// Shape per NAPAS spec + emvgo docs:
// 38[ 00:A000000727 01[ 00:BIN 01:Account 02:QRIBFTTA ] ]
export function buildVietQR(input: {
  acqBin: string; // 6 digits, e.g. 970415
  accountNo: string; // digits, e.g. 113366668888
  amount?: number; // VND, integer
  purpose?: string; // 62/08, <=25, unaccented ASCII
  merchantName?: string; // 59, <=25
}): string {
  const { acqBin, accountNo, amount, purpose, merchantName } = input;
  if (!/^\d{6}$/.test(acqBin)) throw new Error('INVALID_ACQ_BIN');
  if (!/^\d{6,19}$/.test(accountNo)) throw new Error('INVALID_ACCOUNT');

  const inner01 = encodeTlv('00', acqBin) + encodeTlv('01', accountNo) + encodeTlv('02', 'QRIBFTTA');
  const field38Val = encodeTlv('00', 'A000000727') + encodeTlv('01', inner01);
  const field38 = encodeTlv('38', field38Val);

  const fields: string[] = ['000201', '010212', field38, '5303704'];
  if (amount != null && Number.isFinite(amount) && amount > 0) {
    fields.push(encodeTlv('54', String(Math.round(amount))));
  }
  fields.push('5802VN');
  if (merchantName) fields.push(encodeTlv('59', merchantName.slice(0, 25)));
  if (purpose) {
    const cleanPurpose = purpose
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .slice(0, 25);
    // wrap purpose in 62 → 08
    const add = encodeTlv('08', cleanPurpose);
    fields.push(encodeTlv('62', add));
  }
  const withoutCrc = fields.join('') + '6304';
  const crc = crc16CcittFalse(withoutCrc);
  return withoutCrc + crc;
}

// Quick sanity helper for UI previews — returns the EMV payload string.
// Rendering to an image is done client-side with a lightweight canvas QR lib
// (or via a data-uri placeholder in tests to avoid bundling weight).
export function buildVietQRForTransfer(params: {
  recipientBin: string;
  recipientAccount: string;
  amountVnd: number;
  billId: string;
  debtorLabel: string;
}): string {
  return buildVietQR({
    acqBin: params.recipientBin,
    accountNo: params.recipientAccount,
    amount: params.amountVnd,
    purpose: `Chia tien ${params.billId}`,
    merchantName: params.debtorLabel.slice(0, 25),
  });
}

// Lightweight validator for pasted/uploaded strings — accepts with or without CRLF/BOM.
export function isProbablyVietQR(s: string): boolean {
  const t = s.trim();
  return t.startsWith('000201') && t.includes('A000000727');
}
