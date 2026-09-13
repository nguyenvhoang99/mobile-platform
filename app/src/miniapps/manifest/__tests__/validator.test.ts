import { validateManifest } from '../validator';

describe('validateManifest (C9: same file as published schema)', () => {
  const base = {
    id: 'weather',
    name: 'Weather',
    shortName: 'Weather',
    version: 1,
    routes: ['/', '/detail/:id'],
    rootRoute: '/',
    publicEntrypoints: [],
    crossAppLinks: [],
    trackingEvents: [],
  };

  it('accepts a minimal valid manifest', () => {
    expect(validateManifest(base)).toEqual({ ok: true });
  });

  it('rejects missing required fields', () => {
    const r = validateManifest({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/missing required/);
  });

  it('rejects wildcard egress host', () => {
    const r = validateManifest({ ...base, egressHosts: ['*.example.com'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/egressHost/);
  });

  it('rejects unknown top-level field', () => {
    const r = validateManifest({ ...base, evil: true } as unknown as typeof base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/unknown field/);
  });

  it('rejects non-monotonic version type', () => {
    const r = validateManifest({ ...base, version: 0 });
    expect(r.ok).toBe(false);
  });
});
