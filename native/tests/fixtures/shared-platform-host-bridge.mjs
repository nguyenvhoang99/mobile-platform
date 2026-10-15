const METHODS = new Set(['identity.auth', 'scanner.scan', 'connectivity.state', 'storage.kv', 'net.request', 'notifications']);
let sequence = 0;
function capabilityEntry(capabilities, capability) {
  const key = capability === 'storage.kv' && !capabilities['storage.kv'] ? 'storage_kv' : capability;
  return capabilities[key];
}
function hasCapability(capabilities, capability, operation) {
  const entry = capabilityEntry(capabilities, capability);
  if (entry === true) return true;
  if (!entry || typeof entry !== 'object') return false;
  if (operation === undefined) return true;
  const operations = entry.ops || entry.operations;
  return Array.isArray(operations) && operations.includes(operation);
}
export class HostBridgeError extends Error {
  constructor(code, message = code, details = {}) { super(message); this.name = 'HostBridgeError'; this.code = code; this.retryAfterMs = details.retryAfterMs; this.retryable = details.retryable ?? (code === 'RATE_LIMITED' || code === 'TIMEOUT' || code === 'UNCERTAIN'); }
}
export function createHostCapabilityClient({ bridge, capabilities = {}, host = {}, version = 1, createId = () => `mini-${Date.now().toString(36)}-${(++sequence).toString(36)}` } = {}) {
  if (typeof bridge?.request !== 'function') throw new TypeError('Host bridge must implement request(envelope)');
  const snapshot = Object.freeze({ protocolVersion: version, host: Object.freeze({ ...host }), capabilities: Object.freeze({ ...capabilities }) });
  const supports = (capability, operation) => hasCapability(capabilities, capability, operation);
  return Object.freeze({ capabilities: snapshot, supports, async request(capability, operation, args = {}, options = {}) {
    if (!METHODS.has(capability)) throw new HostBridgeError('UNSUPPORTED', `Unknown host capability: ${capability}`);
    const advertisedOperation = capability === 'storage.kv' && operation === 'kv' ? args?.op : operation;
    if (!supports(capability, advertisedOperation)) throw new HostBridgeError('UNSUPPORTED', `Host does not expose ${capability}/${advertisedOperation}`);
    const envelope = { id: options.id || createId(), capability, operation, version, args };
    let reply;
    try { reply = await bridge.request(envelope, options.signal ? { signal: options.signal } : undefined); }
    catch (cause) { throw cause instanceof HostBridgeError ? cause : new HostBridgeError(cause?.code || 'HOST_ERROR', cause?.message || 'Host request failed', { retryable: cause?.retryable, retryAfterMs: cause?.retryAfterMs }); }
    if (reply?.ok === false || reply?.error) { const raw = reply.error || {}; const error = typeof raw === 'object' ? raw : { code: raw, retryAfterMs: reply.retryAfterMs, retryable: reply.retryable }; throw new HostBridgeError(error.code || 'HOST_ERROR', error.message || 'Host rejected request', error); }
    return Object.hasOwn(reply || {}, 'value') ? reply.value : Object.hasOwn(reply || {}, 'data') ? reply.data : reply;
  }, subscribe(capability, operation, listener) {
    if (!METHODS.has(capability) || !supports(capability)) return () => {};
    if (!supports(capability, operation) || typeof bridge.subscribe !== 'function') return () => {};
    return bridge.subscribe({ capability, operation, version }, listener) || (() => {});
  } });
}
export function createHostCapabilityClientFromGlobal(environment = globalThis, options = {}) {
  const bridge = environment?.MiniAppBridge || environment?.__MINIAPP_BRIDGE__;
  const capabilities = environment?.__MINIAPP_CAPS__ || environment?.__miniapp_caps__ || {};
  if (!bridge || typeof bridge.request !== 'function') throw new TypeError('No MiniAppBridge.request() is available in this runtime');
  const host = environment?.__MINIAPP_RUNTIME__ || environment?.__MINIAPP_HOST__ || {};
  return createHostCapabilityClient({ bridge, capabilities, host, version: 1, ...options });
}
export function createHostIdentityBridge(client, { supportedMethods, oauthProviders, passkey } = {}) {
  const call = (operation, args) => client.request('identity.auth', operation, args);
  return { getSession: () => call('getSession'), signIn: (input) => call('signIn', input), signOut: () => call('signOut'), ...(supportedMethods ? { supportedMethods } : { supportedMethods: { signIn: ['password', ...(passkey ? ['passkey'] : [])], signUp: client.supports('identity.auth', 'signUp'), recovery: client.supports('identity.auth', 'recover') } }), ...(oauthProviders ? { oauthProviders } : {}), ...(passkey ? { passkey } : {}), ...(client.supports('identity.auth', 'signUp') ? { signUp: (input) => call('signUp', input) } : {}), ...(client.supports('identity.auth', 'verify') ? { verify: (input) => call('verify', input) } : {}), ...(client.supports('identity.auth', 'recover') ? { recover: (input) => call('recover', input) } : {}), ...(client.supports('identity.auth', 'ensureStrongAuthentication') ? { ensureStrongAuthentication: () => call('ensureStrongAuthentication') } : {}), subscribe: (listener) => client.subscribe('identity.auth', 'authState', listener) };
}
export function createHostScannerBridge(client) { return { scan: (options = {}) => client.request('scanner.scan', 'scan', { mode: 'once', ...options }) }; }
export function createHostConnectivityBridge(client) { return { getState: () => client.request('connectivity.state', 'getState'), subscribe: (listener) => client.subscribe('connectivity.state', 'stateChanged', listener) }; }
export function createHostKvBridge(client) { return { get: async (key) => { const value = await client.request('storage.kv', 'kv', { op: 'get', key }); if (value?.found === false || value == null || (value?.value === null)) return { found: false }; return { found: true, value: value?.value ?? value }; }, set: (key, value) => client.request('storage.kv', 'kv', { op: 'set', key, value }), delete: (key) => client.request('storage.kv', 'kv', { op: 'delete', key }) }; }
export function createHostHttpBridge(client) { return { request: (input) => client.request('net.request', 'request', input) }; }
export function createHostNotificationBridge(client) { return { send: (intent) => client.request('notifications', 'send', intent), getPermission: () => client.request('notifications', 'getPermission'), isAvailable: () => client.request('notifications', 'isAvailable') }; }
