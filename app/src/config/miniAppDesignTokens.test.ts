import { layoutTokens, typographyTokens } from './layout';
import { createMiniAppDesignTokens } from './miniAppDesignTokens';
import { createMotionTokens } from './motion';
import { createPalette } from './palette';

describe('mini-app design token snapshot', () => {
  it('is serializable and excludes host-only chrome tokens', () => {
    const tokens = createMiniAppDesignTokens({
      palette: createPalette(),
      layout: layoutTokens,
      typography: typographyTokens,
      motion: createMotionTokens(),
      reducedMotion: false,
    });

    expect(JSON.parse(JSON.stringify(tokens))).toEqual(tokens);
    expect(tokens.colors.primary).toBeDefined();
    expect('glass' in tokens.colors).toBe(false);
    expect('statusBarStyle' in tokens.colors).toBe(false);
  });

  it('propagates reduced motion into the mini-app snapshot', () => {
    const tokens = createMiniAppDesignTokens({
      palette: createPalette(),
      layout: layoutTokens,
      typography: typographyTokens,
      motion: createMotionTokens(),
      reducedMotion: true,
    });

    expect(tokens.reducedMotion).toBe(true);
    expect(tokens.motion.durationMs.emphasized).toBe(0);
    expect(tokens.motion.distance.medium).toBe(0);
  });
});
