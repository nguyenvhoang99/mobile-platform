import { handleBridgeRequest, registerHandler } from '../handler';
import { registerAllHandlers } from '../register';
import { resetAudit, getAuditRecords } from '../audit';
import { __clearStorage } from '../handlers/storageKv';
import { __clearNotify } from '../handlers/notifySubscribe';
import type { BridgeRequest, BridgeSession } from '../types';

const session: BridgeSession = {
  appId: 'weather',
  tenantId: 'vn-hn',
  userId: 'u-test',
  origin: 'mini://weather',
  isMainFrame: true,
};

function req(partial: Partial<BridgeRequest> & { capability: string }): BridgeRequest {
  return {
    id: 'test-id',
    operation: 'call',
    version: 1,
    args: {},
    ...partial,
  };
}

beforeAll(() => {
  registerAllHandlers(['api.weather.local']);
});

beforeEach(() => {
  resetAudit();
  __clearStorage();
  __clearNotify();
});

describe('bridge handler — 10-step order & guarantees', () => {
  it('G1: rejects undeclared capability', async () => {
    const res = await handleBridgeRequest(req({ capability: 'scanner.scan', args: {} }), {
      session,
      manifestCapabilities: ['storage.kv'], // not declared
      consentRecord: null,
      osState: 'not_required',
      quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
      nowMs: Date.now(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('CAPABILITY_NOT_DECLARED');
  });

  it('B7: emits audit before reply, B6: exactly one terminal reply', async () => {
    const before = getAuditRecords().length;
    const res = await handleBridgeRequest(req({ capability: 'storage.kv', args: { op: 'keys' } }), {
      session,
      manifestCapabilities: ['storage.kv'],
      consentRecord: null,
      osState: 'not_required',
      quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
      nowMs: Date.now(),
    });
    expect(res.ok).toBe(true);
    expect(getAuditRecords().length).toBe(before + 1);
  });

  it('storage.kv set/get round-trips per (tenant,appId,user) namespace', async () => {
    const ctx = {
      session,
      manifestCapabilities: ['storage.kv'],
      consentRecord: null,
      osState: 'not_required' as const,
      quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
      nowMs: Date.now(),
    };
    const set = await handleBridgeRequest(req({ capability: 'storage.kv', args: { op: 'set', key: 'k', value: 'v' } }), ctx);
    expect(set.ok).toBe(true);
    const get = await handleBridgeRequest(req({ capability: 'storage.kv', args: { op: 'get', key: 'k' } }), {
      ...ctx,
      quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
    });
    expect(get.ok && (get.data as { value: string }).value).toBe('v');
  });

  it('net.request rejects host not in manifest egress list', async () => {
    const res = await handleBridgeRequest(
      req({ capability: 'net.request', args: { url: 'https://evil.com/data' } }),
      {
        session,
        manifestCapabilities: ['net.request'],
        consentRecord: null,
        osState: 'not_required',
        quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
        nowMs: Date.now(),
      },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('INVALID_ARGUMENT');
  });

  it('quota: returns RATE_LIMITED with retryAfterMs', async () => {
    const res = await handleBridgeRequest(req({ capability: 'storage.kv', args: { op: 'keys' } }), {
      session,
      manifestCapabilities: ['storage.kv'],
      consentRecord: null,
      osState: 'not_required',
      quotaBucket: { tokens: 0, lastRefillMs: Date.now() },
      nowMs: Date.now(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('RATE_LIMITED');
  });

  it('G2: consent required for scanner.scan', async () => {
    const res = await handleBridgeRequest(req({ capability: 'scanner.scan', args: {} }), {
      session,
      manifestCapabilities: ['scanner.scan'],
      consentRecord: null,
      osState: 'not_required',
      quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
      nowMs: Date.now(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('CONSENT_REQUIRED');
  });

  it('B6: timeout produces terminal error, not silence', async () => {
    registerHandler('test.slow', async (_session, _args) => {
      await new Promise<void>(resolve => setTimeout(resolve, 5000));
      return { x: 1 };
    });
    const res = await handleBridgeRequest(req({ capability: 'test.slow', args: {} }), {
      session,
      manifestCapabilities: ['test.slow'],
      consentRecord: null,
      osState: 'not_required',
      quotaBucket: { tokens: 10, lastRefillMs: Date.now() },
      nowMs: Date.now(),
    });
    // Either INTERNAL (TIMEOUT sanitized) or TIMEOUT mapped — must be terminal, not hang
    expect(res.ok).toBe(false);
  });
});
