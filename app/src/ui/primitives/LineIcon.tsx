import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ShellPalette } from '../../config/palette';

/**
 * Line (Outlined) Icon — thin stroke, transparent fill.
 * Centralizes all iconography so product can swap the set without touching
 * screens. Uses Unicode + border-stroke to achieve an outlined look without
 * adding a native dependency (lucide/react-native-svg would be the next step
 * if we need pixel-perfect stroke control).
 *
 * To move to `lucide-react-native` later:
 *   1. `npm i lucide-react-native react-native-svg`
 *   2. Replace the `GLYPH` map with `import { Trophy, Sun, ... } from 'lucide-react-native'`
 *   3. Keep this component's props (`name`, `size`, `color`) stable.
 */
export type LineIconName =
  | 'trophy' // sport
  | 'sun' // daily
  | 'map-pin' // around_you
  | 'target' // plan_focus
  | 'trending-up' // money
  | 'credit-card' // finance
  | 'badminton'
  | 'cloud-sun' // weather
  | 'bus' // transit
  | 'file-text' // notes
  | 'shopping-bag' // market
  | 'split' // split-bill
  | 'bell'
  | 'user'
  | 'plus'
  | 'more-horizontal' // 6th "view all"
  | 'chevron-right'
  | 'check'
  | 'x'
  | 'search'
  | 'home';

const GLYPH: Record<LineIconName, string> = {
  trophy: '🏆',
  sun: '○',
  'map-pin': '⌖',
  target: '◎',
  'trending-up': '↗',
  'credit-card': '▭',
  badminton: '🏸',
  'cloud-sun': '☀',
  bus: '🚌',
  'file-text': '✎',
  'shopping-bag': '◇',
  split: '₫',
  bell: '🔔',
  user: '◯',
  plus: '＋',
  'more-horizontal': '⋯',
  'chevron-right': '›',
  check: '✓',
  x: '×',
  search: '⌕',
  home: '⌂',
};

type Props = {
  name: LineIconName;
  size?: number;
  color?: string;
  palette?: ShellPalette; // optional, for future tint logic
  strokeWidth?: number;
};

export function LineIcon({ name, size = 20, color = '#657085', strokeWidth = 1.4 }: Props) {
  const glyph = GLYPH[name] ?? '○';
  // Outlined circle container — the "line" part
  // Thin border + transparent fill + centered glyph in thin weight
  return (
    <View
      accessibilityIgnoresInvertColors
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: color,
          backgroundColor: 'transparent',
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.glyph,
          {
            color,
            fontSize: size * 0.52,
            lineHeight: size * 0.58,
            fontWeight: '300',
          },
        ]}
      >
        {glyph}
      </Text>
    </View>
  );
}

// Uncircled variant for inline use where the circle would be redundant
export function LineGlyph({ name, size = 16, color = '#657085' }: Props) {
  const glyph = GLYPH[name] ?? '○';
  return (
    <Text
      allowFontScaling={false}
      style={{
        color,
        fontSize: size,
        lineHeight: size,
        fontWeight: '300',
        letterSpacing: 0,
      }}
    >
      {glyph}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});
