import React from 'react';
import { View, ViewProps } from 'react-native';

import { layoutTokens } from '../../config/layout';
import { ShellPalette } from '../../config/palette';

type SpacingKey = keyof typeof layoutTokens.spacing;
type RadiusKey = keyof typeof layoutTokens.radius;

type Props = ViewProps & {
  padding?: SpacingKey;
  paddingHorizontal?: SpacingKey;
  paddingVertical?: SpacingKey;
  gap?: SpacingKey;
  radius?: RadiusKey;
  bg?: keyof ShellPalette;
  borderColor?: keyof ShellPalette;
  children?: React.ReactNode;
};

export function Box({
  padding,
  paddingHorizontal,
  paddingVertical,
  gap,
  radius,
  bg: _bg,
  borderColor: _borderColor,
  style,
  children,
  ...rest
}: Props) {
  return (
    <View
      {...rest}
      style={[
        padding !== undefined && { padding: layoutTokens.spacing[padding] },
        paddingHorizontal !== undefined && {
          paddingHorizontal: layoutTokens.spacing[paddingHorizontal],
        },
        paddingVertical !== undefined && {
          paddingVertical: layoutTokens.spacing[paddingVertical],
        },
        gap !== undefined && { gap: layoutTokens.spacing[gap] },
        radius !== undefined && { borderRadius: layoutTokens.radius[radius] },
        // bg/borderColor are palette keys — callers resolve via palette[bg] at call site
        // or pass style with backgroundColor. This keeps Box free of a palette instance.
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function HStack({
  gap = 'sm',
  style,
  children,
  ...rest
}: Props) {
  return (
    <View style={[{ flexDirection: 'row', gap: layoutTokens.spacing[gap] }, style]} {...rest}>
      {children}
    </View>
  );
}

export function VStack({
  gap = 'sm',
  style,
  children,
  ...rest
}: Props) {
  return (
    <View style={[{ flexDirection: 'column', gap: layoutTokens.spacing[gap] }, style]} {...rest}>
      {children}
    </View>
  );
}
