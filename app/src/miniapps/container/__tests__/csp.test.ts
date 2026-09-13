import { buildCspHeader, isMetaCsp } from '../csp';

describe('CSP (B2)', () => {
  it('builds header from egress hosts', () => {
    const h = buildCspHeader({ appId: 'weather', egressHosts: ['api.weather.local'] });
    expect(h).toContain("connect-src 'self' https://api.weather.local");
    expect(h).toContain("frame-src 'none'");
  });

  it('intersects author request — does not union', () => {
    const h = buildCspHeader({
      appId: 'weather',
      egressHosts: ['api.weather.local'],
      authorRequestedCsp: "connect-src 'self' https://evil.com",
    });
    expect(h).not.toContain('evil.com');
    expect(h).toContain("'self'");
  });

  it('detects meta CSP', () => {
    expect(isMetaCsp('<meta http-equiv="Content-Security-Policy" content="default-src *">')).toBe(true);
    expect(isMetaCsp('<html><head></head>')).toBe(false);
  });
});
