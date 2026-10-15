import type { HandlerFn } from '../handler';

// No native adapter with the required scope/consent contract exists yet.
export function handleScanner(): HandlerFn {
  return async (_session, args) => {
    if (Object.keys(args).some(key => !['mode'].includes(key))) throw new Error('INVALID_ARGUMENT: unknown field');
    const mode = args.mode ?? 'barcode';
    if (!['barcode', 'qr'].includes(mode as string)) throw new Error('INVALID_ARGUMENT: mode');
    throw new Error('UNAVAILABLE: native capability adapter missing');
  };
}
