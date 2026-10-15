import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import App from '../App';
import { HomeScreen } from '../src/screens/HomeScreen';
import { MiniAppScreen } from '../src/screens/MiniAppScreen';
import { GlassTabBar } from '../src/components/GlassTabBar';
import { MiniAppPickerModal } from '../src/components/MiniAppPickerModal';
import { TenantPickerSheet } from '../src/components/TenantPickerSheet';
import { tracking } from '../src/tracking';
import type { InboxNotification } from '../src/notification';

let mockActivate: (input: { notification: InboxNotification }) => void;

// Keep host orchestration and the real mini-app screen; unrelated home animations
// are outside this signal test and do not represent device performance evidence.
jest.mock('../src/screens/HomeScreen', () => ({
  HomeScreen: jest.fn(() => null),
}));

jest.mock('../src/hooks/useTenant', () => ({
  useTenant: () => ({
    tenantId: 'vn-fallback',
    profile: null,
    loading: false,
    switchTenant: jest.fn(),
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/tracking', () => ({
  tracking: {
    trackHost: jest.fn(async () => null),
    trackMiniApp: jest.fn(async () => null),
    start: jest.fn(async () => undefined),
    stop: jest.fn(),
    flush: jest.fn(async () => undefined),
    notifyForeground: jest.fn(async () => undefined),
    notifyBackground: jest.fn(async () => undefined),
  },
}));
jest.mock('../src/notification', () => ({
  notification: {
    subscribe: jest.fn(() => () => undefined),
    onForegroundReceived: jest.fn(() => () => undefined),
    onActivated: jest.fn(listener => {
      mockActivate = listener;
      return () => undefined;
    }),
    start: jest.fn(async () => undefined),
    stop: jest.fn(),
    refreshPermissionStatus: jest.fn(async () => undefined),
  },
}));

describe('host mini-app load signal wiring', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  const events = (name: string) =>
    jest.mocked(tracking.trackHost).mock.calls.filter(call => call[0] === name);
  const layout = (width = 300, height = 600) => ({
    nativeEvent: { layout: { width, height, x: 0, y: 0 } },
  });
  const content = () =>
    renderer.root.findByProps({ testID: 'miniapp-load-content' });
  const screen = () =>
    renderer.root.findByType(
      (MiniAppScreen as unknown as { type: React.ElementType }).type,
    );
  const dock = () =>
    renderer.root.findByType(
      (GlassTabBar as unknown as { type: React.ElementType }).type,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });
  });
  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    jest.restoreAllMocks();
  });

  test('home open commits before content layout; zero layout and repeated visible open do not complete twice', async () => {
    await act(async () => {
      renderer.root
        .findByType(HomeScreen)
        .props.onOpenMiniApp('weather', 'home_pinned');
    });
    expect(events('mini_app_load_started')).toHaveLength(1);
    expect(events('mini_app_load_finished')).toHaveLength(0);
    await act(async () => {
      content().props.onLayout(layout(0, 0));
    });
    expect(events('mini_app_load_finished')).toHaveLength(0);
    await act(async () => {
      content().props.onLayout(layout());
    });
    expect(events('mini_app_load_finished')[0][1]).toMatchObject({
      outcome: 'content_laid_out',
      source: 'home_pinned',
      runtime: 'react_native_poc',
      navigation_commit_ms: expect.any(Number),
      commit_to_layout_ms: expect.any(Number),
    });
    await act(async () => {
      dock().props.onOpenMiniApp('weather');
      content().props.onLayout(layout());
    });
    expect(events('mini_app_load_started')).toHaveLength(1);
    expect(events('mini_app_load_finished')).toHaveLength(1);
  });

  test('rapid dock switching interrupts the old attempt; retained-session reopen and close settle independently', async () => {
    await act(async () => {
      renderer.root
        .findByType(HomeScreen)
        .props.onOpenMiniApp('weather', 'category');
    });
    const oldLayout = content().props.onLayout;
    await act(async () => {
      dock().props.onOpenMiniApp('notes');
    });
    await act(async () => {
      oldLayout(layout());
    });
    expect(events('mini_app_load_finished')).toHaveLength(1);
    expect(events('mini_app_load_finished')[0][1]).toMatchObject({
      outcome: 'interrupted',
      reason: 'superseded',
    });
    await act(async () => {
      content().props.onLayout(layout());
    });
    await act(async () => {
      dock().props.onOpenMiniApp('weather');
    });
    expect(events('mini_app_load_started')[2][1]).toMatchObject({
      launch_kind: 'existing_session',
    });
    await act(async () => {
      screen().props.onClose();
    });
    expect(events('mini_app_load_finished')[2][1]).toMatchObject({
      outcome: 'interrupted',
      reason: 'navigation_left',
    });
  });

  test('background interrupts pending layout and foreground never turns it into a completed load', async () => {
    const listenerSpy = jest.spyOn(AppState, 'addEventListener');
    // Remount to capture this App instance's actual listener.
    await act(async () => {
      renderer.unmount();
      renderer = TestRenderer.create(<App />);
    });
    const changed = listenerSpy.mock.calls
      .filter(call => call[0] === 'change')
      .at(-1)![1];
    await act(async () => {
      renderer.root
        .findByType(HomeScreen)
        .props.onOpenMiniApp('notes', 'category');
    });
    const oldLayout = content().props.onLayout;
    await act(async () => {
      changed('background');
      changed('active');
      oldLayout(layout());
    });
    expect(events('mini_app_load_finished')).toHaveLength(1);
    expect(events('mini_app_load_finished')[0][1]).toMatchObject({
      reason: 'background',
      content_layout_ms: null,
    });
  });

  test('notification opens have their own measurements, including repeated targets with new sessions', async () => {
    const target = {
      mini_app_id: 'weather',
      entrypoint_id: 'forecast',
      input: {},
    };
    await act(async () => {
      mockActivate({ notification: { target } as InboxNotification });
    });
    expect(events('mini_app_load_started')).toHaveLength(1);
    expect(events('mini_app_load_started')[0][1]).toMatchObject({
      source: 'notification',
    });
    const oldLayout = content().props.onLayout;
    await act(async () => {
      mockActivate({ notification: { target } as InboxNotification });
    });
    await act(async () => {
      oldLayout(layout());
      content().props.onLayout(layout());
    });
    expect(events('mini_app_load_started')).toHaveLength(2);
    expect(
      events('mini_app_load_finished').map(call => call[1].outcome),
    ).toEqual(['interrupted', 'content_laid_out']);
  });

  test('a denied open does not create a load attempt', async () => {
    await act(async () => {
      renderer.root
        .findByType(HomeScreen)
        .props.onOpenMiniApp('unknown', 'category');
    });
    expect(events('mini_app_load_started')).toHaveLength(0);
    expect(events('navigation_denied')).toHaveLength(1);
  });

  test('picker and cross-app launches use separate sources and screen-session signals', async () => {
    await act(async () => {
      dock().props.onRequestSlot('left', 'long_press');
    });
    await act(async () => {
      renderer.root.findByType(MiniAppPickerModal).props.onSelect('weather');
    });
    expect(events('mini_app_load_started')[0][1]).toMatchObject({
      source: 'mini_app_picker',
    });
    await act(async () => {
      content().props.onLayout(layout());
    });
    await act(async () => {
      screen().props.onOpenCrossApp('open_transit');
    });
    expect(events('mini_app_load_started')[1][1]).toMatchObject({
      source: 'cross_app',
      mini_app_id: 'transit',
    });
    await act(async () => {
      content().props.onLayout(layout());
    });
    expect(events('mini_app_load_finished')).toHaveLength(2);
  });

  test('Sample content reports layout through the host; tenant switching invalidates its pending signals', async () => {
    await act(async () => {
      renderer.root
        .findByType(HomeScreen)
        .props.onOpenMiniApp('sample', 'category');
    });
    const staleLayout = content().props.onLayout;
    await act(async () => {
      renderer.root.findByType(TenantPickerSheet).props.onSelect('vn-hn');
    });
    await act(async () => {
      staleLayout(layout());
    });
    expect(events('mini_app_load_finished')).toHaveLength(1);
    expect(events('mini_app_load_finished')[0][1]).toMatchObject({
      reason: 'tenant_changed',
      content_layout_ms: null,
    });
  });

  test('unmount settles a pending launch once', async () => {
    await act(async () => {
      renderer.root
        .findByType(HomeScreen)
        .props.onOpenMiniApp('notes', 'category');
    });
    const staleLayout = content().props.onLayout;
    await act(async () => { renderer.unmount(); });
    await act(async () => { staleLayout(layout()); });
    expect(events('mini_app_load_finished')).toHaveLength(1);
    expect(events('mini_app_load_finished')[0][1]).toMatchObject({
      reason: 'host_unmounted',
    });
  });
});
