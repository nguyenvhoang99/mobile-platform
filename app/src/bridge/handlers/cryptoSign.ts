import type { HandlerFn } from '../handler';

// No native adapter with the required scope/consent contract exists yet.
export function handleCryptoSign(): HandlerFn {
  return async (_session, args) => {
    if (Object.keys(args).some(key => !['challenge'].includes(key))) throw new Error('INVALID_ARGUMENT: unknown field');
    if (typeof args.challenge !== 'string' || args.challenge.length < 8 || args.challenge.length > 1024) throw new Error('INVALID_ARGUMENT: challenge');
    throw new Error('UNAVAILABLE: native capability adapter missing');
  };
}
