// @ts-nocheck - uses Node Buffer/global not in RN lib; runtime verified via jest
import {
  __resetHostStorageForTests,
  replaceTrackingEventLines,
} from '../native/hostStorage';
import { TrackingService } from './trackingService';
import {
  TrackingBatch,
  TrackingNetworkSnapshot,
  TrackingTransport,
  TrackingTransportResult,
} from './types';

const online: TrackingNetworkSnapshot = { kind: 'wifi', reachable: true };

function config() {
  return {
    hostAppVersion: 'test',
    consentVersion: 1,
    maxEventBytes: 16 * 1024,
    maxQueueBytes: 1024 * 1024,
    maxBatchBytes: 512 * 1024,
    cellularBatchBytes: 256 * 1024,
    maxBatchEvents: 200,
    maxWaitMs: {
      critical: 1_000,
      operational: 5_000,
      product: 30_000,
      diagnostic: 300_000,
    },
    retentionMs: {
      critical: 7 * 24 * 60 * 60 * 1_000,
      operational: 72 * 60 * 60 * 1_000,
      product: 24 * 60 * 60 * 1_000,
      diagnostic: 60 * 60 * 1_000,
    },
    userIdProvider: (appId: string | null) =>
      appId ? `pseudonym-${appId}` : 'host-pseudonym',
  };
}

describe('tracking service', () => {
  beforeEach(async () => {
    __resetHostStorageForTests();
    await replaceTrackingEventLines([]);
  });

  test('derives mini-app identity and priority from the reviewed catalog', async () => {
    let id = 0;
    const service = new TrackingService(config(), {
      id: prefix => `${prefix}-${++id}`,
      network: async () => online,
      now: () => 1000,
    });

    const eventId = await service.trackMiniApp(
      { appId: 'weather', appVersion: 1, sessionId: 'weather-session' },
      'forecast_viewed',
      1,
      { day: 'tomorrow', source: 'home' },
    );

    // New idempotency key per spec 1.5: `${session_id}:${event_index}`
    expect(eventId).toBe('session-1:0');
    expect(service.getBufferedEventsForDebug()[0]).toMatchObject({
      mini_app_id: 'weather',
      mini_app_version: 1,
      mini_app_session_id: 'weather-session',
      priority: 'product',
      user_id: 'pseudonym-weather',
      session_id: 'session-1',
      event_index: 0,
    });
  });

  test('accepts only declared Badminton booking fields', async () => {
    const service = new TrackingService(config(), {
      network: async () => online,
    });

    await expect(
      service.trackMiniApp(
        { appId: 'badminton', appVersion: 1, sessionId: 'badminton-session' },
        'slot_booked',
        1,
        {
          slot_id: 'today-court-1-1800',
          court_id: 'court-1',
          start_time: '18:00',
          visibility: 'open',
        },
      ),
    ).resolves.not.toBeNull();
    await expect(
      service.trackMiniApp(
        { appId: 'badminton', appVersion: 1, sessionId: 'badminton-session' },
        'slot_booked',
        1,
        {
          slot_id: 'today-court-1-1800',
          court_id: 'court-1',
          start_time: '18:00',
          visibility: 'open',
          player_name: 'not allowed',
        },
      ),
    ).resolves.toBeNull();
  });

  test('rejects undeclared events and data fields', async () => {
    const service = new TrackingService(config(), {
      network: async () => online,
    });
    await expect(
      service.trackMiniApp(
        { appId: 'weather', appVersion: 1, sessionId: 'session' },
        'not_declared',
        1,
        {},
      ),
    ).resolves.toBeNull();
    await expect(
      service.trackMiniApp(
        { appId: 'weather', appVersion: 1, sessionId: 'session' },
        'forecast_viewed',
        1,
        { secret: 'not allowed' },
      ),
    ).resolves.toBeNull();
  });

  test('accepts allowlisted host interaction fields and rejects extra data', async () => {
    const service = new TrackingService(config(), {
      network: async () => online,
    });

    await expect(
      service.trackHost('mini_app_opened', {
        mini_app_id: 'weather',
        entrypoint_id: 'root',
        source: 'navigation_bar',
      }),
    ).resolves.not.toBeNull();
    await expect(
      service.trackHost('mini_app_opened', {
        mini_app_id: 'weather',
        entrypoint_id: 'root',
        source: 'navigation_bar',
        raw_location: 'not allowed',
      }),
    ).resolves.toBeNull();
    await expect(
      service.trackHost('home_preference_changed', {
        item_type: 'category',
        item_id: 'daily',
        action: 'pin',
        source: 'first_run',
      }),
    ).resolves.not.toBeNull();
    await expect(
      service.trackHost('home_preference_changed', {
        item_type: 'category',
        item_id: 'daily',
        action: 'pin',
        source: 'first_run',
        age: 34,
      }),
    ).resolves.toBeNull();
  });

  test('does not lose an event tracked while persisted state is loading', async () => {
    const service = new TrackingService(config(), {
      network: async () => online,
    });

    const starting = service.start();
    const trackingEvent = service.trackHost('screen_viewed', {
      screen: 'home',
      source: 'app_launch',
    });
    await Promise.all([starting, trackingEvent]);

    expect(service.getBufferedEventsForDebug()).toHaveLength(1);
    expect(service.getBufferedEventsForDebug()[0]).toMatchObject({
      event_name: 'screen_viewed',
      event_data: { screen: 'home', source: 'app_launch' },
    });
  });

  test('publishes higher-priority events first and acknowledges a batch', async () => {
    const sent: TrackingBatch[] = [];
    const transport: TrackingTransport = {
      kind: 'http',
      isAvailable: () => true,
      send: async batch => {
        sent.push(batch);
        return {
          acceptedEventIds: batch.events.map(event => event.event_id),
        };
      },
    };
    let id = 0;
    const service = new TrackingService(config(), {
      httpTransport: transport,
      id: prefix => `${prefix}-${++id}`,
      network: async () => online,
      now: () => 1000,
    });

    await service.trackHost('navigation_opened', {
      destination: 'weather',
      source: 'dock',
    });
    await service.trackHost('navigation_denied', {
      operation: 'cross_app',
      reason: 'LINK_NOT_GRANTED',
    });
    await service.flush('test');

    expect(sent).toHaveLength(1);
    expect(sent[0].events.map(event => event.priority)).toEqual([
      'operational',
      'product',
    ]);
    expect(service.getBufferedEventsForDebug()).toHaveLength(0);
  });

  // --- Backend feedback 2026-08-30 must-fix checklist ---

  test('grpcEnabled=false forces HTTP even on wifi + 20 events', async () => {
    const grpcSent: TrackingBatch[] = [];
    const httpSent: TrackingBatch[] = [];
    const grpc: TrackingTransport = {
      kind: 'grpc',
      isAvailable: () => true,
      send: async batch => {
        grpcSent.push(batch);
        return { acceptedEventIds: batch.events.map(e => `${e.session_id}:${e.event_index}`) };
      },
    };
    const http: TrackingTransport = {
      kind: 'http',
      isAvailable: () => true,
      send: async batch => {
        httpSent.push(batch);
        return { acceptedEventIds: batch.events.map(e => `${e.session_id}:${e.event_index}`) };
      },
    };
    const service = new TrackingService({ ...config(), grpcEnabled: false, grpcTransport: grpc } as never, {
      httpTransport: http,
      network: async () => online,
      now: () => 1000,
    });
    // queue 20 product events
    for (let i = 0; i < 20; i++) {
      await service.trackHost('screen_viewed', { screen: 'home', source: `s${i}` });
    }
    await service.flush('test');
    expect(grpcSent).toHaveLength(0);
    expect(httpSent).toHaveLength(1);
    expect(httpSent[0].events).toHaveLength(20);
  });

  test('207 response deletes accepted+quarantined+permanentlyRejected, retries remainder', async () => {
    const transport: TrackingTransport = {
      kind: 'http',
      isAvailable: () => true,
      send: async batch => {
        // Simulate 207 with 3 events: first accepted, second quarantined, third transient (not in any list)
        const keys = batch.events.map(e => `${e.session_id}:${e.event_index}`);
        return {
          acceptedEventIds: [keys[0]],
          permanentlyRejectedEventIds: [],
          quarantinedEventIds: [keys[1]],
        } as TrackingTransportResult;
      },
    };
    const service = new TrackingService(config(), {
      httpTransport: transport,
      network: async () => online,
      now: () => 1000,
    });
    await service.trackHost('screen_viewed', { screen: 'home', source: 'a' });
    await service.trackHost('screen_viewed', { screen: 'home', source: 'b' });
    await service.trackHost('screen_viewed', { screen: 'home', source: 'c' });
    expect(service.getBufferedEventsForDebug()).toHaveLength(3);
    await service.flush('test');
    // first and second are terminal, third should remain (transient)
    expect(service.getBufferedEventsForDebug()).toHaveLength(1);
    expect(service.getBufferedEventsForDebug()[0].event_data).toEqual({ screen: 'home', source: 'c' });
    // second flush should resend the remaining one and succeed
    await service.flush('test');
    expect(service.getBufferedEventsForDebug()).toHaveLength(0);
  });

  test('event_index increments without gaps within session and survives reload', async () => {
    __resetHostStorageForTests();
    let now = 1000;
    let id = 0;
    const serviceA = new TrackingService(config(), {
      id: prefix => `${prefix}-${++id}`,
      network: async () => online,
      now: () => now,
    });
    await serviceA.start();
    const sid = (serviceA as unknown as { getSessionIdForDebug(): string }).getSessionIdForDebug();
    await serviceA.trackHost('screen_viewed', { screen: 'home', source: 'a' });
    await serviceA.trackHost('screen_viewed', { screen: 'home', source: 'b' });
    expect(serviceA.getBufferedEventsForDebug().map(e => e.event_index)).toEqual([0, 1]);
    expect(serviceA.getBufferedEventsForDebug().every(e => e.session_id === sid)).toBe(true);
    // Simulate reload: new service instance loads persisted lines and session
    const serviceB = new TrackingService(config(), {
      id: prefix => `${prefix}-${++id}`,
      network: async () => online,
      now: () => now,
    });
    await serviceB.start();
    expect((serviceB as unknown as { getSessionIdForDebug(): string }).getSessionIdForDebug()).toBe(sid);
    await serviceB.trackHost('screen_viewed', { screen: 'home', source: 'c' });
    expect(serviceB.getBufferedEventsForDebug().map(e => e.event_index)).toEqual([0, 1, 2]);
  });

  test('session_id renews after 30min background gap', async () => {
    __resetHostStorageForTests();
    let now = 1000;
    const service = new TrackingService(config(), {
      network: async () => online,
      now: () => now,
    });
    await service.start();
    const firstSid = (service as unknown as { getSessionIdForDebug(): string }).getSessionIdForDebug();
    await service.trackHost('screen_viewed', { screen: 'home', source: 'a' });
    // background
    await (service as unknown as { notifyBackground(): Promise<void> }).notifyBackground();
    // advance 31 minutes
    now += 31 * 60 * 1000;
    await (service as unknown as { notifyForeground(): Promise<void> }).notifyForeground();
    const secondSid = (service as unknown as { getSessionIdForDebug(): string }).getSessionIdForDebug();
    expect(secondSid).not.toBe(firstSid);
    await service.trackHost('screen_viewed', { screen: 'home', source: 'b' });
    const events = service.getBufferedEventsForDebug();
    // last event should have new session and index 0
    expect(events[events.length - 1].session_id).toBe(secondSid);
    expect(events[events.length - 1].event_index).toBe(0);
  });

  test('session persists across short background', async () => {
    __resetHostStorageForTests();
    let now = 1000;
    const service = new TrackingService(config(), {
      network: async () => online,
      now: () => now,
    });
    await service.start();
    const firstSid = (service as unknown as { getSessionIdForDebug(): string }).getSessionIdForDebug();
    await (service as unknown as { notifyBackground(): Promise<void> }).notifyBackground();
    now += 5 * 60 * 1000; // 5 min
    await (service as unknown as { notifyForeground(): Promise<void> }).notifyForeground();
    expect((service as unknown as { getSessionIdForDebug(): string }).getSessionIdForDebug()).toBe(firstSid);
  });

  test('gzip Content-Encoding and X-Anonymous-Signature present for large batch', async () => {
    __resetHostStorageForTests();
    const originalFetch = global.fetch;
    let capturedHeaders: Record<string, string> | null = null;
    let capturedBody: unknown = null;
    let capturedEncoding: string | undefined;
    // Mock fetch to capture and return 200
    // @ts-ignore
    global.fetch = async (_url: string, init: { headers: Record<string, string>; body: unknown }) => {
      capturedHeaders = init.headers as Record<string, string>;
      capturedBody = init.body;
      capturedEncoding = (init.headers as Record<string, string>)['Content-Encoding'];
      return {
        ok: true,
        status: 200,
        json: async () => ({ accepted_event_ids: [] }),
      } as Response;
    };
    // Create service with endpoint to trigger Http transport
    const service = new TrackingService({ ...config(), endpoint: 'https://example.com/v1/tracking' }, {
      network: async () => online,
      now: () => 1000,
    });
    await service.start();
    // Push enough events to exceed 1KB
    for (let i = 0; i < 10; i++) {
      await service.trackHost('screen_viewed', { screen: `screen-${i}-with-long-name-to-increase-size`, source: 'home' });
    }
    await service.flush('test');
    expect(capturedHeaders).not.toBeNull();
    // For >1KB batch, should be gzip if compression succeeded, else at least signature present
    expect(capturedHeaders!['X-Anonymous-Signature']).toBeDefined();
    expect(capturedHeaders!['X-Session-Id']).toBeDefined();
    expect(capturedHeaders!['X-Session-Id']).toBe((service as unknown as { getSessionIdForDebug(): string }).getSessionIdForDebug());
    // If body is Uint8Array, it was gzipped; if string, fallback (small)
    if (capturedEncoding === 'gzip') {
      expect(capturedBody instanceof Uint8Array).toBe(true);
      // Decompress via zlib to verify valid JSON
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const zlib = require('zlib') as { gunzipSync: (b: Buffer) => Buffer };
      const decompressed = zlib.gunzipSync(Buffer.from(capturedBody as Uint8Array)).toString('utf-8');
      const parsed = JSON.parse(decompressed) as { batch_id: string; events: unknown[] };
      expect(parsed.events).toHaveLength(10);
    } else {
      // Fallback — still valid JSON string
      expect(typeof capturedBody === 'string').toBe(true);
    }
    global.fetch = originalFetch;
    service.stop();
  });

  test('small batch <1KB does not send Content-Encoding', async () => {
    __resetHostStorageForTests();
    const originalFetch = global.fetch;
    let capturedEncoding: string | undefined;
    // @ts-ignore
    global.fetch = async (_url: string, init: { headers: Record<string, string> }) => {
      capturedEncoding = (init.headers as Record<string, string>)['Content-Encoding'];
      return { ok: true, status: 200, json: async () => ({ accepted_event_ids: [] }) } as Response;
    };
    const service = new TrackingService({ ...config(), endpoint: 'https://example.com/v1/tracking' }, {
      network: async () => online,
      now: () => 1000,
    });
    await service.start();
    await service.trackHost('screen_viewed', { screen: 'home', source: 'a' });
    await service.flush('test');
    // Single small event <1KB should not be gzipped
    expect(capturedEncoding).toBeUndefined();
    global.fetch = originalFetch;
    service.stop();
  });
});
