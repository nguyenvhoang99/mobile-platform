import type { HandlerFn } from '../handler';

// Host-owned scanner — pixels never cross the bridge; only the decoded string does.
export function handleScanner(): HandlerFn {
  return async (_session, args) => {
    const mode = (args.mode as string) ?? 'barcode';
    if (!['barcode', 'qr'].includes(mode)) throw new Error('INVALID_ARGUMENT: mode');
    // In production this presents the native scanner sheet and returns the decoded value.
    // MVP: return a mock value so the contract is testable.
    return { value: 'MOCK-SCAN-12345', format: mode };
  };
}
