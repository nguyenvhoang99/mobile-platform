export type ShellPalette = {
  canvas: string;
  canvasAccent: string;
  surface: string;
  surfaceElevated: string;
  glass: string;
  glassBorder: string;
  border: string;
  text: string;
  mutedText: string;
  inverseText: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  success: string;
  warning: string;
  danger: string;
  onDanger: string;
  focus: string;
  disabled: string;
  scrim: string;
  shadow: string;
  statusBarStyle: 'light-content' | 'dark-content';
};

/**
 * The subset safe to expose to untrusted mini-app content. Glass, shadow,
 * scrim, and status-bar tokens remain host-only so a mini-app cannot imitate
 * trusted chrome or permission surfaces.
 */
export type MiniAppPalette = Pick<
  ShellPalette,
  | 'canvas'
  | 'canvasAccent'
  | 'surface'
  | 'surfaceElevated'
  | 'border'
  | 'text'
  | 'mutedText'
  | 'inverseText'
  | 'primary'
  | 'onPrimary'
  | 'primarySoft'
  | 'success'
  | 'warning'
  | 'danger'
  | 'onDanger'
  | 'focus'
  | 'disabled'
>;

/**
 * The shell deliberately consumes semantic tokens rather than literal colours.
 * A signed remote-config payload can later provide these overrides without
 * changing a navigation component or requiring a native release.
 */
export function createPalette(
  overrides: Partial<ShellPalette> = {},
): ShellPalette {
  return {
    canvas: '#F4F7FB',
    canvasAccent: '#E7EDFF',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    glass: 'rgba(255, 255, 255, 0.78)',
    glassBorder: 'rgba(255, 255, 255, 0.92)',
    border: '#DCE2EC',
    text: '#162033',
    mutedText: '#657085',
    inverseText: '#FFFFFF',
    primary: '#5865F2',
    onPrimary: '#FFFFFF',
    primarySoft: '#E8EAFF',
    success: '#16794B',
    warning: '#9A5B00',
    danger: '#C2353F',
    onDanger: '#FFFFFF',
    focus: '#3559E8',
    disabled: '#A8B0BF',
    scrim: 'rgba(14, 22, 38, 0.42)',
    shadow: 'rgba(44, 56, 90, 0.18)',
    statusBarStyle: 'dark-content',
    ...overrides,
  };
}

export function miniAppPaletteFrom(palette: ShellPalette): MiniAppPalette {
  return {
    canvas: palette.canvas,
    canvasAccent: palette.canvasAccent,
    surface: palette.surface,
    surfaceElevated: palette.surfaceElevated,
    border: palette.border,
    text: palette.text,
    mutedText: palette.mutedText,
    inverseText: palette.inverseText,
    primary: palette.primary,
    onPrimary: palette.onPrimary,
    primarySoft: palette.primarySoft,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    onDanger: palette.onDanger,
    focus: palette.focus,
    disabled: palette.disabled,
  };
}
