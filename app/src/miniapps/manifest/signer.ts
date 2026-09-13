/**
 * Package signing — local MVP of the two-signature chain.
 *
 * Real hierarchy: root (pinned in binary) → cross-signed store key → per-release
 * signature over canonicalized manifest + hash-tree root. Author key is separate.
 *
 * MVP: single dev key, HMAC-like over canonical JSON (pure JS, no Node crypto).
 * Shape-compatible so swapping to real Ed25519 later is additive. Sign the
 * MANIFEST, not the archive (archive is transport, never the trust boundary).
 */

/* eslint-disable no-bitwise */
const DEV_STORE_KEY = 'dev-store-key-do-not-ship';

function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(',')}]`;
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize(rec[k])}`).join(',')}}`;
}

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
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  // stretch to 64 hex
  let out = a + b;
  let salt = 0;
  while (out.length < 64) {
    let x = 0;
    for (let i = 0; i < input.length; i++) x = (x * 31 + input.charCodeAt(i) + salt) | 0;
    out += (x >>> 0).toString(16).padStart(8, '0');
    salt++;
  }
  return out.slice(0, 64);
}

function hmacLike(key: string, data: string): string {
  return hashHex(key + ':' + data);
}

export function hashManifest(manifest: unknown): string {
  return hashHex(canonicalize(manifest));
}

export type SignedPackage = {
  manifest: Record<string, unknown>;
  manifestHash: string;
  storeSignature: string; // HMAC hex
  authorSignature: string; // HMAC hex (dev author key)
  signedAt: string;
};

export function signPackage(
  manifest: Record<string, unknown>,
  opts: { storeKey?: string; authorKey?: string } = {},
): SignedPackage {
  const storeKey = opts.storeKey ?? DEV_STORE_KEY;
  const authorKey = opts.authorKey ?? 'dev-author-key';
  const canon = canonicalize(manifest);
  const storeSig = hmacLike(storeKey, canon);
  const authorSig = hmacLike(authorKey, canon);
  return {
    manifest,
    manifestHash: hashHex(canon),
    storeSignature: storeSig,
    authorSignature: authorSig,
    signedAt: new Date().toISOString(),
  };
}

export function verifyPackage(
  pkg: SignedPackage,
  opts: { storeKey?: string; authorKey?: string } = {},
): { ok: true } | { ok: false; reason: string } {
  const storeKey = opts.storeKey ?? DEV_STORE_KEY;
  const authorKey = opts.authorKey ?? 'dev-author-key';
  const canon = canonicalize(pkg.manifest);
  const expectedStore = hmacLike(storeKey, canon);
  const expectedAuthor = hmacLike(authorKey, canon);
  if (expectedStore !== pkg.storeSignature) return { ok: false, reason: 'storeSignature mismatch' };
  if (expectedAuthor !== pkg.authorSignature) return { ok: false, reason: 'authorSignature mismatch' };
  const expectedHash = hashHex(canon);
  if (expectedHash !== pkg.manifestHash) return { ok: false, reason: 'manifestHash mismatch' };
  return { ok: true };
}
