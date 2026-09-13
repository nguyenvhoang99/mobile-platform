import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { layoutTokens } from '../../config/layout';
import { ShellPalette } from '../../config/palette';
import { Pressable } from '../primitives/Pressable';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  children: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  pill?: boolean;
  leadingIcon?: string;
  trailingIcon?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  palette: ShellPalette;
};

const heightForSize: Record<Size, number> = { sm: 36, md: 48, lg: 56 };

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  fullWidth,
  pill,
  leadingIcon,
  trailingIcon,
  accessibilityLabel,
  onPress,
  palette,
}: Props) {
  const colors = colorsForVariant(variant, palette);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      haptics="selection"
      onPress={onPress}
      style={[
        styles.base,
        {
          minHeight: heightForSize[size],
          backgroundColor: colors.bg,
          borderColor: colors.border,
          borderWidth: colors.border ? 1 : 0,
          borderRadius: pill ? layoutTokens.radius.pill : layoutTokens.radius.lg,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth ? styles.fullWidth : undefined,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.fg} size="small" />
        ) : (
          <>
            {leadingIcon ? <Text style={[styles.icon, { color: colors.fg }]}>{leadingIcon}</Text> : null}
            <Text style={[styles.label, { color: colors.fg }]}>{children}</Text>
            {trailingIcon ? <Text style={[styles.icon, { color: colors.fg }]}>{trailingIcon}</Text> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

function colorsForVariant(variant: Variant, palette: ShellPalette) {
  switch (variant) {
    case 'primary':
      return { bg: palette.primary, fg: palette.onPrimary, border: undefined as unknown as string | undefined };
    case 'secondary':
      return { bg: 'transparent', fg: palette.text, border: palette.border };
    case 'ghost':
      return { bg: palette.primarySoft, fg: palette.primary, border: undefined as unknown as string | undefined };
    case 'danger':
      return { bg: palette.danger, fg: palette.onDanger, border: undefined as unknown as string | undefined };
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fullWidth: { alignSelf: 'stretch', flex: 1 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontWeight: '700' },
  icon: { fontSize: 14, fontWeight: '700' },
});
