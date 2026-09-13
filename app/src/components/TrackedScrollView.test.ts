import { newlyReachedScrollDepths } from './TrackedScrollView';

describe('newlyReachedScrollDepths', () => {
  test('returns each crossed threshold once', () => {
    expect(newlyReachedScrollDepths(300, 200, 1000, new Set())).toEqual([
      25, 50,
    ]);
    expect(newlyReachedScrollDepths(800, 200, 1000, new Set([25, 50]))).toEqual(
      [75, 100],
    );
  });

  test('does not emit already reached or invalid depths', () => {
    expect(
      newlyReachedScrollDepths(800, 200, 1000, new Set([25, 50, 75, 100])),
    ).toEqual([]);
    expect(newlyReachedScrollDepths(0, 0, 1000, new Set())).toEqual([]);
    expect(newlyReachedScrollDepths(0, 200, 0, new Set())).toEqual([]);
  });
});
