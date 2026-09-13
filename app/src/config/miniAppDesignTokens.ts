import { LayoutTokens, TypographyTokens } from './layout';
import { MotionTokens, reduceMotion } from './motion';
import { MiniAppPalette, ShellPalette, miniAppPaletteFrom } from './palette';

export type MiniAppDesignTokens = {
  schemaVersion: 1;
  reducedMotion: boolean;
  colors: MiniAppPalette;
  layout: LayoutTokens;
  typography: TypographyTokens;
  motion: MotionTokens;
};

type Input = {
  palette: ShellPalette;
  layout: LayoutTokens;
  typography: TypographyTokens;
  motion: MotionTokens;
  reducedMotion: boolean;
};

/**
 * Builds the read-only, JSON-serializable token snapshot a native container
 * can freeze before mini-app code runs. It deliberately excludes host chrome.
 */
export function createMiniAppDesignTokens(input: Input): MiniAppDesignTokens {
  return {
    schemaVersion: 1,
    reducedMotion: input.reducedMotion,
    colors: miniAppPaletteFrom(input.palette),
    layout: input.layout,
    typography: input.typography,
    motion: input.reducedMotion ? reduceMotion(input.motion) : input.motion,
  };
}
