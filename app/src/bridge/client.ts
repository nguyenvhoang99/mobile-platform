import { handleBridgeRequest } from './handler';
import { gate1Declaration } from './gates';
import { findCapability } from './registry';
import { validateExtractBillArgs } from './handlers/aiExtractBill';
import type { BillExtraction, ExtractBillArgs } from './handlers/aiExtractBill';
export type { BillExtraction } from './handlers/aiExtractBill';
import type { BridgeResult, BridgeSession, ConsentRecord, QuotaState } from './types';

/** First-party RN demo facade. This is not a WebView security boundary. */
export type BridgeClient = {
  storageGet(key: string): Promise<BridgeResult<{ value: string | null }>>;
  storageSet(key: string, value: string): Promise<BridgeResult<{ ok: true }>>;
  storageDelete(key: string): Promise<BridgeResult<{ ok: true }>>;
  extractBill(args: ExtractBillArgs): Promise<BridgeResult<BillExtraction>>;
};

export type BridgeClientOptions = {
  session: BridgeSession;
  manifestCapabilities: readonly string[];
  /** Host-owned consent UI; never passed to mini-app code. Return null on decline. */
  requestConsent?: (capability: string) => Promise<ConsentRecord | null>;
};

export function createBridgeClient(options: BridgeClientOptions): BridgeClient & { dispose(): void } {
  const session = Object.freeze({ ...options.session });
  const manifestCapabilities = Object.freeze([...options.manifestCapabilities]);
  const buckets = new Map<string, QuotaState>();
  let active = true;
  let sequence = 0;
  async function call<T>(capability: string, args: Record<string, unknown>): Promise<BridgeResult<T>> {
    if (!active) return { ok: false, data: null, error: 'REVOKED', message: 'Session ended' };
    const definition = findCapability(capability);
    // Run G1 before prompting: never spend consent on an undeclared/under-tier call.
    const g1 = gate1Declaration(session, capability, manifestCapabilities);
    let consentRecord: ConsentRecord | null = null;
    if (g1.pass && capability === 'ai.extract_bill') {
      try { validateExtractBillArgs(args); } catch {
        return { ok: false, data: null, error: 'INVALID_ARGUMENT', message: 'Invalid argument' };
      }
    }
    if (g1.pass && definition?.consent !== 'none' && options.requestConsent) {
      try { consentRecord = await options.requestConsent(capability); } catch { /* declined */ }
    }
    if (!active) return { ok: false, data: null, error: 'REVOKED', message: 'Session ended' };
    const nowMs = Date.now();
    let quotaBucket = buckets.get(capability);
    if (!quotaBucket) {
      quotaBucket = { tokens: definition?.quota.burst ?? 0, lastRefillMs: nowMs };
      buckets.set(capability, quotaBucket);
    }
    const result = await handleBridgeRequest({
      id: `host-${++sequence}`, capability, operation: 'call', version: definition?.version ?? 1, args,
    }, { session, manifestCapabilities, consentRecord, osState: 'not_required', quotaBucket, nowMs });
    if (!active) return { ok: false, data: null, error: 'REVOKED', message: 'Session ended' };
    return result as BridgeResult<T>;
  }
  return {
    dispose() { active = false; buckets.clear(); },
    storageGet: key => call('storage.kv', { op: 'get', key }),
    storageSet: (key, value) => call('storage.kv', { op: 'set', key, value }),
    storageDelete: key => call('storage.kv', { op: 'delete', key }),
    extractBill: args => call('ai.extract_bill', { ...args }),
  };
}
