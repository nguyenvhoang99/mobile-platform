/* eslint-disable no-bitwise */
import type { HandlerFn } from '../handler';

// Signs a host-minted challenge. Never returns biometric material or a boolean.
const DEV_SIGN_KEY = 'dev-crypto-sign-key';

function hashHex(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).padEnd(64, '0').slice(0, 64);
}
function hmacLike(key: string, data: string): string {
  return hashHex(key + ':' + data);
}

export function handleCryptoSign(): HandlerFn {
  return async (_session, args) => {
    const challenge = args.challenge as string | undefined;
    if (!challenge || typeof challenge !== 'string' || challenge.length < 8) {
      throw new Error('INVALID_ARGUMENT: challenge required');
    }
    if (challenge.length > 1024) throw new Error('INVALID_ARGUMENT: challenge too long');
    // Hardware-backed assertion in production; here HMAC-like over challenge as a mock assertion.
    const assertion = hmacLike(DEV_SIGN_KEY, challenge);
    return { assertion, algorithm: 'hmac-sha256-mock', challenge };
  };
}
