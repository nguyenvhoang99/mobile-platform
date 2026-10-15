import type { HandlerFn } from '../handler';

/**
 * net.request — host-mediated egress to exact manifest hosts.
 * No cookies, stripped referrer, quotas, logged. Never a pass-through wildcard.
 */

export function handleNetRequest(allowedHosts: readonly string[]): HandlerFn {
  return async (_session, args) => {
    if (Object.keys(args).some(key => !['url', 'method'].includes(key))) throw new Error('INVALID_ARGUMENT: unknown field');
    const url = args.url as string | undefined;
    if (args.method !== undefined && typeof args.method !== 'string') throw new Error('INVALID_ARGUMENT: method');
    const method = ((args.method as string) ?? 'GET').toUpperCase();

    if (!url || typeof url !== 'string') throw new Error('INVALID_ARGUMENT: url required');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('INVALID_ARGUMENT: invalid url');
    }
    if (!allowedHosts.includes(parsed.hostname)) {
      throw new Error('INVALID_ARGUMENT: host not declared');
    }
    if (parsed.protocol !== 'https:') throw new Error('INVALID_ARGUMENT: only https allowed');
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('INVALID_ARGUMENT: method not allowed');

    // RN fetch cannot prove redirect/cookie isolation or bounded native reads.
    // Keep egress disabled until an owned native transport enforces that contract.
    throw new Error('UNAVAILABLE: native egress adapter missing');
  };
}
