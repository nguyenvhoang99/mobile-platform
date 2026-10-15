/* eslint-disable no-bitwise */
import type { AuditRecord } from './types';

// Pure-JS hash for RN (no Node crypto). Not cryptographic; preserves chaining property.
function hashHex(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  // Expand to 64 hex chars by hashing again with a salt
  let out = hex;
  let salt = 0;
  while (out.length < 64) {
    let x = 0;
    for (let i = 0; i < input.length; i++) x = (x * 31 + input.charCodeAt(i) + salt) | 0;
    out += (x >>> 0).toString(16).padStart(8, '0');
    salt++;
  }
  return out.slice(0, 64);
}

/**
 * Append-only hash-chained audit log.
 * Carries capability/op/version, gate outcomes, error, duration, and an
 * args DIGEST (never raw args — log is regulator-readable).
 */

let seq = 0;
let prevHash = 'genesis';
const records: AuditRecord[] = [];

function digestArgs(args: Record<string, unknown>): string {
  try {
    return hashHex(JSON.stringify(args) ?? 'null').slice(0, 16);
  } catch {
    return hashHex('invalid-arguments').slice(0, 16);
  }
}

export function appendAudit(partial: {
  capability: string;
  operation: string;
  version: number;
  appId: string;
  tenantId: string;
  gate1: AuditRecord['gate1'];
  gate2: AuditRecord['gate2'];
  gate3: AuditRecord['gate3'];
  error: import('./types').BridgeErrorCode | null;
  durationMs: number;
  args: Record<string, unknown>;
}): AuditRecord {
  const argsDigest = digestArgs(partial.args);
  const at = new Date().toISOString();
  const nextSeq = ++seq;
  const body = JSON.stringify({
    seq: nextSeq,
    at,
    capability: partial.capability,
    operation: partial.operation,
    version: partial.version,
    appId: partial.appId,
    tenantId: partial.tenantId,
    gate1: partial.gate1,
    gate2: partial.gate2,
    gate3: partial.gate3,
    error: partial.error,
    durationMs: partial.durationMs,
    argsDigest,
    prevHash,
  });
  const hash = hashHex(body);
  const rec: AuditRecord = {
    seq: nextSeq,
    at,
    capability: partial.capability,
    operation: partial.operation,
    version: partial.version,
    appId: partial.appId,
    tenantId: partial.tenantId,
    gate1: partial.gate1,
    gate2: partial.gate2,
    gate3: partial.gate3,
    error: partial.error,
    durationMs: partial.durationMs,
    argsDigest,
    prevHash,
    hash,
  };
  prevHash = hash;
  records.push(rec);
  return rec;
}

export function getAuditRecords(): readonly AuditRecord[] {
  return records;
}

export function resetAudit(): void {
  seq = 0;
  prevHash = 'genesis';
  records.length = 0;
}
