import { createMotionTokens, reduceMotion } from './motion';

describe('motion tokens', () => {
  it('merges product tuning without dropping platform defaults', () => {
    const tokens = createMotionTokens({
      durationMs: { standard: 180 },
      scale: { pressed: 0.97 },
    });

    expect(tokens.durationMs.standard).toBe(180);
    expect(tokens.durationMs.emphasized).toBe(300);
    expect(tokens.scale.pressed).toBe(0.97);
    expect(tokens.easing.standard).toEqual([0.2, 0, 0, 1]);
  });

  it('removes travel, scale, and timing for reduced motion', () => {
    const reduced = reduceMotion(createMotionTokens());

    expect(Object.values(reduced.durationMs)).toEqual([0, 0, 0, 0]);
    expect(Object.values(reduced.distance)).toEqual([0, 0, 0, 0]);
    expect(reduced.scale).toEqual({ rest: 1, pressed: 1 });
  });

  it('rejects product tuning outside the platform motion budget', () => {
    expect(() =>
      createMotionTokens({ durationMs: { emphasized: 301 } }),
    ).toThrow('motion.durationMs.emphasized');
    expect(() => createMotionTokens({ distance: { medium: 25 } })).toThrow(
      'motion.distance.medium',
    );
  });
});
