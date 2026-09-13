import {
  createNavigationState,
  goBack,
  isDeclaredRoute,
  navigateInsideMiniApp,
  openCrossMiniApp,
  openDockMiniApp,
  openNotificationMiniApp,
} from './navigationBroker';
import { findMiniApp } from '../miniapps/catalog';

describe('navigation broker', () => {
  test('allows only declared internal routes', () => {
    const weather = findMiniApp('weather');
    expect(weather).toBeDefined();
    expect(isDeclaredRoute(weather!, '/forecast/tomorrow')).toBe(true);
    expect(isDeclaredRoute(weather!, '/admin')).toBe(false);
    expect(isDeclaredRoute(weather!, 'https://example.com')).toBe(false);
    expect(isDeclaredRoute(weather!, '/forecast/%2e%2e')).toBe(false);
  });

  test('keeps internal history inside the current mini-app', () => {
    const opened = openDockMiniApp(createNavigationState(), 'weather');
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const navigated = navigateInsideMiniApp(opened.state, '/forecast/tomorrow');
    expect(navigated.ok).toBe(true);
    if (!navigated.ok) {
      return;
    }
    expect(navigated.state.miniApps[0].history).toEqual([
      '/',
      '/forecast/tomorrow',
    ]);
    expect(navigated.state.miniApps[0].sessionId).toBe(
      opened.state.miniApps[0].sessionId,
    );
    expect(goBack(navigated.state).miniApps[0].history).toEqual(['/']);
  });

  test('opens only reviewed cross-app entrypoints', () => {
    const opened = openDockMiniApp(createNavigationState(), 'weather');
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const transit = openCrossMiniApp(opened.state, 'open_transit', {
      area: 'current',
    });
    expect(transit.ok).toBe(true);
    if (!transit.ok) {
      return;
    }
    expect(transit.state.miniApps.map(frame => frame.appId)).toEqual([
      'weather',
      'transit',
    ]);
    expect(goBack(transit.state).miniApps.at(-1)?.appId).toBe('weather');

    const denied = openCrossMiniApp(opened.state, 'not_declared', {});
    expect(denied).toMatchObject({ ok: false, error: 'LINK_NOT_GRANTED' });
  });

  test('opens notification targets only through host-approved entrypoints', () => {
    const opened = openNotificationMiniApp(
      createNavigationState(),
      'weather',
      'forecast',
      { area: 'current' },
    );
    expect(opened).toMatchObject({
      ok: true,
      state: {
        miniApps: [{ appId: 'weather', entrypoint: 'forecast' }],
      },
    });

    expect(
      openNotificationMiniApp(createNavigationState(), 'weather', 'forecast', {
        arbitrary: 'not declared',
      }),
    ).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(
      openNotificationMiniApp(
        createNavigationState(),
        'weather',
        'not-public',
        {},
      ),
    ).toMatchObject({ ok: false, error: 'ENTRYPOINT_NOT_EXPOSED' });
  });
});
