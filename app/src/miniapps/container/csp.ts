/**
 * CSP — served as HTTP response header, NEVER as <meta> (B2).
 * Derived from manifest's declared hosts; authors may tighten, never loosen.
 * Host egress allowlist and CSP connect-src are derived from the SAME manifest
 * field so they cannot diverge.
 */

export type CspInput = {
  appId: string;
  egressHosts: readonly string[]; // exact hosts, no wildcards (validated by manifest)
  authorRequestedCsp?: string; // optional tightening request — we intersect, not union
};

function parseCspDirectives(csp: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [dir, ...vals] = trimmed.split(/\s+/);
    map.set(dir, new Set(vals));
  }
  return map;
}

export function buildCspHeader(input: CspInput): string {
  // connect-src is exactly the declared egress hosts + self; never wildcard.
  const connectSrc = ["'self'", ...input.egressHosts.map(h => `https://${h}`)];

  // If author requested a CSP, intersect — they may remove sources, not add.
  if (input.authorRequestedCsp) {
    const authorDirs = parseCspDirectives(input.authorRequestedCsp);
    const authorConnect = authorDirs.get('connect-src');
    if (authorConnect) {
      const allowed = new Set(connectSrc);
      const tightened = [...authorConnect].filter(v => allowed.has(v) || v === "'self'");
      // Intersect: keep only those in both
      const final = tightened.length > 0 ? tightened : ["'self'"];
      // If author added a host not in egressHosts, it's dropped.
      return [
        "default-src 'self'",
        `script-src 'self'`,
        `connect-src ${final.join(' ')}`,
        `frame-src 'none'`,
        `object-src 'none'`,
        `base-uri 'none'`,
      ].join('; ');
    }
  }

  return [
    "default-src 'self'",
    `script-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'none'`,
  ].join('; ');
}

/** Assert CSP is a header, not a meta tag — for tests (B2). */
export function isMetaCsp(html: string): boolean {
  return /<meta[^>]*http-equiv=["']Content-Security-Policy/i.test(html);
}
