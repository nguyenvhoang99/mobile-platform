import { findBankByName } from './banks';
import { buildVietQRForTransfer, parseVietQR } from './vietqr';

// ── Participants ──────────────────────────────────────────────────────────

export const MAX_PARTICIPANTS = 10;

export type ContactKind = 'email' | 'phone' | 'none';

export type Participant = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  kind: ContactKind;
  raw: string; // original input line
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^(?:\+?84|0)[35789]\d{8}$/;

function normalizePhone(s: string): string {
  return s.replace(/[\s.-]/g, '');
}

export function detectContact(token: string): { email?: string; phone?: string; kind: ContactKind } {
  const t = token.trim();
  if (EMAIL_RE.test(t)) return { email: t, kind: 'email' };
  const p = normalizePhone(t);
  if (PHONE_RE.test(p)) return { phone: p, kind: 'phone' };
  return { kind: 'none' };
}

// Input contract: "name must exist beside the other one (name only or email/phone + name)"
// Accepts free-form line; extracts first email/phone token, remainder is name.
export function parseParticipantLine(raw: string): { participant?: Participant; error?: string } {
  const line = raw.trim();
  if (!line) return { error: 'EMPTY' };
  const tokens = line.split(/\s+/);
  let email: string | undefined;
  let phone: string | undefined;
  let kind: ContactKind = 'none';
  const nameTokens: string[] = [];

  for (const tok of tokens) {
    const det = detectContact(tok);
    if (!email && !phone && det.kind !== 'none') {
      email = det.email;
      phone = det.phone;
      kind = det.kind;
    } else {
      nameTokens.push(tok);
    }
  }

  // If no contact extracted, whole line is name (name-only)
  // If contact extracted, remainder must contain a name
  let name = nameTokens.join(' ').trim();
  if (!email && !phone) {
    name = line;
    kind = 'none';
  }
  if (!name) return { error: 'NAME_REQUIRED' };
  if (name.length > 40) return { error: 'NAME_TOO_LONG' };

  const id = foldId(name + (email ?? phone ?? ''));
  return {
    participant: {
      id,
      name,
      email,
      phone,
      kind,
      raw: line,
    },
  };
}

export function foldId(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

// ── Items & text parsing ───────────────────────────────────────────────

export type InputMode = 'text' | 'voice' | 'image';

export type BillItem = {
  id: string;
  description: string;
  amountVnd: number;
  payerId: string;
  sharedWithIds: string[]; // defaults to all participants equally
  inputMode: InputMode;
  createdAt: number;
};

export type PendingItemDraft = {
  description?: string;
  amountVnd?: number;
  payerId?: string;
  sharedWithIds?: string[];
  missing: ('description' | 'amount' | 'payer' | 'sharedWith')[];
};

export function tryParseItemText(
  text: string,
  participants: readonly Participant[],
): { item?: Partial<BillItem>; draft: PendingItemDraft } {
  const draft: PendingItemDraft = { missing: [] };
  let amountVnd: number | undefined;
  let description: string | undefined;

  // Amount extraction: 200k, 200.000, 200,000, 200000, 200k VND
  const amountMatch =
    text.match(/(\d[\d.,]*)\s*k\b/i) ??
    text.match(/(\d[\d.,]*)\s*(?:vnd|đ)\b/i) ??
    text.match(/(\d[\d.,]+)/);
  if (amountMatch) {
    let raw = amountMatch[1].replace(/[.,]/g, '');
    if (/k/i.test(amountMatch[0])) raw = String(Number(raw) * 1000);
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) amountVnd = Math.round(n);
  }

  description = text.replace(amountMatch?.[0] ?? '', '').trim().replace(/\s{2,}/g, ' ') || undefined;

  // Payer detection: if any participant name appears in text
  let payerId: string | undefined;
  for (const p of participants) {
    if (text.toLowerCase().includes(p.name.toLowerCase())) {
      payerId = p.id;
      break;
    }
  }

  // sharedWith: "cho 3 người" / "for 3 people" / explicit names
  let sharedWithIds: string[] | undefined;
  const sharedExplicit = participants.filter(p => text.toLowerCase().includes(p.name.toLowerCase()));
  if (sharedExplicit.length >= 2) sharedWithIds = sharedExplicit.map(p => p.id);

  if (!amountVnd) draft.missing.push('amount');
  if (!description) draft.missing.push('description');
  if (!payerId) draft.missing.push('payer');
  // sharedWith defaults to all if not specified — not missing
  if (amountVnd) draft.amountVnd = amountVnd;
  if (description) draft.description = description;
  if (payerId) draft.payerId = payerId;
  if (sharedWithIds) draft.sharedWithIds = sharedWithIds;

  return { draft, item: { description, amountVnd, payerId, sharedWithIds } as Partial<BillItem> };
}

export function finalizeBillItem(
  draft: PendingItemDraft,
  fallbackPayerId: string,
  allParticipantIds: string[],
): { item?: BillItem; error?: string } {
  const amount = draft.amountVnd;
  const desc = draft.description?.trim();
  if (!desc) return { error: 'DESCRIPTION_REQUIRED' };
  if (!amount || amount <= 0) return { error: 'INVALID_AMOUNT' };
  const payerId = draft.payerId ?? fallbackPayerId;
  if (!payerId) return { error: 'PAYER_REQUIRED' };
  const shared = draft.sharedWithIds && draft.sharedWithIds.length > 0 ? draft.sharedWithIds : allParticipantIds;
  return {
    item: {
      id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      description: desc,
      amountVnd: Math.round(amount),
      payerId,
      sharedWithIds: shared,
      inputMode: 'text',
      createdAt: Date.now(),
    },
  };
}

// ── Bank / VietQR collection ───────────────────────────────────────────

export type PayoutAccount = {
  participantId: string;
  bankBin?: string;
  bankName?: string;
  accountNo?: string;
  vietqrRaw?: string;
  source: 'text' | 'vietqr_paste' | 'vietqr_image' | 'vietqr_scan';
};

// Extract bank + account from free text. Drop account holder name per spec.
export function extractBankAccountFromText(text: string): { bankBin?: string; bankName?: string; accountNo?: string } {
  // Account number: 6-19 contiguous digits
  const acctMatch = text.match(/\b(\d{6,19})\b/);
  const accountNo = acctMatch?.[1];
  if (!accountNo) return {};
  // Remove account digits from text to search bank name
  const withoutAcct = text.replace(accountNo, ' ');
  const bank = findBankByName(withoutAcct);
  if (bank) return { bankBin: bank.bin, bankName: bank.shortName, accountNo };
  // Fallback: try last word as bank hint
  const tokens = withoutAcct.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const b = findBankByName(tokens[i]);
    if (b) return { bankBin: b.bin, bankName: b.shortName, accountNo };
  }
  return { accountNo };
}

export function extractFromVietQRString(raw: string): { bankBin?: string; accountNo?: string; vietqrRaw?: string; error?: string } {
  const parsed = parseVietQR(raw);
  if ('error' in parsed) return { error: parsed.error };
  if (!parsed.bankBin || !parsed.accountNo) return { error: 'MISSING_ACCOUNT_IN_QR' };
  return { bankBin: parsed.bankBin, accountNo: parsed.accountNo, vietqrRaw: raw.trim() };
}

export function maskAccountNo(acct: string): string {
  if (acct.length <= 4) return '****';
  return '****' + acct.slice(-4);
}

// ── Bill & Settlement ───────────────────────────────────────────────────

export type Bill = {
  id: string;
  title: string;
  participants: Participant[];
  items: BillItem[];
  payoutAccounts: PayoutAccount[];
  createdAt: number;
};

export type Transfer = {
  fromId: string;
  toId: string;
  amountVnd: number;
  vietqrPayload?: string;
};

export function computeBalances(bill: Bill): Map<string, number> {
  // balance >0 means person is owed money (creditor), <0 owes
  const bal = new Map<string, number>();
  for (const p of bill.participants) bal.set(p.id, 0);
  for (const it of bill.items) {
    const shareIds = it.sharedWithIds.length > 0 ? it.sharedWithIds : bill.participants.map(p => p.id);
    if (shareIds.length === 0) continue;
    const base = Math.floor(it.amountVnd / shareIds.length);
    const remainder = it.amountVnd - base * shareIds.length; // goes to last participant per spec
    shareIds.forEach((pid, idx) => {
      const share = idx === shareIds.length - 1 ? base + remainder : base;
      bal.set(pid, (bal.get(pid) ?? 0) - share);
    });
    bal.set(it.payerId, (bal.get(it.payerId) ?? 0) + it.amountVnd);
  }
  return bal;
}

// Greedy min-cash-flow (creditors vs debtors sorted)
export function settleBill(bill: Bill): Transfer[] {
  const bal = computeBalances(bill);
  const creditors = [...bal.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, amt]) => ({ id, amt }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = [...bal.entries()]
    .filter(([, v]) => v < 0)
    .map(([id, amt]) => ({ id, amt: -amt }))
    .sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(d.amt, c.amt);
    if (amt > 0) {
      transfers.push({ fromId: d.id, toId: c.id, amountVnd: amt });
      d.amt -= amt;
      c.amt -= amt;
    }
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }

  // Attach VietQR payloads where recipient has bank info
  const acctByPid = new Map(bill.payoutAccounts.map(a => [a.participantId, a] as const));
  for (const t of transfers) {
    const acct = acctByPid.get(t.toId);
    if (acct?.bankBin && acct?.accountNo) {
      try {
        t.vietqrPayload = buildVietQRForTransfer({
          recipientBin: acct.bankBin,
          recipientAccount: acct.accountNo,
          amountVnd: t.amountVnd,
          billId: bill.id,
          debtorLabel: bill.participants.find(p => p.id === t.fromId)?.name ?? 'debtor',
        });
      } catch {
        // leave without payload
      }
    }
  }
  return transfers;
}

export function createEmptyBill(title = 'Hóa đơn mới'): Bill {
  return {
    id: `bill-${Date.now().toString(36)}`,
    title,
    participants: [],
    items: [],
    payoutAccounts: [],
    createdAt: Date.now(),
  };
}
