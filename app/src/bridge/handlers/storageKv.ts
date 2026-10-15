import type { HandlerFn } from '../handler';

// Per-(tenant, appId, user) KV — host-mediated, quota-controlled, no cookies/localStorage.
// Keys are host-minted handles in spirit; here we just namespace by session.

const store = new Map<string, Map<string, string>>(); // namespace → (key → value)
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_KEYS_PER_NAMESPACE = 200;

function nsFor(appId: string, tenantId: string, userId: string): string {
  return JSON.stringify([tenantId, appId, userId]);
}

export function handleStorageKv(): HandlerFn {
  return async (session, args) => {
    if (Object.keys(args).some(field => !['op', 'key', 'value'].includes(field))) throw new Error('INVALID_ARGUMENT: unknown field');
    const op = args.op as string;
    const key = args.key as string | undefined;
    const value = args.value as string | undefined;

    if (op !== 'get' && op !== 'set' && op !== 'delete' && op !== 'keys') {
      throw new Error('INVALID_ARGUMENT: op must be get|set|delete|keys');
    }
    if ((op === 'get' || op === 'set' || op === 'delete') && (!key || typeof key !== 'string')) {
      throw new Error('INVALID_ARGUMENT: key required');
    }
    if (key && (key.length === 0 || key.length > 128 || key.includes(':'))) {
      throw new Error('INVALID_ARGUMENT: invalid key');
    }

    const ns = nsFor(session.appId, session.tenantId, session.userId);
    if (!store.has(ns)) store.set(ns, new Map());
    const bucket = store.get(ns)!;

    if (op === 'get') {
      return { value: bucket.get(key!) ?? null };
    }
    if (op === 'set') {
      if (typeof value !== 'string') throw new Error('INVALID_ARGUMENT: value must be string');
      if (unescape(encodeURIComponent(value)).length > MAX_VALUE_BYTES) throw new Error('INVALID_ARGUMENT: value too large');
      if (!bucket.has(key!) && bucket.size >= MAX_KEYS_PER_NAMESPACE) throw new Error('INVALID_ARGUMENT: too many keys');
      bucket.set(key!, value);
      return { ok: true };
    }
    if (op === 'delete') {
      bucket.delete(key!);
      return { ok: true };
    }
    // keys
    return { keys: [...bucket.keys()] };
  };
}

// For tests
export function __clearStorage(): void {
  store.clear();
}
export function __getStore(): Map<string, Map<string, string>> {
  return store;
}
