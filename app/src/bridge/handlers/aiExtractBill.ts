import type { HandlerFn } from '../handler';
import type { BridgeSession } from '../types';

// ── Bill extraction contract (pilot, v1) ────────────────────────────────────
// The mini-app NEVER sends image bytes or paths (C4). It sends locale +
// idempotencyKey (+ optional short hint). The host owns the image picker and
// runs on-device LLM natively; only derived fields cross the bridge.
// Amounts are integer VND (no floats — SKILLS §3.2). The result is an
// UNTRUSTED DRAFT: the mini-app must show a review screen with edit before
// creating any bill (money rule — extracted amounts are never authority).

export type BillItem = {
  label: string;
  amountVnd: number | null;
};

export type BillExtraction = {
  totalVnd: number | null;
  currency: 'VND';
  paidAt: string | null; // ISO 8601 or null when unreadable
  recipient: { name: string | null; accountMasked: string | null };
  items: BillItem[];
  confidence: 'high' | 'medium' | 'low';
  needsReview: string[]; // field keys the user must check
  model: string; // host-reported implementation identifier
};

export type ExtractBillArgs = {
  locale: 'vi' | 'en';
  idempotencyKey: string;
  hint?: string;
};

// ── Bounds (validated here AND natively — never trust one side) ────────────
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_HINT_CHARS = 280;
const MAX_ITEMS = 20;
const MAX_LABEL_CHARS = 120;
const MAX_NAME_CHARS = 120;
const MAX_MASKED_CHARS = 32;

// Args the bridge must refuse: anything carrying pixels or filesystem access.
const FORBIDDEN_ARG_KEYS = ['image', 'imageBytes', 'base64', 'path', 'filePath', 'uri', 'url'] as const;

function fail(message: string): never {
  throw new Error(`INVALID_ARGUMENT: ${message}`);
}

function asRecord(args: Record<string, unknown>): Record<string, unknown> {
  return args;
}

/** Deep arg validation — handler-owned (handler.ts only does the shallow check). */
export function validateExtractBillArgs(raw: Record<string, unknown>): ExtractBillArgs {
  const args = asRecord(raw);
  for (const key of Object.keys(args)) {
    if (!['locale', 'idempotencyKey', 'hint'].includes(key)) fail(`unknown field: ${key}`);
  }
  for (const forbidden of FORBIDDEN_ARG_KEYS) {
    if (forbidden in args) fail(`image/paths never cross the bridge: ${forbidden}`);
  }
  const { locale, idempotencyKey, hint } = args as {
    locale: unknown;
    idempotencyKey: unknown;
    hint?: unknown;
  };
  if (locale !== 'vi' && locale !== 'en') fail('locale must be vi|en');
  if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_RE.test(idempotencyKey)) {
    fail('idempotencyKey must match [A-Za-z0-9_-]{1,64}');
  }
  if (hint !== undefined && (typeof hint !== 'string' || hint.length > MAX_HINT_CHARS)) {
    fail(`hint must be a string <= ${MAX_HINT_CHARS} chars`);
  }
  return { locale, idempotencyKey, ...(hint === undefined ? {} : { hint }) };
}

function isIntegerVnd(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 999_999_999_999;
}

/** Response-shape guard — fail closed on malformed adapter output (adversarial by default). */
export function assertValidExtraction(value: unknown): asserts value is BillExtraction {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('extraction must be object');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['totalVnd', 'currency', 'paidAt', 'recipient', 'items', 'confidence', 'needsReview', 'model'].includes(key))) fail('unexpected extraction field');
  if (v.currency !== 'VND') fail('currency must be VND');
  if (v.totalVnd !== null && !isIntegerVnd(v.totalVnd)) fail('totalVnd must be integer VND or null');
  if (v.paidAt !== null && typeof v.paidAt !== 'string') fail('paidAt must be ISO string or null');
  if (typeof v.paidAt === 'string' && (v.paidAt.length > 40 || Number.isNaN(Date.parse(v.paidAt)))) {
    fail('paidAt must be parseable ISO 8601');
  }
  const recipient = v.recipient as Record<string, unknown> | null;
  if (typeof recipient !== 'object' || recipient === null || Array.isArray(recipient)) fail('recipient must be object');
  if (Object.keys(recipient).some(key => !['name', 'accountMasked'].includes(key))) fail('unexpected recipient field');
  if (recipient.name !== null && (typeof recipient.name !== 'string' || recipient.name.length > MAX_NAME_CHARS)) {
    fail('recipient.name bounded string or null');
  }
  if (
    recipient.accountMasked !== null &&
    (typeof recipient.accountMasked !== 'string' || recipient.accountMasked.length > MAX_MASKED_CHARS)
  ) {
    fail('recipient.accountMasked bounded string or null');
  }
  if (!Array.isArray(v.items) || v.items.length > MAX_ITEMS) fail(`items max ${MAX_ITEMS}`);
  for (const item of v.items as unknown[]) {
    const it = item as Record<string, unknown>;
    if (typeof it !== 'object' || it === null || Array.isArray(it)) fail('item must be object');
    if (Object.keys(it).some(key => !['label', 'amountVnd'].includes(key))) fail('unexpected item field');
    if (typeof it.label !== 'string' || it.label.length === 0 || it.label.length > MAX_LABEL_CHARS) {
      fail('item.label bounded non-empty string');
    }
    if (it.amountVnd !== null && !isIntegerVnd(it.amountVnd)) fail('item.amountVnd integer VND or null');
  }
  if (!['high', 'medium', 'low'].includes(v.confidence as string)) fail('confidence high|medium|low');
  if (!Array.isArray(v.needsReview) || v.needsReview.length > MAX_ITEMS ||
      v.needsReview.some(field => typeof field !== 'string' || field.length > MAX_LABEL_CHARS)) {
    fail('needsReview must be bounded field names');
  }
  if (typeof v.model !== 'string' || v.model.length === 0 || v.model.length > 32) fail('model bounded string');
}

// ── Adapter port ────────────────────────────────────────────────────────────
// Production: native on-device LLM behind the host image picker.
// Until that adapter is wired, the runtime must fail closed as unavailable.

export type BillExtractionAdapter = (
  session: Pick<BridgeSession, 'appId' | 'tenantId' | 'userId'>,
  args: ExtractBillArgs,
) => Promise<BillExtraction>;

/** Adapter reporting the model unavailable (device without on-device LLM). */
export function unavailableBillExtractionAdapter(): BillExtractionAdapter {
  return async () => {
    throw new Error('UNAVAILABLE: on-device LLM not available on this device');
  };
}

export type ExtractBillOptions = {
  adapter?: BillExtractionAdapter;
};

export function handleAiExtractBill(options: ExtractBillOptions = {}): HandlerFn {
  const adapter = options.adapter ?? unavailableBillExtractionAdapter();
  return async (session, rawArgs) => {
    const args = validateExtractBillArgs(rawArgs);
    let result: BillExtraction;
    try {
      result = await adapter({ appId: session.appId, tenantId: session.tenantId, userId: session.userId }, args);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('UNAVAILABLE')) throw new Error('UNAVAILABLE: model unavailable');
      throw e;
    }
    assertValidExtraction(result);
    return result;
  };
}
