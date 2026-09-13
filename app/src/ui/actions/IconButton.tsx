import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ShellPalette } from '../../config/palette';
import { Pressable } from '../primitives/Pressable';
import { LineIcon, LineIconName } from '../primitives/LineIcon';

type Props = {
  glyph: string;
  icon?: LineIconName;
  label: string;
  onPress?: () => void;
  variant?: 'soft' | 'canvas' | 'primary';
  size?: 'sm' | 'md';
  badge?: number;
  haptics?: 'selection' | 'none';
  palette: ShellPalette;
};

export function IconButton({
  glyph,
  icon,
  label,
  onPress,
  variant = 'soft',
  size = 'sm',
  badge,
  haptics = 'selection',
  palette,
}: Props) {
  const bg =
    variant === 'soft' ? palette.primarySoft : variant === 'primary' ? palette.primary : palette.canvas;
  const fg = variant === 'primary' ? palette.onPrimary : variant === 'soft' ? palette.primary : palette.text;
  const dim = size === 'sm' ? 38 : 48;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      haptics={haptics}
      onPress={onPress}
      style={[styles.base, { backgroundColor: bg, width: dim, height: dim, borderRadius: dim / 2 }]}
    >
      {icon ? (
        <LineIcon name={icon} size={18} color={fg} strokeWidth={1.5} />
      ) : (
        <Text style={[styles.glyph, { color: fg }]}>{glyph}</Text>
      )}
      {badge !== undefined && badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: palette.primary }]}>
          <Text style={[styles.badgeText, { color: palette.onPrimary }]}>
            {badge > 9 ? '9+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 18, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
