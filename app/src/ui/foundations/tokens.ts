/**
 * ui/foundations/tokens — single re-export for the host design system.
 *
 * Single-source rule: no token value may be inlined elsewhere.
 * Colors, spacing, radius, typography, and motion all come from app/src/config/*.
 * To change a value edit policy/budgets.md or app/src/config/* — not here.
 */

export { createPalette, miniAppPaletteFrom } from '../../config/palette';
export type { ShellPalette, MiniAppPalette } from '../../config/palette';

export {
  layoutTokens,
  typographyTokens,
} from '../../config/layout';
export type { LayoutTokens, TypographyTokens } from '../../config/layout';

export {
  createMotionTokens,
  reduceMotion,
} from '../../config/motion';
export type { MotionTokens, MotionOverrides, CubicBezier } from '../../config/motion';

export { appConfig } from '../../config/appConfig';

/**
 * Convenience: the frozen mini-app token snapshot shape.
 * Container freezes a MiniAppDesignTokens per mini-app launch.
 */
export type { MiniAppDesignTokens } from '../../config/miniAppDesignTokens';
export { createMiniAppDesignTokens } from '../../config/miniAppDesignTokens';

/**
 * Budgets — re-exported so screens that need timing ceilings import from here
 * rather than duplicating a literal. Values are generated from policy/budgets.md.
 */
export * from '../../config/budgets';
