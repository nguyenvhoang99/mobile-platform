import { decideNavigation } from '../navigationGuard';

const declared = ['/', '/detail/:id', '/bookings'];

describe('decideNavigation (B3)', () => {
  it('allows own origin + declared path', () => {
    expect(
      decideNavigation(
        { url: 'mini://weather/', isMainFrame: true },
        { appId: 'weather', declaredRoutes: declared, isAndroid: false },
      ),
    ).toEqual({ allowed: true });
    expect(
      decideNavigation(
        { url: 'mini://weather/detail/tomorrow', isMainFrame: true },
        { appId: 'weather', declaredRoutes: declared, isAndroid: false },
      ),
    ).toEqual({ allowed: true });
  });

  it('blocks foreign origin', () => {
    expect(
      decideNavigation(
        { url: 'mini://other/', isMainFrame: true },
        { appId: 'weather', declaredRoutes: declared, isAndroid: false },
      ),
    ).toMatchObject({ allowed: false, reason: 'HOST_MISMATCH' });
  });

  it('blocks foreign scheme', () => {
    expect(
      decideNavigation(
        { url: 'https://evil.com/', isMainFrame: true },
        { appId: 'weather', declaredRoutes: declared, isAndroid: false },
      ),
    ).toMatchObject({ allowed: false });
    expect(
      decideNavigation(
        { url: 'tel:0901234567', isMainFrame: true },
        { appId: 'weather', declaredRoutes: declared, isAndroid: false },
      ),
    ).toMatchObject({ allowed: false });
  });

  it('blocks undeclared path', () => {
    expect(
      decideNavigation(
        { url: 'mini://weather/admin', isMainFrame: true },
        { appId: 'weather', declaredRoutes: declared, isAndroid: false },
      ),
    ).toMatchObject({ allowed: false, reason: 'PATH_NOT_DECLARED' });
  });

  it('blocks new window (not main frame)', () => {
    expect(
      decideNavigation(
        { url: 'mini://weather/', isMainFrame: false },
        { appId: 'weather', declaredRoutes: declared, isAndroid: false },
      ),
    ).toMatchObject({ allowed: false, reason: 'NOT_MAIN_FRAME' });
  });

  it('accepts Android asset-loader origin', () => {
    expect(
      decideNavigation(
        { url: 'https://weather.miniapp.platform.local/', isMainFrame: true },
        { appId: 'weather', declaredRoutes: declared, isAndroid: true },
      ),
    ).toEqual({ allowed: true });
  });
});
