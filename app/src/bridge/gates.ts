/**
 * Three gates, never collapsible, in mandatory order G1 → G2 → G3.
 * These host PoC checks are not native transport enforcement.
 *
 * This module is pure (no I/O) so it can be unit-tested and audited.
 */

import type { BridgeSession, ConsentRecord, ConsentScope } from './types';
import { findCapability } from './registry';

// ── G1: declaration + review grant ───────────────────────────────────────
// MVP: manifestCapabilities is the set declared in the signed manifest.
// Store grant is the same set filtered by tier (we assume store already did tier filtering).

export function gate1Declaration(
  session: BridgeSession,
  capability: string,
  manifestCapabilities: readonly string[],
): { pass: true } | { pass: false; error: 'CAPABILITY_NOT_DECLARED' | 'CAPABILITY_NOT_GRANTED' } {
  if (!manifestCapabilities.includes(capability)) {
    return { pass: false, error: 'CAPABILITY_NOT_DECLARED' };
  }
  // Registry must contain it (R1) — if not, treat as not declared (fail closed)
  if (!findCapability(capability)) {
    return { pass: false, error: 'CAPABILITY_NOT_DECLARED' };
  }
  const tiers = ['sandbox', 'self_serve', 'partner_verified', 'first_party'];
  if (tiers.indexOf(session.tier ?? 'sandbox') < tiers.indexOf(findCapability(capability)!.minTier)) {
    return { pass: false, error: 'CAPABILITY_NOT_GRANTED' };
  }
  return { pass: true };
}

// ── G2: runtime consent per mini-app ─────────────────────────────────────

export function gate2Consent(
  capability: string,
  scope: ConsentScope,
  existing: ConsentRecord | null,
  nowMs: number,
): { pass: true } | { pass: false; error: 'CONSENT_REQUIRED' | 'CONSENT_DENIED' | 'CONSENT_DENIED_PERMANENTLY' } {
  if (!existing || existing.capability !== capability || existing.scope !== scope ||
      !Number.isFinite(existing.grantedAt) || existing.grantedAt > nowMs) return { pass: false, error: 'CONSENT_REQUIRED' };
  if (existing.expiresAt !== null && (!Number.isFinite(existing.expiresAt) || nowMs >= existing.expiresAt)) {
    return { pass: false, error: 'CONSENT_REQUIRED' };
  }
  // MVP: consent records carry scope; persistent denial would be a separate record type.
  // We keep the enum honest for the contract (B3: distinct codes).
  return { pass: true };
}

// ── G3: OS permission per host app ───────────────────────────────────────
// MVP: all six capabilities are broker/host-owned and require no OS permission.
// This gate is still present in the order so adding a permission later cannot be forgotten.

export function gate3OsPermission(
  _capability: string,
  osState: 'granted' | 'denied' | 'denied_permanently' | 'not_required',
): { pass: true } | { pass: false; error: 'OS_DENIED' | 'OS_DENIED_PERMANENTLY' } {
  if (osState === 'denied') return { pass: false, error: 'OS_DENIED' };
  if (osState === 'denied_permanently') return { pass: false, error: 'OS_DENIED_PERMANENTLY' };
  return { pass: true };
}

// ── Quota: token bucket per mini-app per capability ──────────────────────

export type QuotaBucket = { tokens: number; lastRefillMs: number };

export function checkQuota(
  bucket: QuotaBucket,
  nowMs: number,
  cost: number,
  refillPerMinute: number,
  burst: number,
): { allowed: true; nextBucket: QuotaBucket } | { allowed: false; retryAfterMs: number; nextBucket: QuotaBucket } {
  const elapsedMin = Math.max(0, nowMs - bucket.lastRefillMs) / 60_000;
  const refilled = Math.min(burst, bucket.tokens + elapsedMin * refillPerMinute);
  if (refilled >= cost) {
    return { allowed: true, nextBucket: { tokens: refilled - cost, lastRefillMs: nowMs } };
  }
  const needed = cost - refilled;
  const retryAfterMs = Math.ceil((needed / refillPerMinute) * 60_000);
  return { allowed: false, retryAfterMs, nextBucket: { tokens: refilled, lastRefillMs: nowMs } };
}
