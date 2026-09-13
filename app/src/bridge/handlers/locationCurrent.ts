import type { HandlerFn } from '../handler';

// One-shot current location, coarse by default. Precise is a separate capability.
// Returns coarse coords or host-derived region — never bulk, never background.
export function handleLocationCurrent(): HandlerFn {
  return async (_session, args) => {
    const precision = (args.precision as string) ?? 'coarse';
    if (!['coarse', 'precise'].includes(precision)) throw new Error('INVALID_ARGUMENT: precision');
    // MVP mock: Hanoi coarse. Real impl uses platform location with coarse flag.
    // Precise requires separate review grant — here we still return coarse if requested without grant.
    return {
      lat: 21.0285,
      lon: 105.8542,
      accuracyM: precision === 'coarse' ? 1500 : 20,
      precision,
      at: new Date().toISOString(),
    };
  };
}
