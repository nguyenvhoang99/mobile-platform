/* Split Bill bundle (mini-app) — built by build.mjs. DO NOT EDIT. */
(function(){
/**
 * Split Bill — pure domain logic (no DOM, no bridge, no network, no storage).
 *
 * Port of the spec in the handoff (`model.ts` + `SplitBillBody.tsx` behaviour):
 * participants, free-text items + ask-back, VietQR EMVCo parse/build, bank
 * lookup, integer-VND balances, greedy min-cash-flow settlement, vi/en strings.
 *
 * Integer math only. No floating point on money paths.
 * No `fetch`, no `localStorage`, no `crypto.subtle` — this file is safe to run
 * inside the mini-app sandbox AND in node tests.
 *
 * Exposed as `SplitBillLogic` global for the single-file browser bundle, and
 * as an ESM export for `node --test`.
 */

const MAX_PARTICIPANTS = 30;
const MAX_NAME_LENGTH = 40;
const MAX_DESC_LENGTH = 120;
const MAX_AMOUNT_VND = 1000000000000; // 1e12 — sanity ceiling, integer only
const STORAGE_KEY = 'splitbill:bill';
const STORAGE_BYTES_MAX = 50 * 1024; // bounded serialized state (eviction-safe)

const EMAIL_RE = /[^@\s]+@[^@\s]+\.[^@\s]+/;
const EMAIL_TOKEN_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_TOKEN_RE = /^(?:\+?84|0)[35789]\d{8}$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Vietnamese-aware fold: strip diacritics, lowercase, collapse separators. */
function foldName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

/** Display fold for substring search (keeps spaces, strips diacritics). */
function foldSearch(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function foldId(name, contactValue) {
  const base = foldName(name) || 'nguoi';
  if (contactValue) return `${base}#${String(contactValue).toLowerCase()}`;
  return base;
}

function uid(prefix) {
  // No crypto dependency: counter + time is enough for local draft ids.
  uid._n = (uid._n || 0) + 1;
  return `${prefix}-${Date.now().toString(36)}-${uid._n.toString(36)}`;
}

function formatVND(amountVnd, locale) {
  const n = Math.trunc(Number(amountVnd) || 0);
  try {
    const tag = locale === 'en' ? 'en-US' : 'vi-VN';
    return `${new Intl.NumberFormat(tag).format(n)}đ`;
  } catch {
    return `${String(n)}đ`;
  }
}

function maskAccount(account) {
  const digits = String(account || '').replace(/\D/g, '');
  if (!digits) return '****';
  const last4 = digits.slice(-4);
  return `****${last4}`;
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

/**
 * Parse one input line: extract the FIRST email or VN phone token, the
 * remainder is the display name (required, ≤40 chars).
 * Returns { name, contact } or { error }.
 */
function parseParticipantLine(line) {
  const raw = String(line == null ? '' : line).trim().replace(/\s+/g, ' ');
  if (!raw) return { error: 'NAME_REQUIRED' };
  const tokens = raw.split(' ');
  let contact = null;
  const nameTokens = [];
  for (const tok of tokens) {
    if (!contact) {
      // Strip only surrounding punctuation — never inner dots (emails).
      const cleaned = tok.replace(/^[,;()[\]]+|[,;()[\]]+$/g, '');
      if (EMAIL_TOKEN_RE.test(cleaned)) {
        contact = { kind: 'email', value: cleaned };
        continue;
      }
      const digits = cleaned.replace(/[\s.-]/g, '');
      if (PHONE_TOKEN_RE.test(digits)) {
        contact = { kind: 'phone', value: digits };
        continue;
      }
      // Loose email search inside a glued token (e.g. "Anminh@x.vn")
      const m = tok.match(EMAIL_RE);
      if (m && EMAIL_TOKEN_RE.test(m[0].replace(/^[,;()[\]]+|[,;()[\]]+$/g, ''))) {
        contact = { kind: 'email', value: m[0].replace(/^[,;()[\]]+|[,;()[\]]+$/g, '') };
        const rest = tok.replace(m[0], '').trim();
        if (rest) nameTokens.push(rest);
        continue;
      }
    }
    nameTokens.push(tok);
  }
  const name = nameTokens.join(' ').trim();
  if (!name) return { error: 'NAME_REQUIRED' };
  if (name.length > MAX_NAME_LENGTH) return { error: 'NAME_TOO_LONG' };
  return { name, contact };
}

function participantFromParsed(parsed) {
  return {
    id: foldId(parsed.name, parsed.contact && parsed.contact.value),
    name: parsed.name,
    contact: parsed.contact,
  };
}

function duplicateParticipantCode(participants, candidate) {
  const list = Array.isArray(participants) ? participants : [];
  const folded = foldName(candidate.name);
  for (const p of list) {
    if (p.id === candidate.id) return 'DUPLICATE_PARTICIPANT';
    if (candidate.contact && p.contact &&
        String(p.contact.value).toLowerCase() === String(candidate.contact.value).toLowerCase()) {
      return 'DUPLICATE_PARTICIPANT';
    }
    if (!candidate.contact && foldName(p.name) === folded) return 'DUPLICATE_PARTICIPANT';
  }
  return null;
}

/** Validate + insert. Returns { participant } or { error }. */
function addParticipant(participants, line) {
  const list = Array.isArray(participants) ? participants : [];
  if (list.length >= MAX_PARTICIPANTS) return { error: 'LIMIT_PARTICIPANTS' };
  const parsed = parseParticipantLine(line);
  if (parsed.error) return { error: parsed.error };
  const participant = participantFromParsed(parsed);
  const duplicate = duplicateParticipantCode(list, participant);
  if (duplicate) return { error: duplicate };
  return { participant };
}

/**
 * Detect and parse manual multi-person input. Lists are separated by comma,
 * semicolon, or line break. Bullet/number prefixes from pasted lists are
 * stripped. Capacity is deliberately NOT applied here: the confirmation UI
 * lets the user choose which candidates occupy the remaining slots.
 */
function parseParticipantListInput(input, existingParticipants) {
  const raw = String(input == null ? '' : input);
  const parts = raw
    .split(/\r?\n|[,;]+/)
    .map((part) => part.replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  const isList = /[\r\n,;]/.test(raw) && parts.length > 1;
  if (!isList) {
    return { isList: false, input: raw.trim(), candidates: [], rejected: [] };
  }

  const candidates = [];
  const rejected = [];
  const seen = Array.isArray(existingParticipants) ? existingParticipants.slice() : [];
  for (const part of parts) {
    const parsed = parseParticipantLine(part);
    if (parsed.error) {
      rejected.push({ input: part, error: parsed.error });
      continue;
    }
    const participant = participantFromParsed(parsed);
    const duplicate = duplicateParticipantCode(seen, participant);
    if (duplicate) {
      rejected.push({ input: part, error: duplicate });
      continue;
    }
    candidates.push({ input: part, participant });
    seen.push(participant);
  }
  return { isList: true, input: raw.trim(), candidates, rejected };
}

/**
 * Find participant names with high confidence directly from an expense line.
 * This powers the expense-first UX: people appear as soon as the composer
 * contains a clear payer ("An trả" / "An paid") or an explicit split clause.
 * Ambiguous free text is intentionally left to ask-back instead of guessing.
 */
function discoverParticipantsFromItemText(text) {
  const raw = String(text == null ? '' : text).trim();
  const names = [];
  let payerName = null;
  const splitNames = [];

  function pushName(value, target) {
    const name = String(value || '')
      .replace(/^[\s,;:|/+-]+|[\s,;:|/+-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    if (!name || /\d/.test(name)) return;
    const folded = foldName(name);
    if (!folded) return;
    if (!names.some((n) => foldName(n) === folded)) names.push(name);
    if (target && !target.some((n) => foldName(n) === folded)) target.push(name);
  }

  // 1–3 name-like words immediately before "trả/paid". Because an amount
  // contains digits, it naturally stops a description such as
  // "Bún bò 120k An trả" from being swallowed into the name.
  const payerRe = /(?:^|[\s,;|])([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,2})\s+(?:trả|tra|paid)(?=\s|$|[,.;:])/iu;
  const pm = raw.match(payerRe);
  if (pm && pm[1]) {
    payerName = pm[1].trim();
    pushName(payerName);
  }

  // Explicit split clauses are deliberately conservative: comma, &, slash,
  // or "và/and" separate people. Existing-participant substring matching in
  // tryParseItemText still handles natural lines without such a clause.
  const sm = raw.match(/(?:chia(?:\s+cho)?|split(?:\s+with)?)\s+(.+)$/iu);
  if (sm && sm[1]) {
    sm[1]
      .replace(/\b(?:đều|deu|equally)\b/giu, '')
      .split(/\s*(?:,|&|\/|\bvà\b|\band\b)\s*/iu)
      .forEach((part) => pushName(part, splitNames));
  }

  return { names, payerName, splitNames, explicitSplit: splitNames.length > 0 };
}

/** Resolve an item's dynamic split rule against the current participant list. */
function resolveItemSharedWith(item, participants) {
  const ids = (participants || []).map((p) => p.id);
  const rule = item && item.splitRule;
  if (rule && rule.type === 'EXPLICIT' && Array.isArray(rule.participantIds)) {
    return rule.participantIds.filter((id) => ids.includes(id));
  }
  if (rule && rule.type === 'ALL') return ids.slice();
  // Backwards compatibility for drafts created before splitRule existed.
  const legacy = (item && item.sharedWith) || [];
  return legacy.filter((id) => ids.includes(id));
}

// ---------------------------------------------------------------------------
// Items (free text + ask-back)
// ---------------------------------------------------------------------------

/**
 * Parse free text: amount (number + optional k/vнд/đ suffix, k=*1000),
 * description (text minus amount), payer (first participant name found),
 * sharedWith (≥2 names found, else all).
 */
function tryParseItemText(text, participants) {
  const raw = String(text == null ? '' : text).trim();
  const ids = (participants || []).map((p) => p.id);
  const empty = { description: null, amountVnd: null, payerId: null, sharedWith: ids.slice(), missing: [] };
  if (!raw) {
    empty.missing = ['description', 'amount'];
    if (!empty.payerId) empty.missing.push('payer');
    return empty;
  }

  // Amount candidates: number with optional unit suffix.
  const re = /(\d[\d.,]*)\s*(k|K|vnd|VND|vnđ|VNĐ|đ|Đ|d|D|dong|đồng)?/g;
  let m;
  let withUnit = null;
  let bare = null;
  while ((m = re.exec(raw)) !== null) {
    const digits = String(m[1]).replace(/[.,\s]/g, '');
    if (!digits || digits.length > 15) continue;
    let value = parseInt(digits, 10);
    if (!Number.isSafeInteger(value) || value <= 0) continue;
    const unit = m[2] || '';
    if (/^k$/i.test(unit)) {
      value = value * 1000;
      if (!Number.isSafeInteger(value) || value > MAX_AMOUNT_VND) continue;
    } else if (unit && value > MAX_AMOUNT_VND) {
      continue;
    } else if (!unit && value > MAX_AMOUNT_VND) {
      continue;
    }
    // Avoid matching a year-like fragment inside a longer digit run: require
    // the match to sit on a token boundary.
    const start = m.index;
    const before = start > 0 ? raw[start - 1] : ' ';
    if (/[0-9]/.test(before)) continue;
    const cand = { value, index: start, length: m[0].length, text: m[0] };
    if (unit) withUnit = cand; // keep last unit-qualified (most specific)
    else if (!bare) bare = cand; // keep first bare number
  }
  const picked = withUnit || bare;

  let description = raw;
  let amountVnd = null;
  if (picked) {
    amountVnd = picked.value;
    description = (raw.slice(0, picked.index) + ' ' + raw.slice(picked.index + picked.length))
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—,.:;]+|[\s\-–—,.:;]+$/g, '')
      .trim();
  }

  // Name mentions (diacritic-insensitive substring).
  const folded = foldSearch(raw);
  const mentioned = [];
  for (const p of participants || []) {
    const needle = foldSearch(p.name).trim();
    if (needle && folded.includes(needle)) mentioned.push(p.id);
  }
  const discovered = discoverParticipantsFromItemText(raw);
  let payerId = mentioned.length > 0 ? mentioned[0] : null;
  if (discovered.payerName) {
    const payerFold = foldName(discovered.payerName);
    const exact = (participants || []).find((p) => foldName(p.name) === payerFold);
    if (exact) payerId = exact.id;
  }

  let splitRule = { type: 'ALL' };
  let sharedWith = ids.slice();
  if (discovered.explicitSplit) {
    const explicitIds = [];
    for (const name of discovered.splitNames) {
      const f = foldName(name);
      const p = (participants || []).find((x) => foldName(x.name) === f);
      if (p && !explicitIds.includes(p.id)) explicitIds.push(p.id);
    }
    if (explicitIds.length > 0) {
      splitRule = { type: 'EXPLICIT', participantIds: explicitIds };
      sharedWith = explicitIds;
    }
  }

  const missing = [];
  if (!description) missing.push('description');
  if (amountVnd == null) missing.push('amount');
  if (!payerId) missing.push('payer');
  if (sharedWith.length === 0) missing.push('sharedWith');
  return { description: description || null, amountVnd, payerId, sharedWith, splitRule, missing };
}

/** Final validation before an item enters the bill. */
function finalizeBillItem(parsed, participants) {
  const ids = new Set((participants || []).map((p) => p.id));
  if (!parsed.description || !parsed.description.trim()) return { error: 'ITEM_DESC_REQUIRED' };
  if (parsed.description.trim().length > MAX_DESC_LENGTH) return { error: 'ITEM_DESC_TOO_LONG' };
  if (!Number.isInteger(parsed.amountVnd) || parsed.amountVnd <= 0 || parsed.amountVnd > MAX_AMOUNT_VND) {
    return { error: 'ITEM_AMOUNT_INVALID' };
  }
  if (!parsed.payerId || !ids.has(parsed.payerId)) return { error: 'ITEM_PAYER_REQUIRED' };
  let splitRule = parsed.splitRule && parsed.splitRule.type === 'EXPLICIT'
    ? {
        type: 'EXPLICIT',
        participantIds: (parsed.splitRule.participantIds || []).filter((id) => ids.has(id)),
      }
    : { type: 'ALL' };
  const shared = splitRule.type === 'ALL'
    ? (participants || []).map((p) => p.id)
    : splitRule.participantIds.slice();
  if (shared.length === 0) return { error: 'ITEM_SHARED_REQUIRED' };
  return {
    item: {
      id: uid('item'),
      description: parsed.description.trim(),
      amountVnd: Math.trunc(parsed.amountVnd),
      payerId: parsed.payerId,
      splitRule,
      // Retain a snapshot for backwards-compatible rendering/serialization.
      // Calculations use splitRule via resolveItemSharedWith.
      sharedWith: shared,
    },
  };
}

// ---------------------------------------------------------------------------
// Banks (embedded seed; refreshable via net.request to vietqr.net)
// ---------------------------------------------------------------------------

/** BIN table seed (NAPAS 6-digit BINs). Refresh via host net.request. */
const BANKS_SEED = [
  { bin: '970436', shortName: 'VCB', name: 'Vietcombank', keywords: ['vcb', 'vietcombank', 'ngoai thuong'] },
  { bin: '970415', shortName: 'VTB', name: 'VietinBank', keywords: ['vtb', 'vietinbank', 'cong thuong'] },
  { bin: '970418', shortName: 'BIDV', name: 'BIDV', keywords: ['bidv', 'dau tu'] },
  { bin: '970405', shortName: 'Agribank', name: 'Agribank', keywords: ['agribank', 'nong nghiep'] },
  { bin: '970407', shortName: 'TCB', name: 'Techcombank', keywords: ['tcb', 'techcombank', 'ky thuong'] },
  { bin: '970422', shortName: 'MB', name: 'MB Bank', keywords: ['mb', 'mbbank', 'quan doi'] },
  { bin: '970416', shortName: 'ACB', name: 'ACB', keywords: ['acb', 'a chau'] },
  { bin: '970432', shortName: 'VPB', name: 'VPBank', keywords: ['vpb', 'vpbank', 'viet nam thinh vuong'] },
  { bin: '970423', shortName: 'TPB', name: 'TPBank', keywords: ['tpb', 'tpbank', 'tien phong'] },
  { bin: '970403', shortName: 'STB', name: 'Sacombank', keywords: ['stb', 'sacombank', 'sai gon thuong tin'] },
  { bin: '970443', shortName: 'SHB', name: 'SHB', keywords: ['shb', 'sai gon ha noi'] },
  { bin: '970437', shortName: 'HDB', name: 'HDBank', keywords: ['hdb', 'hdbank', 'phat trien'] },
  { bin: '970441', shortName: 'VIB', name: 'VIB', keywords: ['vib', 'quoc te'] },
  { bin: '970426', shortName: 'MSB', name: 'MSB', keywords: ['msb', 'hang hai'] },
  { bin: '970448', shortName: 'OCB', name: 'OCB', keywords: ['ocb', 'phuong dong'] },
  { bin: '970431', shortName: 'EIB', name: 'Eximbank', keywords: ['eib', 'eximbank', 'xuat nhap khau'] },
  { bin: '970440', shortName: 'SEAB', name: 'SeABank', keywords: ['seab', 'seabank', 'dong nam a'] },
  { bin: '970449', shortName: 'LPB', name: 'LPBank', keywords: ['lpb', 'lpbank', 'buu dien'] },
];

function findBankByBin(bin, banks) {
  const table = banks || BANKS_SEED;
  const b = String(bin || '').trim();
  return table.find((x) => x.bin === b) || null;
}

function findBankByName(text, banks) {
  const table = banks || BANKS_SEED;
  const f = foldSearch(text);
  if (!f.trim()) return null;
  for (const b of table) {
    if (f.includes(foldSearch(b.shortName)) || f.includes(foldSearch(b.name))) return b;
    for (const k of b.keywords || []) {
      if (k && f.includes(foldSearch(k))) return b;
    }
  }
  return null;
}

/** Tertiary manual path: digits + bank-name hint. */
function extractBankAccountFromText(text, banks) {
  const raw = String(text == null ? '' : text);
  const m = raw.match(/\d{6,19}/);
  if (!m) return { error: 'BANK_ACCOUNT_NOT_FOUND' };
  const bank = findBankByName(raw, banks);
  return { account: m[0], bin: bank ? bank.bin : null, bankName: bank ? bank.name : null };
}

// ---------------------------------------------------------------------------
// VietQR (EMVCo TLV + CRC16/CCITT-FALSE)
// ---------------------------------------------------------------------------

function tlv(id, value) {
  const v = String(value);
  const len = String(v.length).padStart(2, '0');
  return `${id}${len}${v}`;
}

/** Parse `ID(2) LEN(2) VALUE(LEN)` chain. Returns { fields } or { error }. */
function parseTLV(s) {
  const str = String(s == null ? '' : s);
  const fields = [];
  let i = 0;
  while (i < str.length) {
    if (i + 4 > str.length) return { error: 'MALFORMED' };
    const id = str.slice(i, i + 2);
    const lenRaw = str.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenRaw)) return { error: 'MALFORMED' };
    const len = parseInt(lenRaw, 10);
    const value = str.slice(i + 4, i + 4 + len);
    if (value.length !== len) return { error: 'MALFORMED' };
    fields.push({ id, value });
    i += 4 + len;
  }
  return { fields };
}

function field(fields, id) {
  return (fields || []).find((f) => f.id === id) || null;
}

function crc16CcittFalse(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * Parse a VietQR EMVCo string `000201...6304XXXX`.
 * Verifies CRC16/CCITT-FALSE, extracts `38→01→00` BIN + `01` account (6-19
 * digits). Returns { bin, account, amountVnd } or { error }.
 */
function parseVietQR(payload, banks) {
  const raw = String(payload == null ? '' : payload).trim();
  if (!/^000201/.test(raw)) return { error: 'VIETQR_MALFORMED' };
  if (raw.length < 12 || raw.slice(-8, -4).toUpperCase() !== '6304') return { error: 'VIETQR_MALFORMED' };
  const body = raw.slice(0, -4);
  const crcGiven = raw.slice(-4).toUpperCase();
  if (!/^[0-9A-Fa-f]{4}$/.test(crcGiven)) return { error: 'VIETQR_MALFORMED' };
  const calc = crc16CcittFalse(body).toString(16).toUpperCase().padStart(4, '0');
  if (calc !== crcGiven) return { error: 'VIETQR_CRC_FAIL' };

  const topBody = parseTLV(body.slice(0, -4)); // strip trailing "6304" CRC header
  if (topBody.error) return { error: 'VIETQR_MALFORMED' };
  const f38 = field(topBody.fields, '38');
  if (!f38) return { error: 'VIETQR_MISSING_ACCOUNT' };
  const l1 = parseTLV(f38.value);
  if (l1.error) return { error: 'VIETQR_MALFORMED' };
  const guid = field(l1.fields, '00');
  if (!guid || guid.value !== 'A000000727') return { error: 'VIETQR_MALFORMED' };
  const f01 = field(l1.fields, '01');
  if (!f01) return { error: 'VIETQR_MISSING_ACCOUNT' };
  const l2 = parseTLV(f01.value);
  if (l2.error) return { error: 'VIETQR_MALFORMED' };
  const fBin = field(l2.fields, '00');
  const fAcct = field(l2.fields, '01');
  if (!fBin || !fAcct) return { error: 'VIETQR_MISSING_ACCOUNT' };
  const bin = fBin.value.trim();
  const account = fAcct.value.trim();
  if (!/^\d{6}$/.test(bin) && !/^\d{6,8}$/.test(bin)) return { error: 'VIETQR_MALFORMED' };
  if (!/^\d{6,19}$/.test(account)) return { error: 'VIETQR_MISSING_ACCOUNT' };
  const bank = findBankByBin(bin, banks);
  if (!bank) return { error: 'VIETQR_UNKNOWN_BANK', bin, account };

  const f54 = field(topBody.fields, '54');
  let amountVnd = null;
  if (f54 && /^\d{1,13}$/.test(f54.value)) {
    const n = parseInt(f54.value, 10);
    if (Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT_VND) amountVnd = n;
  }
  return { bin, account, bankName: bank.name, amountVnd };
}

/**
 * Build a VietQR payload for one transfer (38:A000000727 template + CRC).
 * Deterministic for idempotency: same inputs → same payload.
 */
function buildVietQRForTransfer(input) {
  const { recipientBin, recipientAccount, amountVnd, billId, debtorLabel } = input || {};
  if (!recipientBin || !/^\d{6,8}$/.test(String(recipientBin))) return { error: 'VIETQR_MISSING_ACCOUNT' };
  if (!recipientAccount || !/^\d{6,19}$/.test(String(recipientAccount))) return { error: 'VIETQR_MISSING_ACCOUNT' };
  if (!Number.isInteger(amountVnd) || amountVnd <= 0 || amountVnd > MAX_AMOUNT_VND) {
    return { error: 'ITEM_AMOUNT_INVALID' };
  }
  const acctInfo = tlv('00', String(recipientBin)) + tlv('01', String(recipientAccount));
  const f38 = tlv('00', 'A000000727') + tlv('01', acctInfo);
  const label = String(debtorLabel || 'SPLITBILL').slice(0, 25) || 'SPLITBILL';
  const ref = String(billId || 'bill').slice(0, 20) || 'bill';
  let p = '';
  p += tlv('00', '01');
  p += tlv('01', '12');
  p += tlv('38', f38);
  p += tlv('52', '0000');
  p += tlv('53', '704');
  p += tlv('54', String(amountVnd));
  p += tlv('58', 'VN');
  p += tlv('59', label);
  p += tlv('60', 'HN');
  p += tlv('62', tlv('08', ref));
  p += '6304';
  const crc = crc16CcittFalse(p).toString(16).toUpperCase().padStart(4, '0');
  return { payload: p + crc };
}

// ---------------------------------------------------------------------------
// Balances + settlement (integer VND, min-cash-flow greedy)
// ---------------------------------------------------------------------------

function computeBalances(items, participants) {
  const ids = (participants || []).map((p) => p.id);
  const paid = {};
  const owed = {};
  for (const id of ids) {
    paid[id] = 0;
    owed[id] = 0;
  }
  for (const it of items || []) {
    if (!ids.includes(it.payerId)) continue;
    const shared = resolveItemSharedWith(it, participants || []);
    if (shared.length === 0) continue;
    const amount = Math.trunc(it.amountVnd);
    if (!Number.isInteger(amount) || amount <= 0) continue;
    const n = shared.length;
    const share = Math.floor(amount / n);
    const remainder = amount - share * n; // to last participant
    shared.forEach((pid, idx) => {
      owed[pid] += share + (idx === n - 1 ? remainder : 0);
    });
    paid[it.payerId] += amount;
  }
  const net = {};
  for (const id of ids) net[id] = (paid[id] || 0) - (owed[id] || 0);
  return { paid, owed, net };
}

/**
 * Greedy min-cash-flow: match largest creditor vs largest debtor.
 * Transfer id is deterministic (`billId:from->to:amount:index`) so a
 * double-tap recompute yields identical ids (idempotent).
 */
function settleBill(input) {
  const { items, participants, accounts, billId } = input || {};
  const { net } = computeBalances(items || [], participants || []);
  const creditors = [];
  const debtors = [];
  for (const p of participants || []) {
    const v = Math.trunc(net[p.id] || 0);
    if (v > 0) creditors.push({ id: p.id, amount: v });
    else if (v < 0) debtors.push({ id: p.id, amount: -v });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  const transfers = [];
  let ci = 0;
  let di = 0;
  let seq = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amt = Math.min(c.amount, d.amount);
    if (amt <= 0) break;
    seq += 1;
    const acct = (accounts || {})[c.id];
    let payload = '';
    if (acct && acct.bin && acct.account) {
      const built = buildVietQRForTransfer({
        recipientBin: acct.bin,
        recipientAccount: acct.account,
        amountVnd: amt,
        billId: billId || 'bill',
        debtorLabel: (participants || []).find((p) => p.id === d.id)?.name || d.id,
      });
      if (built.payload) payload = built.payload;
    }
    transfers.push({
      id: `${billId || 'bill'}:${d.id}->${c.id}:${amt}:${seq}`,
      fromId: d.id,
      toId: c.id,
      amountVnd: amt,
      vietqrPayload: payload,
    });
    c.amount -= amt;
    d.amount -= amt;
    if (c.amount === 0) ci += 1;
    if (d.amount === 0) di += 1;
  }
  return transfers;
}

// ---------------------------------------------------------------------------
// Bill serialization (bounded, eviction-safe) + i18n
// ---------------------------------------------------------------------------

function serializeBill(bill) {
  try {
    const json = JSON.stringify(bill == null ? null : bill);
    if (json.length > STORAGE_BYTES_MAX) return { error: 'BILL_TOO_LARGE' };
    return { json };
  } catch {
    return { error: 'BILL_SERIALIZE_FAIL' };
  }
}

function deserializeBill(json) {
  if (json == null) return { bill: null };
  try {
    const bill = JSON.parse(String(json));
    if (bill !== null && typeof bill !== 'object') return { error: 'BILL_CORRUPT' };
    return { bill };
  } catch {
    return { error: 'BILL_CORRUPT' };
  }
}

const STRINGS = {
  vi: {
    appName: 'Chia tiền',
    steps: ['Chi phí', 'Chốt sổ'],
    participantPlaceholder: 'VD: An, Bình hoặc mỗi người một dòng',
    participantAdd: 'Thêm người',
    itemPlaceholder: 'VD: Bún bò 120k An trả',
    itemAdd: 'Thêm món',
    askBackTitle: 'Bổ sung thông tin món',
    askBackDesc: 'Thiếu một vài chi tiết — giữ nguyên chữ bạn đã gõ.',
    fieldDesc: 'Món gì',
    fieldAmount: 'Số tiền (VND)',
    fieldPayer: 'Ai trả',
    fieldShared: 'Chia cho ai',
    confirm: 'Xác nhận',
    cancel: 'Hủy',
    scanCta: 'Quét VietQR',
    pasteLabel: 'Dán mã VietQR (EMVCo)',
    manualLabel: 'Nhập số tài khoản + ngân hàng',
    settleTitle: 'Chốt sổ',
    noTransfers: 'Không cần chuyển khoản — đã cân bằng.',
    retry: 'Thử lại',
    offline: 'Đang offline — vẫn dùng được, chỉ không làm mới danh sách ngân hàng.',
    billCreated: 'Đã tạo bill',
  },
  en: {
    appName: 'Split Bill',
    steps: ['Expenses', 'Settle'],
    participantPlaceholder: 'E.g. An, Binh or one person per line',
    participantAdd: 'Add person',
    itemPlaceholder: 'E.g. Pho 120k An paid',
    itemAdd: 'Add item',
    askBackTitle: 'Complete item details',
    askBackDesc: 'A few details are missing — your text is kept.',
    fieldDesc: 'Description',
    fieldAmount: 'Amount (VND)',
    fieldPayer: 'Paid by',
    fieldShared: 'Shared with',
    confirm: 'Confirm',
    cancel: 'Cancel',
    scanCta: 'Scan VietQR',
    pasteLabel: 'Paste VietQR code (EMVCo)',
    manualLabel: 'Enter account + bank',
    settleTitle: 'Settle up',
    noTransfers: 'No transfers needed — all balanced.',
    retry: 'Retry',
    offline: 'Offline — fully usable except bank-list refresh.',
    billCreated: 'Bill created',
  },
};

function stringsFor(locale) {
  return STRINGS[locale === 'en' ? 'en' : 'vi'];
}

/** Strict single-email check shared by participant parsing and login. */
function isValidEmail(value) {
  return EMAIL_TOKEN_RE.test(String(value == null ? '' : value).trim());
}

const api = {
  MAX_PARTICIPANTS,
  MAX_NAME_LENGTH,
  STORAGE_KEY,
  STORAGE_BYTES_MAX,
  BANKS_SEED,
  foldName,
  foldSearch,
  foldId,
  formatVND,
  maskAccount,
  isValidEmail,
  parseParticipantLine,
  addParticipant,
  parseParticipantListInput,
  discoverParticipantsFromItemText,
  resolveItemSharedWith,
  tryParseItemText,
  finalizeBillItem,
  findBankByBin,
  findBankByName,
  extractBankAccountFromText,
  tlv,
  parseTLV,
  crc16CcittFalse,
  parseVietQR,
  buildVietQRForTransfer,
  computeBalances,
  settleBill,
  serializeBill,
  deserializeBill,
  stringsFor,
  STRINGS,
};

// Browser global for the single-file bundle (no modules on custom scheme).
if (typeof window !== 'undefined') {
  window.SplitBillLogic = api;
}

// ESM export for node tests.


})();
/*
 * Split Bill adapters for the shared-platform contracts.
 *
 * The shared-platform packages are intentionally not runtime dependencies:
 * they are still workspace-local, while this app builds and deploys alone.
 * Keep these small adapters aligned with the connectivity, scanner, KV and
 * HTTP contracts so the app can move to package imports once they are
 * published or pinned as a deployable dependency.
 */
(function (root) {
  'use strict';

  var NETWORK_STATES = { online: true, offline: true, degraded: true, unknown: true };

  function createBrowserNetworkSource(environment) {
    var target = environment.window || environment;
    return {
      getState: function () {
        var online = environment.navigator && environment.navigator.onLine;
        return Promise.resolve(typeof online === 'boolean' ? (online ? 'online' : 'offline') : 'unknown');
      },
      subscribe: function (listener) {
        var online = function () { listener('online'); };
        var offline = function () { listener('offline'); };
        if (!target.addEventListener) return function () {};
        target.addEventListener('online', online);
        target.addEventListener('offline', offline);
        return function () {
          target.removeEventListener && target.removeEventListener('online', online);
          target.removeEventListener && target.removeEventListener('offline', offline);
        };
      },
    };
  }

  function combineNetworkStates(states) {
    var known = states.filter(function (state) { return NETWORK_STATES[state]; });
    if (!known.length || known.every(function (state) { return state === 'unknown'; })) return 'unknown';
    if (known.indexOf('offline') !== -1) return 'offline';
    if (known.indexOf('degraded') !== -1) return 'degraded';
    return 'online';
  }

  function createConnectivityMonitor(sources, environment) {
    var states = sources.map(function () { return 'unknown'; });
    var listeners = [];
    var unsubscribers = [];
    var snapshot = Object.freeze({ state: 'unknown', observedAt: Date.now() });
    var timer;
    var schedule = function () {
      (environment.clearTimeout || clearTimeout)(timer);
      timer = (environment.setTimeout || setTimeout)(publish, 100);
    };
    var publish = function () {
      var state = combineNetworkStates(states);
      var changed = state !== snapshot.state;
      snapshot = Object.freeze({ state: state, observedAt: Date.now() });
      if (changed) listeners.slice().forEach(function (listener) { listener(snapshot); });
    };
    sources.forEach(function (source, index) {
      Promise.resolve().then(function () { return source.getState(); }).then(function (state) {
        states[index] = NETWORK_STATES[state] ? state : 'unknown';
        schedule();
      }, schedule);
      if (source.subscribe) {
        unsubscribers[index] = source.subscribe(function (state) {
          states[index] = NETWORK_STATES[state] ? state : 'unknown';
          schedule();
        });
      }
    });
    return {
      getState: function () { return Promise.resolve(snapshot.state); },
      getSnapshot: function () { return snapshot; },
      subscribe: function (listener) {
        listeners.push(listener);
        return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
      },
      dispose: function () {
        (environment.clearTimeout || clearTimeout)(timer);
        unsubscribers.forEach(function (unsubscribe) { if (unsubscribe) unsubscribe(); });
        listeners = [];
      },
    };
  }

  function normalizeKVRead(response) {
    if (!response || response.ok === false) {
      return { ok: false, value: null, error: response && response.error ? response.error : 'UNAVAILABLE' };
    }
    if (Object.prototype.hasOwnProperty.call(response, 'value')) {
      return { ok: true, value: response.value == null ? null : response.value, error: null };
    }
    var data = response.data;
    var value = data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'value')
      ? data.value
      : data;
    return { ok: true, value: value == null ? null : value, error: null };
  }

  function normalizeScanResult(response) {
    if (!response || response.ok === false) {
      var code = String((response && response.error) || 'FAILED').toUpperCase();
      if (/CANCEL|ABORT/.test(code)) return { ok: false, cancelled: true, error: 'cancelled' };
      if (/DENIED|PERMISSION/.test(code)) return { ok: false, cancelled: false, error: 'permission-denied' };
      if (/UNAVAILABLE/.test(code)) return { ok: false, cancelled: false, error: 'unavailable' };
      if (/TIMEOUT/.test(code)) return { ok: false, cancelled: false, error: 'timeout' };
      return { ok: false, cancelled: false, error: 'failed' };
    }
    var data = response.data || response;
    var value = data.value || data.decoded || data.text || data.rawValue || '';
    if (!value) return { ok: false, cancelled: false, error: 'invalid-result' };
    var format = data.format === 'qr' || data.format === 'qr_code' ? 'qr' : 'unknown';
    return { ok: true, value: String(value), format: format };
  }

  function normalizeHttpResponse(response) {
    if (!response || response.ok === false) {
      return { ok: false, body: null, status: null, error: (response && response.error) || 'NETWORK_ERROR' };
    }
    var data = response.data !== undefined ? response.data : response;
    var body = data && typeof data === 'object' && data.body !== undefined
      ? data.body
      : data && typeof data === 'object' && data.bodyHandle !== undefined
        ? data.bodyHandle
        : data;
    var status = data && Number.isInteger(data.status) ? data.status : null;
    if (status !== null && (status < 200 || status >= 300)) {
      return { ok: false, body: body, status: status, error: status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR' };
    }
    return { ok: true, body: body, status: status, error: null };
  }

  root.SplitBillPlatform = Object.freeze({
    createBrowserNetworkSource: createBrowserNetworkSource,
    createConnectivityMonitor: createConnectivityMonitor,
    normalizeKVRead: normalizeKVRead,
    normalizeScanResult: normalizeScanResult,
    normalizeHttpResponse: normalizeHttpResponse,
  });
})(typeof window !== 'undefined' ? window : globalThis);

;
/**
 * Split Bill — shared shell (UI + capability adapters), dual-target.
 *
 * MINI-APP mode (host WebView, bundle.js = logic + this file):
 * - No `fetch` to foreign origins, no localStorage/cookies/IndexedDB, no
 *   crypto.subtle/ServiceWorker/WebAuthn, no iframe/new-window/foreign
 *   navigation, no eval/remote script. Persistence only via `storage.kv`
 *   scoped (tenant,user,appId). Network only via `net.request` to the exact
 *   manifest host `vietqr.net`. Scanner only via `scanner.scan` host UI.
 * - Feature-detect via the frozen handshake (`caps.storage_kv?.ops`), never
 *   version-sniff. Every bridge error branches the closed enum.
 *
 * WEBSITE mode (standalone browser, bundle.web.js = logic + web.js + this
 * file): the same UI talks to the optional `window.SplitBillWeb` hook
 * (localStorage draft, direct bank-list fetch, QR-image decode) with the same
 * memory/seed fallbacks. This file NEVER touches a web-only API directly —
 * that keeps the mini-app bundle statically clean (see check-constraints).
 *
 * Depends on `window.SplitBillLogic` (src/logic.js, inlined by build.mjs).
 */

(function () {
  'use strict';

  var L = (typeof window !== 'undefined' && window.SplitBillLogic) || null;
  var Platform = (typeof window !== 'undefined' && window.SplitBillPlatform) || null;
  if (!L) {
    document.addEventListener('DOMContentLoaded', function () {
      var root = document.getElementById('app');
      if (root) root.textContent = 'Missing SplitBillLogic — bundle not built. Run build.mjs.';
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Frozen handshake + bridge (feature-detect, never version-sniff)
  // ---------------------------------------------------------------------------

  function readCaps() {
    try {
      var c = window.__MINIAPP_CAPS__ || window.__miniapp_caps__ || null;
      return c && typeof c === 'object' ? c : {};
    } catch (e) {
      return {};
    }
  }

  function capOps(caps, snake, dotted) {
    var entry = (caps && (caps[snake] || caps[dotted])) || null;
    if (!entry) return [];
    if (Array.isArray(entry.ops)) return entry.ops;
    if (Array.isArray(entry.operations)) return entry.operations;
    return [];
  }

  function hasOp(caps, snake, dotted, op) {
    return capOps(caps, snake, dotted).indexOf(op) !== -1;
  }

  function bridgeRequestFn() {
    try {
      if (window.MiniAppBridge && typeof window.MiniAppBridge.request === 'function') {
        return window.MiniAppBridge.request.bind(window.MiniAppBridge);
      }
      if (window.__MINIAPP_BRIDGE__ && typeof window.__MINIAPP_BRIDGE__.request === 'function') {
        return window.__MINIAPP_BRIDGE__.request.bind(window.__MINIAPP_BRIDGE__);
      }
    } catch (e) { /* fall through to null */ }
    return null;
  }

  var caps = readCaps();
  var bridgeRequest = bridgeRequestFn();

  var canStorageGet = bridgeRequest && (hasOp(caps, 'storage_kv', 'storage.kv', 'get') || hasOp(caps, 'storage_kv', 'storage.kv', 'read') || Object.keys(caps).length === 0);
  var canStorageSet = bridgeRequest && (hasOp(caps, 'storage_kv', 'storage.kv', 'set') || hasOp(caps, 'storage_kv', 'storage.kv', 'write') || Object.keys(caps).length === 0);
  // Empty handshake (Vercel preview / plain browser): allow attempting bridge
  // if present, else cleanly fall back to memory. A real host always injects
  // the frozen handshake before this script runs.
  if (bridgeRequest && Object.keys(caps).length === 0) {
    canStorageGet = true;
    canStorageSet = true;
  }
  var canScan = !!bridgeRequest;
  var canNet = !!bridgeRequest;

  // ---------------------------------------------------------------------------
  // Mode: 'miniapp' (host WebView) vs 'web' (standalone browser)
  // ---------------------------------------------------------------------------
  // Order matters: an explicit host signal always wins; otherwise the open web
  // is the default. `?mode=miniapp|web` overrides for preview/testing.
  function detectMode() {
    try {
      var search = String(window.location && window.location.search ? window.location.search : '');
      if (/[?&]mode=miniapp\b/.test(search)) return 'miniapp';
      if (/[?&]mode=web\b/.test(search)) return 'web';
      if (window.MiniAppBridge || window.__MINIAPP_BRIDGE__) return 'miniapp';
      var c = readCaps();
      if (c && Object.keys(c).length > 0) return 'miniapp';
      var proto = String(window.location && window.location.protocol ? window.location.protocol : '');
      if (proto === 'mini:') return 'miniapp';
      var host = String(window.location && window.location.hostname ? window.location.hostname : '');
      if (/\.miniapp\.platform\.local$/.test(host)) return 'miniapp';
    } catch (e) { /* default below */ }
    return 'web';
  }

  var MODE = detectMode();
  var trackingClients = Object.create(null);

  function getTrackingClient(schemaVersion) {
    if (MODE !== 'web' || state.trackingConsent !== true) return null;
    try {
      var config = window.SplitBillTrackingConfig;
      var factory = window.SplitBillTracking && window.SplitBillTracking.createFreeDpTrackingClient;
      if (!config || typeof config.baseUrl !== 'string' || !config.baseUrl.trim() || typeof factory !== 'function') return null;
      var key = String(schemaVersion);
      if (!trackingClients[key]) {
        trackingClients[key] = factory({
          baseUrl: config.baseUrl,
          source: 'split-bill-web',
          schemaVersion: schemaVersion,
          onError: function () { /* Tracking delivery never changes the bill flow. */ },
        });
      }
      return trackingClients[key];
    } catch (e) {
      return null;
    }
  }

  try {
    window.addEventListener('pagehide', function () {
      Object.keys(trackingClients).forEach(function (key) {
        trackingClients[key].flush().catch(function () {});
      });
    });
  } catch (e) {}

  var connectivity = Platform
    ? Platform.createConnectivityMonitor([Platform.createBrowserNetworkSource(window)], window)
    : null;
  // Website-only hook (src/web.js). Absent in the mini-app bundle by
  // construction — never polyfilled here, so the mini-app bundle stays
  // statically free of web-only APIs.
  function webHook() {
    try {
      if (MODE === 'web' && window.SplitBillWeb && typeof window.SplitBillWeb === 'object') {
        return window.SplitBillWeb;
      }
    } catch (e) {}
    return null;
  }

  function reqId() {
    reqId._n = (reqId._n || 0) + 1;
    return 'sb-' + Date.now().toString(36) + '-' + reqId._n.toString(36);
  }

  /** Single bridge doorway: {id,capability,operation,version,args}, no appId. */
  function callBridge(capability, operation, args) {
    if (!bridgeRequest) {
      return Promise.resolve({ ok: false, data: null, error: 'UNAVAILABLE', message: 'No host bridge — using offline fallback.' });
    }
    var payload = { id: reqId(), capability: capability, operation: operation, version: 1, args: args || {} };
    var p;
    try {
      p = bridgeRequest(payload);
    } catch (e) {
      return Promise.resolve({ ok: false, data: null, error: 'INTERNAL', message: 'Bridge call failed.' });
    }
    return Promise.resolve(p).then(function (res) {
      if (res && typeof res === 'object' && ('ok' in res)) return res;
      // Lenient shape: bare data means success.
      return { ok: true, data: res, error: null };
    }, function (err) {
      var code = (err && err.error) || 'INTERNAL';
      return { ok: false, data: null, error: code, message: (err && err.message) || 'Bridge error.', retryAfterMs: err && err.retryAfterMs };
    });
  }

  // ---------------------------------------------------------------------------
  // Storage (storage.kv key=splitbill:bill, bounded, memory fallback)
  // ---------------------------------------------------------------------------

  var memoryStore = {};
  var storageMode = 'memory'; // 'bridge' | 'local' | 'memory'
  var storageError = null;

  function memorySnapshot() {
    return memoryStore[L.STORAGE_KEY] != null ? memoryStore[L.STORAGE_KEY] : null;
  }

  function storageGet() {
    // Website tier: localStorage via the optional hook (never touched directly
    // here, so the mini-app bundle has no web-storage reference at all).
    var hook = webHook();
    if (hook && hook.storage) {
      var webRead = Platform ? Platform.normalizeKVRead({ ok: true, value: hook.storage.get() }) : { value: hook.storage.get() };
      var webVal = webRead.value;
      if (webVal != null) memoryStore[L.STORAGE_KEY] = webVal;
      storageMode = webVal != null ? 'local' : 'memory';
      storageError = null;
      return Promise.resolve({ value: webVal, mode: storageMode });
    }
    if (!canStorageGet) return Promise.resolve({ value: memorySnapshot(), mode: 'memory' });
    return callBridge('storage.kv', 'kv', { op: 'get', key: L.STORAGE_KEY }).then(function (res) {
      if (res.ok) {
        storageMode = 'bridge';
        storageError = null;
        var normalized = Platform ? Platform.normalizeKVRead(res) : { value: res.data && (res.data.value !== undefined ? res.data.value : res.data) };
        return { value: normalized.value != null ? String(normalized.value) : null, mode: 'bridge' };
      }
      storageMode = 'memory';
      storageError = res.error || 'INTERNAL';
      return { value: memorySnapshot(), mode: 'memory', error: res.error };
    });
  }

  var saveTimer = null;
  var pendingSave = null;

  function storageSetNow(json) {
    memoryStore[L.STORAGE_KEY] = json; // always keep memory copy (eviction-safe)
    var hook = webHook();
    if (hook && hook.storage) {
      storageMode = hook.storage.set(json); // 'local' | 'memory'
      storageError = null;
      renderPersistBadge();
      return Promise.resolve({ mode: storageMode });
    }
    if (!canStorageSet) {
      storageMode = 'memory';
      renderPersistBadge();
      return Promise.resolve({ mode: 'memory' });
    }
    return callBridge('storage.kv', 'kv', { op: 'set', key: L.STORAGE_KEY, value: json }).then(function (res) {
      if (res.ok) {
        storageMode = 'bridge';
        storageError = null;
      } else {
        storageMode = 'memory';
        storageError = res.error || 'INTERNAL';
        if (res.error === 'RATE_LIMITED') scheduleSave(json, res.retryAfterMs || 2000);
      }
      renderPersistBadge();
      return { mode: storageMode, error: storageError };
    });
  }

  /** Coalesced save: no per-frame bridge, one write per quiet period. */
  function scheduleSave(json, delayMs) {
    pendingSave = json;
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      var payload = pendingSave;
      pendingSave = null;
      storageSetNow(payload);
    }, Math.max(400, delayMs || 600));
  }

  function persistBill() {
    var s = L.serializeBill(state.bill);
    if (s.error) {
      setStatus('error', s.error === 'BILL_TOO_LARGE' ? t('billTooLarge') : t('saveFailed'));
      return;
    }
    scheduleSave(s.json);
    renderPersistBadge();
  }

  // ---------------------------------------------------------------------------
  // Tracking (declared events only, allowlisted keys, no raw PII)
  // ---------------------------------------------------------------------------

  var TRACK_ALLOW = {
    bill_created: ['participant_count'],
    bill_item_added: ['input_mode', 'has_ask_back'],
    bill_settled: ['participant_count', 'item_count', 'transfer_count'],
    vietqr_parsed: ['has_amount', 'bank_bin'],
  };
  var TRACK_VERSION = {
    bill_created: 2,
    bill_item_added: 1,
    bill_settled: 1,
    vietqr_parsed: 1,
  };

  function trackEvent(name, data) {
    var allowed = TRACK_ALLOW[name];
    if (!allowed) return;
    var clean = {};
    for (var i = 0; i < allowed.length; i++) {
      var k = allowed[i];
      if (data && data[k] !== undefined) clean[k] = data[k];
    }
    try {
      if (MODE === 'web') {
        var tracker = getTrackingClient(TRACK_VERSION[name]);
        if (tracker) tracker.track(name, clean);
        return;
      }
      if (window.MiniAppBridge && typeof window.MiniAppBridge.track === 'function') {
        window.MiniAppBridge.track(name, TRACK_VERSION[name], clean);
      }
    } catch (e) { /* tracking never breaks the journey */ }
  }

  // ---------------------------------------------------------------------------
  // i18n (vi default, en via host-injected setSplitBillLang)
  // ---------------------------------------------------------------------------

  var lang = 'vi';
  var EXTRA_STRINGS = {
    vi: {
      tagline: 'Chia tiền ăn uống — offline, lưu nháp tự động.',
      trackingConsentTitle: 'Cho phép gửi thống kê sử dụng ẩn danh?',
      trackingConsentBody: 'Split Bill gửi các sự kiện nghiệp vụ đã chọn tới dịch vụ FreeDP để cải thiện ứng dụng. Không gửi nội dung bill, thông tin tài khoản hay mã QR.',
      trackingConsentAccept: 'Cho phép',
      trackingConsentReject: 'Không cho phép',
      stepHint: 'Bước',
      peopleTitle: 'Ai tham gia?',
      peopleHint: 'Tối đa 30 người. Mỗi dòng: tên + email hoặc SĐT VN (không bắt buộc).',
      itemsTitle: 'Đã chi gì?',
      itemsHint: 'Gõ tự do: “Bún bò 120k An trả”. Thiếu gì sẽ hỏi lại, không mất chữ.',
      accountsTitle: 'Nhận tiền về đâu?',
      accountsHint: 'Dán mã VietQR là nhanh nhất. Quét hoặc gõ tay đều được.',
      settleHint: 'Chia đều (phần lẻ về người cuối), ghép nợ tối thiểu.',
      filterAll: 'Tất cả',
      totalSpent: 'Tổng chi',
      perPerson: 'người',
      emptyPeople: 'Chưa có ai — thêm người đầu tiên ở trên.',
      emptyItems: 'Chưa có món nào — gõ dòng đầu tiên ở trên.',
      needPeopleFirst: 'Thêm ít nhất 2 người trước khi thêm món.',
      needItemsFirst: 'Thêm ít nhất 1 món trước khi chốt sổ.',
      askBackNote: 'Chữ bạn gõ được giữ nguyên.',
      amountHint: 'VD 120k = 120.000đ',
      scanUnavailable: 'Máy quét của host chưa sẵn sàng — dán mã hoặc gõ tay bên dưới.',
      scanCancelled: 'Đã huỷ quét. Bạn có thể thử lại, dán mã hoặc nhập tay.',
      scanDenied: 'Bạn đã từ chối quét. Dán mã VietQR hoặc gõ tay vẫn được.',
      scanDeniedPermanent: 'Quét đã bị từ chối vĩnh viễn cho mini-app này. Dùng dán mã hoặc gõ tay — không tự mở Cài đặt.',
      osDenied: 'Hệ điều hành đã từ chối. Dùng dán mã hoặc gõ tay.',
      rateLimited: 'Đang bị giới hạn — thử lại sau giây lát.',
      timeout: 'Hết thời gian chờ. Dữ liệu đã nhập được giữ nguyên.',
      uncertain: 'Kết quả chưa xác định (có thể đã xong). Kiểm tra lại thay vì gửi mới.',
      unknown: 'Có lỗi không xác định. Dữ liệu được giữ nguyên.',
      invalidQR: 'Mã VietQR chưa đúng — kiểm tra lại chuỗi EMVCo.',
      crcFail: 'Mã sai checksum (CRC). Có thể copy thiếu ký tự — dán lại mã đầy đủ.',
      unknownBank: 'Không nhận diện được ngân hàng (BIN lạ). Chọn ngân hàng tay bên dưới.',
      missingAcct: 'Chưa thấy số tài khoản trong mã. Dán mã đầy đủ bắt đầu bằng 000201…',
      copied: 'Đã chọn toàn bộ — nhấn Copy để sao chép.',
      draftSavedBridge: 'Nháp đã lưu (host).',
      draftSavedLocal: 'Nháp đã lưu trên trình duyệt này.',
      draftSavedMemory: 'Nháp giữ trong phiên này (host storage chưa sẵn sàng).',
      refreshBanks: 'Làm mới danh sách ngân hàng',
      banksOffline: 'Offline — dùng danh sách có sẵn trong app.',
      banksWebFail: 'Không tải được danh sách mới — dùng danh sách có sẵn.',
      uploadQR: 'Tải ảnh mã QR',
      uploadHint: 'Chọn ảnh chứa mã VietQR, trình duyệt sẽ đọc ngay trên máy.',
      decoding: 'Đang đọc ảnh…',
      decodeNotFound: 'Không thấy mã QR trong ảnh — thử ảnh rõ hơn hoặc dán mã.',
      decodeUnsupported: 'Trình duyệt này không đọc được QR từ ảnh — dán mã bên trên.',
      footerNote: 'Chạy độc lập trên web: nháp lưu trên trình duyệt này, danh sách ngân hàng tải trực tiếp. Trong mobile app, cùng bundle chạy qua host bridge (không storage web, không network trực tiếp).',
      billTitle: 'Tên bill',
      billTitlePh: 'VD: Ăn tối Quận 1',
      login: 'Đăng nhập',
      logout: 'Đăng xuất',
      account: 'Tài khoản',
      myBills: 'Bills của tôi',
      back: 'Quay lại',
      emailLabel: 'Email',
      emailPh: 'ban@example.com',
      continueBtn: 'Tiếp tục',
      passwordLabel: 'Mật khẩu',
      autoPwLabel: 'Tự tạo mật khẩu mạnh cho tôi',
      showPw: 'Hiện',
      hidePw: 'Ẩn',
      createOrLogin: 'Tạo tài khoản / Đăng nhập',
      changeEmail: 'Đổi email',
      codeLabel: 'Mã xác minh 6 số',
      codeHint: 'Vừa gửi đến email của bạn, hiệu lực ngắn hạn. Đây là lớp xác thực thứ hai sau mật khẩu.',
      verifyBtn: 'Xác minh & đăng nhập',
      resendCode: 'Gửi lại mã',
      resendWait: 'Gửi lại sau ít giây…',
      codeSent: 'Đã gửi mã mới.',
      useAnotherEmail: 'Dùng email khác',
      nudgeTitle: 'Lưu bill này để xem lại & chia sẻ?',
      nudgeBody: 'Đăng nhập để bill được lưu theo tài khoản của bạn — mở lại trên thiết bị khác hoặc gửi link cho người cùng chia. Bỏ qua vẫn dùng bình thường.',
      laterBtn: 'Để sau',
      cloudOffNote: 'Chưa bật lưu cloud cho website này (thiếu cấu hình). Bill vẫn dùng tốt, chỉ lưu trên trình duyệt này.',
      cloudSaving: 'Đang lưu cloud…',
      cloudSaved: 'Đã lưu cloud',
      cloudPending: 'Chưa lưu cloud',
      forkBadge: 'Bản chia sẻ — chỉ đọc cloud',
      forkNotice: 'Bạn đang xem bản chia sẻ. Đăng nhập đúng tài khoản chủ bill để lưu thay đổi lên cloud.',
      invalidLink: 'Link không hợp lệ hoặc bill chưa được chia sẻ.',
      openBill: 'Mở',
      shareOn: 'Đang chia sẻ — tắt?',
      shareOff: 'Chia sẻ link',
      copyLink: 'Chép link',
      linkCopied: 'Đã chép link chia sẻ.',
      deleteBill: 'Xóa',
      deleteAsk: 'Chắc chắn xóa?',
      noBills: 'Chưa có bill nào trên cloud — bill hiện tại sẽ tự lưu sau khi bạn đăng nhập.',
      badEmail: 'Email chưa đúng định dạng.',
      weakPw: 'Mật khẩu tối thiểu 8 ký tự.',
      authFailed: 'Không đăng nhập được — kiểm tra lại thông tin.',
      badCredentials: 'Sai email hoặc mật khẩu.',
      emailExistsNote: 'Email đã có tài khoản — đang đăng nhập…',
      codeWrong: 'Mã chưa đúng — kiểm tra lại 6 số trong email.',
      codeExpired: 'Mã đã hết hạn — bấm Gửi lại mã.',
      rateLimitedAuth: 'Gửi quá nhiều — đợi một lát rồi thử lại.',
      networkFail: 'Mất mạng — kiểm tra kết nối rồi thử lại.',
      pushFail: 'Chưa lưu được lên cloud — sẽ thử lại khi có thay đổi mới.',
      deleteFail: 'Chưa xóa được — thử lại.',
      billsFail: 'Chưa tải được danh sách bills.',
      sessionExpired: 'Phiên đã hết hạn — đăng nhập lại.',
      passkeySetupTitle: 'Bật đăng nhập bằng thiết bị',
      passkeySetupHint: 'Nhấn nút bên dưới rồi xác nhận bằng Face ID, vân tay hoặc khóa bảo mật trên thiết bị này. Từ lần sau, đó là lớp thứ hai sau mật khẩu — không cần gõ mã.',
      passkeyTurnOn: 'Bật Face ID / vân tay / khóa',
      passkeyWaiting: 'Đang chờ thiết bị… làm theo yêu cầu hiện trên trình duyệt.',
      passkeyCancelled: 'Bạn đã hủy — bấm lại để thử tiếp.',
      passkeyExists: 'Thiết bị này đã đăng ký passkey — hãy đăng nhập thay vì đăng ký mới.',
      passkeyUnsupported: 'Trình duyệt/thiết bị này chưa hỗ trợ passkey (cần HTTPS và trình duyệt mới).',
      passkeyDisabled: 'Máy chủ chưa bật passkey (beta) — nhờ admin bật Authentication → Passkeys.',
      passkeyFailed: 'Xác minh passkey thất bại — thử lại.',
      passkeyReadonlyNote: 'Đã xác minh email nhưng thiết bị này thiếu passkey — chỉ xem được, chưa lưu cloud. Dùng trình duyệt hỗ trợ passkey để lưu.',
      passkeyTitle: 'Xác minh bằng thiết bị',
      passkeyHint: 'Nhấn nút bên dưới rồi xác nhận bằng Face ID, vân tay hoặc khóa bảo mật.',
      passkeyVerifyBtn: 'Xác minh bằng passkey',
      verifyPasskey: 'Xác minh passkey',
      lostPasskey: 'Mất thiết bị passkey?',
      verifyNeeded: 'Chờ xác minh passkey mới được lưu cloud',
      oldFactorKept: 'Đã đăng nhập bằng thiết bị mới, nhưng chưa gỡ được thiết bị cũ — liên hệ hỗ trợ để thu hồi.',
      voiceNA: 'Nhập bằng giọng nói chưa có trên WebView này (cần host AI) — vui lòng gõ chữ.',
      imageNA: 'Thêm từ ảnh chưa có trên WebView này — vui lòng gõ chữ.',
      inputMode: 'Cách nhập',
      modeText: 'Gõ chữ',
      modeVoice: 'Nói',
      modeImage: 'Ảnh',
      billTooLarge: 'Bill quá lớn để lưu — bớt món hoặc tách bill mới.',
      saveFailed: 'Chưa lưu được nháp — vẫn giữ trên màn hình.',
      duplicateTransferGuard: 'Đang tính — chống nhấn đúp.',
      settleRun: 'Tính chốt sổ',
      qrPlaceholder: 'QR để quét trả',
      payloadLabel: 'Mã VietQR',
      toLabel: 'tới',
      fromLabel: 'từ',
      langLabel: 'Ngôn ngữ',
      close: 'Đóng',
      remove: 'Xóa',
      edit: 'Sửa',
      backToEdit: 'Về sửa bill',
      offlineBadge: 'Offline',
      onlineBadge: 'Online',
      unknownNetworkBadge: 'Chưa rõ mạng',
      degradedNetworkBadge: 'Mạng chập chờn',
      loading: 'Đang tải…',
      participantCount: 'người',
      itemCount: 'món',
    },
    en: {
      tagline: 'Split food bills — offline, auto draft.',
      trackingConsentTitle: 'Allow anonymous usage analytics?',
      trackingConsentBody: 'Split Bill sends selected product events to FreeDP to improve the app. Bill contents, account details, and QR codes are not sent.',
      trackingConsentAccept: 'Allow',
      trackingConsentReject: 'Do not allow',
      stepHint: 'Step',
      peopleTitle: 'Who is in?',
      peopleHint: 'Max 30 people. Each line: name + email or VN phone (optional).',
      itemsTitle: 'What was spent?',
      itemsHint: 'Free text: “Pho 120k An paid”. Missing bits are asked back, text kept.',
      accountsTitle: 'Where to get paid?',
      accountsHint: 'Pasting a VietQR code is fastest. Scan or typing works too.',
      settleHint: 'Even split (remainder to last), minimal transfers.',
      filterAll: 'Everyone',
      totalSpent: 'Total',
      perPerson: 'people',
      emptyPeople: 'Nobody yet — add the first person above.',
      emptyItems: 'No items yet — type the first line above.',
      needPeopleFirst: 'Add at least 2 people before adding items.',
      needItemsFirst: 'Add at least 1 item before settling.',
      askBackNote: 'Your text is kept as-is.',
      amountHint: 'E.g. 120k = 120,000đ',
      scanUnavailable: 'Host scanner is not ready — paste a code or type below.',
      scanCancelled: 'Scan cancelled. Try again, paste a code, or enter details manually.',
      scanDenied: 'Scan declined. Pasting a VietQR code or typing still works.',
      scanDeniedPermanent: 'Scanning is permanently denied for this mini-app. Use paste or typing — Settings is never opened automatically.',
      osDenied: 'Denied by the OS. Use paste or typing.',
      rateLimited: 'Rate limited — retry in a moment.',
      timeout: 'Timed out. Your input is kept.',
      uncertain: 'Uncertain outcome (may have landed). Re-check instead of resending.',
      unknown: 'Unknown error. Your input is kept.',
      invalidQR: 'This VietQR code looks wrong — check the EMVCo string.',
      crcFail: 'Checksum (CRC) mismatch. A character may be missing — paste the full code.',
      unknownBank: 'Bank not recognized (unknown BIN). Pick the bank manually below.',
      missingAcct: 'No account found in the code. Paste the full code starting with 000201…',
      copied: 'All selected — press Copy.',
      draftSavedBridge: 'Draft saved (host).',
      draftSavedLocal: 'Draft saved in this browser.',
      draftSavedMemory: 'Draft kept in this session (host storage unavailable).',
      refreshBanks: 'Refresh bank list',
      banksOffline: 'Offline — using the built-in list.',
      banksWebFail: 'Could not fetch a fresh list — using the built-in one.',
      uploadQR: 'Upload QR image',
      uploadHint: 'Pick a photo containing the VietQR code; this browser reads it on-device.',
      decoding: 'Reading image…',
      decodeNotFound: 'No QR code found in that image — try a clearer photo or paste the code.',
      decodeUnsupported: 'This browser cannot decode QR from images — paste the code above.',
      footerNote: 'Standalone web build: drafts stay in this browser, bank list loads directly. Inside the mobile app the same bundle runs over the host bridge (no web storage, no direct network).',
      billTitle: 'Bill name',
      billTitlePh: 'E.g. District 1 dinner',
      login: 'Sign in',
      logout: 'Sign out',
      account: 'Account',
      myBills: 'My bills',
      back: 'Back',
      emailLabel: 'Email',
      emailPh: 'you@example.com',
      continueBtn: 'Continue',
      passwordLabel: 'Password',
      autoPwLabel: 'Generate a strong password for me',
      showPw: 'Show',
      hidePw: 'Hide',
      createOrLogin: 'Create account / Sign in',
      changeEmail: 'Change email',
      codeLabel: '6-digit verification code',
      codeHint: 'Just sent to your email, short-lived. This is the second factor after your password.',
      verifyBtn: 'Verify & sign in',
      resendCode: 'Resend code',
      resendWait: 'Resend in a few seconds…',
      codeSent: 'A new code was sent.',
      useAnotherEmail: 'Use another email',
      nudgeTitle: 'Save this bill to revisit & share?',
      nudgeBody: 'Signing in saves the bill to your account — reopen it on another device or send the link to your group. Skipping keeps everything working.',
      laterBtn: 'Later',
      cloudOffNote: 'Cloud save is not enabled for this site (missing config). The bill still works, stored in this browser only.',
      cloudSaving: 'Saving to cloud…',
      cloudSaved: 'Saved to cloud',
      cloudPending: 'Not saved to cloud',
      forkBadge: 'Shared copy — cloud read-only',
      forkNotice: 'You are viewing a shared copy. Sign in as the bill owner to push changes.',
      invalidLink: 'Invalid link, or the bill is not shared.',
      openBill: 'Open',
      shareOn: 'Sharing — turn off?',
      shareOff: 'Share link',
      copyLink: 'Copy link',
      linkCopied: 'Share link copied.',
      deleteBill: 'Delete',
      deleteAsk: 'Delete for sure?',
      noBills: 'No cloud bills yet — the current bill auto-saves after you sign in.',
      badEmail: 'That email does not look valid.',
      weakPw: 'Password needs at least 8 characters.',
      authFailed: 'Could not sign in — check your details.',
      badCredentials: 'Wrong email or password.',
      emailExistsNote: 'Email already has an account — signing in…',
      codeWrong: 'Wrong code — check the 6 digits in your email.',
      codeExpired: 'Code expired — press Resend code.',
      rateLimitedAuth: 'Too many attempts — wait a moment and retry.',
      networkFail: 'Offline — check your connection and retry.',
      pushFail: 'Could not save to cloud — will retry on the next change.',
      deleteFail: 'Could not delete — retry.',
      billsFail: 'Could not load the bill list.',
      sessionExpired: 'Session expired — please sign in again.',
      passkeySetupTitle: 'Turn on device sign-in',
      passkeySetupHint: 'Press the button below, then confirm with Face ID, fingerprint, or a security key on this device. From now on that is the second layer after your password — no codes to type.',
      passkeyTurnOn: 'Turn on Face ID / fingerprint / key',
      passkeyWaiting: 'Waiting for your device… follow the browser prompt.',
      passkeyCancelled: 'You cancelled — press again to retry.',
      passkeyExists: 'This device already has a passkey — sign in instead of registering.',
      passkeyUnsupported: 'This browser/device does not support passkeys yet (needs HTTPS and a recent browser).',
      passkeyDisabled: 'The server has not enabled passkeys (beta) — ask an admin to turn on Authentication → Passkeys.',
      passkeyFailed: 'Passkey verification failed — retry.',
      passkeyReadonlyNote: 'Email verified, but this device lacks a passkey — read-only, cloud save off. Use a passkey-capable browser to save.',
      passkeyTitle: 'Verify with your device',
      passkeyHint: 'Press the button below, then confirm with Face ID, fingerprint, or a security key.',
      passkeyVerifyBtn: 'Verify with passkey',
      verifyPasskey: 'Verify passkey',
      lostPasskey: 'Lost your passkey device?',
      verifyNeeded: 'Passkey verification needed before cloud save',
      oldFactorKept: 'Signed in on the new device, but the old factor could not be revoked — contact support to revoke it.',
      voiceNA: 'Voice input is unavailable in this WebView (needs host AI) — please type.',
      imageNA: 'Photo input is unavailable in this WebView — please type.',
      inputMode: 'Input mode',
      modeText: 'Type',
      modeVoice: 'Voice',
      modeImage: 'Photo',
      billTooLarge: 'Bill too large to save — remove items or start a new bill.',
      saveFailed: 'Draft could not be saved — it is still on screen.',
      duplicateTransferGuard: 'Computing — double-tap guarded.',
      settleRun: 'Compute settlement',
      qrPlaceholder: 'QR to scan & pay',
      payloadLabel: 'VietQR code',
      toLabel: 'to',
      fromLabel: 'from',
      langLabel: 'Language',
      close: 'Close',
      remove: 'Remove',
      edit: 'Edit',
      backToEdit: 'Back to edit',
      offlineBadge: 'Offline',
      onlineBadge: 'Online',
      unknownNetworkBadge: 'Network unknown',
      degradedNetworkBadge: 'Network degraded',
      loading: 'Loading…',
      participantCount: 'people',
      itemCount: 'items',
    },
  };

  function t(key) {
    var base = L.stringsFor(lang);
    if (base && base[key] !== undefined) return base[key];
    var pack = EXTRA_STRINGS[lang] || EXTRA_STRINGS.vi;
    if (pack[key] !== undefined) return pack[key];
    return EXTRA_STRINGS.vi[key] !== undefined ? EXTRA_STRINGS.vi[key] : key;
  }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'vi';
    try { document.documentElement.lang = lang; } catch (e) {}
    render();
  }

  // Host-injected language switch (documented contract).
  try {
    window.setSplitBillLang = function (next) { setLang(next); };
  } catch (e) {}

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  function newBillId() {
    return 'bill-' + Date.now().toString(36);
  }

  function selfParticipant() {
    return { id: 'ban', name: 'Bạn', contact: null, isSelf: true };
  }

  function newLocalBill() {
    var now = Date.now();
    return {
      id: newBillId(),
      participants: [selfParticipant()],
      items: [],
      accounts: {},
      allJoinConfirmed: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  function normalizeEditableDraft(bill) {
    var b = bill || newLocalBill();
    b.participants = (b.participants || []).slice(0, L.MAX_PARTICIPANTS);
    b.items = (b.items || []).slice(0, 200);
    b.accounts = b.accounts || {};
    if (typeof b.allJoinConfirmed !== 'boolean') b.allJoinConfirmed = false;
    // Do not silently change the accounting of an old bill that already has
    // items. Only empty/editable drafts are migrated to the new default "Bạn".
    if (b.items.length === 0 && !b.participants.some(function (p) { return p && p.id === 'ban'; })) {
      b.participants.unshift(selfParticipant());
      b.participants = b.participants.slice(0, L.MAX_PARTICIPANTS);
    }
    return b;
  }

  var state = {
    bill: newLocalBill(),
    step: 0, // 0 expense workspace, 1 settlement
    status: { kind: 'loading', text: '' }, // loading|ready|error|offline
    statusDetail: '',
    peopleError: '',
    itemError: '',
    askBack: null, // { text, parsed, inputMode, hasAskBack }
    participantBatch: null, // manual multi-person confirmation sheet
    scanState: {}, // pid -> { kind, message }
    qrState: {}, // pid -> { message, kind }
    filterId: '',
    transfers: [],
    settling: false,
    banks: L.BANKS_SEED.slice(),
    banksSource: 'seed', // seed|net
    banksFlash: '', // transient confirmation surviving the post-refresh render
    inputMode: 'text',
    participantPreview: { activeIds: [], newIds: [] },
    trackingConsent: null,
    bootDone: false,
    // -- cloud account (website only; inert in the mini-app) ----------------
    authView: null, // null|'nudge'|'email'|'password'|'code'|'account'|'bills'
    authFocus: false, // focus first field once per view change
    nudgedBills: {}, // billId -> true (login nudge shown once per bill)
    cloud: {
      session: null, // {access_token, refresh_token, user, aal:'aal1'|'aal2'}
      email: '',
      password: '',
      autoPw: true,
      showPw: false,
      code: '',
      message: '',
      messageKind: '',
      otpSentAt: 0,
      myBills: [],
      pendingDeleteId: null,
      lastPushedHash: null,
      pushing: false,
      cloudMsg: '',
      sharedOn: {}, // billId -> is_shared (survives list refreshes)
      sharedView: null, // {id, mine} when opened from a share link
      shareToken: '',
      sharePin: '',
      shareTargetBillId: '',
      shareLinks: {}, // billId -> raw token, session-only by design
      // Passkey ceremony payload ({factorId, challengeId, type, options}).
      passkey: null,
      pendingSession: null, // aal1 session awaiting its passkey step
      recovery: false, // code view leads to re-enroll (lost authenticator)
      recoveryIds: [], // verified factor ids to revoke after fresh enroll
    },
  };

  if (MODE === 'web') {
    var consentHook = webHook();
    if (consentHook && typeof consentHook.getTrackingConsent === 'function') {
      state.trackingConsent = consentHook.getTrackingConsent();
    }
  }

  function touchBill() {
    state.bill.updatedAt = Date.now();
    persistBill();
    scheduleCloudSave();
  }

  // ---------------------------------------------------------------------------
  // Status + error-enum branching (closed enum, no auto re-prompt)
  // ---------------------------------------------------------------------------

  function branchBridgeError(res, context) {
    var code = (res && res.error) || 'INTERNAL';
    switch (code) {
      case 'CONSENT_DENIED':
        return { kind: 'permission', text: t('scanDenied'), retryable: true, context: context };
      case 'CONSENT_DENIED_PERMANENTLY':
        return { kind: 'permission', text: t('scanDeniedPermanent'), retryable: false, context: context };
      case 'OS_DENIED':
      case 'OS_DENIED_PERMANENTLY':
        return { kind: 'permission', text: t('osDenied'), retryable: false, context: context };
      case 'RATE_LIMITED':
        return { kind: 'rate', text: t('rateLimited'), retryable: true, retryAfterMs: res.retryAfterMs, context: context };
      case 'TIMEOUT':
        return { kind: 'error', text: t('timeout'), retryable: true, terminal: true, context: context };
      case 'UNCERTAIN':
        return { kind: 'unknown', text: t('uncertain'), retryable: true, context: context };
      case 'CAPABILITY_NOT_DECLARED':
      case 'CONSENT_REQUIRED':
        return { kind: 'permission', text: t('scanUnavailable'), retryable: false, context: context };
      case 'UNAVAILABLE':
        return { kind: 'offline', text: t('scanUnavailable'), retryable: false, context: context };
      default:
        return { kind: 'error', text: t('unknown'), retryable: true, context: context };
    }
  }

  function setStatus(kind, text) {
    state.status = { kind: kind, text: text || '' };
    renderStatus();
  }

  // ---------------------------------------------------------------------------
  // Boot: restore bounded draft, hash route, offline probe (no fetch)
  // ---------------------------------------------------------------------------

  function currentHashRoute() {
    try {
      var h = window.location.hash || '#/';
      var path = h.replace(/^#/, '') || '/';
      return path;
    } catch (e) {
      return '/';
    }
  }

  function applyHashRoute() {
    var path = currentHashRoute();
    var mBill = path.match(/^\/bill\/([^/]+)/);
    var mSettle = path.match(/^\/settle\/([^/]+)/);
    if (mSettle) state.step = 1;
    else if (mBill) state.step = 0;
  }

  function boot() {
    applyHashRoute();
    setStatus('loading', t('loading'));
    render();
    storageGet().then(function (got) {
      var parsed = L.deserializeBill(got.value);
      if (parsed.bill && parsed.bill.participants) {
        // Trust-but-bound: accept stored draft, cap sizes.
        var b = normalizeEditableDraft(parsed.bill);
        b.billCreatedTracked = !!b.billCreatedTracked || b.items.length > 0;
        if (b.id) state.bill = b;
      }
      if (got.mode === 'memory') {
        storageMode = 'memory';
      }
      state.bootDone = true;
      setStatus('ready', '');
      render();
    });
    // Connectivity is a UX signal; the result of each request remains authoritative.
    updateOnline();
    if (connectivity) connectivity.subscribe(updateOnline);
    try {
      window.addEventListener('hashchange', function () {
        applyHashRoute();
        maybeLoadSharedLink();
        render();
      });
    } catch (e) {}
    bootCloud();
  }

  function updateOnline() {
    var online = true;
    try { online = window.navigator.onLine !== false; } catch (e) {}
    var networkState = connectivity ? connectivity.getSnapshot().state : (online ? 'online' : 'offline');
    var badge = document.getElementById('net-badge');
    if (badge) {
      badge.textContent = networkState === 'offline' ? t('offlineBadge') : networkState === 'unknown' ? t('unknownNetworkBadge') : networkState === 'degraded' ? t('degradedNetworkBadge') : t('onlineBadge');
      badge.setAttribute('data-online', networkState === 'offline' ? 'false' : 'true');
      badge.setAttribute('data-network-state', networkState);
    }
    var off = document.getElementById('offline-banner');
    if (off) off.hidden = networkState !== 'offline';
  }

  // ---------------------------------------------------------------------------
  // Mutations (all local-first; persist coalesced)
  // ---------------------------------------------------------------------------

  function addPersonFromInput(inputEl) {
    var line = inputEl.value;
    var batch = L.parseParticipantListInput
      ? L.parseParticipantListInput(line, state.bill.participants)
      : { isList: false, input: line, candidates: [], rejected: [] };

    if (batch.isList) {
      if (state.bill.participants.length >= L.MAX_PARTICIPANTS) {
        state.peopleError = personErrorText('LIMIT_PARTICIPANTS');
        render();
        return;
      }
      if (batch.candidates.length === 0) {
        state.peopleError = batch.rejected.length
          ? personErrorText(batch.rejected[0].error)
          : personErrorText('NAME_REQUIRED');
        render();
        return;
      }
      var remaining = Math.max(0, L.MAX_PARTICIPANTS - state.bill.participants.length);
      state.participantBatch = {
        sourceInputId: inputEl.id || '',
        raw: line,
        candidates: batch.candidates.map(function (candidate, idx) {
          return {
            input: candidate.input,
            participant: candidate.participant,
            selected: idx < remaining,
          };
        }),
        rejected: batch.rejected || [],
      };
      state.peopleError = '';
      renderParticipantBatch();
      return;
    }

    var r = L.addParticipant(state.bill.participants, batch.input);
    if (r.error) {
      state.peopleError = personErrorText(r.error);
      render();
      return;
    }
    state.bill.participants.push(r.participant);
    state.peopleError = '';
    inputEl.value = '';
    touchBill();
    render();
    var nextInput = document.getElementById(inputEl.id);
    try { if (nextInput) nextInput.focus(); } catch (e) {}
  }

  function personErrorText(code) {
    switch (code) {
      case 'NAME_REQUIRED': return lang === 'en' ? 'Name is required.' : 'Cần nhập tên.';
      case 'NAME_TOO_LONG': return lang === 'en' ? 'Name is too long (max 40).' : 'Tên quá dài (tối đa 40 ký tự).';
      case 'DUPLICATE_PARTICIPANT': return lang === 'en' ? 'This person is already added.' : 'Người này đã có trong bill.';
      case 'LIMIT_PARTICIPANTS': return lang === 'en' ? 'Max 30 people.' : 'Tối đa 30 người.';
      default: return t('unknown');
    }
  }

  function removeParticipant(id) {
    state.bill.participants = state.bill.participants.filter(function (p) { return p.id !== id; });
    state.bill.items = state.bill.items.filter(function (it) {
      return it.payerId !== id;
    }).map(function (it) {
      if (it.splitRule && it.splitRule.type === 'EXPLICIT') {
        it.splitRule.participantIds = (it.splitRule.participantIds || []).filter(function (pid) { return pid !== id; });
        it.sharedWith = it.splitRule.participantIds.slice();
      } else {
        it.sharedWith = (it.sharedWith || []).filter(function (pid) { return pid !== id; });
      }
      return it;
    }).filter(function (it) {
      return !(it.splitRule && it.splitRule.type === 'EXPLICIT' && it.splitRule.participantIds.length === 0);
    });
    delete state.bill.accounts[id];
    touchBill();
    render();
  }

  function ensureDiscoveredParticipants(text) {
    var found = L.discoverParticipantsFromItemText ? L.discoverParticipantsFromItemText(text) : { names: [] };
    var active = [];
    var added = [];
    (found.names || []).forEach(function (name) {
      var folded = L.foldName(name);
      var existing = state.bill.participants.find(function (p) { return L.foldName(p.name) === folded; });
      if (!existing && state.bill.participants.length < L.MAX_PARTICIPANTS) {
        var r = L.addParticipant(state.bill.participants, name);
        if (!r.error && r.participant) {
          state.bill.participants.push(r.participant);
          existing = r.participant;
          added.push(existing.id);
        }
      }
      if (existing) active.push(existing.id);
    });
    state.participantPreview = { activeIds: active, newIds: added };
    if (added.length > 0) touchBill();
    return found;
  }

  function updateParticipantPreview(text) {
    ensureDiscoveredParticipants(text);
    renderParticipantStrip();
  }

  function clearParticipantPreview() {
    state.participantPreview = { activeIds: [], newIds: [] };
    renderParticipantStrip();
  }

  function submitItemText() {
    var input = document.getElementById('item-input');
    if (!input) return;
    var text = input.value;
    ensureDiscoveredParticipants(text);
    var parsed = L.tryParseItemText(text, state.bill.participants);
    var confirmImplicitAll = parsed.splitRule && parsed.splitRule.type === 'ALL' && !state.bill.allJoinConfirmed;
    if (parsed.missing.length > 0 || confirmImplicitAll) {
      state.askBack = {
        text: text,
        parsed: parsed,
        inputMode: state.inputMode,
        hasAskBack: parsed.missing.length > 0,
        confirmAll: confirmImplicitAll,
        editItemId: null,
      };
      state.itemError = '';
      renderAskBack();
      return;
    }
    var fin = L.finalizeBillItem(parsed, state.bill.participants);
    if (fin.error) {
      state.itemError = fin.error;
      return;
    }
    var createsBill = state.bill.items.length === 0 && !state.bill.billCreatedTracked;
    state.bill.items.push(fin.item);
    if (createsBill) state.bill.billCreatedTracked = true;
    input.value = '';
    state.itemError = '';
    state.participantPreview = { activeIds: [], newIds: [] };
    touchBill();
    if (createsBill) trackEvent('bill_created', { participant_count: state.bill.participants.length });
    trackEvent('bill_item_added', { input_mode: state.inputMode, has_ask_back: false });
    render();
    maybeNudgeLogin();
    try { input.focus(); } catch (e) {}
  }

  function editItem(id) {
    var item = state.bill.items.find(function (it) { return it.id === id; });
    if (!item) return;
    var shared = L.resolveItemSharedWith ? L.resolveItemSharedWith(item, state.bill.participants) : (item.sharedWith || []);
    state.askBack = {
      text: item.description,
      parsed: {
        description: item.description,
        amountVnd: item.amountVnd,
        payerId: item.payerId,
        sharedWith: shared,
        splitRule: item.splitRule || { type: 'EXPLICIT', participantIds: shared.slice() },
        missing: [],
      },
      inputMode: 'edit',
      hasAskBack: false,
      confirmAll: false,
      editItemId: item.id,
    };
    renderAskBack();
  }

  function confirmAskBack() {
    if (!state.askBack) return;
    var descEl = document.getElementById('ask-desc');
    var amtEl = document.getElementById('ask-amount');
    var payerEl = document.getElementById('ask-payer');
    var checked = [];
    try {
      var boxes = document.querySelectorAll('#ask-shared input[type="checkbox"]');
      for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) checked.push(boxes[i].value);
    } catch (e) {}
    var amountRaw = amtEl ? amtEl.value : '';
    var amount = parseAmountInput(amountRaw);
    var parsed = {
      description: descEl ? descEl.value.trim() : state.askBack.parsed.description,
      amountVnd: amount != null ? amount : state.askBack.parsed.amountVnd,
      payerId: payerEl ? payerEl.value : state.askBack.parsed.payerId,
      sharedWith: checked.length > 0 ? checked : state.askBack.parsed.sharedWith,
      splitRule: checked.length > 0 && checked.length < state.bill.participants.length
        ? { type: 'EXPLICIT', participantIds: checked }
        : { type: 'ALL' },
    };
    var fin = L.finalizeBillItem(parsed, state.bill.participants);
    if (fin.error) {
      var errEl = document.getElementById('ask-error');
      if (errEl) errEl.textContent = String(fin.error);
      return;
    }
    var editingId = state.askBack.editItemId;
    var wasImplicitAllConfirmation = !!state.askBack.confirmAll;
    var createsBill = !editingId && state.bill.items.length === 0 && !state.bill.billCreatedTracked;
    if (editingId) {
      var idx = state.bill.items.findIndex(function (it) { return it.id === editingId; });
      if (idx !== -1) {
        fin.item.id = editingId;
        state.bill.items[idx] = fin.item;
      }
    } else {
      state.bill.items.push(fin.item);
    }
    if (wasImplicitAllConfirmation) state.bill.allJoinConfirmed = true;
    if (createsBill) state.bill.billCreatedTracked = true;
    var inp = document.getElementById('item-input');
    if (inp && !editingId) inp.value = '';
    state.askBack = null;
    state.participantPreview = { activeIds: [], newIds: [] };
    touchBill();
    if (createsBill) trackEvent('bill_created', { participant_count: state.bill.participants.length });
    if (!editingId) trackEvent('bill_item_added', { input_mode: state.inputMode, has_ask_back: true });
    render();
    if (!editingId) maybeNudgeLogin();
  }

  function parseAmountInput(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    var m = s.match(/(\d[\d.,]*)\s*(k|K)?/);
    if (!m) return null;
    var digits = m[1].replace(/[.,\s]/g, '');
    if (!digits) return null;
    var v = parseInt(digits, 10);
    if (!Number.isSafeInteger(v) || v <= 0) return null;
    if (m[2]) v = v * 1000;
    if (!Number.isSafeInteger(v) || v <= 0 || v > 1000000000000) return null;
    return v;
  }

  function removeItem(id) {
    state.bill.items = state.bill.items.filter(function (it) { return it.id !== id; });
    touchBill();
    render();
  }

  // -- accounts ------------------------------------------------------------

  function saveAccount(pid, info) {
    state.bill.accounts[pid] = {
      account: info.account,
      bin: info.bin || null,
      bankName: info.bankName || null,
      source: info.source || 'text',
      updatedAt: Date.now(),
    };
    touchBill();
  }

  function handlePasteQR(pid, source) {
    var ta = document.getElementById('qr-' + pid);
    var msgEl = document.getElementById('qr-msg-' + pid);
    if (!ta) return;
    var payload = ta.value.trim();
    if (!payload) return;
    var r = L.parseVietQR(payload, state.banks);
    if (r.error) {
      var text = qrErrorText(r);
      if (msgEl) {
        msgEl.textContent = text;
        msgEl.setAttribute('data-kind', 'error');
      }
      state.qrState[pid] = { kind: 'error', message: text };
      return; // keep input
    }
    saveAccount(pid, { account: r.account, bin: r.bin, bankName: r.bankName, source: source || 'vietqr_paste' });
    if (state._settledOnce) state.transfers = L.settleBill({ items: state.bill.items, participants: state.bill.participants, accounts: state.bill.accounts, billId: state.bill.id });
    trackEvent('vietqr_parsed', { has_amount: r.amountVnd != null, bank_bin: r.bin });
    state.qrState[pid] = { kind: 'ok', message: (lang === 'en' ? 'Saved VietQR · ' : 'Đã lưu VietQR · ') + (r.bankName || r.bin) + ' · ' + L.maskAccount(r.account) };
    render();
  }

  function qrErrorText(r) {
    switch (r.error) {
      case 'VIETQR_CRC_FAIL': return t('crcFail');
      case 'VIETQR_UNKNOWN_BANK': return t('unknownBank');
      case 'VIETQR_MISSING_ACCOUNT': return t('missingAcct');
      default: return t('invalidQR');
    }
  }

  function handleScanQR(pid) {
    var msgEl = document.getElementById('qr-msg-' + pid);
    function show(kind, text) {
      if (msgEl) {
        msgEl.textContent = text;
        msgEl.setAttribute('data-kind', kind);
      }
      state.qrState[pid] = { kind: kind, message: text };
    }
    function acceptValue(value, source) {
      if (!value) {
        show('error', t('invalidQR'));
        return;
      }
      var ta = document.getElementById('qr-' + pid);
      if (ta) ta.value = String(value);
      handlePasteQR(pid, source);
    }

    var hook = webHook();
    if (MODE === 'web' && hook && hook.scanCamera) {
      show('info', lang === 'en' ? 'Requesting camera access…' : 'Đang xin quyền camera…');
      hook.scanCamera({ lang: lang }).then(function (res) {
        if (res && res.value) {
          acceptValue(res.value, 'vietqr_camera');
          return;
        }
        var code = (res && res.error) || 'CAMERA_FAIL';
        if (code === 'SCAN_CANCELLED') {
          show('info', lang === 'en' ? 'Camera closed.' : 'Đã đóng camera.');
        } else if (code === 'CAMERA_DENIED') {
          show('warn', lang === 'en'
            ? 'Camera permission was denied. Upload or paste the VietQR instead.'
            : 'Bạn chưa cấp quyền camera. Có thể tải ảnh hoặc dán VietQR thay thế.');
        } else if (code === 'CAMERA_NOT_FOUND' || code === 'CAMERA_BUSY') {
          show('warn', lang === 'en'
            ? 'Camera is unavailable. Upload or paste the VietQR instead.'
            : 'Camera hiện không khả dụng. Có thể tải ảnh hoặc dán VietQR thay thế.');
        } else if (code === 'DECODE_UNSUPPORTED') {
          show('warn', lang === 'en'
            ? 'This browser cannot decode QR from the camera. Upload a QR image instead.'
            : 'Trình duyệt này chưa hỗ trợ đọc QR trực tiếp từ camera. Hãy tải ảnh QR thay thế.');
        } else {
          show('warn', lang === 'en'
            ? 'Could not scan from the camera. Upload or paste the VietQR instead.'
            : 'Không thể quét bằng camera. Có thể tải ảnh hoặc dán VietQR thay thế.');
        }
      });
      return;
    }

    if (!canScan) {
      show('warn', t('scanUnavailable'));
      return;
    }
    show('info', lang === 'en' ? 'Opening host scanner…' : 'Đang mở máy quét…');
    callBridge('scanner.scan', 'scan', { mode: 'qr', formats: ['qr'], purpose: 'Read a VietQR payment code', timeoutMs: 60000 }).then(function (res) {
      var result = Platform ? Platform.normalizeScanResult(res) : { ok: res.ok, value: res.data && (res.data.value || res.data.decoded || res.data.text) };
      if (result.cancelled) {
        show('warn', t('scanCancelled'));
        return;
      }
      if (result.ok) {
        acceptValue(result.value, 'vietqr_scan');
        return;
      }
      if (result.error === 'invalid-result') {
        show('error', t('invalidQR'));
        return;
      }
      var b = branchBridgeError(res, 'scan');
      show(b.kind === 'permission' ? 'warn' : 'error', b.text);
      // Fallback stays visible (paste + manual). Never re-prompt automatically.
    });
  }

  // Website: decode a user-picked QR photo on-device via the optional hook.
  function handleUploadQR(pid) {
    var hook = webHook();
    var msgEl = document.getElementById('qr-msg-' + pid);
    function show(kind, text) {
      if (msgEl) {
        msgEl.textContent = text;
        msgEl.setAttribute('data-kind', kind);
      }
      state.qrState[pid] = { kind: kind, message: text };
    }
    if (!hook || !hook.decodeImage) {
      show('warn', t('decodeUnsupported'));
      return;
    }
    var fileInput = document.getElementById('qrf-' + pid);
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      show('warn', t('uploadHint'));
      return;
    }
    show('info', t('decoding'));
    hook.decodeImage(file).then(function (res) {
      if (res && res.value) {
        var ta = document.getElementById('qr-' + pid);
        if (ta) ta.value = String(res.value);
        handlePasteQR(pid, 'vietqr_image');
        return;
      }
      var code = (res && res.error) || 'DECODE_FAIL';
      show('warn', code === 'DECODE_NOT_FOUND' ? t('decodeNotFound') : t('decodeUnsupported'));
    });
  }

  function handleManualAccount(pid) {
    var acctEl = document.getElementById('acct-' + pid);
    var bankEl = document.getElementById('bank-' + pid);
    var msgEl = document.getElementById('qr-msg-' + pid);
    if (!acctEl) return;
    var text = acctEl.value + ' ' + (bankEl ? bankEl.value : '');
    var r = L.extractBankAccountFromText(bankEl && bankEl.selectedOptions && bankEl.selectedOptions[0]
      ? acctEl.value + ' ' + bankEl.selectedOptions[0].text
      : text, state.banks);
    if (r.error) {
      var msg = lang === 'en' ? 'Account number not found (6–19 digits).' : 'Chưa thấy số tài khoản (6–19 chữ số).';
      if (msgEl) { msgEl.textContent = msg; msgEl.setAttribute('data-kind', 'error'); }
      return;
    }
    var bin = r.bin;
    var bankName = r.bankName;
    if (bankEl && bankEl.value) {
      var picked = L.findBankByBin(bankEl.value, state.banks);
      if (picked) { bin = picked.bin; bankName = picked.name; }
    }
    saveAccount(pid, { account: r.account, bin: bin, bankName: bankName, source: 'text' });
    if (state._settledOnce) state.transfers = L.settleBill({ items: state.bill.items, participants: state.bill.participants, accounts: state.bill.accounts, billId: state.bill.id });
    render();
  }

  function applyBankList(list, note) {
    if (!Array.isArray(list) || list.length === 0) return false;
    var mapped = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      var entry = mapBankEntry(e);
      if (entry) mapped.push(entry);
    }
    if (mapped.length === 0) return false;
    state.banks = mapped;
    state.banksSource = 'net';
    state.banksFlash = lang === 'en' ? 'Bank list refreshed.' : 'Đã làm mới danh sách ngân hàng.';
    if (note) note.textContent = state.banksFlash;
    render();
    return true;
  }

  function mapBankEntry(e) {
    var bin = String(e.bin || e.code || '').trim();
    var name = String(e.shortName || e.short_name || e.name || '').trim();
    if (/^\d{6,8}$/.test(bin) && name) {
      return { bin: bin, shortName: name.slice(0, 12).toUpperCase(), name: String(e.name || name), keywords: [] };
    }
    return null;
  }

  function refreshBanks(btnId, noteId) {
    if (typeof btnId !== 'string') btnId = 'refresh-banks';
    if (typeof noteId !== 'string') noteId = 'banks-note';
    var btn = document.getElementById(btnId);
    var note = document.getElementById(noteId);
    // Website tier: direct fetch via the optional hook (open web, no allowlist).
    var hook = webHook();
    if (hook && hook.fetchBanks) {
      if (btn) btn.disabled = true;
      hook.fetchBanks().then(function (res) {
        if (btn) btn.disabled = false;
        var normalized = Platform ? Platform.normalizeHttpResponse(res) : { ok: !!(res && res.ok), body: res && res.body };
        if (normalized.ok && applyBankList(normalized.body, note)) return;
        if (note) note.textContent = t('banksWebFail');
      });
      return;
    }
    if (!canNet) {
      if (note) note.textContent = t('banksOffline');
      return;
    }
    if (btn) btn.disabled = true;
    // Exact manifest host only. Path is informational; host enforces allowlist.
    callBridge('net.request', 'request', { url: 'https://vietqr.net/api/banks', method: 'GET' }).then(function (res) {
      if (btn) btn.disabled = false;
      if (!res.ok) {
        if (note) {
          var b = branchBridgeError(res, 'banks');
          note.textContent = b.text + ' ' + t('banksOffline');
        }
        return;
      }
      try {
        var normalized = Platform ? Platform.normalizeHttpResponse(res) : { ok: res.ok, body: res.data && (res.data.body || res.data.bodyHandle || res.data) };
        if (!normalized.ok) {
          if (note) note.textContent = t('banksOffline');
          return;
        }
        var body = normalized.body;
        var parsed = typeof body === 'string' ? JSON.parse(body) : body;
        var list = parsed && (parsed.data || parsed.banks || parsed);
        if (applyBankList(list, note)) return;
      } catch (e) { /* keep seed */ }
      if (note) note.textContent = t('banksOffline');
    });
  }

  // -- settle --------------------------------------------------------------

  function runSettle() {
    if (state.settling) return; // idempotency: no duplicate transfer on double-tap
    state.settling = true;
    render(); // re-render via the step body (single attach point)
    // Compute synchronously (integer math, tiny N) — then publish once.
    var transfers = L.settleBill({
      items: state.bill.items,
      participants: state.bill.participants,
      accounts: state.bill.accounts,
      billId: state.bill.id,
    });
    state.transfers = transfers;
    state.settling = false;
    trackEvent('bill_settled', {
      participant_count: state.bill.participants.length,
      item_count: state.bill.items.length,
      transfer_count: transfers.length,
    });
    try {
      window.location.hash = '#/settle/' + encodeURIComponent(state.bill.id);
    } catch (e) {}
    render();
  }

  // ---------------------------------------------------------------------------
  // Cloud account + per-user bills — WEBSITE ONLY.
  // Inert in the mini-app (MODE check + optional hook + remote config).
  // Login: email → password (auto-generated or typed, password-manager
  // friendly) → time-limited 6-digit email code as the second factor.
  // ---------------------------------------------------------------------------

  function cloudClient() {
    try {
      var h = webHook();
      if (MODE === 'web' && h && h.cloud && h.cloud.configured) return h.cloud;
    } catch (e) {}
    return null;
  }

  function cloudSession() {
    return state.cloud.session && state.cloud.session.access_token ? state.cloud.session : null;
  }

  // Assurance read from the token itself (decode only — the server enforces
  // it), never from a remembered flag. Unknown/undecodable → aal1.
  function sessionAal(session) {
    try {
      var hook = webHook();
      if (hook && hook.cloud && hook.cloud.tokenAal && session && session.access_token) {
        return hook.cloud.tokenAal(session.access_token) || 'aal1';
      }
    } catch (e) {}
    return (session && session.aal) || 'aal1';
  }

  function withAal(session) {
    if (session) session.aal = sessionAal(session);
    return session;
  }

  // Reads (list/open) need any valid session; writes (push/delete/share)
  // need a TOTP-verified one. Remembered aal2 sessions are trusted on boot
  // (remember-me semantics — see README).
  function cloudFullSession() {
    var s = cloudSession();
    return s && s.aal === 'aal2' ? s : null;
  }

  function cloudErrorText(code) {
    switch (code) {
      case 'BAD_CREDENTIALS': return t('badCredentials');
      case 'PASSKEY_DISABLED': return t('passkeyDisabled');
      case 'CODE_WRONG': return t('codeWrong');
      case 'CODE_EXPIRED': return t('codeExpired');
      case 'RATE_LIMITED': return t('rateLimitedAuth');
      case 'NETWORK_FAIL': return t('networkFail');
      case 'TIMEOUT': return t('timeout');
      case 'WEAK_PASSWORD': return t('weakPw');
      case 'PUSH_FAIL': return t('pushFail');
      case 'DELETE_FAIL': return t('deleteFail');
      case 'BILLS_FAIL': return t('billsFail');
      default: return t('authFailed');
    }
  }

  function billHash() {
    var s = L.serializeBill(state.bill);
    if (s.error) return null;
    var h = 5381;
    for (var i = 0; i < s.json.length; i++) h = ((h << 5) + h + s.json.charCodeAt(i)) | 0;
    return String(h);
  }

  function hasBillContent() {
    return state.bill.participants.length > 0 || state.bill.items.length > 0;
  }

  function billTitle() {
    var custom = String(state.bill.title || '').trim().slice(0, 60);
    if (custom) return custom;
    try {
      return 'Bill ' + new Date(state.bill.createdAt || Date.now()).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN');
    } catch (e) {
      return 'Bill';
    }
  }

  // -- cloud push (debounced, dirty-checked, never overwrites a fork) --------

  var cloudTimer = null;

  function scheduleCloudSave() {
    if (!cloudFullSession()) return;
    if (cloudTimer) return;
    cloudTimer = setTimeout(function () {
      cloudTimer = null;
      pushBill();
    }, 1500);
  }

  function pushBill() {
    var session = cloudFullSession();
    if (!session) return;
    if (state.cloud.pushing) return;
    if (state.cloud.sharedView && !state.cloud.sharedView.mine) return; // fork: local only
    if (!hasBillContent() && state.cloud.lastPushedHash == null) return; // no empty rows
    var hash = billHash();
    if (hash == null || hash === state.cloud.lastPushedHash) {
      renderCloudBadge();
      return;
    }
    var client = cloudClient();
    if (!client) return;
    state.cloud.pushing = true;
    renderCloudBadge();
    var row = {
      id: state.bill.id,
      owner_id: session.user.id,
      owner_email: session.user.email || state.cloud.email,
      title: billTitle(),
      data: state.bill,
      is_shared: false,
      updated_at: new Date().toISOString(),
    };
    client.upsertBill(session.access_token, row).then(function (res) {
      state.cloud.pushing = false;
      if (res.ok) {
        state.cloud.lastPushedHash = hash;
        state.cloud.cloudMsg = '';
      } else {
        state.cloud.cloudMsg = cloudErrorText(res.error);
        if (res.error === 'BILL_NOT_FOUND' || res.status === 401) dropSession();
      }
      renderCloudBadge();
      updateUnloadGuard();
    });
  }

  function dropSession() {
    try {
      var client = cloudClient();
      if (client && state.cloud.session) client.signout(state.cloud.session.access_token);
    } catch (e) {}
    try {
      var hook = webHook();
      if (hook && hook.cloud) hook.cloud.clearSession();
    } catch (e) {}
    state.cloud.session = null;
    state.cloud.myBills = [];
    state.cloud.lastPushedHash = null;
  }

  // -- session restore + shared-link open (web boot) -------------------------

  function bootCloud() {
    if (MODE !== 'web') return;
    var client = cloudClient();
    if (!client) {
      maybeLoadSharedLink();
      return;
    }
    var saved = null;
    try {
      saved = client.loadSession();
    } catch (e) {}
    if (!saved || !saved.access_token) {
      maybeLoadSharedLink();
      return;
    }
    client.getUser(saved.access_token).then(function (res) {
      if (res.ok && res.user) {
        state.cloud.session = withAal({
          access_token: saved.access_token,
          refresh_token: saved.refresh_token,
          user: res.user,
          verified_at: saved.verified_at || Date.now(),
        });
        render();
        maybeLoadSharedLink();
        return;
      }
      if (saved.refresh_token) {
        client.refresh(saved.refresh_token).then(function (rr) {
          if (rr.ok && rr.session && rr.session.access_token) {
            state.cloud.session = withAal({
              access_token: rr.session.access_token,
              refresh_token: rr.session.refresh_token,
              user: rr.session.user,
              verified_at: Date.now(),
            });
            try {
              client.saveSession(state.cloud.session);
            } catch (e) {}
          } else {
            try {
              client.clearSession();
            } catch (e) {}
          }
          render();
          maybeLoadSharedLink();
        });
        return;
      }
      try {
        client.clearSession();
      } catch (e) {}
      render();
      maybeLoadSharedLink();
    });
  }

  function isMineRow(row) {
    try {
      return !!(
        state.cloud.session &&
        state.cloud.session.user &&
        row.owner_id &&
        state.cloud.session.user.id === row.owner_id
      );
    } catch (e) {
      return false;
    }
  }

  function maybeLoadSharedLink() {
    if (MODE !== 'web') return;
    var m = currentHashRoute().match(/^\/s\/([^/?#]+)/);
    if (!m) return;
    var token = '';
    try { token = decodeURIComponent(m[1]); } catch (e) { return; }
    if (!token) return;
    if (state.cloud.sharedView && state.cloud.shareToken === token) return;
    state.cloud.shareToken = token;
    state.cloud.sharePin = '';
    state.cloud.message = '';
    openAuthView('share-pin');
  }


  // -- login nudge (once per bill, guest only, never blocking) ---------------

  function maybeNudgeLogin() {
    // Deliberately non-blocking: save/share CTAs appear inline after 2 items.
    // The only exit-time interruption is the platform/browser unload warning.
    return;
  }

  // -- unload guard (browser-native dialog, content-at-risk only) -------------

  var unloadOn = false;

  function needsUnloadGuard() {
    if (MODE !== 'web') return false;
    if (!hasBillContent()) return false;
    if (!cloudFullSession()) return true; // guest draft, or login awaiting TOTP
    return billHash() !== state.cloud.lastPushedHash; // synced → no nag
  }

  function onBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '';
  }

  function updateUnloadGuard() {
    try {
      var need = needsUnloadGuard();
      if (need && !unloadOn && typeof window.addEventListener === 'function') {
        window.addEventListener('beforeunload', onBeforeUnload);
        unloadOn = true;
      } else if (!need && unloadOn && typeof window.removeEventListener === 'function') {
        window.removeEventListener('beforeunload', onBeforeUnload);
        unloadOn = false;
      }
    } catch (e) {}
  }

  // -- auth modal ------------------------------------------------------------

  var resendTimer = null;

  function armResendTimer() {
    try {
      if (resendTimer) clearTimeout(resendTimer);
    } catch (e) {}
    resendTimer = setTimeout(function () {
      resendTimer = null;
      if (state.authView === 'code') renderAuth(); // re-enable resend
    }, 30000);
  }

  function openAuthView(view) {
    state.authView = view;
    state.authFocus = true;
    renderAuth(); // instant feedback even when a fetch follows
    if (view === 'bills') refreshMyBills();
  }

  function closeAuth() {
    state.authView = null;
    try {
      if (resendTimer) {
        clearTimeout(resendTimer);
        resendTimer = null;
      }
    } catch (e) {}
    var o = document.getElementById('auth-overlay');
    if (o) {
      o.hidden = true;
      o.textContent = '';
    }
  }

  function setCloudMsg(kind, text) {
    state.cloud.messageKind = kind;
    state.cloud.message = text;
    var m = document.getElementById('auth-msg');
    if (m) {
      m.textContent = text || '';
      m.setAttribute('data-kind', kind || 'info');
    }
  }

  function renderAuth() {
    var overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    if (!state.authView) {
      overlay.hidden = true;
      overlay.textContent = '';
      return;
    }
    overlay.hidden = false;
    overlay.textContent = '';
    var box = el('div', { class: 'sheet', role: 'dialog', aria: 'aria-modal' });
    box.setAttribute('aria-modal', 'true');
    var view = state.authView;
    if (view === 'nudge') authNudge(box);
    else if (view === 'email') authEmail(box);
    else if (view === 'code') authCode(box);
    else if (view === 'passkey-setup') authPasskeySetup(box);
    else if (view === 'passkey') authPasskey(box);
    else if (view === 'account') authAccount(box);
    else if (view === 'bills') authBills(box);
    else if (view === 'share-create') authShareCreate(box);
    else if (view === 'share-pin') authSharePin(box);
    overlay.appendChild(box);
    if (state.authFocus) {
      state.authFocus = false;
      try {
        var first = box.querySelector
          ? box.querySelector('input, button')
          : findFirstField(box);
        if (first && first.focus) first.focus();
      } catch (e) {}
    }
  }

  function findFirstField(node) {
    // Fallback for environments without querySelector.
    var found = null;
    (function walk(n) {
      if (found || !n) return;
      if (n.tagName === 'INPUT' || n.tagName === 'BUTTON') {
        found = n;
        return;
      }
      (n.children || []).forEach(walk);
    })(node);
    return found;
  }

  function authHead(box, titleText) {
    var head = el('div', { class: 'row' });
    var h = el('h2', { text: titleText });
    head.appendChild(h);
    var x = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: '×' });
    x.setAttribute('aria-label', t('close'));
    x.addEventListener('click', closeAuth);
    head.appendChild(x);
    box.appendChild(head);
    var msg = el('p', {
      class: 'inline-note',
      id: 'auth-msg',
      role: 'alert',
      text: state.cloud.message || '',
    });
    msg.setAttribute('data-kind', state.cloud.messageKind || 'info');
    box.appendChild(msg);
  }

  function authNudge(box) {
    authHead(box, t('nudgeTitle'));
    box.appendChild(el('p', { class: 'hint', text: t('nudgeBody') }));
    var row = el('div', { class: 'row' });
    var go = el('button', { class: 'btn btn-primary', type: 'button', text: t('login') });
    go.addEventListener('click', function () {
      openAuthView('email');
    });
    var later = el('button', { class: 'btn btn-secondary', type: 'button', text: t('laterBtn') });
    later.addEventListener('click', closeAuth);
    row.appendChild(go);
    row.appendChild(later);
    box.appendChild(row);
  }

  function authEmail(box) {
    var client = cloudClient();
    authHead(box, t('login'));
    if (!client) {
      box.appendChild(el('p', { class: 'notice', role: 'note', text: t('cloudOffNote') }));
      return;
    }
    var form = el('form', { novalidate: 'novalidate' });
    var lab = el('label', { class: 'field' });
    lab.appendChild(el('span', { text: t('emailLabel') + ' *' }));
    var input = el('input', { id: 'auth-email', type: 'email', maxlength: '120' });
    input.setAttribute('name', 'email');
    input.setAttribute('autocomplete', 'email');
    input.setAttribute('inputmode', 'email');
    input.setAttribute('placeholder', t('emailPh'));
    input.setAttribute('required', 'required');
    input.value = state.cloud.email || '';
    lab.appendChild(input);
    form.appendChild(lab);
    var go = el('button', { class: 'btn btn-primary', type: 'submit', text: t('continueBtn') });
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = String(input.value || '').trim();
      if (!L.isValidEmail(v)) {
        setCloudMsg('error', t('badEmail'));
        return;
      }
      state.cloud.email = v;
      state.cloud.message = '';
      sendCodeAndShow();
    });
    box.appendChild(form);
  }

  function authPassword(box) {
    var client = cloudClient();
    authHead(box, t('login'));
    if (!client) {
      box.appendChild(el('p', { class: 'notice', role: 'note', text: t('cloudOffNote') }));
      return;
    }
    var hook = webHook();
    if (state.cloud.autoPw && !state.cloud.password && hook && hook.genPassword) {
      state.cloud.password = hook.genPassword();
    }
    var mailRow = el('p', { class: 'muted', text: state.cloud.email + ' · ' });
    var change = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('changeEmail') });
    change.addEventListener('click', function () {
      openAuthView('email');
    });
    mailRow.appendChild(change);
    box.appendChild(mailRow);

    var form = el('form', { novalidate: 'novalidate' });
    var autoLab = el('label', { class: 'chip' });
    var auto = el('input', { type: 'checkbox', id: 'auth-autogen' });
    auto.checked = !!state.cloud.autoPw;
    auto.addEventListener('change', function () {
      state.cloud.autoPw = !!auto.checked;
      if (state.cloud.autoPw && hook && hook.genPassword) pw.value = hook.genPassword();
      else if (state.cloud.autoPw) pw.value = '';
      else pw.value = '';
      state.cloud.password = pw.value;
    });
    autoLab.appendChild(auto);
    autoLab.appendChild(el('span', { text: t('autoPwLabel') }));
    form.appendChild(autoLab);

    var lab = el('label', { class: 'field' });
    lab.appendChild(el('span', { text: t('passwordLabel') + ' *' }));
    var pwRow = el('div', { class: 'row' });
    var pw = el('input', { id: 'auth-pw', type: 'password', maxlength: '128' });
    pw.setAttribute('name', 'new-password');
    pw.setAttribute('autocomplete', 'new-password');
    pw.setAttribute('minlength', '8');
    pw.setAttribute('required', 'required');
    pw.value = state.cloud.password || '';
    var toggle = el('button', {
      class: 'btn btn-ghost btn-small',
      type: 'button',
      text: state.cloud.showPw ? t('hidePw') : t('showPw'),
    });
    toggle.addEventListener('click', function () {
      state.cloud.showPw = !state.cloud.showPw;
      pw.setAttribute('type', state.cloud.showPw ? 'text' : 'password');
      toggle.textContent = state.cloud.showPw ? t('hidePw') : t('showPw');
    });
    pwRow.appendChild(pw);
    pwRow.appendChild(toggle);
    lab.appendChild(pwRow);
    form.appendChild(lab);

    var go = el('button', { class: 'btn btn-primary', type: 'submit', text: t('createOrLogin') });
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitPassword(pw.value, go);
    });
    box.appendChild(form);
  }

  function submitPassword(rawPw, btn) {
    var client = cloudClient();
    if (!client) return;
    var password = String(rawPw || '');
    if (password.length < 8) {
      setCloudMsg('error', t('weakPw'));
      return;
    }
    state.cloud.password = password;
    if (btn) btn.disabled = true;
    setCloudMsg('info', t('loading'));
    client.signup(state.cloud.email, password).then(function (r) {
      if (r.ok) {
        sendCodeAndShow();
        return;
      }
      if (r.error === 'EMAIL_EXISTS') {
        setCloudMsg('info', t('emailExistsNote'));
        client.signin(state.cloud.email, password).then(function (s) {
          if (s.ok && s.session) {
            // Password done (aal1) → TOTP challenge if enrolled, else email code.
            routePostSignin({
              access_token: s.session.access_token,
              refresh_token: s.session.refresh_token,
              user: s.session.user,
              aal: 'aal1',
            });
            return;
          }
          if (btn) btn.disabled = false;
          setCloudMsg('error', cloudErrorText(s.error));
        });
        return;
      }
      if (btn) btn.disabled = false;
      setCloudMsg('error', cloudErrorText(r.error));
    });
  }

  function sendCodeAndShow() {
    var client = cloudClient();
    if (!client) return;
    client.sendCode(state.cloud.email).then(function (r) {
      if (!r.ok && r.error !== 'EMAIL_EXISTS') {
        setCloudMsg('error', cloudErrorText(r.error));
        renderAuth();
        return;
      }
      state.cloud.otpSentAt = Date.now();
      state.cloud.code = '';
      state.cloud.message = '';
      openAuthView('code');
      armResendTimer();
    });
  }

  // -- TOTP routing: password/email step done (aal1) → what is next? ---------

  function verifiedPasskeyFactor(factors) {
    var list = factors || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f && f.id && f.status === 'verified' && (!f.factor_type || f.factor_type === 'webauthn')) {
        return f;
      }
    }
    return null;
  }

  // Passkey ceremony needs a capable browser AND the website hook.
  function canUsePasskey() {
    try {
      var hook = webHook();
      return !!(hook && hook.webauthnSupported && hook.webauthnSupported());
    } catch (e) {
      return false;
    }
  }

  function rpInfo() {
    try {
      return {
        rpId: String(window.location.hostname || ''),
        rpOrigins: [String(window.location.origin || '')],
      };
    } catch (e) {
      return { rpId: '', rpOrigins: [] };
    }
  }

  // After email+password: enrolled → TOTP challenge; otherwise email code.
  function routePostSignin(emailSession) {
    var client = cloudClient();
    if (!client) return;
    state.cloud.pendingSession = emailSession;
    setCloudMsg('info', t('loading'));
    client.listFactors(emailSession.access_token).then(function (res) {
      if (!res.ok) {
        setCloudMsg('error', cloudErrorText(res.error));
        renderAuth();
        return;
      }
      var verified = verifiedPasskeyFactor(res.factors);
      if (verified) {
        startPasskeyChallenge(emailSession, verified.id);
        return;
      }
      sendCodeAndShow();
    });
  }

  // After the first email code: register a passkey — or settle for a
  // read-only email session where this browser cannot do WebAuthn.
  function routePostEmailVerify(emailSession) {
    var client = cloudClient();
    if (!client) return;
    if (!canUsePasskey()) {
      finishEmailOnlySession(emailSession);
      return;
    }
    state.cloud.pendingSession = emailSession;
    setCloudMsg('info', t('loading'));
    client.listFactors(emailSession.access_token).then(function (res) {
      if (!res.ok) {
        setCloudMsg('error', cloudErrorText(res.error));
        renderAuth();
        return;
      }
      var verified = verifiedPasskeyFactor(res.factors);
      if (verified) {
        startPasskeyChallenge(emailSession, verified.id);
        return;
      }
      beginPasskeyEnroll(emailSession);
    });
  }

  // No passkey-capable browser: keep the proven email identity as a read-only
  // session (list/open work; writes stay locked behind aal2). Honest, usable.
  function finishEmailOnlySession(emailSession) {
    var session = withAal({
      access_token: emailSession.access_token,
      refresh_token: emailSession.refresh_token,
      user: emailSession.user,
      verified_at: Date.now(),
    });
    var client = cloudClient();
    state.cloud.session = session;
    state.cloud.pendingSession = null;
    state.cloud.passkey = null;
    state.cloud.lastPushedHash = null;
    try {
      if (client) client.saveSession(session);
    } catch (e) {}
    closeAuth();
    setStatus('info', t('passkeyReadonlyNote'));
    render();
  }

  function startPasskeyChallenge(emailSession, factorId) {
    var client = cloudClient();
    if (!client) return;
    if (!canUsePasskey()) {
      finishEmailOnlySession(emailSession);
      return;
    }
    state.cloud.pendingSession = emailSession;
    setCloudMsg('info', t('loading'));
    var rp = rpInfo();
    client.challengePasskey(emailSession.access_token, factorId, rp.rpId, rp.rpOrigins).then(function (res) {
      if (!res.ok || !res.challengeId || !res.options) {
        setCloudMsg('error', cloudErrorText(res.error));
        renderAuth();
        return;
      }
      if (res.type && res.type !== 'request') {
        setCloudMsg('error', t('passkeyFailed'));
        renderAuth();
        return;
      }
      state.cloud.passkey = { factorId: factorId, challengeId: res.challengeId, type: 'request', options: res.options };
      state.cloud.message = '';
      openAuthView('passkey');
    });
  }

  function beginPasskeyEnroll(emailSession) {
    var client = cloudClient();
    if (!client) return;
    if (!canUsePasskey()) {
      finishEmailOnlySession(emailSession);
      return;
    }
    state.cloud.pendingSession = emailSession;
    state.cloud.passkey = null;
    setCloudMsg('info', t('loading'));
    client.enrollPasskey(emailSession.access_token, 'passkey').then(function (res) {
      if (!res.ok || !res.factor || !res.factor.id) {
        setCloudMsg('error', cloudErrorText(res.error));
        renderAuth();
        return;
      }
      var rp = rpInfo();
      client.challengePasskey(emailSession.access_token, res.factor.id, rp.rpId, rp.rpOrigins).then(function (ch) {
        if (!ch.ok || !ch.challengeId || !ch.options) {
          setCloudMsg('error', cloudErrorText(ch.error));
          renderAuth();
          return;
        }
        if (ch.type && ch.type !== 'create') {
          setCloudMsg('error', t('passkeyFailed'));
          renderAuth();
          return;
        }
        state.cloud.passkey = { factorId: res.factor.id, challengeId: ch.challengeId, type: 'create', options: ch.options };
        state.cloud.message = '';
        openAuthView('passkey-setup');
      });
    });
  }

  // Lost authenticator: prove the email again, then enroll a FRESH factor
  // first (enroll works at aal1). The lost factors are revoked only after the
  // new one verifies — unenroll demands aal2, so revoking first cannot work.
  // See confirmPasskeySetup.
  function recoverEnroll(emailSession) {
    var client = cloudClient();
    if (!client) return;
    state.cloud.pendingSession = emailSession;
    setCloudMsg('info', t('loading'));
    client.listFactors(emailSession.access_token).then(function (res) {
      if (!res.ok) {
        setCloudMsg('error', cloudErrorText(res.error));
        renderAuth();
        return;
      }
      state.cloud.recoveryIds = [];
      (res.factors || []).forEach(function (f) {
        if (f && f.id && f.status === 'verified') state.cloud.recoveryIds.push(f.id);
      });
      beginPasskeyEnroll(emailSession);
    });
  }

  // Re-verify a remembered aal1 session (boot restore, legacy accounts).
  function startReverify() {
    var session = cloudSession();
    var client = cloudClient();
    if (!client || !session) return;
    if (session.user && session.user.email && !state.cloud.email) {
      state.cloud.email = session.user.email;
    }
    setCloudMsg('info', t('loading'));
    routePostSignin({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
      aal: 'aal1',
    });
  }

  function finishPasskeyLogin(user, tokens) {
    var session = withAal({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: user,
      verified_at: Date.now(),
    });
    var client = cloudClient();
    state.cloud.session = session;
    state.cloud.passkey = null;
    state.cloud.pendingSession = null;
    state.cloud.recoveryIds = [];
    state.cloud.lastPushedHash = null;
    try {
      if (client) client.saveSession(session);
    } catch (e) {}
    closeAuth();
    pushBill();
    render();
  }

  function authPasskeySetup(box) {
    authHead(box, t('passkeySetupTitle'));
    var payload = state.cloud.passkey;
    if (!payload || !payload.factorId || !payload.options) {
      box.appendChild(el('p', { class: 'hint', text: t('loading') }));
      return;
    }
    box.appendChild(el('p', { class: 'hint', text: t('passkeySetupHint') }));
    var go = el('button', { class: 'btn btn-primary', type: 'button', text: t('passkeyTurnOn') });
    go.addEventListener('click', function () {
      confirmPasskeySetup(go);
    });
    box.appendChild(go);
    var back = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('laterBtn') });
    back.addEventListener('click', closeAuth);
    box.appendChild(back);
  }

  function passkeyErrorText(code) {
    switch (code) {
      case 'PASSKEY_CANCELLED': return t('passkeyCancelled');
      case 'PASSKEY_EXISTS': return t('passkeyExists');
      case 'PASSKEY_UNSUPPORTED': return t('passkeyUnsupported');
      case 'PASSKEY_DISABLED': return t('passkeyDisabled');
      default: return t('passkeyFailed');
    }
  }

  function confirmPasskeySetup(btn) {
    var hook = webHook();
    var client = cloudClient();
    var pending = state.cloud.pendingSession;
    var payload = state.cloud.passkey;
    if (!client || !pending || !payload || !hook || !hook.runCreateCeremony) return;
    if (btn) btn.disabled = true;
    setCloudMsg('info', t('passkeyWaiting'));
    hook.runCreateCeremony(payload.options).then(function (cer) {
      if (!cer.ok) {
        if (btn) btn.disabled = false;
        setCloudMsg('error', passkeyErrorText(cer.error));
        return;
      }
      var rp = rpInfo();
      client.verifyPasskey(pending.access_token, payload.factorId, payload.challengeId, payload.type || 'create', rp.rpId, rp.rpOrigins, cer.credential).then(function (r) {
        if (!r.ok || !r.session || !r.session.access_token) {
          if (btn) btn.disabled = false;
          setCloudMsg('error', passkeyErrorText(r.error));
          return;
        }
        var stale = state.cloud.recoveryIds || [];
        state.cloud.recoveryIds = [];
        if (stale.length === 0) {
          finishPasskeyLogin(pending.user, r.session);
          return;
        }
        // Recovery, now aal2: revoke the lost factors, then finish.
        var freshToken = r.session.access_token;
        (function next(i) {
          if (i >= stale.length) {
            finishPasskeyLogin(pending.user, r.session);
            return;
          }
          client.unenrollFactor(freshToken, stale[i]).then(function (u) {
            if (!u.ok) {
              // Logged in on the new device; the old factor survives — say so.
              finishPasskeyLogin(pending.user, r.session);
              setStatus('info', t('oldFactorKept'));
              return;
            }
            next(i + 1);
          });
        })(0);
      });
    });
  }

  function authPasskey(box) {
    authHead(box, t('passkeyTitle'));
    var pending = state.cloud.pendingSession;
    var payload = state.cloud.passkey;
    if (!pending || !payload || !payload.challengeId || !payload.options) {
      box.appendChild(el('p', { class: 'hint', text: t('loading') }));
      return;
    }
    box.appendChild(el('p', { class: 'hint', text: t('passkeyHint') }));
    var go = el('button', { class: 'btn btn-primary', type: 'button', text: t('passkeyVerifyBtn') });
    go.addEventListener('click', function () {
      confirmPasskeyLogin(go);
    });
    box.appendChild(go);
    var row = el('div', { class: 'row' });
    var lost = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('lostPasskey') });
    lost.addEventListener('click', function () {
      state.cloud.recovery = true;
      sendCodeAndShow();
    });
    var other = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('useAnotherEmail') });
    other.addEventListener('click', function () {
      state.cloud.pendingSession = null;
      state.cloud.passkey = null;
      openAuthView('email');
    });
    row.appendChild(lost);
    row.appendChild(other);
    box.appendChild(row);
  }

  function confirmPasskeyLogin(btn) {
    var hook = webHook();
    var client = cloudClient();
    var pending = state.cloud.pendingSession;
    var payload = state.cloud.passkey;
    if (!client || !pending || !payload || !hook || !hook.runGetCeremony) return;
    if (btn) btn.disabled = true;
    setCloudMsg('info', t('passkeyWaiting'));
    hook.runGetCeremony(payload.options).then(function (cer) {
      if (!cer.ok) {
        if (btn) btn.disabled = false;
        setCloudMsg('error', passkeyErrorText(cer.error));
        return;
      }
      var rp = rpInfo();
      client.verifyPasskey(pending.access_token, payload.factorId, payload.challengeId, payload.type || 'request', rp.rpId, rp.rpOrigins, cer.credential).then(function (r) {
        if (!r.ok || !r.session || !r.session.access_token) {
          if (btn) btn.disabled = false;
          setCloudMsg('error', passkeyErrorText(r.error));
          return;
        }
        finishPasskeyLogin(pending.user, r.session);
      });
    });
  }

  function authCode(box) {
    var client = cloudClient();
    authHead(box, t('codeLabel'));
    if (!client) {
      box.appendChild(el('p', { class: 'notice', role: 'note', text: t('cloudOffNote') }));
      return;
    }
    box.appendChild(el('p', { class: 'hint', text: t('codeHint') }));
    box.appendChild(el('p', { class: 'muted', text: state.cloud.email }));
    var form = el('form', { novalidate: 'novalidate' });
    var lab = el('label', { class: 'field' });
    lab.appendChild(el('span', { text: t('codeLabel') + ' *' }));
    var input = el('input', { id: 'auth-code', type: 'text', inputmode: 'numeric', maxlength: '6' });
    input.setAttribute('name', 'one-time-code');
    input.setAttribute('autocomplete', 'one-time-code');
    input.setAttribute('required', 'required');
    input.value = state.cloud.code || '';
    lab.appendChild(input);
    form.appendChild(lab);
    var go = el('button', { class: 'btn btn-primary', type: 'submit', text: t('verifyBtn') });
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = String(input.value || '').replace(/\D/g, '');
      if (code.length < 6) {
        setCloudMsg('error', t('codeWrong'));
        return;
      }
      go.disabled = true;
      setCloudMsg('info', t('loading'));
      client.verifyCode(state.cloud.email, code).then(function (r) {
        if (!r.ok || !r.session || !r.session.access_token) {
          go.disabled = false;
          setCloudMsg('error', cloudErrorText(r.error || 'CODE_WRONG'));
          return;
        }
        // Email verified (aal1). First time → set up TOTP; recovery → re-enroll.
        var emailSession = {
          access_token: r.session.access_token,
          refresh_token: r.session.refresh_token,
          user: r.session.user,
          aal: 'aal1',
        };
        state.cloud.password = '';
        state.cloud.code = '';
        if (state.cloud.recovery) {
          state.cloud.recovery = false;
          recoverEnroll(emailSession);
          return;
        }
        routePostEmailVerify(emailSession);
      });
    });
    box.appendChild(form);
    var row = el('div', { class: 'row' });
    var cool = Date.now() - (state.cloud.otpSentAt || 0) < 30000;
    var resend = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: cool ? t('resendWait') : t('resendCode') });
    if (cool) resend.disabled = true;
    resend.addEventListener('click', function () {
      resend.disabled = true;
      client.sendCode(state.cloud.email).then(function (r) {
        state.cloud.otpSentAt = Date.now();
        setCloudMsg(r.ok ? 'ok' : 'error', r.ok ? t('codeSent') : cloudErrorText(r.error));
        renderAuth();
        armResendTimer();
      });
    });
    var other = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('useAnotherEmail') });
    other.addEventListener('click', function () {
      state.cloud.code = '';
      openAuthView('email');
    });
    row.appendChild(resend);
    row.appendChild(other);
    box.appendChild(row);
  }

  function authAccount(box) {
    authHead(box, t('account'));
    var session = cloudSession();
    if (!session) {
      openAuthView('email');
      return;
    }
    var email = (session.user && session.user.email) || state.cloud.email || '';
    box.appendChild(el('p', { text: email }));
    if (!cloudFullSession()) {
      box.appendChild(el('p', { class: 'hint', text: t('verifyNeeded') }));
      var verify = el('button', { class: 'btn btn-primary', type: 'button', text: t('verifyPasskey') });
      verify.addEventListener('click', function () {
        startReverify();
      });
      box.appendChild(verify);
    }
    var row = el('div', { class: 'row' });
    var bills = el('button', { class: 'btn btn-primary', type: 'button', text: t('myBills') });
    bills.addEventListener('click', function () {
      openAuthView('bills');
    });
    var out = el('button', { class: 'btn btn-ghost', type: 'button', text: t('logout') });
    out.addEventListener('click', function () {
      dropSession();
      closeAuth();
      render();
    });
    row.appendChild(bills);
    row.appendChild(out);
    box.appendChild(row);
  }

  function refreshMyBills() {
    var client = cloudClient();
    var session = cloudSession();
    if (!client || !session) {
      renderAuth();
      return;
    }
    client.listBills(session.access_token).then(function (res) {
      if (!res.ok) {
        if (res.error === 'BILL_NOT_FOUND') dropSession();
        setCloudMsg('error', cloudErrorText(res.error));
        renderAuth();
        return;
      }
      state.cloud.myBills = res.bills || [];
      renderAuth();
    });
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN');
    } catch (e) {
      return '';
    }
  }

  function shareLinkFor(token) {
    try {
      return window.location.origin + window.location.pathname + '#/s/' + encodeURIComponent(token);
    } catch (e) {
      return '#/s/' + token;
    }
  }

  function loadReadOnlySharedBill(row) {
    var data = row && row.data && typeof row.data === 'object' ? row.data : {};
    state.bill = {
      id: String((row && row.id) || data.id || newBillId()),
      title: String((row && row.title) || data.title || ''),
      participants: (data.participants || []).slice(0, L.MAX_PARTICIPANTS),
      items: (data.items || []).slice(0, 200),
      accounts: data.accounts || {},
      is_shared: true,
      createdAt: data.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    state.cloud.sharedView = { id: state.bill.id, mine: false };
    state.transfers = [];
    state.step = 0;
    persistBill();
    closeAuth();
    setStatus('info', lang === 'en'
      ? 'Shared bill · read only. Make your own copy if you need to edit.'
      : 'Bill được chia sẻ · chỉ đọc. Tạo bản riêng nếu bạn cần chỉnh sửa.');
    render();
  }

  function authSharePin(box) {
    authHead(box, lang === 'en' ? 'Open shared bill' : 'Mở bill được chia sẻ');
    box.appendChild(el('p', { class: 'hint', text: lang === 'en'
      ? 'This link is protected by a 4-digit PIN from the bill owner.'
      : 'Link này được bảo vệ bằng mã PIN 4 số do chủ bill cung cấp.' }));
    var form = el('form', { novalidate: 'novalidate' });
    var input = el('input', { id: 'share-pin', type: 'text', inputmode: 'numeric', maxlength: '4' });
    input.setAttribute('autocomplete', 'one-time-code');
    input.setAttribute('placeholder', '••••');
    input.value = state.cloud.sharePin || '';
    var go = el('button', { class: 'btn btn-primary', type: 'submit', text: lang === 'en' ? 'Open bill' : 'Mở bill' });
    form.appendChild(input);
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = String(input.value || '').replace(/\D/g, '');
      if (pin.length !== 4) {
        setCloudMsg('error', lang === 'en' ? 'Enter the 4-digit PIN.' : 'Nhập đủ PIN 4 số.');
        return;
      }
      var client = cloudClient();
      if (!client || !client.openSharedBill) {
        setCloudMsg('error', lang === 'en' ? 'Protected sharing is not active on this preview backend yet.' : 'Backend chia sẻ có PIN chưa được activate cho Preview này.');
        return;
      }
      go.disabled = true;
      state.cloud.sharePin = pin;
      client.openSharedBill(state.cloud.shareToken, pin).then(function (res) {
        if (!res.ok) {
          go.disabled = false;
          var msg = res.error === 'SHARE_LOCKED'
            ? (lang === 'en' ? 'Too many attempts. Try again later.' : 'Sai quá nhiều lần. Thử lại sau.')
            : (lang === 'en' ? 'PIN is incorrect or the link is no longer active.' : 'PIN chưa đúng hoặc link đã bị tắt.');
          setCloudMsg('error', msg);
          return;
        }
        loadReadOnlySharedBill(res.bill);
      });
    });
    box.appendChild(form);
  }

  function authShareCreate(box) {
    authHead(box, lang === 'en' ? 'Share this bill' : 'Chia sẻ bill này');
    var session = cloudFullSession();
    if (!session) {
      box.appendChild(el('p', { class: 'hint', text: lang === 'en' ? 'Sign in first to create a protected link.' : 'Đăng nhập trước để tạo link được bảo vệ.' }));
      return;
    }
    var billId = state.cloud.shareTargetBillId || state.bill.id;
    var token = state.cloud.shareLinks[billId] || '';
    if (token) {
      box.appendChild(el('p', { class: 'hint', text: lang === 'en'
        ? 'Send this link and the 4-digit PIN separately.'
        : 'Gửi link này và mã PIN 4 số riêng cho người nhận.' }));
      var link = el('input', { id: 'share-link', type: 'text', readonly: 'true' });
      link.value = shareLinkFor(token);
      link.addEventListener('focus', function () { try { link.select(); } catch (e) {} });
      box.appendChild(link);
      var row = el('div', { class: 'row' });
      var copy = el('button', { class: 'btn btn-primary', type: 'button', text: t('copyLink') });
      copy.addEventListener('click', function () {
        try { link.select(); if (document.execCommand) document.execCommand('copy'); } catch (e) {}
        setCloudMsg('ok', t('linkCopied'));
      });
      var disable = el('button', { class: 'btn btn-ghost', type: 'button', text: lang === 'en' ? 'Disable link' : 'Tắt link' });
      disable.addEventListener('click', function () {
        var client = cloudClient();
        if (!client || !client.disableShare) return;
        disable.disabled = true;
        client.disableShare(session.access_token, billId).then(function (res) {
          disable.disabled = false;
          if (!res.ok) { setCloudMsg('error', lang === 'en' ? 'Could not disable sharing.' : 'Chưa tắt được link chia sẻ.'); return; }
          delete state.cloud.shareLinks[billId];
          state.cloud.sharePin = '';
          renderAuth();
        });
      });
      row.appendChild(copy);
      row.appendChild(disable);
      box.appendChild(row);
      return;
    }

    box.appendChild(el('p', { class: 'hint', text: lang === 'en'
      ? 'Choose a 4-digit PIN. The link itself also contains a long random token.'
      : 'Chọn PIN 4 số. Bản thân link cũng chứa token ngẫu nhiên dài để tránh đoán link.' }));
    var form = el('form', { novalidate: 'novalidate' });
    var pin = el('input', { id: 'share-create-pin', type: 'text', inputmode: 'numeric', maxlength: '4' });
    pin.setAttribute('placeholder', lang === 'en' ? '4-digit PIN' : 'PIN 4 số');
    pin.value = state.cloud.sharePin || '';
    var create = el('button', { class: 'btn btn-primary', type: 'submit', text: lang === 'en' ? 'Create protected link' : 'Tạo link có PIN' });
    form.appendChild(pin);
    form.appendChild(create);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = String(pin.value || '').replace(/\D/g, '');
      if (value.length !== 4) {
        setCloudMsg('error', lang === 'en' ? 'PIN must be 4 digits.' : 'PIN cần đúng 4 số.');
        return;
      }
      var client = cloudClient();
      if (!client || !client.createShare) {
        setCloudMsg('error', lang === 'en' ? 'Protected sharing backend is not active yet.' : 'Backend chia sẻ có PIN chưa được activate.');
        return;
      }
      create.disabled = true;
      state.cloud.sharePin = value;
      // Ensure the latest bill snapshot reaches cloud before exposing a link.
      pushBill();
      client.createShare(session.access_token, billId, value).then(function (res) {
        create.disabled = false;
        if (!res.ok) {
          setCloudMsg('error', lang === 'en' ? 'Could not create the share link.' : 'Chưa tạo được link chia sẻ.');
          return;
        }
        state.cloud.shareLinks[billId] = res.shareToken;
        renderAuth();
      });
    });
    box.appendChild(form);
  }

  function authBills(box) {
    authHead(box, t('myBills'));
    var session = cloudSession();
    if (!session) {
      openAuthView('email');
      return;
    }
    var backRow = el('div', { class: 'row' });
    var back = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('back') });
    back.addEventListener('click', function () {
      openAuthView('account');
    });
    backRow.appendChild(back);
    box.appendChild(backRow);

    var list = state.cloud.myBills || [];
    if (list.length === 0) {
      box.appendChild(el('p', { class: 'empty', text: t('noBills') }));
      return;
    }
    var ul = el('ul', { class: 'list' });
    list.forEach(function (row) {
      var li = el('li', { class: 'transfer' });
      var top = el('div', { class: 'transfer-top' });
      top.appendChild(el('strong', { text: row.title || row.id }));
      top.appendChild(el('span', { class: 'muted', text: fmtDate(row.updated_at) }));
      li.appendChild(top);

      var actions = el('div', { class: 'row' });
      var open = el('button', { class: 'btn btn-primary btn-small', type: 'button', text: t('openBill') });
      (function (r) {
        open.addEventListener('click', function () {
          openCloudBill(r.id);
        });
      })(row);
      var share = el('button', {
        class: 'btn btn-ghost btn-small',
        type: 'button',
        text: lang === 'en' ? 'Share with PIN' : 'Chia sẻ có PIN',
      });
      (function (r) {
        share.addEventListener('click', function () {
          state.cloud.shareTargetBillId = r.id;
          state.cloud.sharePin = '';
          openAuthView('share-create');
        });
      })(row);
      actions.appendChild(open);
      actions.appendChild(share);
      li.appendChild(actions);

      var delRow = el('div', { class: 'row' });
      var pending = state.cloud.pendingDeleteId === row.id;
      var del = el('button', {
        class: 'btn btn-ghost btn-small',
        type: 'button',
        text: pending ? t('deleteAsk') : t('deleteBill'),
      });
      if (pending) del.setAttribute('data-kind', 'error');
      (function (r) {
        del.addEventListener('click', function () {
          if (state.cloud.pendingDeleteId !== r.id) {
            state.cloud.pendingDeleteId = r.id;
            renderAuth();
            return;
          }
          state.cloud.pendingDeleteId = null;
          var client = cloudClient();
          var s = cloudFullSession(); // deletes are writes: TOTP required
          if (!client || !s) {
            setCloudMsg('error', t('verifyNeeded'));
            renderAuth();
            return;
          }
          client.deleteBill(s.access_token, r.id).then(function (res) {
            if (!res.ok) {
              setCloudMsg('error', cloudErrorText(res.error));
              renderAuth();
              return;
            }
            if (r.id === state.bill.id) state.cloud.lastPushedHash = null;
            refreshMyBills();
          });
        });
      })(row);
      delRow.appendChild(del);
      li.appendChild(delRow);

      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function openCloudBill(id) {
    var client = cloudClient();
    var session = cloudSession();
    if (!client || !session) return;
    client.getBill(session.access_token, id).then(function (res) {
      if (!res.ok) {
        setCloudMsg('error', cloudErrorText(res.error));
        renderAuth();
        return;
      }
      var row = res.bill;
      var data = row.data && typeof row.data === 'object' ? row.data : {};
      state.bill = {
        id: row.id,
        title: String(row.title || data.title || ''),
        participants: (data.participants || []).slice(0, L.MAX_PARTICIPANTS),
        items: (data.items || []).slice(0, 200),
        accounts: data.accounts || {},
        allJoinConfirmed: typeof data.allJoinConfirmed === 'boolean' ? data.allJoinConfirmed : true,
        billCreatedTracked: !!data.billCreatedTracked || (data.items || []).length > 0,
        is_shared: !!row.is_shared,
        createdAt: data.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      state.cloud.sharedView = { id: row.id, mine: true };
      state.cloud.lastPushedHash = billHash();
      try {
        window.location.hash = '#/bill/' + encodeURIComponent(row.id);
      } catch (e) {}
      state.step = 0;
      closeAuth();
      persistBill();
      render();
    });
  }

  // Protected sharing is handled by authShareCreate + Edge Functions.

  function renderCloudBadge() {
    var b = document.getElementById('cloud-badge');
    if (!b) return;
    if (MODE !== 'web' || !cloudClient()) {
      b.hidden = true;
      return;
    }
    if (state.cloud.sharedView && !state.cloud.sharedView.mine) {
      b.hidden = false;
      b.textContent = t('forkBadge');
      return;
    }
    if (!cloudSession()) {
      b.hidden = true;
      return;
    }
    if (!cloudFullSession()) {
      b.hidden = false;
      b.textContent = t('verifyNeeded');
      return;
    }
    b.hidden = false;
    if (state.cloud.pushing) b.textContent = t('cloudSaving');
    else if (state.cloud.cloudMsg) b.textContent = state.cloud.cloudMsg;
    else if (state.cloud.lastPushedHash) b.textContent = t('cloudSaved');
    else b.textContent = t('cloudPending');
  }

  // ---------------------------------------------------------------------------
  // Rendering (vanilla, semantic tokens only, 48px targets)
  // ---------------------------------------------------------------------------

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.indexOf('aria') === 0 || k === 'role' || k === 'for' || k === 'id') n.setAttribute(k === 'for' ? 'for' : k, v);
        else if (k === 'disabled' && v) n.disabled = true;
        else n.setAttribute(k, v);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s);
  }

  function personName(id) {
    var p = state.bill.participants.find(function (x) { return x.id === id; });
    return p ? p.name : id;
  }

  function render() {
    applyModeChrome();
    renderHeader();
    renderTrackingConsent();
    renderStatus();
    renderPersistBadge();
    renderCloudBadge();
    renderSteps();
    renderBody();
    renderAuth();
    updateOnline();
    updateUnloadGuard();
  }

  function renderTrackingConsent() {
    var panel = document.getElementById('tracking-consent');
    if (!panel) return;
    var config = null;
    try { config = window.SplitBillTrackingConfig; } catch (e) {}
    var enabled = MODE === 'web' && config && typeof config.baseUrl === 'string' && config.baseUrl.trim();
    panel.hidden = !enabled || state.trackingConsent !== null;
    var title = document.getElementById('tracking-consent-title');
    var body = document.getElementById('tracking-consent-body');
    var accept = document.getElementById('tracking-consent-accept');
    var reject = document.getElementById('tracking-consent-reject');
    if (title) title.textContent = t('trackingConsentTitle');
    if (body) body.textContent = t('trackingConsentBody');
    if (accept) accept.textContent = t('trackingConsentAccept');
    if (reject) reject.textContent = t('trackingConsentReject');
  }

  function chooseTrackingConsent(accepted) {
    state.trackingConsent = !!accepted;
    var hook = webHook();
    if (hook && typeof hook.setTrackingConsent === 'function') hook.setTrackingConsent(state.trackingConsent);
    renderTrackingConsent();
  }

  function renderHeader() {
    var title = document.getElementById('app-title');
    if (title) title.textContent = t('appName');
    var tag = document.getElementById('app-tagline');
    if (tag) tag.textContent = t('tagline');
    var langBtn = document.getElementById('lang-toggle');
    if (langBtn) langBtn.textContent = lang === 'vi' ? 'VI · EN' : 'EN · VI';
    renderAccountSlot();
  }

  // Topbar account entry — website only. Hidden in the mini-app and when the
  // website bundle has no configured backend.
  function renderAccountSlot() {
    var slot = document.getElementById('account-slot');
    if (!slot) return;
    slot.textContent = '';
    if (MODE !== 'web' || !cloudClient()) {
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    var session = cloudSession();
    var btn = el('button', { class: 'btn btn-ghost btn-small', type: 'button' });
    if (session) {
      var email = (session.user && session.user.email) || '';
      btn.textContent = email || t('account');
      btn.setAttribute('aria-label', t('account') + ': ' + email);
      btn.addEventListener('click', function () {
        openAuthView('account');
      });
    } else {
      btn.textContent = t('login');
      btn.setAttribute('aria-label', t('login'));
      btn.addEventListener('click', function () {
        openAuthView('email');
      });
    }
    slot.appendChild(btn);
  }

  function renderStatus() {
    var region = document.getElementById('status-region');
    if (!region) return;
    region.textContent = '';
    var kind = state.status.kind;
    if (kind === 'ready' || (kind === 'loading' && state.bootDone)) {
      region.hidden = true;
      return;
    }
    region.hidden = false;
    var box = el('div', { class: 'status status-' + kind, role: 'status' }, [
      el('span', { text: kind === 'loading' ? t('loading') : (state.status.text || t('unknown')) }),
    ]);
    if (kind === 'error' || kind === 'unknown') {
      var btn = el('button', { class: 'btn btn-secondary', type: 'button', text: t('retry') });
      btn.addEventListener('click', function () { setStatus('ready', ''); render(); });
      box.appendChild(btn);
    }
    region.appendChild(box);
  }

  function renderPersistBadge() {
    var b = document.getElementById('persist-badge');
    if (!b) return;
    b.textContent = storageMode === 'bridge' ? t('draftSavedBridge')
      : storageMode === 'local' ? t('draftSavedLocal')
      : t('draftSavedMemory');
    b.setAttribute('data-mode', storageMode === 'local' ? 'local' : storageMode);
  }

  function applyModeChrome() {
    try {
      document.documentElement.setAttribute('data-mode', MODE);
      var foot = document.getElementById('footer-note');
      if (foot) foot.textContent = t('footerNote');
    } catch (e) {}
  }

  function renderSteps() {
    var nav = document.getElementById('steps');
    if (!nav) return;
    nav.textContent = '';
    var labels = t('steps');
    if (!Array.isArray(labels) || labels.length < 2) labels = lang === 'en' ? ['Expenses', 'Settle'] : ['Chi phí', 'Chốt sổ'];
    for (var i = 0; i < 2; i++) {
      (function (idx) {
        var b = el('button', {
          class: 'step' + (state.step === idx ? ' is-active' : ''),
          type: 'button',
          aria: 'aria-current',
        });
        if (state.step === idx) b.setAttribute('aria-current', 'step');
        b.appendChild(el('span', { class: 'step-n', text: String(idx + 1) }));
        b.appendChild(el('span', { class: 'step-l', text: labels[idx] }));
        b.addEventListener('click', function () { state.step = idx; render(); });
        nav.appendChild(b);
      })(i);
    }
    var hint = document.getElementById('step-hint');
    if (hint) hint.textContent = t('stepHint') + ' ' + (state.step + 1) + '/2';
  }

  function renderBody() {
    var body = document.getElementById('step-body');
    if (!body) return;
    body.textContent = '';
    if (!state.bootDone) {
      body.appendChild(skeleton());
      return;
    }
    if (state.step === 0) body.appendChild(renderItems());
    else body.appendChild(renderSettle());
    if (state.participantBatch) renderParticipantBatch();
    else if (state.askBack) renderAskBack();
    else closeSheetIfOpen();
  }

  function skeleton() {
    var d = el('div', { class: 'skeleton', role: 'status', aria: 'aria-label' });
    d.setAttribute('aria-label', t('loading'));
    for (var i = 0; i < 3; i++) d.appendChild(el('div', { class: 'sk-line' }));
    return d;
  }

  // -- step 0: people ------------------------------------------------------

  function renderPeople() {
    var wrap = el('section', { class: 'card', aria: 'aria-labelledby' });
    wrap.setAttribute('aria-labelledby', 'h-people');
    wrap.appendChild(el('h2', { id: 'h-people', text: t('peopleTitle') }));
    wrap.appendChild(el('p', { class: 'hint', text: t('peopleHint') }));

    var titleLab = el('label', { class: 'field' });
    titleLab.appendChild(el('span', { text: t('billTitle') }));
    var titleInput = el('input', { id: 'bill-title', type: 'text', maxlength: '60' });
    titleInput.setAttribute('placeholder', t('billTitlePh'));
    titleInput.setAttribute('aria-label', t('billTitle'));
    titleInput.setAttribute('autocomplete', 'off');
    titleInput.value = state.bill.title || '';
    // 'change' (not 'input'): no re-render churn, focus never stolen mid-typing.
    titleInput.addEventListener('change', function () {
      state.bill.title = String(titleInput.value || '').slice(0, 60);
      touchBill();
    });
    titleLab.appendChild(titleInput);
    wrap.appendChild(titleLab);

    var row = el('div', { class: 'row' });
    row.appendChild(el('span', { class: 'muted member-input-hint', text: lang === 'en'
      ? 'Add one person, or paste a list separated by commas / new lines.'
      : 'Thêm một người, hoặc dán danh sách cách nhau bằng dấu phẩy / xuống dòng.' }));
    var input = el('textarea', { id: 'person-input', rows: '2', maxlength: '600' });
    input.setAttribute('placeholder', t('participantPlaceholder'));
    input.setAttribute('aria-label', t('peopleTitle'));
    input.setAttribute('autocomplete', 'off');
    var add = el('button', { class: 'btn btn-primary', type: 'button', text: t('participantAdd') });
    add.addEventListener('click', function () { addPersonFromInput(input); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addPersonFromInput(input); }
    });
    row.appendChild(input);
    row.appendChild(add);
    wrap.appendChild(row);

    if (state.peopleError) {
      wrap.appendChild(el('p', { class: 'inline-error', role: 'alert', text: state.peopleError }));
    }

    var list = state.bill.participants;
    if (list.length === 0) {
      wrap.appendChild(el('p', { class: 'empty', text: t('emptyPeople') }));
    } else {
      var ul = el('ul', { class: 'list' });
      list.forEach(function (p) {
        var li = el('li', { class: 'list-row' });
        var who = el('div', { class: 'who' });
        who.appendChild(el('strong', { text: p.name }));
        if (p.contact) who.appendChild(el('span', { class: 'muted', text: ' · ' + p.contact.value }));
        li.appendChild(who);
        var rm = el('button', { class: 'btn btn-ghost', type: 'button', aria: 'aria-label' });
        rm.setAttribute('aria-label', t('remove') + ': ' + p.name);
        rm.textContent = t('remove');
        rm.addEventListener('click', function () { removeParticipant(p.id); });
        li.appendChild(rm);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      wrap.appendChild(el('p', { class: 'muted', text: list.length + ' ' + t('participantCount') + ' / ' + L.MAX_PARTICIPANTS }));
    }
    return wrap;
  }

  // -- step 1: items -------------------------------------------------------

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function participantRoleText(p) {
    var active = (state.participantPreview.activeIds || []).indexOf(p.id) !== -1;
    if (!active) return '';
    return lang === 'en' ? 'detected' : 'đã nhận diện';
  }

  function buildParticipantStrip() {
    var strip = el('div', { class: 'people-strip', id: 'people-strip', role: 'list' });
    state.bill.participants.forEach(function (p) {
      var active = (state.participantPreview.activeIds || []).indexOf(p.id) !== -1;
      var fresh = (state.participantPreview.newIds || []).indexOf(p.id) !== -1;
      var chip = el('div', {
        class: 'person-chip' + (active ? ' is-active' : '') + (fresh ? ' is-new' : ''),
        role: 'listitem',
      });
      chip.setAttribute('data-person-id', p.id);
      chip.appendChild(el('span', { class: 'person-avatar', text: initials(p.name) }));
      var label = el('span', {});
      label.appendChild(el('span', { text: p.name }));
      var role = participantRoleText(p);
      if (role) label.appendChild(el('span', { class: 'person-role', text: ' · ' + role }));
      chip.appendChild(label);
      strip.appendChild(chip);
    });
    var plus = el('button', { class: 'people-add', type: 'button', text: '+' });
    plus.setAttribute('aria-label', lang === 'en' ? 'Add person manually' : 'Thêm người thủ công');
    plus.addEventListener('click', function () {
      var row = document.getElementById('manual-person-row');
      if (row) row.hidden = !row.hidden;
      var inp = document.getElementById('manual-person-input');
      if (row && !row.hidden && inp) try { inp.focus(); } catch (e) {}
    });
    strip.appendChild(plus);
    return strip;
  }

  function renderParticipantStrip() {
    var current = document.getElementById('people-strip');
    if (!current || !current.parentNode) return;
    var next = buildParticipantStrip();
    current.parentNode.replaceChild(next, current);
  }

  function renderInlineCloudCtas() {
    // Cloud account/auth is a standalone-web capability today. The mini-app
    // host owns identity and needs an explicit host save/share contract before
    // these CTAs can be exposed there without becoming dead controls.
    if (MODE !== 'web' || !cloudClient()) return null;
    if (state.bill.items.length < 2) return null;
    var rail = el('div', { class: 'cta-rail' });
    var saved = !!cloudFullSession();
    var save = el('button', { class: 'cta-card', type: 'button' });
    save.appendChild(el('span', { class: 'cta-title', text: saved ? (lang === 'en' ? 'Saved to account' : 'Đã lưu vào tài khoản') : (lang === 'en' ? 'Save bill' : 'Lưu bill') }));
    save.appendChild(el('span', { class: 'cta-desc', text: saved ? (lang === 'en' ? 'Cloud sync is active' : 'Đồng bộ cloud đang bật') : (lang === 'en' ? 'Sign in / sign up to keep it' : 'Đăng nhập / tạo tài khoản để lưu lại') }));
    save.addEventListener('click', function () {
      if (cloudFullSession()) { pushBill(); return; }
      openAuthView('email');
    });
    var share = el('button', { class: 'cta-card', type: 'button' });
    share.appendChild(el('span', { class: 'cta-title', text: lang === 'en' ? 'Share bill' : 'Chia sẻ bill' }));
    share.appendChild(el('span', { class: 'cta-desc', text: saved ? (lang === 'en' ? 'Create a protected share link' : 'Tạo link chia sẻ có mã PIN') : (lang === 'en' ? 'Sign in / sign up to create a link' : 'Đăng nhập / tạo tài khoản để tạo link') }));
    share.addEventListener('click', function () {
      if (!cloudFullSession()) { openAuthView('email'); return; }
      state.cloud.shareTargetBillId = state.bill.id;
      state.cloud.sharePin = '';
      openAuthView('share-create');
    });
    rail.appendChild(save);
    rail.appendChild(share);
    return rail;
  }

  function renderItems() {
    var wrap = el('section', { class: 'card' });
    wrap.appendChild(el('h2', { text: lang === 'en' ? 'Add expenses' : 'Nhập các khoản chi' }));
    wrap.appendChild(el('p', { class: 'hint', text: lang === 'en'
      ? 'Type naturally. People are detected and added automatically; you can still add someone manually.'
      : 'Gõ tự nhiên. Người tham gia sẽ được nhận diện và thêm tự động; bạn vẫn có thể thêm thủ công.' }));

    var titleLab = el('label', { class: 'field' });
    titleLab.appendChild(el('span', { text: t('billTitle') }));
    var titleInput = el('input', { id: 'bill-title', type: 'text', maxlength: '60' });
    titleInput.setAttribute('placeholder', t('billTitlePh'));
    titleInput.value = state.bill.title || '';
    titleInput.addEventListener('change', function () {
      state.bill.title = String(titleInput.value || '').slice(0, 60);
      touchBill();
    });
    titleLab.appendChild(titleInput);
    wrap.appendChild(titleLab);

    wrap.appendChild(el('strong', { text: lang === 'en' ? 'People' : 'Người tham gia' }));
    wrap.appendChild(buildParticipantStrip());

    var manualRow = el('div', { class: 'row', id: 'manual-person-row' });
    manualRow.hidden = true;
    manualRow.appendChild(el('span', { class: 'muted member-input-hint', text: lang === 'en'
      ? 'Add one person, or paste a list separated by commas / new lines.'
      : 'Thêm một người, hoặc dán danh sách cách nhau bằng dấu phẩy / xuống dòng.' }));
    var personInput = el('textarea', { id: 'manual-person-input', rows: '2', maxlength: '600' });
    personInput.setAttribute('placeholder', t('participantPlaceholder'));
    personInput.setAttribute('aria-label', lang === 'en' ? 'Add people' : 'Thêm người tham gia');
    var personAdd = el('button', { class: 'btn btn-secondary', type: 'button', text: t('participantAdd') });
    personAdd.addEventListener('click', function () { addPersonFromInput(personInput); });
    personInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addPersonFromInput(personInput); }
    });
    manualRow.appendChild(personInput);
    manualRow.appendChild(personAdd);
    wrap.appendChild(manualRow);

    var composer = el('div', { class: 'expense-composer' });
    var input = el('input', { id: 'item-input', type: 'text', maxlength: '160' });
    input.setAttribute('placeholder', t('itemPlaceholder'));
    input.setAttribute('aria-label', t('itemsTitle'));
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('enterkeyhint', 'done');
    var add = el('button', { class: 'btn btn-primary', type: 'button', text: t('itemAdd') });
    add.addEventListener('click', submitItemText);
    input.addEventListener('input', function () {
      // Clear previous highlight immediately, then light up only high-confidence
      // names from the current text. Newly discovered people animate in first.
      state.participantPreview = { activeIds: [], newIds: [] };
      updateParticipantPreview(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitItemText(); }
    });
    input.addEventListener('blur', function () {
      if (!input.value.trim()) clearParticipantPreview();
    });
    composer.appendChild(input);
    composer.appendChild(add);
    wrap.appendChild(composer);

    if (state.itemError) wrap.appendChild(el('p', { class: 'inline-error', role: 'alert', text: state.itemError }));

    var items = state.bill.items;
    if (items.length === 0) {
      wrap.appendChild(el('p', { class: 'empty', text: lang === 'en' ? 'No expenses yet — add the first one above.' : 'Chưa có khoản chi — nhập khoản đầu tiên ở trên.' }));
    } else {
      var total = items.reduce(function (a, it) { return a + it.amountVnd; }, 0);
      wrap.appendChild(el('p', { class: 'muted', text: t('totalSpent') + ': ' + L.formatVND(total, lang) + ' · ' + items.length + ' ' + t('itemCount') }));
      var ul = el('ul', { class: 'list' });
      items.forEach(function (it) {
        var shared = L.resolveItemSharedWith ? L.resolveItemSharedWith(it, state.bill.participants) : (it.sharedWith || []);
        var li = el('li', { class: 'list-row' });
        var main = el('div', { class: 'who' });
        main.appendChild(el('strong', { text: it.description }));
        main.appendChild(el('span', { class: 'muted', text: ' · ' + L.formatVND(it.amountVnd, lang) + ' · ' + personName(it.payerId) }));
        main.appendChild(el('span', { class: 'muted', text: ' · ' + (lang === 'en' ? 'split: ' : 'chia: ') + shared.map(personName).join(', ') }));
        li.appendChild(main);
        var itemActions = el('div', { class: 'item-actions' });
        var edit = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('edit') });
        edit.setAttribute('aria-label', t('edit') + ': ' + it.description);
        edit.addEventListener('click', function () { editItem(it.id); });
        var rm = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('remove') });
        rm.setAttribute('aria-label', t('remove') + ': ' + it.description);
        rm.addEventListener('click', function () { removeItem(it.id); });
        itemActions.appendChild(edit);
        itemActions.appendChild(rm);
        li.appendChild(itemActions);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }

    var cloudCtas = renderInlineCloudCtas();
    if (cloudCtas) wrap.appendChild(cloudCtas);

    if (items.length > 0) {
      var settle = el('button', { class: 'btn btn-primary', type: 'button', text: lang === 'en' ? 'Settle up' : 'Chốt sổ' });
      settle.addEventListener('click', function () { state.step = 1; render(); });
      wrap.appendChild(settle);
    }
    return wrap;
  }

  // -- manual multi-person confirmation sheet -------------------------------

  function wireSheetEscape(overlay) {
    if (!overlay || overlay._sheetWired) return;
    overlay._sheetWired = true;
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        state.askBack = null;
        state.participantBatch = null;
        overlay.hidden = true;
        overlay.textContent = '';
      }
    });
  }

  function participantBatchSelectionCount() {
    if (!state.participantBatch) return 0;
    return state.participantBatch.candidates.filter(function (c) { return c.selected; }).length;
  }

  function updateParticipantBatchControls() {
    if (!state.participantBatch) return;
    var remaining = Math.max(0, L.MAX_PARTICIPANTS - state.bill.participants.length);
    var count = participantBatchSelectionCount();
    var confirm = document.getElementById('batch-confirm');
    var error = document.getElementById('batch-error');
    if (confirm) {
      confirm.disabled = count > remaining;
      confirm.textContent = count > 0
        ? (lang === 'en' ? 'Add ' + count + ' people' : 'Thêm ' + count + ' người')
        : (lang === 'en' ? 'Done' : 'Xong');
    }
    if (error) {
      error.textContent = count > remaining
        ? (lang === 'en' ? 'You can add at most ' + remaining + ' more people.' : 'Bạn chỉ có thể thêm tối đa ' + remaining + ' người nữa.')
        : '';
    }
  }

  function cancelParticipantBatch() {
    var overlay = document.getElementById('sheet-overlay');
    var sourceId = state.participantBatch && state.participantBatch.sourceInputId;
    state.participantBatch = null;
    if (overlay) { overlay.hidden = true; overlay.textContent = ''; }
    var source = sourceId && document.getElementById(sourceId);
    try { if (source) source.focus(); } catch (e) {}
  }

  function confirmParticipantBatch() {
    var data = state.participantBatch;
    if (!data) return;
    var selected = data.candidates.filter(function (candidate) { return candidate.selected; });
    var remaining = Math.max(0, L.MAX_PARTICIPANTS - state.bill.participants.length);
    if (selected.length > remaining) {
      updateParticipantBatchControls();
      return;
    }

    // Validate atomically against the current list before mutating state.
    var staged = state.bill.participants.slice();
    for (var i = 0; i < selected.length; i++) {
      var r = L.addParticipant(staged, selected[i].input);
      if (r.error) {
        var err = document.getElementById('batch-error');
        if (err) err.textContent = personErrorText(r.error);
        return;
      }
      staged.push(r.participant);
    }

    var sourceId = data.sourceInputId;
    state.bill.participants = staged;
    state.participantBatch = null;
    state.peopleError = '';
    if (selected.length > 0) {
      touchBill();
    }
    render();
    var source = sourceId && document.getElementById(sourceId);
    try { if (source) source.focus(); } catch (e) {}
  }

  function renderParticipantBatch() {
    var overlay = document.getElementById('sheet-overlay');
    var data = state.participantBatch;
    if (!overlay || !data) return;
    overlay.hidden = false;
    overlay.textContent = '';

    var sheet = el('div', { class: 'sheet', role: 'dialog' });
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', lang === 'en' ? 'Confirm people' : 'Xác nhận người tham gia');
    sheet.appendChild(el('h2', { text: lang === 'en' ? 'Confirm people' : 'Xác nhận người tham gia' }));
    sheet.appendChild(el('p', { class: 'hint', text: lang === 'en'
      ? 'We detected a list. Uncheck anyone you do not want to add.'
      : 'Đã nhận diện dạng danh sách. Bỏ tick những người bạn không muốn thêm.' }));

    var remaining = Math.max(0, L.MAX_PARTICIPANTS - state.bill.participants.length);
    sheet.appendChild(el('p', { class: 'muted', text: lang === 'en'
      ? remaining + ' slots remaining in this bill.'
      : 'Bill còn ' + remaining + ' vị trí có thể thêm.' }));

    var list = el('fieldset', { class: 'member-batch-list', id: 'batch-members' });
    list.appendChild(el('legend', { text: lang === 'en' ? 'People to add' : 'Người sẽ thêm' }));
    data.candidates.forEach(function (candidate, idx) {
      var lab = el('label', { class: 'member-batch-option' });
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!candidate.selected;
      cb.value = String(idx);
      cb.addEventListener('change', function () {
        candidate.selected = !!cb.checked;
        updateParticipantBatchControls();
      });
      var copy = el('span', { class: 'member-batch-copy' });
      copy.appendChild(el('strong', { text: candidate.participant.name }));
      if (candidate.participant.contact) {
        copy.appendChild(el('span', { class: 'muted', text: candidate.participant.contact.value }));
      }
      lab.appendChild(cb);
      lab.appendChild(copy);
      list.appendChild(lab);
    });
    sheet.appendChild(list);

    if (data.rejected.length > 0) {
      var skipped = data.rejected.map(function (entry) {
        return entry.input + ' — ' + personErrorText(entry.error);
      }).join(' · ');
      sheet.appendChild(el('p', { class: 'muted', text: (lang === 'en' ? 'Skipped: ' : 'Bỏ qua: ') + skipped }));
    }

    sheet.appendChild(el('p', { class: 'inline-error', id: 'batch-error', role: 'alert', text: '' }));
    var actions = el('div', { class: 'row' });
    var ok = el('button', { class: 'btn btn-primary', id: 'batch-confirm', type: 'button', text: t('confirm') });
    ok.addEventListener('click', confirmParticipantBatch);
    var cancel = el('button', { class: 'btn btn-secondary', type: 'button', text: t('cancel') });
    cancel.addEventListener('click', cancelParticipantBatch);
    actions.appendChild(ok);
    actions.appendChild(cancel);
    sheet.appendChild(actions);
    overlay.appendChild(sheet);
    wireSheetEscape(overlay);
    updateParticipantBatchControls();
    try { ok.focus(); } catch (e) {}
  }

  // -- ask-back sheet ------------------------------------------------------

  function renderAskBack() {
    var overlay = document.getElementById('sheet-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    overlay.textContent = '';
    var data = state.askBack;
    var sheet = el('div', { class: 'sheet', role: 'dialog', aria: 'aria-modal' });
    sheet.setAttribute('aria-modal', 'true');
    var sheetTitle = data.editItemId
      ? (lang === 'en' ? 'Edit expense' : 'Sửa khoản chi')
      : (data.confirmAll
        ? (lang === 'en' ? 'Everyone joins this expense?' : 'Tất cả mọi người cùng tham gia khoản này?')
        : t('askBackTitle'));
    sheet.setAttribute('aria-label', sheetTitle);
    sheet.appendChild(el('h2', { text: sheetTitle }));
    if (data.confirmAll && !data.editItemId) {
      sheet.appendChild(el('p', { class: 'notice all-join-confirm', text: lang === 'en'
        ? 'No participant list was specified, so the default is everyone in the bill. Confirm or adjust it below. We only ask this once; later expenses use the same default automatically.'
        : 'Bạn chưa chỉ định ai cùng tham gia, nên mặc định là tất cả mọi người trong bill. Xác nhận hoặc chỉnh lại bên dưới. Chỉ hỏi lần đầu; các khoản tương tự sau sẽ tự dùng mặc định này.' }));
    } else {
      sheet.appendChild(el('p', { class: 'hint', text: data.editItemId
        ? (lang === 'en' ? 'You can change the payer and who joins this expense.' : 'Bạn có thể sửa người trả và những ai tham gia khoản này.')
        : t('askBackDesc') + ' ' + t('askBackNote') }));
    }
    if (!data.editItemId) sheet.appendChild(el('p', { class: 'quoted', text: '“' + data.text + '”' }));

    var missing = data.parsed.missing;

    var fDesc = el('label', { class: 'field' });
    fDesc.appendChild(el('span', { text: t('fieldDesc') + (missing.indexOf('description') !== -1 ? ' *' : '') }));
    var descInput = el('input', { id: 'ask-desc', type: 'text', maxlength: '120' });
    descInput.value = data.parsed.description || '';
    fDesc.appendChild(descInput);
    sheet.appendChild(fDesc);

    var fAmt = el('label', { class: 'field' });
    fAmt.appendChild(el('span', { text: t('fieldAmount') + (missing.indexOf('amount') !== -1 ? ' *' : '') }));
    var amtInput = el('input', { id: 'ask-amount', type: 'text', inputmode: 'numeric' });
    amtInput.setAttribute('placeholder', t('amountHint'));
    amtInput.value = data.parsed.amountVnd != null ? String(data.parsed.amountVnd) : '';
    fAmt.appendChild(amtInput);
    sheet.appendChild(fAmt);

    var fPayer = el('label', { class: 'field' });
    fPayer.appendChild(el('span', { text: t('fieldPayer') + (missing.indexOf('payer') !== -1 ? ' *' : '') }));
    var sel = el('select', { id: 'ask-payer' });
    state.bill.participants.forEach(function (p) {
      var o = el('option', { text: p.name });
      o.value = p.id;
      if (p.id === data.parsed.payerId) o.selected = true;
      sel.appendChild(o);
    });
    // Keep the control value explicit. Browsers infer it from selected
    // options, but deterministic state is safer for re-rendering and tests.
    sel.value = data.parsed.payerId || (state.bill.participants[0] && state.bill.participants[0].id) || '';
    fPayer.appendChild(sel);
    sheet.appendChild(fPayer);

    var fShared = el('fieldset', { class: 'field', id: 'ask-shared' });
    fShared.appendChild(el('legend', { text: data.confirmAll && !data.editItemId
      ? (lang === 'en' ? 'Who joins? · default: everyone' : 'Ai tham gia? · mặc định: tất cả')
      : t('fieldShared') }));
    state.bill.participants.forEach(function (p) {
      var lab = el('label', { class: 'chip' });
      var cb = el('input', { type: 'checkbox' });
      cb.value = p.id;
      cb.checked = data.parsed.sharedWith.indexOf(p.id) !== -1;
      lab.appendChild(cb);
      lab.appendChild(el('span', { text: p.name }));
      fShared.appendChild(lab);
    });
    sheet.appendChild(fShared);

    sheet.appendChild(el('p', { class: 'inline-error', id: 'ask-error', role: 'alert', text: '' }));

    var actions = el('div', { class: 'row' });
    var ok = el('button', { class: 'btn btn-primary', type: 'button', text: t('confirm') });
    ok.addEventListener('click', confirmAskBack);
    var no = el('button', { class: 'btn btn-secondary', type: 'button', text: t('cancel') });
    no.addEventListener('click', function () { state.askBack = null; overlay.hidden = true; overlay.textContent = ''; });
    actions.appendChild(ok);
    actions.appendChild(no);
    sheet.appendChild(actions);
    overlay.appendChild(sheet);
    try {
      wireSheetEscape(overlay);
      (descInput.value ? amtInput : descInput).focus();
    } catch (e) {}
  }

  function closeSheetIfOpen() {
    var overlay = document.getElementById('sheet-overlay');
    if (overlay && !state.askBack && !state.participantBatch) {
      overlay.hidden = true;
      overlay.textContent = '';
    }
  }

  // -- step 2: accounts ----------------------------------------------------

  function renderAccounts() {
    var wrap = el('section', { class: 'card' });
    wrap.appendChild(el('h2', { text: t('accountsTitle') }));
    wrap.appendChild(el('p', { class: 'hint', text: t('accountsHint') }));

    var brow = el('div', { class: 'row' });
    var rb = el('button', { class: 'btn btn-secondary', id: 'refresh-banks', type: 'button', text: t('refreshBanks') });
    rb.addEventListener('click', refreshBanks);
    brow.appendChild(rb);
    wrap.appendChild(brow);
    wrap.appendChild(el('p', { class: 'muted', id: 'banks-note', text: state.banksFlash || (state.banksSource === 'net' ? '' : t('banksOffline')) }));

    if (state.bill.participants.length === 0) {
      wrap.appendChild(el('p', { class: 'empty', text: t('emptyPeople') }));
      return wrap;
    }

    var grid = el('div', { class: 'accts' });
    state.bill.participants.forEach(function (p) {
      var acct = state.bill.accounts[p.id];
      var card = el('div', { class: 'acct' });
      var head = el('div', { class: 'acct-head' });
      head.appendChild(el('strong', { text: p.name }));
      if (acct && acct.account) {
        var masked = L.maskAccount(acct.account) + (acct.bankName ? ' · ' + acct.bankName : '') + ' · ' + (acct.source || 'text');
        head.appendChild(el('span', { class: 'pill', text: masked }));
      } else {
        head.appendChild(el('span', { class: 'pill pill-warn', text: lang === 'en' ? 'no account yet' : 'chưa có tài khoản' }));
      }
      card.appendChild(head);

      // Priority: wide VietQR paste.
      var pasteLab = el('label', { class: 'field' });
      pasteLab.appendChild(el('span', { text: t('pasteLabel') }));
      var ta = el('textarea', { id: 'qr-' + p.id, rows: '2', spellcheck: 'false' });
      ta.setAttribute('placeholder', '000201…6304XXXX');
      ta.setAttribute('aria-label', t('pasteLabel') + ': ' + p.name);
      ta.setAttribute('autocomplete', 'off');
      pasteLab.appendChild(ta);
      card.appendChild(pasteLab);
      var msg = state.qrState[p.id];
      var msgEl = el('p', { class: 'inline-note', id: 'qr-msg-' + p.id, text: msg ? msg.message : '' });
      if (msg) msgEl.setAttribute('data-kind', msg.kind);
      card.appendChild(msgEl);

      var rowBtns = el('div', { class: 'row' });
      var pasteBtn = el('button', { class: 'btn btn-primary', type: 'button', text: lang === 'en' ? 'Save VietQR' : 'Lưu VietQR' });
      (function (pid) {
        pasteBtn.addEventListener('click', function () { handlePasteQR(pid); });
      })(p.id);
      // Secondary: small scan CTA.
      var scanBtn = el('button', { class: 'btn btn-secondary btn-small', type: 'button', text: '◧ ' + t('scanCta') });
      (function (pid) {
        scanBtn.addEventListener('click', function () { handleScanQR(pid); });
      })(p.id);
      rowBtns.appendChild(pasteBtn);
      rowBtns.appendChild(scanBtn);
      card.appendChild(rowBtns);

      // Website: QR-image upload (on-device decode via the optional hook).
      // Never rendered in the mini-app bundle (hook is absent there).
      var web = webHook();
      if (web && web.decodeImage) {
        var up = el('div', { class: 'manual' });
        up.appendChild(el('span', { class: 'muted', text: t('uploadHint') }));
        var urow = el('div', { class: 'row' });
        var fileInput = el('input', { id: 'qrf-' + p.id, type: 'file' });
        fileInput.setAttribute('accept', 'image/*');
        fileInput.setAttribute('aria-label', t('uploadQR') + ': ' + p.name);
        var upBtn = el('button', { class: 'btn btn-secondary btn-small', type: 'button', text: '▦ ' + t('uploadQR') });
        (function (pid) {
          upBtn.addEventListener('click', function () { handleUploadQR(pid); });
        })(p.id);
        urow.appendChild(fileInput);
        urow.appendChild(upBtn);
        up.appendChild(urow);
        card.appendChild(up);
      }

      // Tertiary: manual account + bank.
      var man = el('div', { class: 'manual' });
      man.appendChild(el('span', { class: 'muted', text: t('manualLabel') }));
      var mrow = el('div', { class: 'row' });
      var acctInput = el('input', { id: 'acct-' + p.id, type: 'text', inputmode: 'numeric', maxlength: '19' });
      acctInput.setAttribute('placeholder', '123456789');
      acctInput.setAttribute('aria-label', t('manualLabel') + ': ' + p.name);
      if (acct && acct.account) acctInput.value = acct.account;
      var bankSel = el('select', { id: 'bank-' + p.id });
      bankSel.setAttribute('aria-label', 'Bank');
      var none = el('option', { text: lang === 'en' ? 'Auto-detect bank' : 'Tự nhận diện NH' });
      none.value = '';
      bankSel.appendChild(none);
      state.banks.forEach(function (b) {
        var o = el('option', { text: b.shortName + ' · ' + b.name });
        o.value = b.bin;
        if (acct && acct.bin === b.bin) o.selected = true;
        bankSel.appendChild(o);
      });
      mrow.appendChild(acctInput);
      mrow.appendChild(bankSel);
      man.appendChild(mrow);
      var saveMan = el('button', { class: 'btn btn-ghost', type: 'button', text: lang === 'en' ? 'Save account' : 'Lưu tài khoản' });
      (function (pid) {
        saveMan.addEventListener('click', function () { handleManualAccount(pid); });
      })(p.id);
      man.appendChild(saveMan);
      card.appendChild(man);

      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  // -- contextual payment setup inside settlement ----------------------------

  function renderTransferAccountEditor(pid) {
    var p = state.bill.participants.find(function (x) { return x.id === pid; });
    var acct = state.bill.accounts[pid];
    var box = el('div', { class: 'account-editor' });
    box.appendChild(el('strong', { text: lang === 'en'
      ? 'How should ' + (p ? p.name : pid) + ' receive money?'
      : (p ? p.name : pid) + ' nhận tiền bằng cách nào?' }));
    box.appendChild(el('p', { class: 'muted', text: lang === 'en'
      ? 'Optional. Enter this once and it will be reused for every transfer to this recipient.'
      : 'Không bắt buộc. Chỉ cần nhập một lần và sẽ dùng cho mọi khoản chuyển đến người này.' }));

    var pasteLab = el('label', { class: 'field' });
    pasteLab.appendChild(el('span', { text: t('pasteLabel') }));
    var ta = el('textarea', { id: 'qr-' + pid, rows: '2', spellcheck: 'false' });
    ta.setAttribute('placeholder', '000201…6304XXXX');
    pasteLab.appendChild(ta);
    box.appendChild(pasteLab);
    var msg = state.qrState[pid];
    var msgEl = el('p', { class: 'inline-note', id: 'qr-msg-' + pid, text: msg ? msg.message : '' });
    if (msg) msgEl.setAttribute('data-kind', msg.kind);
    box.appendChild(msgEl);

    var qrow = el('div', { class: 'row' });
    var saveQr = el('button', { class: 'btn btn-secondary', type: 'button', text: lang === 'en' ? 'Use VietQR' : 'Dùng VietQR' });
    saveQr.addEventListener('click', function () { handlePasteQR(pid); });
    var scan = el('button', { class: 'btn btn-ghost', type: 'button', text: '◧ ' + t('scanCta') });
    scan.addEventListener('click', function () { handleScanQR(pid); });
    qrow.appendChild(saveQr);
    qrow.appendChild(scan);
    box.appendChild(qrow);

    var web = webHook();
    if (web && web.decodeImage) {
      var upRow = el('div', { class: 'row' });
      var fi = el('input', { id: 'qrf-' + pid, type: 'file' });
      fi.setAttribute('accept', 'image/*');
      var up = el('button', { class: 'btn btn-ghost', type: 'button', text: t('uploadQR') });
      up.addEventListener('click', function () { handleUploadQR(pid); });
      upRow.appendChild(fi);
      upRow.appendChild(up);
      box.appendChild(upRow);
    }

    box.appendChild(el('span', { class: 'muted', text: lang === 'en' ? 'or enter bank + account' : 'hoặc nhập ngân hàng + số tài khoản' }));
    var bankTools = el('div', { class: 'row' });
    var refreshId = 'refresh-banks-' + pid;
    var noteId = 'banks-note-' + pid;
    var refresh = el('button', { class: 'btn btn-ghost btn-small', id: refreshId, type: 'button', text: t('refreshBanks') });
    refresh.addEventListener('click', function () { refreshBanks(refreshId, noteId); });
    bankTools.appendChild(refresh);
    bankTools.appendChild(el('span', { class: 'muted', id: noteId, text: state.banksFlash || '' }));
    box.appendChild(bankTools);
    var mrow = el('div', { class: 'row' });
    var acctInput = el('input', { id: 'acct-' + pid, type: 'text', inputmode: 'numeric', maxlength: '19' });
    acctInput.setAttribute('placeholder', lang === 'en' ? 'Account number' : 'Số tài khoản');
    if (acct && acct.account) acctInput.value = acct.account;
    var bankSel = el('select', { id: 'bank-' + pid });
    var none = el('option', { text: lang === 'en' ? 'Choose bank' : 'Chọn ngân hàng' });
    none.value = '';
    bankSel.appendChild(none);
    state.banks.forEach(function (b) {
      var o = el('option', { text: b.shortName + ' · ' + b.name });
      o.value = b.bin;
      if (acct && acct.bin === b.bin) o.selected = true;
      bankSel.appendChild(o);
    });
    mrow.appendChild(bankSel);
    mrow.appendChild(acctInput);
    box.appendChild(mrow);
    var saveManual = el('button', { class: 'btn btn-ghost', type: 'button', text: lang === 'en' ? 'Save payment info' : 'Lưu thông tin nhận tiền' });
    saveManual.addEventListener('click', function () { handleManualAccount(pid); });
    box.appendChild(saveManual);
    return box;
  }

  function groupTransfersByRecipient(transfers) {
    var groups = [];
    var byRecipient = {};
    (transfers || []).forEach(function (tr) {
      var group = byRecipient[tr.toId];
      if (!group) {
        group = { toId: tr.toId, transfers: [], totalVnd: 0 };
        byRecipient[tr.toId] = group;
        groups.push(group);
      }
      group.transfers.push(tr);
      group.totalVnd += tr.amountVnd;
    });
    return groups;
  }

  function renderTransferPaymentDetails(tr) {
    var frag = el('div', { class: 'transfer-payment' });
    if (!tr.vietqrPayload) return frag;

    var qrFallback = el('div', { class: 'qr-ph', role: 'img' });
    qrFallback.setAttribute('aria-label', t('qrPlaceholder') + ': ' + personName(tr.toId) + ' ' + L.formatVND(tr.amountVnd, lang));
    qrFallback.appendChild(el('span', { text: '▦▦▦' }));
    qrFallback.appendChild(el('small', { text: t('qrPlaceholder') }));

    var renderedImage = false;
    var acct = state.bill.accounts[tr.toId];
    var hook = webHook();
    if (MODE === 'web' && hook && hook.vietQrImageUrl && acct && acct.bin && acct.account) {
      var imageUrl = hook.vietQrImageUrl({
        bin: acct.bin,
        account: acct.account,
        amountVnd: tr.amountVnd,
        description: 'Split bill ' + personName(tr.fromId),
      });
      if (imageUrl) {
        var img = el('img', { class: 'vietqr-image' });
        img.setAttribute('src', imageUrl);
        img.setAttribute('alt', (lang === 'en' ? 'VietQR to pay ' : 'VietQR chuyển ') + personName(tr.toId) + ' · ' + L.formatVND(tr.amountVnd, lang));
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('referrerpolicy', 'no-referrer');
        qrFallback.hidden = true;
        img.addEventListener('error', function () {
          img.hidden = true;
          qrFallback.hidden = false;
        });
        frag.appendChild(img);
        frag.appendChild(qrFallback);
        renderedImage = true;
      }
    }
    if (!renderedImage) frag.appendChild(qrFallback);

    frag.appendChild(el('p', { class: 'muted', text: t('payloadLabel') + ': ' + tr.vietqrPayload.slice(0, 24) + '…' + tr.vietqrPayload.slice(-8) }));
    var copyRow = el('div', { class: 'row' });
    var ro = el('input', { type: 'text', readonly: 'true' });
    ro.value = tr.vietqrPayload;
    ro.setAttribute('aria-label', t('payloadLabel'));
    ro.addEventListener('focus', function () { ro.select(); });
    var cp = el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Copy' });
    cp.addEventListener('click', function () {
      try { ro.select(); } catch (e) {}
      var done = false;
      try {
        if (document.execCommand) done = document.execCommand('copy');
      } catch (e) {}
      if (!done) {
        var n = document.getElementById('copy-note-' + tr.id);
        if (n) n.textContent = t('copied');
      }
    });
    copyRow.appendChild(ro);
    copyRow.appendChild(cp);
    frag.appendChild(copyRow);
    frag.appendChild(el('p', { class: 'muted', id: 'copy-note-' + tr.id, text: '' }));
    return frag;
  }

  // -- step 3: settle ------------------------------------------------------

  function renderSettle() {
    var wrap = el('section', { class: 'card' });
    wrap.appendChild(el('h2', { text: t('settleTitle') }));
    wrap.appendChild(el('p', { class: 'hint', text: lang === 'en'
      ? 'The shortest set of transfers to balance this bill.'
      : 'Các lần chuyển tối thiểu để cân bằng bill này.' }));

    if (state.bill.items.length === 0) {
      wrap.appendChild(el('p', { class: 'empty', text: t('needItemsFirst') }));
      var back = el('button', { class: 'btn btn-secondary', type: 'button', text: t('backToEdit') });
      back.addEventListener('click', function () { state.step = 0; render(); });
      wrap.appendChild(back);
      return wrap;
    }

    var bal = L.computeBalances(state.bill.items, state.bill.participants);
    var bList = el('ul', { class: 'list' });
    state.bill.participants.forEach(function (p) {
      var v = bal.net[p.id] || 0;
      var li = el('li', { class: 'list-row' });
      li.appendChild(el('span', { text: p.name }));
      var amt = el('strong', { text: (v >= 0 ? '+' : '−') + L.formatVND(Math.abs(v), lang).replace('-', '') });
      amt.setAttribute('data-sign', v > 0 ? 'pos' : (v < 0 ? 'neg' : 'zero'));
      li.appendChild(amt);
      bList.appendChild(li);
    });
    wrap.appendChild(bList);

    // Filter by person.
    var fRow = el('div', { class: 'row' });
    var fSel = el('select', { id: 'settle-filter' });
    fSel.setAttribute('aria-label', 'Filter');
    var all = el('option', { text: t('filterAll') });
    all.value = '';
    fSel.appendChild(all);
    state.bill.participants.forEach(function (p) {
      var o = el('option', { text: p.name });
      o.value = p.id;
      if (state.filterId === p.id) o.selected = true;
      fSel.appendChild(o);
    });
    fSel.addEventListener('change', function () { state.filterId = fSel.value; render(); });
    fRow.appendChild(fSel);

    var run = el('button', { class: 'btn btn-primary', type: 'button', text: state.settling ? t('duplicateTransferGuard') : t('settleRun') });
    if (state.settling) run.disabled = true;
    run.addEventListener('click', runSettle);
    fRow.appendChild(run);
    wrap.appendChild(fRow);

    var list = state.transfers.filter(function (tr) {
      if (!state.filterId) return true;
      return tr.fromId === state.filterId || tr.toId === state.filterId;
    });

    if (state._settledOnce) {
      var hero = el('div', { class: 'settle-hero' });
      hero.appendChild(el('p', { class: 'settle-count', text: state.transfers.length === 0
        ? (lang === 'en' ? 'Already balanced' : 'Đã cân bằng')
        : (lang === 'en' ? state.transfers.length + ' transfer' + (state.transfers.length > 1 ? 's' : '') + ' needed' : 'Cần ' + state.transfers.length + ' lần chuyển') }));
      var recipientCount = groupTransfersByRecipient(state.transfers).length;
      hero.appendChild(el('span', { class: 'muted', text: lang === 'en'
        ? recipientCount + ' recipient' + (recipientCount === 1 ? '' : 's') + ' need to receive money. Payment info is entered once per recipient.'
        : recipientCount + ' người cần nhận tiền. Thông tin nhận tiền chỉ nhập một lần cho mỗi người.' }));
      wrap.appendChild(hero);
    }

    if (state.transfers.length === 0) {
      // Not computed yet, or balanced.
      if (state._settledOnce) {
        wrap.appendChild(el('p', { class: 'empty', text: t('noTransfers') }));
      }
    } else if (list.length === 0) {
      wrap.appendChild(el('p', { class: 'empty', text: t('noTransfers') }));
    } else {
      var groups = groupTransfersByRecipient(list);
      var groupList = el('div', { class: 'recipient-settlements' });
      groups.forEach(function (group) {
        var recipient = personName(group.toId);
        var card = el('section', { class: 'recipient-settlement' });
        card.setAttribute('data-recipient-id', group.toId);

        var head = el('div', { class: 'recipient-head' });
        var summary = el('div', {});
        summary.appendChild(el('strong', { text: lang === 'en' ? recipient + ' receives' : recipient + ' nhận tiền' }));
        summary.appendChild(el('span', { class: 'muted', text: lang === 'en'
          ? group.transfers.length + ' transfer' + (group.transfers.length === 1 ? '' : 's')
          : group.transfers.length + ' khoản chuyển' }));
        head.appendChild(summary);
        head.appendChild(el('strong', { text: L.formatVND(group.totalVnd, lang) }));
        card.appendChild(head);

        var acct = state.bill.accounts[group.toId];
        if (acct && acct.account) {
          card.appendChild(el('p', { class: 'recipient-account muted', text: (acct.bankName || '') + ' · ' + L.maskAccount(acct.account) }));
        } else {
          card.appendChild(renderTransferAccountEditor(group.toId));
        }

        var transfers = el('ul', { class: 'list recipient-transfers' });
        group.transfers.forEach(function (tr) {
          var li = el('li', { class: 'transfer' });
          var top = el('div', { class: 'transfer-top' });
          top.appendChild(el('strong', { text: personName(tr.fromId) + ' → ' + recipient }));
          top.appendChild(el('strong', { text: L.formatVND(tr.amountVnd, lang) }));
          li.appendChild(top);
          li.appendChild(renderTransferPaymentDetails(tr));
          transfers.appendChild(li);
        });
        card.appendChild(transfers);
        groupList.appendChild(card);
      });
      wrap.appendChild(groupList);
    }

    var postCtas = renderInlineCloudCtas();
    if (postCtas) wrap.appendChild(postCtas);

    var back2 = el('button', { class: 'btn btn-secondary', type: 'button', text: t('backToEdit') });
    back2.addEventListener('click', function () { state.step = 0; persistBill(); render(); });
    wrap.appendChild(back2);
    return wrap;
  }

  // Wrap runSettle to mark settled-once for the empty state.
  var _runSettle = runSettle;
  runSettle = function () {
    state._settledOnce = true;
    _runSettle();
  };

  // ---------------------------------------------------------------------------
  // Static wiring
  // ---------------------------------------------------------------------------

  function wireStatic() {
    var langBtn = document.getElementById('lang-toggle');
    if (langBtn) langBtn.addEventListener('click', function () { setLang(lang === 'vi' ? 'en' : 'vi'); });
    var trackingAccept = document.getElementById('tracking-consent-accept');
    var trackingReject = document.getElementById('tracking-consent-reject');
    if (trackingAccept) trackingAccept.addEventListener('click', function () { chooseTrackingConsent(true); });
    if (trackingReject) trackingReject.addEventListener('click', function () { chooseTrackingConsent(false); });
    var overlay = document.getElementById('sheet-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { state.askBack = null; overlay.hidden = true; overlay.textContent = ''; }
      });
    }
    // Auth overlay: every view dismisses normally (non-blocking by design).
    var authOverlay = document.getElementById('auth-overlay');
    if (authOverlay && !authOverlay._wired) {
      authOverlay._wired = true;
      authOverlay.addEventListener('click', function (e) {
        if (e.target === authOverlay) closeAuth();
      });
      authOverlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAuth();
      });
    }
    // Reduce motion: token transform on the same tree (0 duration/travel).
    try {
      var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq) {
        var apply = function () { document.documentElement.setAttribute('data-motion', mq.matches ? 'reduced' : 'full'); };
        apply();
        if (mq.addEventListener) mq.addEventListener('change', apply);
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wireStatic(); boot(); });
  } else {
    wireStatic();
    boot();
  }
})();

/*# sourceURL=split-bill-bundle (mini-app) */
