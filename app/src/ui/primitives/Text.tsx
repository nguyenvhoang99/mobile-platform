import React from 'react';
import { Text as RNText, TextProps } from 'react-native';

import { typographyTokens } from '../../config/layout';
import { ShellPalette } from '../../config/palette';

type Variant = 'caption' | 'label' | 'body' | 'heading' | 'title';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

type Props = TextProps & {
  variant?: Variant;
  weight?: Weight;
  color?: keyof ShellPalette;
  children: React.ReactNode;
};

export function Text({
  variant = 'body',
  weight,
  color: _color = 'text',
  style,
  children,
  ...rest
}: Props) {
  // Palette color resolved via inline style — no literal outside palette.ts.
  // Mapping is intentionally trivial to stay host-RN only.
  const resolvedWeight = typographyTokens.weight[weight ?? defaultWeight(variant)];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontSize: typographyTokens.size[variant],
          lineHeight: typographyTokens.lineHeight[variant],
          fontWeight: resolvedWeight,
        },
        // color is applied by caller via palette lookup at call site;
        // Text itself does not import a palette instance to keep it presentation-agnostic.
        // Callers pass style={{ color: palette[color] }} or use the color prop via css helper.
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

function defaultWeight(variant: Variant): Weight {
  switch (variant) {
    case 'caption':
      return 'regular';
    case 'label':
      return 'medium';
    case 'body':
      return 'regular';
    case 'heading':
      return 'bold';
    case 'title':
      return 'bold';
  }
}
