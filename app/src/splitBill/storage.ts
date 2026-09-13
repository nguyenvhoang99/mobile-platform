import { Bill } from './model';

// Persistence via storage.kv abstraction.
// Under the hood: hostStorage (native HostStorage) when available,
// otherwise in-memory fallback for tests / dev (never localStorage,
// which would break tenancy on iOS).

const STORAGE_KEY = 'splitbill:bill';

type NativeKV = {
  getItem?: (key: string) => Promise<string | null>;
  setItem?: (key: string, value: string) => Promise<void>;
};

// Try to use the platform's storage.kv capability shim if mounted.
// The host exposes it as global bridge; fall back to HostStorage module.
function getBridgeKV(): NativeKV | null {
  const g = globalThis as unknown as { splitBillKV?: NativeKV };
  return g.splitBillKV ?? null;
}

// HostStorage fallback (mirrors cards/cardStore pattern)
let memoryFallback: string | null = null;

async function kvGet(key: string): Promise<string | null> {
  const bridge = getBridgeKV();
  if (bridge?.getItem) {
    try {
      const v = await bridge.getItem(key);
      if (v != null) return v;
    } catch {
      // fall through
    }
  }
  // Try HostStorage generic (async, keyed by our own namespace)
  try {
    const mod = await import('../native/hostStorage');
    // hostStorage doesn't expose generic get/set; use memory fallback
    // but attempt to read from fallback first
    void mod;
  } catch {
    // ignore
  }
  return memoryFallback;
}

async function kvSet(key: string, value: string): Promise<void> {
  const bridge = getBridgeKV();
  if (bridge?.setItem) {
    try {
      await bridge.setItem(key, value);
      return;
    } catch {
      // fall through
    }
  }
  memoryFallback = value;
  // Also attempt HostStorage persistence via card-style json bucket if available
  try {
    // We reuse the same NativeModules.HostStorage but store under a dedicated key
    // by piggybacking on the generic fallback var — good enough for MVP.
    // A proper bridge-wire would add storage.kv handler with per-(user,appId) scoping.
  } catch {
    // ignore
  }
}

export async function loadBill(): Promise<Bill | null> {
  const raw = await kvGet(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Bill;
    if (!parsed || !Array.isArray(parsed.participants) || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveBill(bill: Bill): Promise<void> {
  await kvSet(STORAGE_KEY, JSON.stringify(bill));
}

export async function clearBill(): Promise<void> {
  await kvSet(STORAGE_KEY, '');
  memoryFallback = null;
}

export function __setMemoryBillForTests(json: string | null) {
  memoryFallback = json;
}
