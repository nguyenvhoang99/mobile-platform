import React from 'react';
import {
  Pressable as RNPressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

import { layoutTokens } from '../../config/layout';
import { useReducedMotion } from '../../config/useReducedMotion';
import { signalNavigationSelection } from '../../native/nativeShell';

type Props = Omit<PressableProps, 'style'> & {
  haptics?: 'selection' | 'none';
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
};

/**
 * Single host press primitive. Enforces touchTarget, pressed appearance,
 * reduced-motion, and optional selection haptics in one place.
 * All host screens must go through this (or Button/IconButton which wrap it).
 */
export function Pressable({
  haptics = 'none',
  hitSlop,
  onPress,
  style,
  children,
  ...rest
}: Props) {
  const reducedMotion = useReducedMotion();

  return (
    <RNPressable
      {...rest}
      hitSlop={
        hitSlop !== undefined
          ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }
          : { top: 4, bottom: 4, left: 4, right: 4 }
      }
      onPress={event => {
        if (haptics === 'selection') signalNavigationSelection();
        onPress?.(event);
      }}
      style={state => {
        const base = Array.isArray(style) ? Object.assign({}, ...style) : style;
        const pressedStyle: ViewStyle | undefined = state.pressed
          ? {
              opacity: 0.76,
              ...(reducedMotion ? null : { transform: [{ scale: 0.98 }] }),
            }
          : undefined;

        // Enforce minimum touch target via minHeight/minWidth if not already set.
        const rawMinHeight = (base as ViewStyle | undefined)?.minHeight;
        const numericMinHeight =
          typeof rawMinHeight === 'number' ? rawMinHeight : 0;
        const touchEnforced: ViewStyle = {
          minHeight: Math.max(numericMinHeight, layoutTokens.size.touchTarget),
          // minWidth not forced globally — some inline pills are narrower.
        };

        const resolved =
          typeof children === 'function'
            ? undefined // style handled above; children fn not memoized here
            : undefined;

        void resolved;

        if (typeof style === 'function') {
          // Support render-prop style if caller passed a function (rare).
          const fn = style as unknown as (s: { pressed: boolean }) => ViewStyle;
          return [touchEnforced, fn(state), pressedStyle] as unknown as ViewStyle;
        }

        return [touchEnforced, base, pressedStyle] as unknown as ViewStyle;
      }}
    >
      {children as never}
    </RNPressable>
  );
}
