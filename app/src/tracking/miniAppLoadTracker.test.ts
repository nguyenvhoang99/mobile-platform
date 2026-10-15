import { MiniAppLoadTracker, MiniAppLoadEventName } from './miniAppLoadTracker';

const frame = {
  appId: 'weather',
  sessionId: 'weather-session',
  history: ['/'],
};

function harness() {
  let monotonic = 100;
  let wall = 1_000;
  const sink = jest.fn<
    Promise<unknown>,
    [MiniAppLoadEventName, Record<string, unknown>, number]
  >(async () => undefined);
  const tracker = new MiniAppLoadTracker(
    sink,
    () => monotonic,
    () => wall,
  );
  const begin = (
    target = frame,
    kind: 'new_session' | 'existing_session' = 'new_session',
  ) => {
    tracker.begin(target, 1, 'home_pinned', kind, tracker.requestTime());
    return tracker.signalsFor(target)!;
  };
  return {
    tracker,
    sink,
    begin,
    advance: (ms: number) => {
      monotonic += ms;
    },
    changeWall: (value: number) => {
      wall = value;
    },
  };
}

test('separates request/commit/layout with a monotonic clock, despite wall-clock changes', () => {
  const h = harness();
  const requested = h.tracker.requestTime();
  h.advance(20); // Navigation validation belongs to request → commit.
  h.tracker.begin(frame, 1, 'home_pinned', 'new_session', requested);
  const signals = h.tracker.signalsFor(frame)!;
  h.advance(30);
  signals.committed();
  h.advance(40);
  signals.committed(); // Duplicate commits must not move the first milestone.
  h.changeWall(-10_000);
  signals.contentLaidOut();
  signals.contentLaidOut();
  h.tracker.cancel('host_unmounted');
  expect(h.sink).toHaveBeenCalledTimes(2);
  expect(h.sink.mock.calls[0]).toEqual([
    'mini_app_load_started',
    expect.objectContaining({
      mini_app_id: 'weather',
      mini_app_version: 1,
      mini_app_session_id: 'weather-session',
      source: 'home_pinned',
      runtime: 'react_native_poc',
      launch_kind: 'new_session',
    }),
    1_000,
  ]);
  expect(h.sink.mock.calls[1]).toEqual([
    'mini_app_load_finished',
    expect.objectContaining({
      load_id: h.sink.mock.calls[0][1].load_id,
      outcome: 'content_laid_out',
      reason: null,
      elapsed_ms: 90,
      navigation_commit_ms: 50,
      content_layout_ms: 90,
      commit_to_layout_ms: 40,
    }),
    -10_000,
  ]);
});

test.each([
  'background',
  'tenant_changed',
  'host_unmounted',
  'navigation_left',
  'route_changed',
] as const)('settles %s once without inventing layout timings', reason => {
  const h = harness();
  const old = h.begin();
  h.advance(50);
  old.committed();
  h.advance(80);
  h.tracker.cancel(reason);
  old.contentLaidOut();
  h.tracker.cancel(reason);
  expect(h.sink).toHaveBeenCalledTimes(2);
  expect(h.sink.mock.calls[1][1]).toMatchObject({
    outcome: 'interrupted',
    reason,
    elapsed_ms: 130,
    navigation_commit_ms: 50,
    content_layout_ms: null,
    commit_to_layout_ms: null,
  });
});

test('supersession and reopen of the same session reject old callbacks', () => {
  const h = harness();
  const old = h.begin();
  h.advance(10);
  const next = h.begin(frame, 'existing_session');
  old.committed();
  old.contentLaidOut();
  expect(h.sink).toHaveBeenCalledTimes(3);
  expect(h.sink.mock.calls[1][1]).toMatchObject({
    outcome: 'interrupted',
    reason: 'superseded',
  });
  expect(h.sink.mock.calls[0][1].load_id).not.toBe(
    h.sink.mock.calls[2][1].load_id,
  );
  h.advance(20);
  next.committed();
  h.advance(30);
  next.contentLaidOut();
  expect(h.sink.mock.calls[3][1]).toMatchObject({
    outcome: 'content_laid_out',
    launch_kind: 'existing_session',
    elapsed_ms: 50,
    navigation_commit_ms: 20,
    commit_to_layout_ms: 30,
  });
});

test('navigation within the pending route retains the attempt; leaving or changing route cancels it', () => {
  const h = harness();
  h.begin();
  h.tracker.navigationChanged({ ...frame });
  expect(h.sink).toHaveBeenCalledTimes(1);
  expect(
    h.tracker.signalsFor({ ...frame, sessionId: 'forged' }),
  ).toBeUndefined();
  h.tracker.navigationChanged({ ...frame, history: ['/forecast'] });
  expect(h.sink.mock.calls[1][1]).toMatchObject({ reason: 'route_changed' });
  h.begin();
  h.tracker.navigationChanged(undefined);
  expect(h.sink.mock.calls[3][1]).toMatchObject({ reason: 'navigation_left' });
});

test('missing commit is null; no signal is mistaken for first paint or ready', () => {
  const h = harness();
  const signals = h.begin();
  h.advance(20);
  signals.contentLaidOut();
  expect(h.sink.mock.calls[1][1]).toMatchObject({
    elapsed_ms: 20,
    content_layout_ms: 20,
    navigation_commit_ms: null,
    commit_to_layout_ms: null,
  });
  for (const metric of ['fcp_ms', 'lcp_ms', 'ready_ms']) {
    expect(h.sink.mock.calls[1][1]).not.toHaveProperty(metric);
  }
  expect(h.tracker.signalsFor(frame)).toBeUndefined();
});

test.each(['throw', 'reject'] as const)(
  'telemetry %s cannot block launch or completion',
  async mode => {
    const sink = jest.fn(() => {
      if (mode === 'throw') throw new Error('disk unavailable');
      return Promise.reject(new Error('disk unavailable'));
    });
    const tracker = new MiniAppLoadTracker(
      sink,
      () => 100,
      () => 1_000,
    );
    expect(() =>
      tracker.begin(frame, 1, 'category', 'new_session', tracker.requestTime()),
    ).not.toThrow();
    const signals = tracker.signalsFor(frame)!;
    expect(() => signals.contentLaidOut()).not.toThrow();
    await Promise.resolve();
    expect(sink).toHaveBeenCalledTimes(2);
    expect(tracker.signalsFor(frame)).toBeUndefined();
  },
);
