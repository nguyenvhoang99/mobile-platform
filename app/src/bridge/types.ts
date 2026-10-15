/**
 * Bridge call contract — single door from untrusted mini-app JS to device.
 * Identity is NEVER in the payload (native derives from bound session + origin).
 * Every resource is a host-minted handle, never a caller-constructed name.
 */

// ── Error enum — closed, never strings (native-capability) ───────────────
// Two distinctions must never collapse: consentDenied vs permanently, osDenied vs permanently.
export type BridgeErrorCode =
  | 'SUCCESS'
  | 'CAPABILITY_NOT_DECLARED' // G1
  | 'CAPABILITY_NOT_GRANTED' // G1 tier
  | 'CONSENT_REQUIRED'
  | 'CONSENT_DENIED'
  | 'CONSENT_DENIED_PERMANENTLY'
  | 'OS_DENIED'
  | 'OS_DENIED_PERMANENTLY'
  | 'RATE_LIMITED'
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'REVOKED'
  | 'UNCERTAIN' // cancellation that may have landed
  | 'UNAVAILABLE' // device/model cannot perform this op (e.g. no on-device LLM) — build a fallback, do not retry blindly
  | 'INTERNAL';

export type BridgeResult<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: BridgeErrorCode; message: string; retryAfterMs?: number };

// ── Request envelope — no identity fields (C3) ────────────────────────────
// Native derives appId/origin/user from the WebView bound session.
export type BridgeRequest = {
  id: string; // per-call UUID for tracing
  capability: string; // e.g. "storage.get"
  operation: string; // e.g. "get"
  version: number;
  args: Record<string, unknown>; // validated against operation schema; unknown fields rejected
};

// ── Native session — derived, not supplied ────────────────────────────────
export type BridgeTier = 'sandbox' | 'self_serve' | 'partner_verified' | 'first_party';

export type BridgeSession = {
  tier?: BridgeTier; // Missing trusted tier fails closed to sandbox.
  appId: string;
  tenantId: string;
  userId: string; // per-(tenant, appId, user) pseudonymous — never the platform vendor ID
  origin: string;
  isMainFrame: boolean;
};

// ── Consent & permission ──────────────────────────────────────────────────
export type ConsentScope = 'once' | 'while_using' | 'session' | 'persistent';
export type ConsentRecord = {
  capability: string;
  scope: ConsentScope;
  grantedAt: number;
  expiresAt: number | null; // null = persistent until revoked
};

// ── Quota ─────────────────────────────────────────────────────────────────
export type QuotaState = {
  tokens: number;
  lastRefillMs: number;
};

// ── Audit ─────────────────────────────────────────────────────────────────
export type AuditRecord = {
  seq: number;
  at: string;
  capability: string;
  operation: string;
  version: number;
  appId: string;
  tenantId: string;
  gate1: 'pass' | 'fail';
  gate2: 'pass' | 'fail' | 'prompted';
  gate3: 'pass' | 'fail' | 'not_required';
  error: BridgeErrorCode | null;
  durationMs: number;
  argsDigest: string; // hash, never raw args
  prevHash: string; // hash chain
  hash: string;
};
