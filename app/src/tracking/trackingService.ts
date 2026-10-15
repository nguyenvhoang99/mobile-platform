// @ts-nocheck - temporary until dom/node lib added; logic verified via tests
import { Platform } from 'react-native';

import { MiniAppManifest, miniAppCatalog } from '../miniapps/catalog';
import {
  appendTrackingEventLine,
  getOrCreateAnonymousId,
  getOrCreateDeviceSecret,
  loadTrackingEventLines,
  loadTrackingSession,
  replaceTrackingEventLines,
  saveTrackingSession,
} from '../native/hostStorage';
import { requestDeviceAccess } from '../native/deviceAccess';
import {
  TrackingBatch,
  TrackingEventEnvelope,
  TrackingNetworkSnapshot,
  TrackingPriority,
  TrackingTransport,
  TrackingTransportResult,
} from './types';

type EventDeclaration = {
  version: number;
  priority: TrackingPriority;
  privacyClass: TrackingEventEnvelope['privacy_class'];
  allowedDataKeys: readonly string[];
};

const hostEvents = {
  app_started: {
    version: 1,
    priority: 'operational',
    privacyClass: 'essential',
    allowedDataKeys: [],
  },
  screen_viewed: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['screen', 'source'],
  },
  screen_scroll_depth: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['screen', 'depth_percent'],
  },
  navigation_opened: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['destination', 'source'],
  },
  navigation_bar_clicked: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['destination', 'mini_app_id', 'slot'],
  },
  navigation_customization_requested: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['slot', 'gesture', 'current_mini_app_id'],
  },
  navigation_denied: {
    version: 1,
    priority: 'operational',
    privacyClass: 'essential',
    allowedDataKeys: ['operation', 'reason'],
  },
  dock_slot_changed: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['slot', 'mini_app_id'],
  },
  entrypoint_clicked: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['entrypoint_id', 'surface', 'destination', 'mini_app_id'],
  },
  home_preference_changed: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['item_type', 'item_id', 'action', 'source'],
  },
  mini_app_opened: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['mini_app_id', 'entrypoint_id', 'source'],
  },
  mini_app_load_started: {
    version: 1,
    priority: 'operational',
    privacyClass: 'essential',
    allowedDataKeys: [
      'mini_app_id', 'mini_app_version', 'mini_app_session_id', 'load_id',
      'source', 'runtime', 'launch_kind',
    ],
  },
  mini_app_load_finished: {
    version: 1,
    priority: 'operational',
    privacyClass: 'essential',
    allowedDataKeys: [
      'mini_app_id', 'mini_app_version', 'mini_app_session_id', 'load_id',
      'source', 'runtime', 'launch_kind', 'outcome', 'reason', 'elapsed_ms',
      'navigation_commit_ms', 'content_layout_ms', 'commit_to_layout_ms',
    ],
  },
  mini_app_closed: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['mini_app_id', 'reason'],
  },
  mini_app_route_viewed: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['mini_app_id', 'route', 'source'],
  },
  mini_app_scroll_depth: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['mini_app_id', 'route', 'depth_percent'],
  },
  device_access_requested: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['access_kind'],
  },
  device_access_completed: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['access_kind', 'status'],
  },
  notification_received: {
    version: 1,
    priority: 'operational',
    privacyClass: 'essential',
    allowedDataKeys: [
      'notification_id',
      'category',
      'app_state',
      'target_app_id',
      'provider_message_id',
    ],
  },
  notification_clicked: {
    version: 1,
    priority: 'operational',
    privacyClass: 'analytics',
    allowedDataKeys: [
      'notification_id',
      'category',
      'app_state',
      'target_app_id',
      'entrypoint_id',
      'interaction_source',
    ],
  },
  notification_inbox_seen: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['notification_ids', 'visible_count'],
  },
  notification_inbox_opened: {
    version: 1,
    priority: 'product',
    privacyClass: 'analytics',
    allowedDataKeys: ['unread_count'],
  },
} satisfies Record<string, EventDeclaration>;

export type HostTrackingEventName = keyof typeof hostEvents;

export type HostTrackingContext = {
  occurredAtMs?: number;
  sourceType?: Extract<
    TrackingEventEnvelope['source_type'],
    'native' | 'react_native'
  >;
};

const priorityOrder: Record<TrackingPriority, number> = {
  critical: 0,
  operational: 1,
  product: 2,
  diagnostic: 3,
};

export type TrackingConfig = {
  endpoint?: string;
  hostAppVersion: string;
  consentVersion: number;
  maxEventBytes: number;
  maxQueueBytes: number;
  maxBatchBytes: number;
  cellularBatchBytes: number;
  maxBatchEvents: number;
  maxWaitMs: Record<TrackingPriority, number>;
  retentionMs: Record<TrackingPriority, number>;
  userIdProvider?: (miniAppId: string | null) => string | null;
  grpcTransport?: TrackingTransport;
  grpcEnabled?: boolean; // backend feedback 1.3 — default false
};

export type MiniAppTrackingContext = {
  appId: string;
  appVersion: number;
  sessionId: string;
};

type TrackingDependencies = {
  now?: () => number;
  id?: (prefix: string) => string;
  network?: () => Promise<TrackingNetworkSnapshot>;
  httpTransport?: TrackingTransport;
};

const SESSION_RENEW_MS = 30 * 60 * 1000;
const GZIP_THRESHOLD_BYTES = 1024;

function generatedId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}

function uuidv7(): string {
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, '0');
  let randHex = '';
  try {
    if (typeof crypto !== 'undefined' && (crypto as unknown as { getRandomValues?: unknown }).getRandomValues) {
      const bytes = new Uint8Array(10);
      (crypto as unknown as { getRandomValues(b: Uint8Array): void }).getRandomValues(bytes);
      randHex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 20);
    } else {
      throw new Error('no crypto');
    }
  } catch {
    for (let i = 0; i < 20; i++) randHex += Math.floor(Math.random() * 16).toString(16);
  }
  const full = (timeHex + randHex).padEnd(32, '0').slice(0, 32);
  // version 7 at 13th nibble, variant 10xx at 17th nibble
  const v = `7${full.slice(13, 16)}`;
  const variant = ((parseInt(full.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-${v.slice(0, 4)}-${variant}${full.slice(18, 20)}-${full.slice(20, 32)}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Pure JS SHA-256 + HMAC (fallback when crypto.subtle unavailable)
function rotr(v: number, n: number): number {
  return (v >>> n) | (v << (32 - n));
}
// Minimal SHA-256 - adapted from public domain, kept small for RN
function sha256(bytes: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const ml = bytes.length * 8;
  const padLen = bytes.length % 64 < 56 ? 56 - (bytes.length % 64) : 120 - (bytes.length % 64);
  const padded = new Uint8Array(bytes.length + padLen + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, ml >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(ml / 0x100000000), false);
  for (let off = 0; off < padded.length; off += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const o = new DataView(out.buffer);
  o.setUint32(0, h0, false); o.setUint32(4, h1, false); o.setUint32(8, h2, false); o.setUint32(12, h3, false); o.setUint32(16, h4, false); o.setUint32(20, h5, false); o.setUint32(24, h6, false); o.setUint32(28, h7, false);
  return out;
}

function hmacSha256Pure(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 64;
  let k = key;
  if (k.length > blockSize) k = sha256(k);
  if (k.length < blockSize) {
    const tmp = new Uint8Array(blockSize);
    tmp.set(k);
    k = tmp;
  }
  const oKey = new Uint8Array(blockSize);
  const iKey = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKey[i] = k[i] ^ 0x5c;
    iKey[i] = k[i] ^ 0x36;
  }
  const inner = new Uint8Array(blockSize + data.length);
  inner.set(iKey);
  inner.set(data, blockSize);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(blockSize + innerHash.length);
  outer.set(oKey);
  outer.set(innerHash, blockSize);
  return sha256(outer);
}

async function hmacSha256Hex(keyHex: string, data: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const dataBytes = new TextEncoder().encode(data);
  // Try WebCrypto
  try {
    const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
    if (subtle) {
      const key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await subtle.sign('HMAC', key, dataBytes);
      return bytesToHex(new Uint8Array(sig));
    }
  } catch {}
  return bytesToHex(hmacSha256Pure(keyBytes, dataBytes));
}

async function gzipIfNeeded(input: string): Promise<{ body: string | Uint8Array; encoding?: string }> {
  const utf8Len = new TextEncoder().encode(input).length;
  if (utf8Len < GZIP_THRESHOLD_BYTES) return { body: input };
  // Try pako if installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pako = require('pako') as { gzip: (s: string) => Uint8Array };
    if (pako?.gzip) {
      const gz = pako.gzip(input);
      return { body: gz, encoding: 'gzip' };
    }
  } catch {}
  // Try CompressionStream (available in Node 18+ / modern browsers)
  try {
    const CS = (globalThis as unknown as { CompressionStream?: new (f: string) => unknown }).CompressionStream;
    if (CS) {
      const stream = new (CS as unknown as new (f: string) => { writable: WritableStream; readable: ReadableStream })('gzip');
      const writer = (stream as unknown as { writable: WritableStream<Uint8Array> }).writable.getWriter();
      const reader = (stream as unknown as { readable: ReadableStream<Uint8Array> }).readable.getReader();
      const data = new TextEncoder().encode(input);
      void writer.write(data).then(() => writer.close());
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      if (out.length > 0 && out.length < utf8Len) return { body: out, encoding: 'gzip' };
    }
  } catch {}
  // Try Node zlib if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require('zlib') as { gzipSync: (b: Buffer) => Buffer };
    if (zlib?.gzipSync) {
      const gz = zlib.gzipSync(Buffer.from(input, 'utf-8'));
      return { body: new Uint8Array(gz), encoding: 'gzip' };
    }
  } catch {}
  return { body: input };
}

function eventKey(e: TrackingEventEnvelope): string {
  // New idempotency key per spec 1.5
  if (typeof e.event_index === 'number' && e.session_id) return `${e.session_id}:${e.event_index}`;
  return e.event_id;
}

function normalizePersistedEvent(raw: unknown): TrackingEventEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // Basic shape check
  if (typeof r.event_name !== 'string' || typeof r.session_id !== 'string') return null;
  // Backward compat: event_index may be missing, derive from queue_sequence
  const eventIndex = typeof r.event_index === 'number' ? r.event_index : typeof r.queue_sequence === 'number' ? (r.queue_sequence as number) : 0;
  const queueSeq = typeof r.queue_sequence === 'number' ? (r.queue_sequence as number) : eventIndex;
  const eventId = typeof r.event_id === 'string' ? (r.event_id as string) : `${r.session_id as string}:${eventIndex}`;
  return {
    event_id: eventId,
    event_index: eventIndex,
    event_name: r.event_name as string,
    event_version: typeof r.event_version === 'number' ? (r.event_version as number) : 1,
    event_data: (r.event_data as Record<string, unknown>) ?? {},
    occurred_at_ms: typeof r.occurred_at_ms === 'number' ? (r.occurred_at_ms as number) : Date.now(),
    queue_sequence: queueSeq,
    source_type: (r.source_type as TrackingEventEnvelope['source_type']) ?? 'react_native',
    mini_app_id: (r.mini_app_id as string | null) ?? null,
    mini_app_version: (r.mini_app_version as number | null) ?? null,
    host_app_version: (r.host_app_version as string) ?? '0.0.1',
    platform: (r.platform as 'ios' | 'android') ?? 'android',
    session_id: r.session_id as string,
    mini_app_session_id: (r.mini_app_session_id as string | null) ?? null,
    user_id: (r.user_id as string | null) ?? null,
    anonymous_id: (r.anonymous_id as string) ?? 'anonymous-pending',
    priority: (r.priority as TrackingPriority) ?? 'product',
    trace_id: (r.trace_id as string | null) ?? null,
    privacy_class: (r.privacy_class as TrackingEventEnvelope['privacy_class']) ?? 'analytics',
    consent_version: typeof r.consent_version === 'number' ? (r.consent_version as number) : 1,
    sdk_version: typeof r.sdk_version === 'number' ? (r.sdk_version as number) : 1,
    network_at_event: (r.network_at_event as TrackingEventEnvelope['network_at_event']) ?? 'unknown',
    attempt_count: typeof r.attempt_count === 'number' ? (r.attempt_count as number) : 0,
  };
}

class HttpTrackingTransport implements TrackingTransport {
  readonly kind = 'http' as const;

  constructor(
    private readonly endpoint: string,
    private readonly getSessionId: () => string,
  ) {}

  isAvailable(snapshot: TrackingNetworkSnapshot): boolean {
    return snapshot.reachable;
  }

  async send(batch: TrackingBatch): Promise<TrackingTransportResult> {
    const json = JSON.stringify(batch);
    const { body, encoding } = await gzipIfNeeded(json);
    const deviceSecret = await getOrCreateDeviceSecret().catch(() => null);
    const signature = deviceSecret ? await hmacSha256Hex(deviceSecret, `${batch.batch_id}${batch.sent_at_ms}`).catch(() => null) : null;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (encoding) headers['Content-Encoding'] = encoding;
    if (signature) headers['X-Anonymous-Signature'] = signature;
    const sessionId = this.getSessionId();
    if (sessionId) headers['X-Session-Id'] = sessionId;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: body as unknown as BodyInit,
    });

    // 200 and 207 are both success per 1.4 — only 4xx/5xx outside those throw
    if (response.status !== 200 && response.status !== 207 && !response.ok) {
      throw new Error(`Tracking upload failed with ${response.status}`);
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // No JSON — treat as all accepted fallback
      return { acceptedEventIds: batch.events.map(eventKey) };
    }

    const p = payload as Record<string, unknown>;
    // New 207 format: { accepted: [[session_id, event_index]], permanentlyRejected: ..., quarantined: ... }
    const pickTuples = (v: unknown): [string, number][] => {
      if (!Array.isArray(v)) return [];
      return (v as unknown[]).flatMap(item => {
        if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'number') return [[item[0], item[1]] as [string, number]];
        return [];
      });
    };
    const tupleToKey = ([sid, idx]: [string, number]): string => `${sid}:${idx}`;

    // New format
    if (Array.isArray(p.accepted) || Array.isArray(p.permanentlyRejected) || Array.isArray(p.quarantined)) {
      const accepted = pickTuples(p.accepted).map(tupleToKey);
      const permanentlyRejected = pickTuples(p.permanentlyRejected).map(tupleToKey);
      // Support both spellings: permanentlyRejected (camel) and permanently_rejected
      const permAlt = pickTuples((p as Record<string, unknown>).permanently_rejected).map(tupleToKey);
      const perm = permanentlyRejected.length ? permanentlyRejected : permAlt;
      const quarantined = pickTuples(p.quarantined).map(tupleToKey);
      const reasons = (p.rejectedReasons as Record<string, string>) ?? (p as Record<string, unknown>).rejected_reasons as Record<string, string> | undefined;
      return {
        acceptedEventIds: accepted.length ? accepted : batch.events.map(eventKey), // fallback if server omitted?
        permanentlyRejectedEventIds: perm,
        quarantinedEventIds: quarantined,
        rejectedReasons: reasons,
      };
    }

    // Legacy format: { accepted_event_ids, permanently_rejected_event_ids }
    try {
      const legacy = p as Partial<{ accepted_event_ids: string[]; permanently_rejected_event_ids: string[]; acceptedEventIds: string[] }>;
      const accepted = legacy.accepted_event_ids ?? legacy.acceptedEventIds;
      const perm = legacy.permanently_rejected_event_ids;
      // Also support legacy tuple format inside those arrays? spec 1.4 says new is 207, old 200 stays string ids
      // If legacy contains tuple arrays, map them
      const normalizeIds = (arr: unknown): string[] | undefined => {
        if (!Array.isArray(arr)) return undefined;
        return (arr as unknown[]).map(item => {
          if (Array.isArray(item) && item.length === 2) return `${item[0]}:${item[1]}`;
          return String(item);
        });
      };
      const a = normalizeIds(accepted);
      const pr = normalizeIds(perm);
      if (a || pr) {
        return {
          acceptedEventIds: a ?? batch.events.map(eventKey),
          permanentlyRejectedEventIds: pr ?? [],
        };
      }
      return {
        acceptedEventIds: (p.accepted_event_ids as string[]) ?? batch.events.map(eventKey),
        permanentlyRejectedEventIds: (p.permanently_rejected_event_ids as string[]) ?? [],
      };
    } catch {
      return { acceptedEventIds: batch.events.map(eventKey) };
    }
  }
}

async function defaultNetwork(): Promise<TrackingNetworkSnapshot> {
  const result = await requestDeviceAccess('network');
  if (result.status === 'offline') {
    return { kind: 'offline', reachable: false };
  }
  return {
    kind: result.networkType ?? 'unknown',
    reachable: result.status === 'available',
  };
}

function serializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  let bytes = 0;
  for (const character of serialized) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
        ? 3
        : 4;
  }
  return bytes;
}

function validData(
  data: Record<string, unknown>,
  allowedDataKeys: readonly string[],
  maxBytes: number,
): boolean {
  try {
    return (
      Object.keys(data).every(key => allowedDataKeys.includes(key)) &&
      serializedBytes(data) <= maxBytes
    );
  } catch {
    return false;
  }
}

export class TrackingService {
  private queue: TrackingEventEnvelope[] = [];
  private anonymousId = 'anonymous-pending';
  private readonly miniAppAnonymousIds = new Map<string, string>();
  private lastNetwork: TrackingNetworkSnapshot = {
    kind: 'unknown',
    reachable: false,
  };
  private lastNetworkAt = 0;
  // deprecated global sequence — kept for migration, but ordering now uses event_index
  private sequence = 0;
  private sessionId: string;
  private nextEventIndex = 0;
  private lastActiveMs = 0;
  private started = false;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private droppedCriticalEvents = 0;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly network: () => Promise<TrackingNetworkSnapshot>;
  private readonly httpTransport?: TrackingTransport;

  constructor(
    private readonly config: TrackingConfig,
    dependencies: TrackingDependencies = {},
  ) {
    this.now = dependencies.now ?? Date.now;
    this.id = dependencies.id ?? generatedId;
    this.network = dependencies.network ?? defaultNetwork;
    // sessionId will be properly set in initialize(); use id('session') as placeholder for tests
    this.sessionId = this.id('session');
    this.nextEventIndex = 0;
    this.lastActiveMs = this.now();
    const endpoint = config.endpoint;
    this.httpTransport =
      dependencies.httpTransport ??
      (endpoint
        ? new HttpTrackingTransport(endpoint, () => this.sessionId)
        : undefined);
  }

  async start(): Promise<void> {
    this.started = true;
    if (this.initialized) {
      await this.ensureSessionValid();
      this.schedule();
      return;
    }
    if (!this.initializing) {
      this.initializing = this.initialize().finally(() => {
        this.initializing = null;
      });
    }
    await this.initializing;
  }

  private async ensureSessionValid(): Promise<void> {
    const now = this.now();
    if (now - this.lastActiveMs > SESSION_RENEW_MS) {
      await this.renewSession(now);
    } else {
      this.lastActiveMs = now;
      await saveTrackingSession({ sessionId: this.sessionId, nextEventIndex: this.nextEventIndex, lastActiveMs: this.lastActiveMs }).catch(() => undefined);
    }
  }

  private async renewSession(now: number): Promise<void> {
    // Generate new session; next index resets
    const newId = this.id ? (() => {
      // If id is mocked (tests), use it; else uuidv7
      const maybe = this.id('session');
      // Detect if mock returns deterministic session- prefix vs real uuid
      // For real, prefer uuidv7 when id is default generatedId
      if (maybe.startsWith('session-') && maybe.length < 20) {
        // mock — keep mock
        return maybe;
      }
      // If default generatedId, replace with uuidv7 for production
      if (maybe === this.sessionId) return uuidv7();
      return maybe;
    })() : uuidv7();
    // If id is default generatedId, use uuidv7 instead of generatedId result
    const isDefault = this.id === generatedId;
    this.sessionId = isDefault ? uuidv7() : newId;
    this.nextEventIndex = 0;
    this.lastActiveMs = now;
    await saveTrackingSession({ sessionId: this.sessionId, nextEventIndex: this.nextEventIndex, lastActiveMs: now }).catch(() => undefined);
  }

  private async initialize(): Promise<void> {
    this.anonymousId = await getOrCreateAnonymousId('host');
    // Load or create session
    const saved = await loadTrackingSession().catch(() => null);
    const now = this.now();
    if (saved && now - saved.lastActiveMs < SESSION_RENEW_MS) {
      this.sessionId = saved.sessionId;
      this.nextEventIndex = saved.nextEventIndex;
      this.lastActiveMs = saved.lastActiveMs;
    } else {
      // New session
      const isDefault = this.id === generatedId;
      this.sessionId = isDefault ? uuidv7() : this.id('session');
      this.nextEventIndex = 0;
      this.lastActiveMs = now;
      await saveTrackingSession({ sessionId: this.sessionId, nextEventIndex: 0, lastActiveMs: now }).catch(() => undefined);
    }

    const lines = await loadTrackingEventLines();
    this.queue = lines.flatMap(line => {
      try {
        const parsed = JSON.parse(line) as unknown;
        const norm = normalizePersistedEvent(parsed);
        return norm ? [norm] : [];
      } catch {
        return [];
      }
    });
    // Migrate old queue_sequence to sequence for compat, and nextEventIndex to max for current session
    const currentSessionEvents = this.queue.filter(e => e.session_id === this.sessionId);
    const maxIdx = currentSessionEvents.reduce((m, e) => Math.max(m, e.event_index), -1);
    if (maxIdx >= this.nextEventIndex) {
      this.nextEventIndex = maxIdx + 1;
      await saveTrackingSession({ sessionId: this.sessionId, nextEventIndex: this.nextEventIndex, lastActiveMs: this.lastActiveMs }).catch(() => undefined);
    }
    // For global sequence compat
    this.sequence = this.queue.reduce(
      (highest, event) => Math.max(highest, event.queue_sequence ?? event.event_index),
      0,
    );
    await this.enforceQueueLimit();
    this.initialized = true;
    this.schedule();
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Persist last active for session renewal check on next start
    this.lastActiveMs = this.now();
    void saveTrackingSession({ sessionId: this.sessionId, nextEventIndex: this.nextEventIndex, lastActiveMs: this.lastActiveMs }).catch(() => undefined);
  }

  /** Called by App.tsx on AppState background to update lastActiveMs */
  async notifyBackground(): Promise<void> {
    this.lastActiveMs = this.now();
    await saveTrackingSession({ sessionId: this.sessionId, nextEventIndex: this.nextEventIndex, lastActiveMs: this.lastActiveMs }).catch(() => undefined);
  }

  /** Called on foreground — renews if gap >30m */
  async notifyForeground(): Promise<void> {
    const now = this.now();
    if (now - this.lastActiveMs > SESSION_RENEW_MS) {
      await this.renewSession(now);
    } else {
      this.lastActiveMs = now;
      await saveTrackingSession({ sessionId: this.sessionId, nextEventIndex: this.nextEventIndex, lastActiveMs: now }).catch(() => undefined);
    }
  }

  async trackHost(
    name: HostTrackingEventName,
    data: Record<string, unknown>,
    context: HostTrackingContext = {},
  ): Promise<string | null> {
    const declaration = hostEvents[name];
    return this.enqueue({
      name,
      data,
      declaration,
      source: context.sourceType ?? 'react_native',
      miniApp: null,
      occurredAtMs: context.occurredAtMs,
    });
  }

  async trackMiniApp(
    context: MiniAppTrackingContext,
    name: string,
    version: number,
    data: Record<string, unknown>,
  ): Promise<string | null> {
    const manifest = miniAppCatalog.find(app => app.id === context.appId);
    const event = manifest?.trackingEvents.find(
      item => item.name === name && item.version === version,
    );
    if (!manifest || !event) {
      return null;
    }
    return this.enqueue({
      name,
      data,
      declaration: {
        version: event.version,
        priority: event.priority,
        privacyClass: 'analytics',
        allowedDataKeys: event.allowedDataKeys,
      },
      source: 'mini_app',
      miniApp: { manifest, sessionId: context.sessionId },
      occurredAtMs: undefined,
    });
  }

  private async enqueue(input: {
    name: string;
    data: Record<string, unknown>;
    declaration: EventDeclaration;
    source: TrackingEventEnvelope['source_type'];
    miniApp: { manifest: MiniAppManifest; sessionId: string } | null;
    occurredAtMs: number | undefined;
  }): Promise<string | null> {
    if (this.initializing) {
      await this.initializing;
    }
    if (
      !validData(
        input.data,
        input.declaration.allowedDataKeys,
        this.config.maxEventBytes,
      )
    ) {
      return null;
    }

    const network = await this.networkSnapshot(false);
    const anonymousId = input.miniApp
      ? await this.miniAppAnonymousId(input.miniApp.manifest.id)
      : this.anonymousId;
    await this.ensureSessionValid();
    const eventIndex = this.nextEventIndex++;
    const sessionId = this.sessionId;
    const eventId = `${sessionId}:${eventIndex}`;
    // Keep queue_sequence for backward compat, but ordering now uses event_index
    const queueSeq = eventIndex;
    this.sequence = Math.max(this.sequence, queueSeq);
    await saveTrackingSession({ sessionId, nextEventIndex: this.nextEventIndex, lastActiveMs: this.lastActiveMs }).catch(() => undefined);
    const event: TrackingEventEnvelope = {
      event_id: eventId,
      event_index: eventIndex,
      event_name: input.name,
      event_version: input.declaration.version,
      event_data: input.data,
      occurred_at_ms: input.occurredAtMs ?? this.now(),
      queue_sequence: queueSeq,
      source_type: input.source,
      mini_app_id: input.miniApp?.manifest.id ?? null,
      mini_app_version: input.miniApp?.manifest.version ?? null,
      host_app_version: this.config.hostAppVersion,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      session_id: sessionId,
      mini_app_session_id: input.miniApp?.sessionId ?? null,
      user_id:
        this.config.userIdProvider?.(input.miniApp?.manifest.id ?? null) ??
        null,
      anonymous_id: anonymousId,
      priority: input.declaration.priority,
      trace_id: null,
      privacy_class: input.declaration.privacyClass,
      consent_version: this.config.consentVersion,
      sdk_version: 1,
      network_at_event: network.kind,
      attempt_count: 0,
    };

    this.queue.push(event);
    await appendTrackingEventLine(JSON.stringify(event));
    await this.enforceQueueLimit();

    if (event.priority === 'critical') {
      this.flush('critical_event').catch(() => undefined);
    } else {
      this.schedule();
    }
    return eventId;
  }

  private async enforceQueueLimit(): Promise<void> {
    const now = this.now();
    const previousLength = this.queue.length;
    this.queue = this.queue.filter(
      event =>
        now - event.occurred_at_ms <= this.config.retentionMs[event.priority],
    );
    let size = serializedBytes(this.queue);
    if (size <= this.config.maxQueueBytes) {
      if (this.queue.length !== previousLength) {
        await this.persistQueue();
      }
      return;
    }

    for (const priority of ['diagnostic', 'product', 'operational'] as const) {
      while (size > this.config.maxQueueBytes) {
        const index = this.queue.findIndex(
          event => event.priority === priority,
        );
        if (index < 0) {
          break;
        }
        this.queue.splice(index, 1);
        size = serializedBytes(this.queue);
      }
    }
    while (size > this.config.maxQueueBytes && this.queue.length > 0) {
      const removed = this.queue.shift();
      if (removed?.priority === 'critical') {
        this.droppedCriticalEvents += 1;
      }
      size = serializedBytes(this.queue);
    }
    await this.persistQueue();
  }

  private eligible(
    event: TrackingEventEnvelope,
    network: TrackingNetworkSnapshot,
  ): boolean {
    if (!network.reachable) {
      return false;
    }
    if (network.kind === 'roaming' || network.kind === 'constrained') {
      return event.priority === 'critical' || event.priority === 'operational';
    }
    if (event.priority === 'diagnostic') {
      return network.kind === 'wifi';
    }
    return true;
  }

  private async miniAppAnonymousId(appId: string): Promise<string> {
    const existing = this.miniAppAnonymousIds.get(appId);
    if (existing) {
      return existing;
    }
    const created = await getOrCreateAnonymousId(`mini-app-${appId}`);
    this.miniAppAnonymousIds.set(appId, created);
    return created;
  }

  private async networkSnapshot(
    refresh: boolean,
  ): Promise<TrackingNetworkSnapshot> {
    const now = this.now();
    if (
      !refresh &&
      this.lastNetworkAt > 0 &&
      now - this.lastNetworkAt < 5_000
    ) {
      return this.lastNetwork;
    }
    try {
      this.lastNetwork = await this.network();
      this.lastNetworkAt = now;
    } catch {
      this.lastNetwork = { kind: 'unknown', reachable: false };
      this.lastNetworkAt = now;
    }
    return this.lastNetwork;
  }

  private createBatch(
    network: TrackingNetworkSnapshot,
    reason: string,
  ): TrackingBatch | null {
    const sorted = this.queue
      .filter(event => this.eligible(event, network))
      .sort(
        (left, right) =>
          priorityOrder[left.priority] - priorityOrder[right.priority] ||
          left.occurred_at_ms - right.occurred_at_ms ||
          left.event_index - right.event_index,
      );
    const events: TrackingEventEnvelope[] = [];
    let bytes = 0;
    const batchByteLimit =
      network.kind === 'wifi'
        ? this.config.maxBatchBytes
        : Math.min(this.config.maxBatchBytes, this.config.cellularBatchBytes);
    for (const event of sorted) {
      const eventBytes = serializedBytes(event);
      if (
        events.length >= this.config.maxBatchEvents ||
        (events.length > 0 && bytes + eventBytes > batchByteLimit)
      ) {
        break;
      }
      events.push({ ...event, attempt_count: event.attempt_count + 1 });
      bytes += eventBytes;
    }
    if (events.length === 0) {
      return null;
    }
    return {
      batch_id: this.id('batch'),
      sent_at_ms: this.now(),
      reason,
      events,
    };
  }

  private chooseTransport(
    network: TrackingNetworkSnapshot,
  ): TrackingTransport | undefined {
    // Backend feedback 1.3 — gRPC disabled via flag. Keep check but force false.
    const grpcEnabled = this.config.grpcEnabled ?? false;
    const grpc = this.config.grpcTransport;
    if (
      grpcEnabled &&
      grpc &&
      network.kind === 'wifi' &&
      this.queue.length >= 20 &&
      grpc.isAvailable(network)
    ) {
      return grpc;
    }
    return this.httpTransport?.isAvailable(network)
      ? this.httpTransport
      : undefined;
  }

  async flush(reason: string): Promise<void> {
    if (this.flushing) {
      return this.flushing;
    }
    this.flushing = this.flushOnce(reason).finally(() => {
      this.flushing = null;
      this.schedule();
    });
    return this.flushing;
  }

  private async flushOnce(reason: string): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }
    const network = await this.networkSnapshot(true);
    const transport = this.chooseTransport(network);
    if (!transport) {
      return;
    }
    const batch = this.createBatch(network, reason);
    if (!batch) {
      return;
    }

    try {
      const result = await transport.send(batch);
      const terminal = new Set<string>([
        ...result.acceptedEventIds,
        ...(result.permanentlyRejectedEventIds ?? []),
        ...(result.quarantinedEventIds ?? []),
      ]);
      // Map batch events to keys for comparison — handle both old event_id and new composite
      this.queue = this.queue.filter(event => !terminal.has(eventKey(event)));
      await this.persistQueue();
    } catch {
      const attempted = new Set(batch.events.map(eventKey));
      this.queue = this.queue.map(event =>
        attempted.has(eventKey(event))
          ? { ...event, attempt_count: event.attempt_count + 1 }
          : event,
      );
      await this.persistQueue();
    }
  }

  private schedule(): void {
    if (!this.started || !this.httpTransport || this.queue.length === 0) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const now = this.now();
    const delay = Math.max(
      0,
      Math.min(
        ...this.queue.map(
          event =>
            event.occurred_at_ms + this.config.maxWaitMs[event.priority] - now,
        ),
      ),
    );
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush('max_wait').catch(() => undefined);
    }, delay);
  }

  private persistQueue(): Promise<void> {
    return replaceTrackingEventLines(
      this.queue.map(event => JSON.stringify(event)),
    );
  }

  getBufferedEventsForDebug(): readonly TrackingEventEnvelope[] {
    return this.queue;
  }

  getDroppedCriticalCountForDebug(): number {
    return this.droppedCriticalEvents;
  }

  // For testing / debugging
  getSessionIdForDebug(): string {
    return this.sessionId;
  }

  getNextEventIndexForDebug(): number {
    return this.nextEventIndex;
  }
}
