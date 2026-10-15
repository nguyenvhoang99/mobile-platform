import type { HandlerFn } from '../handler';

// No native adapter with the required scope/consent contract exists yet.
export function handleLocationCurrent(): HandlerFn {
  return async (_session, args) => {
    if (Object.keys(args).some(key => !['precision'].includes(key))) throw new Error('INVALID_ARGUMENT: unknown field');
    if (args.precision !== undefined && args.precision !== 'coarse') throw new Error('INVALID_ARGUMENT: coarse only');
    throw new Error('UNAVAILABLE: native capability adapter missing');
  };
}
