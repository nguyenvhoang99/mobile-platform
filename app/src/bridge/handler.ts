/**
 * Bridge handler — the 10-step order is the contract (bridge-wiring Step 2).
 * Each step assumes the previous ran; reordering breaks specific things.
 *
 * This file is the orchestrator; per-capability execution lives in handlers/*.
 * Every handler returns exactly one terminal reply (B6) and emits audit before reply (B7).
 */

import { validateExtractBillArgs } from './handlers/aiExtractBill';
import { BRIDGE_ROUND_TRIP_P95_MS } from '../config/budgets';
import { appendAudit } from './audit';
import { gate1Declaration, gate2Consent, gate3OsPermission, checkQuota } from './gates';
import { findCapability } from './registry';
import type { BridgeRequest, BridgeResult, BridgeSession, ConsentRecord, BridgeErrorCode } from './types';

// Handlers are pure functions: (session, args) => Promise<data>
// Identity is derived from session, never from args (C3).

export type HandlerFn = (session: BridgeSession, args: Record<string, unknown>) => Promise<unknown>;

export type HandlerContext = {
  session: BridgeSession;
  manifestCapabilities: readonly string[];
  consentRecord: ConsentRecord | null;
  osState: 'granted' | 'denied' | 'denied_permanently' | 'not_required';
  quotaBucket: { tokens: number; lastRefillMs: number };
  nowMs: number;
};

const handlers = new Map<string, HandlerFn>();

export function registerHandler(capability: string, fn: HandlerFn): void {
  handlers.set(capability, fn);
}

export function getHandler(capability: string): HandlerFn | undefined {
  return handlers.get(capability);
}

export function listHandlers(): string[] {
  return [...handlers.keys()];
}

/**
 * Execute a bridge request through the 10-step pipeline.
 * 1 identity (derived) 2 origin match 3 G1 4 arg validate 5 G2 6 G3 7 quota 8 execute 9 audit 10 reply
 */
export async function handleBridgeRequest(
  req: BridgeRequest,
  ctx: HandlerContext,
): Promise<BridgeResult<unknown>> {
  const started = Date.now();
  const capDef = findCapability(req.capability);
  const session = ctx.session;

  // Step 1-2: identity + origin — caller guarantees session is derived from WebView binding.
  // Origin mismatch is handled by the transport dropping (SEC_* log + terminate).
  // Here we assert main-frame (transport guarantees).
  if (!session.isMainFrame) {
    // Drop — return nothing is transport-level; here we fail closed with audit.
    const result: BridgeResult<unknown> = { ok: false, data: null, error: 'CAPABILITY_NOT_DECLARED', message: 'Not main frame' };
    appendAudit({
      capability: req.capability,
      operation: req.operation,
      version: req.version,
      appId: session.appId,
      tenantId: session.tenantId,
      gate1: 'fail',
      gate2: 'fail',
      gate3: 'not_required',
      error: result.error,
      durationMs: Date.now() - started,
      args: req.args,
    });
    return result;
  }

  // Step 3: G1 — is this capability declared + granted?
  const g1 = gate1Declaration(session, req.capability, ctx.manifestCapabilities);
  if (!g1.pass) {
    const res: BridgeResult<unknown> = { ok: false, data: null, error: g1.error, message: 'Capability not declared for this mini-app' };
    appendAudit({
      capability: req.capability,
      operation: req.operation,
      version: req.version,
      appId: session.appId,
      tenantId: session.tenantId,
      gate1: 'fail',
      gate2: 'fail',
      gate3: 'not_required',
      error: g1.error,
      durationMs: Date.now() - started,
      args: req.args,
    });
    return res;
  }

  // Step 4: arg validate — reject unknown fields (strict). Each handler has a schema.
  // Bounded envelope and operation fields are checked before any consent grant.
  if (typeof req.args !== 'object' || req.args === null || Array.isArray(req.args) ||
      req.version !== capDef!.version || req.operation !== 'call' ||
      !validArgs(req, capDef!.payloadCap) ||
      !Object.keys(req).every(key => ['id', 'capability', 'operation', 'version', 'args'].includes(key))) {
    const res: BridgeResult<unknown> = { ok: false, data: null, error: 'INVALID_ARGUMENT', message: 'Invalid request'  };
    appendAudit({
      capability: req.capability,
      operation: req.operation,
      version: req.version,
      appId: session.appId,
      tenantId: session.tenantId,
      gate1: 'pass',
      gate2: 'fail',
      gate3: 'not_required',
      error: 'INVALID_ARGUMENT',
      durationMs: Date.now() - started,
      args: req.args as Record<string, unknown>,
    });
    return res;
  }

  // Step 5: G2 — consent
  const cap = capDef!;
  if (cap.consent !== 'none') {
    const g2 = gate2Consent(req.capability, cap.consent as ConsentRecord['scope'], ctx.consentRecord, ctx.nowMs);
    if (!g2.pass) {
      const res: BridgeResult<unknown> = { ok: false, data: null, error: g2.error, message: 'Consent required' };
      appendAudit({
        capability: req.capability,
        operation: req.operation,
        version: req.version,
        appId: session.appId,
        tenantId: session.tenantId,
        gate1: 'pass',
        gate2: 'fail',
        gate3: 'not_required',
        error: g2.error,
        durationMs: Date.now() - started,
        args: req.args,
      });
      return res;
    }
  }

  // A once grant authorizes one attempted operation, including an unavailable result.
  if (cap.consent === 'once' && ctx.consentRecord) ctx.consentRecord.expiresAt = ctx.nowMs;

  // Step 6: G3 — OS permission, only now (never before G2 — would spend host prompt)
  const g3 = gate3OsPermission(req.capability, ctx.osState);
  if (!g3.pass) {
    const res: BridgeResult<unknown> = { ok: false, data: null, error: g3.error, message: 'OS permission denied' };
    appendAudit({
      capability: req.capability,
      operation: req.operation,
      version: req.version,
      appId: session.appId,
      tenantId: session.tenantId,
      gate1: 'pass',
      gate2: 'pass',
      gate3: 'fail',
      error: g3.error,
      durationMs: Date.now() - started,
      args: req.args,
    });
    return res;
  }

  // Step 7: quota
  const quota = checkQuota(ctx.quotaBucket, ctx.nowMs, 1, cap.quota.sustainedPerMinute, cap.quota.burst);
  Object.assign(ctx.quotaBucket, quota.nextBucket);
  if (!quota.allowed) {
    const res: BridgeResult<unknown> = {
      ok: false,
      data: null,
      error: 'RATE_LIMITED',
      message: 'Rate limited',
      retryAfterMs: quota.retryAfterMs,
    };
    appendAudit({
      capability: req.capability,
      operation: req.operation,
      version: req.version,
      appId: session.appId,
      tenantId: session.tenantId,
      gate1: 'pass',
      gate2: 'pass',
      gate3: 'pass',
      error: 'RATE_LIMITED',
      durationMs: Date.now() - started,
      args: req.args,
    });
    return res;
  }

  // Step 8: execute on background — with timeout, exactly one terminal reply (B6)
  const handler = handlers.get(req.capability);
  if (!handler) {
    const res: BridgeResult<unknown> = { ok: false, data: null, error: 'NOT_FOUND', message: 'No handler' };
    appendAudit({
      capability: req.capability,
      operation: req.operation,
      version: req.version,
      appId: session.appId,
      tenantId: session.tenantId,
      gate1: 'pass',
      gate2: 'pass',
      gate3: 'pass',
      error: 'NOT_FOUND',
      durationMs: Date.now() - started,
      args: req.args,
    });
    return res;
  }

  let data: unknown;
  let execError: BridgeResult<unknown> | null = null;
  try {
    // Most capabilities must answer within a frame budget; LLM-backed ones get a
    // provisional long deadline (unverified — baseline on device-lab before ratchet).
    const timeoutMs = CAPABILITY_TIMEOUT_MS[req.capability] ?? BRIDGE_ROUND_TRIP_P95_MS * 4;
    data = await withTimeout(handler(session, req.args), timeoutMs); // generous for MVP; real p95 is 16ms
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Never pass platform error through (template only) — map to closed enum (R3)
    const { code, sanitized } = classifyError(msg);
    execError = { ok: false, data: null, error: code, message: sanitized };
  }

  // Step 9: audit before reply (B7)
  const errorForAudit: BridgeErrorCode | null = execError ? execError.error : null;
  appendAudit({
    capability: req.capability,
    operation: req.operation,
    version: req.version,
    appId: session.appId,
    tenantId: session.tenantId,
    gate1: 'pass',
    gate2: 'pass',
    gate3: 'pass',
    error: errorForAudit,
    durationMs: Date.now() - started,
    args: req.args,
  });

  // Step 10: exactly one terminal reply
  if (execError) return execError;
  return { ok: true, data: data as unknown, error: null };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function classifyError(raw: string): { code: BridgeErrorCode; sanitized: string } {
  // Template — never leak paths/tokens. For MVP, map known messages to closed enum (R3).
  if (raw === 'TIMEOUT' || raw.includes('TIMEOUT')) return { code: 'TIMEOUT', sanitized: 'Operation timed out' };
  if (raw.startsWith('INVALID_ARGUMENT')) return { code: 'INVALID_ARGUMENT', sanitized: 'Invalid argument' };
  if (raw.includes('CAPABILITY_NOT_DECLARED')) return { code: 'CAPABILITY_NOT_DECLARED', sanitized: 'Capability not declared' };
  if (raw.startsWith('UNAVAILABLE')) return { code: 'UNAVAILABLE', sanitized: 'Not available on this device' };
  return { code: 'INTERNAL', sanitized: 'Internal error' };
}

// Per-capability execution deadlines (not budgets — no row in policy/budgets.md).
// LLM-backed ops cannot meet the frame-derived round trip; the value is provisional
// until device-lab baselines TTFT + total latency on reference hardware.
export const CAPABILITY_TIMEOUT_MS: Record<string, number> = {
  'ai.extract_bill': 30_000,
};

// Strict host-side PoC validation before consent; native transport must repeat it.
function validArgs(req: BridgeRequest, payloadCap: number): boolean {
  const fields: Record<string, readonly string[]> = {
    'storage.kv': ['op', 'key', 'value'], 'net.request': ['url', 'method'],
    'scanner.scan': ['mode'], 'location.current': ['precision'],
    'crypto.sign': ['challenge'], 'notify.subscribe': ['action'],
    'ai.extract_bill': ['locale', 'idempotencyKey', 'hint'],
  };
  try {
    if (Object.keys(req.args).some(key => !(fields[req.capability] ?? []).includes(key))) return false;
    if (unescape(encodeURIComponent(JSON.stringify(req.args))).length > payloadCap) return false;
    if (req.capability === 'ai.extract_bill') validateExtractBillArgs(req.args);
    return true;
  } catch { return false; }
}
