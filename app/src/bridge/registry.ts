/**
 * Capability registry — typed mirror of policy/capabilities.yaml.
 * CI (R1) asserts every handler has an entry and every entry has a handler.
 *
 * MVP six capabilities — all broker/host-owned, zero raw OS permission spend
 * where possible (native-capability Step 1: prefer picker/host UI).
 */

export type CapabilityDef = {
  name: string; // namespace.operation
  version: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
  consent: 'none' | 'once' | 'while_using' | 'session' | 'persistent';
  osPermission: 'none' | string;
  brokerUi: string | false;
  minTier: 'sandbox' | 'self_serve' | 'partner_verified' | 'first_party';
  quota: { sustainedPerMinute: number; burst: number };
  audit: 'none' | 'call' | 'call_with_result';
  owner: string;
  supportHorizon: string;
  errors: string[];
};

export const CAPABILITIES: readonly CapabilityDef[] = [
  {
    name: 'net.request',
    version: 1,
    risk: 'medium',
    consent: 'none',
    osPermission: 'none',
    brokerUi: false,
    minTier: 'sandbox',
    quota: { sustainedPerMinute: 60, burst: 10 },
    audit: 'call',
    owner: 'platform',
    supportHorizon: 'indefinite, reviewed annually',
    errors: ['CAPABILITY_NOT_DECLARED', 'INVALID_ARGUMENT', 'RATE_LIMITED', 'TIMEOUT', 'NOT_FOUND'],
  },
  {
    name: 'storage.kv',
    version: 1,
    risk: 'low',
    consent: 'none',
    osPermission: 'none',
    brokerUi: false,
    minTier: 'sandbox',
    quota: { sustainedPerMinute: 120, burst: 20 },
    audit: 'call',
    owner: 'platform',
    supportHorizon: 'indefinite, reviewed annually',
    errors: ['CAPABILITY_NOT_DECLARED', 'INVALID_ARGUMENT', 'RATE_LIMITED', 'REVOKED'],
  },
  {
    name: 'scanner.scan',
    version: 1,
    risk: 'medium',
    consent: 'once',
    osPermission: 'none', // host-owned scanner UI — no OS prompt
    brokerUi: 'host_scanner',
    minTier: 'self_serve',
    quota: { sustainedPerMinute: 10, burst: 2 },
    audit: 'call_with_result',
    owner: 'platform',
    supportHorizon: 'indefinite, reviewed annually',
    errors: ['CAPABILITY_NOT_DECLARED', 'CONSENT_REQUIRED', 'CONSENT_DENIED', 'CONSENT_DENIED_PERMANENTLY', 'TIMEOUT'],
  },
  {
    name: 'location.current',
    version: 1,
    risk: 'high',
    consent: 'once',
    osPermission: 'none', // coarse one-shot derived server-side; precise is separate capability
    brokerUi: false,
    minTier: 'partner_verified',
    quota: { sustainedPerMinute: 6, burst: 2 },
    audit: 'call_with_result',
    owner: 'platform',
    supportHorizon: 'indefinite, reviewed annually',
    errors: ['CAPABILITY_NOT_DECLARED', 'CONSENT_REQUIRED', 'CONSENT_DENIED', 'CONSENT_DENIED_PERMANENTLY', 'RATE_LIMITED', 'TIMEOUT', 'REVOKED'],
  },
  {
    name: 'crypto.sign',
    version: 1,
    risk: 'high',
    consent: 'once',
    osPermission: 'none',
    brokerUi: 'biometric_prompt',
    minTier: 'partner_verified',
    quota: { sustainedPerMinute: 10, burst: 3 },
    audit: 'call',
    owner: 'platform',
    supportHorizon: 'indefinite, reviewed annually',
    errors: ['CAPABILITY_NOT_DECLARED', 'CONSENT_REQUIRED', 'CONSENT_DENIED', 'TIMEOUT', 'REVOKED'],
  },
  {
    name: 'notify.subscribe',
    version: 1,
    risk: 'low',
    consent: 'while_using',
    osPermission: 'none',
    brokerUi: false,
    minTier: 'self_serve',
    quota: { sustainedPerMinute: 5, burst: 2 },
    audit: 'call',
    owner: 'platform',
    supportHorizon: 'indefinite, reviewed annually',
    errors: ['CAPABILITY_NOT_DECLARED', 'CONSENT_REQUIRED', 'CONSENT_DENIED', 'RATE_LIMITED'],
  },
] as const;

export const CAPABILITY_NAMES = CAPABILITIES.map(c => c.name);

export function findCapability(name: string): CapabilityDef | undefined {
  return CAPABILITIES.find(c => c.name === name);
}
