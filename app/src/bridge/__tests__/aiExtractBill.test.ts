import { handleBridgeRequest, registerHandler, CAPABILITY_TIMEOUT_MS } from '../handler';
import { registerAllHandlers } from '../register';
import { resetAudit, getAuditRecords } from '../audit';
import { handleAiExtractBill } from '../handlers/aiExtractBill';
import { BRIDGE_ROUND_TRIP_P95_MS } from '../../config/budgets';
import type { BridgeRequest, BridgeSession, ConsentRecord } from '../types';

// Pilot use case: split-bill mini-app reads a payment screenshot and asks the
// host to extract bill fields. Pixels never cross the bridge — args carry only
// locale + idempotencyKey (+ optional short hint).

const session: BridgeSession = {
  appId: 'split-bill',
  tenantId: 'vn-hn',
  userId: 'u-pilot',
  origin: 'mini://split-bill',
  isMainFrame: true,
};

const consent: ConsentRecord = {
  capability: 'ai.extract_bill',
  scope: 'once',
  grantedAt: Date.now(),
  expiresAt: null,
};

function req(args: Record<string, unknown>): BridgeRequest {
  return { id: 'bill-test-id', capability: 'ai.extract_bill', operation: 'extract', version: 1, args };
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    session,
    manifestCapabilities: ['ai.extract_bill'],
    consentRecord: consent,
    osState: 'not_required' as const,
    quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
    nowMs: Date.now(),
    ...overrides,
  };
}

const validArgs = { locale: 'vi', idempotencyKey: 'bill-001' };

beforeAll(() => {
  registerAllHandlers(['api.weather.local']);
});

beforeEach(() => {
  resetAudit();
  // Production registration is unavailable until the native picker/model adapter ships.
  registerHandler('ai.extract_bill', handleAiExtractBill());
});

describe('ai.extract_bill pilot — bill screenshot use case', () => {
  it('happy path: returns schema-valid draft extraction with review flags', async () => {
    registerHandler('ai.extract_bill', handleAiExtractBill({
      adapter: async () => ({
        totalVnd: 150_000,
        currency: 'VND',
        paidAt: '2026-09-01T12:00:00Z',
        recipient: { name: 'Fixture Recipient', accountMasked: '****1234' },
        items: [{ label: 'Fixture item', amountVnd: 150_000 }],
        confidence: 'medium',
        needsReview: ['paidAt', 'recipient.name'],
        model: 'test-fixture',
      }),
    }));
    const res = await handleBridgeRequest(req(validArgs), ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as Record<string, unknown>;
    expect(data.currency).toBe('VND');
    expect(Number.isInteger(data.totalVnd)).toBe(true);
    expect(data.model).toBe('test-fixture');
    expect(Array.isArray(data.items)).toBe(true);
    // Untrusted draft: the mini-app must force user review.
    expect(Array.isArray(data.needsReview) && (data.needsReview as unknown[]).length > 0).toBe(true);
    expect(['high', 'medium', 'low']).toContain(data.confidence);
  });

  it('G1: undeclared capability is rejected', async () => {
    const res = await handleBridgeRequest(req(validArgs), ctx({ manifestCapabilities: ['storage.kv'] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('CAPABILITY_NOT_DECLARED');
  });

  it('G2: missing consent is rejected', async () => {
    const res = await handleBridgeRequest(req(validArgs), ctx({ consentRecord: null }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('CONSENT_REQUIRED');
  });

  it.each([
    ['bad locale', { locale: 'fr', idempotencyKey: 'bill-001' }],
    ['unknown field', { ...validArgs, foo: 1 }],
    ['image bytes smuggled in args', { ...validArgs, imageBytes: 'aGVsbG8=' }],
    ['filesystem path smuggled in args', { ...validArgs, filePath: '/tmp/shot.png' }],
    ['oversized hint', { ...validArgs, hint: 'x'.repeat(281) }],
    ['bad idempotency key', { ...validArgs, idempotencyKey: 'bill 001!!' }],
  ])('validation rejects %s with INVALID_ARGUMENT', async (_label, args) => {
    const res = await handleBridgeRequest(req(args as Record<string, unknown>), ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('INVALID_ARGUMENT');
  });

  it('quota exhausted returns RATE_LIMITED with retryAfterMs', async () => {
    const res = await handleBridgeRequest(
      req(validArgs),
      ctx({ quotaBucket: { tokens: 0, lastRefillMs: Date.now() } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('RATE_LIMITED');
      expect(typeof res.retryAfterMs).toBe('number');
    }
  });

  it('default handler returns UNAVAILABLE until native inference is wired', async () => {
    const res = await handleBridgeRequest(req(validArgs), ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('UNAVAILABLE');
  });

  it('malformed adapter output fails closed with INVALID_ARGUMENT', async () => {
    registerHandler(
      'ai.extract_bill',
      handleAiExtractBill({
        adapter: async () => ({
          totalVnd: 150000.5, // float VND — never authority, never returned
          currency: 'VND',
          paidAt: null,
          recipient: { name: null, accountMasked: null },
          items: [],
          confidence: 'high',
          needsReview: [],
          model: 'evil-mock',
        }),
      }),
    );
    const res = await handleBridgeRequest(req(validArgs), ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('INVALID_ARGUMENT');
  });

  it('B7: audit record carries digest, never raw bill PII', async () => {
    registerHandler('ai.extract_bill', handleAiExtractBill({
      adapter: async () => ({
        totalVnd: 150_000,
        currency: 'VND',
        paidAt: null,
        recipient: { name: 'Fixture Recipient', accountMasked: '****1234' },
        items: [{ label: 'Fixture item', amountVnd: 150_000 }],
        confidence: 'medium',
        needsReview: ['paidAt'],
        model: 'test-fixture',
      }),
    }));
    const res = await handleBridgeRequest(req(validArgs), ctx());
    expect(res.ok).toBe(true);
    const records = getAuditRecords();
    expect(records.length).toBe(1);
    expect(records[0].capability).toBe('ai.extract_bill');
    expect(records[0].error).toBeNull();
    expect(records[0].argsDigest).toMatch(/^[0-9a-f]{16}$/);
    // No raw prompt/output/PII in the regulator-readable log.
    expect(JSON.stringify(records)).not.toContain('Fixture Recipient');
    expect(JSON.stringify(records)).not.toContain('150000');
  });

  it('LLM deadline is provisional-long, not the frame-derived round trip', () => {
    expect(CAPABILITY_TIMEOUT_MS['ai.extract_bill']).toBe(30_000);
    expect(CAPABILITY_TIMEOUT_MS['ai.extract_bill']).toBeGreaterThan(BRIDGE_ROUND_TRIP_P95_MS * 4);
  });
});
