import { resolveTenantFromCoords, TENANTS } from '../tenants';

describe('resolveTenantFromCoords (multi-tenant MVP)', () => {
  it('resolves Hanoi for Hanoi coords', () => {
    expect(resolveTenantFromCoords({ lat: 21.0285, lon: 105.8542 })).toBe('vn-hn');
  });

  it('resolves HCM for HCM coords', () => {
    expect(resolveTenantFromCoords({ lat: 10.8231, lon: 106.6297 })).toBe('vn-hcm');
  });

  it('resolves Da Nang for Da Nang coords', () => {
    expect(resolveTenantFromCoords({ lat: 16.0544, lon: 108.2022 })).toBe('vn-dn');
  });

  it('falls back when coords are null', () => {
    expect(resolveTenantFromCoords(null)).toBe('vn-fallback');
    expect(resolveTenantFromCoords(undefined)).toBe('vn-fallback');
  });

  it('falls back when far from all MVP provinces (>350km)', () => {
    // Vientiane is ~500km from Hanoi — should be fallback
    expect(resolveTenantFromCoords({ lat: 17.9757, lon: 102.6331 })).toBe('vn-fallback');
  });

  it('picks nearest among candidates', () => {
    // Hue is ~75km from Da Nang, ~500km from Hanoi — should be Da Nang
    expect(resolveTenantFromCoords({ lat: 16.4637, lon: 107.5909 })).toBe('vn-dn');
  });

  it('every tenant has required fields', () => {
    for (const t of Object.values(TENANTS)) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.featuredAppIds.length).toBeGreaterThan(0);
      expect(t.centre.lat).toBeDefined();
    }
  });
});
