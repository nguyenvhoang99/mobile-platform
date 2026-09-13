/**
 * Auto tests for continuous-render prevention.
 * UX is critical — these run in CI and fail the build if a PR introduces
 * churn on the JS thread.
 *
 * Covers: memo stabilization, stable callbacks, Profiler commit budget,
 * and that critical surfaces don't re-render on unrelated state.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// ── helpers ────────────────────────────────────────────────────────────────
function renderCountSpy() {
  let count = 0;
  const spy = () => {
    count += 1;
  };
  return {
    get: () => count,
    inc: spy,
    reset: () => {
      count = 0;
    },
  };
}

// Synthetic memo contract — proves the mechanism works in this harness
describe('renderStability: memo contract', () => {
  it('React.memo prevents re-render when props shallow-equal', () => {
    const spy = renderCountSpy();
    const Pure = React.memo(function Pure({ a }: { a: number }) {
      spy.inc();
      void a;
      return null;
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Pure a={1} />);
    });
    expect(spy.get()).toBe(1);

    act(() => {
      renderer.update(<Pure a={1} />);
    });
    expect(spy.get()).toBe(1); // memo hit

    act(() => {
      renderer.update(<Pure a={2} />);
    });
    expect(spy.get()).toBe(2); // changed prop -> re-render
  });

  it('unstable inline callback breaks memo', () => {
    const spy = renderCountSpy();
    const Pure = React.memo(function Pure({ onPress }: { onPress: () => void }) {
      spy.inc();
      void onPress;
      return null;
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Pure onPress={() => {}} />);
    });
    expect(spy.get()).toBe(1);
    act(() => {
      // new arrow every render -> memo miss
      renderer.update(<Pure onPress={() => {}} />);
    });
    expect(spy.get()).toBe(2);
  });

  it('useCallback stabilizes callback identity across parent re-renders', () => {
    const spy = renderCountSpy();
    const PureChild = React.memo(function Child({ onPress }: { onPress: () => void }) {
      spy.inc();
      void onPress;
      return null;
    });

    function Parent({ tick }: { tick: number }) {
      // stable across tick changes
      const stable = React.useCallback(() => {}, []);
      void tick;
      return <PureChild onPress={stable} />;
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Parent tick={0} />);
    });
    expect(spy.get()).toBe(1);
    act(() => {
      renderer.update(<Parent tick={1} />);
    });
    expect(spy.get()).toBe(1); // child not re-rendered because onPress stable
  });
});

// ── real surfaces: should be memo ────────────────────────────────────────
import { GlassTabBar } from '../components/GlassTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { MiniAppScreen } from '../screens/MiniAppScreen';

describe('renderStability: critical surfaces are memo', () => {
  const isMemo = (c: unknown) =>
    typeof c === 'object' &&
    c !== null &&
    (c as { $$typeof?: symbol }).$$typeof === Symbol.for('react.memo');

  it('GlassTabBar is memoized (prevents tab bar churn)', () => {
    expect(isMemo(GlassTabBar)).toBe(true);
  });

  it('HomeScreen is memoized', () => {
    expect(isMemo(HomeScreen)).toBe(true);
  });

  it('MiniAppScreen is memoized', () => {
    expect(isMemo(MiniAppScreen)).toBe(true);
  });
});

// ── Profiler commit budget — no continuous renders when idle ──────────────
describe('renderStability: Profiler commit budget', () => {
  it('idle parent re-render causes at most 1 commit for memo child', () => {
    const commitSpy = jest.fn();
    const MemoChild = React.memo(() => null);

    function Parent({ n }: { n: number }) {
      void n;
      return (
        <React.Profiler id="test" onRender={commitSpy}>
          <MemoChild />
        </React.Profiler>
      );
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Parent n={0} />);
    });
    const commitsAfterMount = commitSpy.mock.calls.length;
    // Re-render parent with same child props — Profiler should not see child commit
    act(() => {
      renderer.update(<Parent n={1} />);
    });
    // Child is memo, so Profiler onRender for child tree should be 0-1,
    // total commits for this update should be <=1 (parent only).
    // We assert commitSpy was not called with excessive renders.
    expect(commitSpy.mock.calls.length - commitsAfterMount).toBeLessThanOrEqual(1);
  });

  it('100 rapid parent ticks do not cause 100 child commits', () => {
    let childCommits = 0;
    const MemoChild = React.memo(() => {
      childCommits += 1;
      return null;
    });

    function Parent({ tick }: { tick: number }) {
      void tick;
      return <MemoChild />;
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Parent tick={0} />);
    });
    childCommits = 0; // reset after mount
    act(() => {
      for (let i = 1; i <= 100; i++) {
        renderer.update(<Parent tick={i} />);
      }
    });
    expect(childCommits).toBe(0); // memo prevents all 100
  });
});
