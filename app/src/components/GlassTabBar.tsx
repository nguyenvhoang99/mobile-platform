import React, { memo, useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShellPalette } from '../config/palette';
import { findMiniApp } from '../miniapps/catalog';
import { DockSelection, DockSlot } from '../navigation/navigationBroker';
import { signalNavigationSelection } from '../native/nativeShell';
import { LineIcon } from '../ui/primitives/LineIcon';

type Props = {
  palette: ShellPalette;
  dockSelection: DockSelection;
  activeMiniAppId: string | null;
  onExplore: () => void;
  onHome?: () => void;
  onOpenMiniApp: (appId: string, slot: DockSlot) => void;
  onRequestSlot: (slot: DockSlot, gesture: 'swipe' | 'long_press') => void;
};

export const GlassTabBar = memo(function GlassTabBar({
  palette,
  dockSelection,
  activeMiniAppId,
  onExplore,
  onHome,
  onOpenMiniApp,
  onRequestSlot,
}: Props) {
  const insets = useSafeAreaInsets();
  const explorePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) > 16 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) < 44) {
            return;
          }
          signalNavigationSelection();
          onRequestSlot(gesture.dx < 0 ? 'left' : 'right', 'swipe');
        },
      }),
    [onRequestSlot],
  );

  const hasAnySlot = Boolean(dockSelection.left || dockSelection.right);

  if (!hasAnySlot) {
    return (
      <View
        pointerEvents="box-none"
        style={[styles.safeArea, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <View
          style={[
            styles.compactBar,
            {
              backgroundColor: palette.glass,
              borderColor: palette.glassBorder,
              shadowColor: palette.shadow,
            },
          ]}
        >
          <View
            style={styles.exploreGesture}
            {...explorePanResponder.panHandlers}
          >
            <Pressable
              accessibilityHint="Vuốt trái hoặc phải để chọn lối tắt mini-app"
              accessibilityLabel="Khám phá"
              accessibilityRole="tab"
              accessibilityState={{ selected: activeMiniAppId === null }}
              onPress={() => {
                signalNavigationSelection();
                onExplore();
              }}
              style={({ pressed }) => [
                styles.tab,
                styles.primaryTab,
                styles.compactPrimaryTab,
                {
                  backgroundColor: palette.primary,
                  shadowColor: palette.primary,
                },
                pressed && styles.pressed,
              ]}
            >
              <LineIcon name="search" size={18} color={palette.onPrimary} strokeWidth={1.6} />
              <Text style={[styles.label, { color: palette.onPrimary }]}>
                Khám phá
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.safeArea, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: palette.glass,
            borderColor: palette.glassBorder,
            shadowColor: palette.shadow,
          },
        ]}
      >
        <ShortcutSlot
          activeMiniAppId={activeMiniAppId}
          appId={dockSelection.left}
          onHome={onHome}
          onOpenMiniApp={onOpenMiniApp}
          onRequestSlot={onRequestSlot}
          palette={palette}
          slot="left"
        />
        <View
          style={styles.exploreGesture}
          {...explorePanResponder.panHandlers}
        >
          <Pressable
            accessibilityHint="Vuốt trái hoặc phải để chọn lối tắt mini-app"
            accessibilityLabel="Khám phá"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeMiniAppId === null }}
            onPress={() => {
              signalNavigationSelection();
              onExplore();
            }}
            style={({ pressed }) => [
              styles.tab,
              styles.primaryTab,
              {
                backgroundColor: palette.primary,
                shadowColor: palette.primary,
              },
              pressed && styles.pressed,
            ]}
          >
            <LineIcon name="search" size={18} color={palette.onPrimary} strokeWidth={1.6} />
            <Text style={[styles.label, { color: palette.onPrimary }]}>
              Khám phá
            </Text>
          </Pressable>
        </View>
        <ShortcutSlot
          activeMiniAppId={activeMiniAppId}
          appId={dockSelection.right}
          onHome={onHome}
          onOpenMiniApp={onOpenMiniApp}
          onRequestSlot={onRequestSlot}
          palette={palette}
          slot="right"
        />
      </View>
    </View>
  );
});

type ShortcutProps = {
  slot: DockSlot;
  appId: string | null;
  activeMiniAppId: string | null;
  palette: ShellPalette;
  onHome?: () => void;
  onOpenMiniApp: (appId: string, slot: DockSlot) => void;
  onRequestSlot: (slot: DockSlot, gesture: 'swipe' | 'long_press') => void;
};

function ShortcutSlot({
  slot,
  appId,
  activeMiniAppId,
  palette,
  onHome,
  onOpenMiniApp,
  onRequestSlot,
}: ShortcutProps) {
  const app = appId ? findMiniApp(appId) : undefined;
  if (!app) {
    // When this slot is not chosen, it acts as the Home screen entrypoint
    const homeSelected = activeMiniAppId === null;
    return (
      <Pressable
        accessibilityHint="Chạm để về Trang chủ, hoặc nhấn giữ để gán lối tắt mini-app"
        accessibilityLabel="Trang chủ"
        accessibilityRole="tab"
        accessibilityState={{ selected: homeSelected }}
        delayLongPress={420}
        onLongPress={() => {
          signalNavigationSelection();
          onRequestSlot(slot, 'long_press');
        }}
        onPress={() => {
          signalNavigationSelection();
          onHome?.();
        }}
        style={({ pressed }) => [
          styles.shortcut,
          homeSelected && { backgroundColor: palette.primarySoft },
          pressed && styles.pressed,
        ]}
      >
        <LineIcon
          name="home"
          size={18}
          color={homeSelected ? palette.primary : palette.mutedText}
          strokeWidth={1.5}
        />
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: homeSelected ? palette.primary : palette.mutedText },
          ]}
        >
          Trang chủ
        </Text>
      </Pressable>
    );
  }

  const selected = activeMiniAppId === app.id;
  return (
    <Pressable
      accessibilityHint="Nhấn giữ để thay lối tắt này"
      accessibilityLabel={app.name}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      delayLongPress={420}
      onLongPress={() => {
        signalNavigationSelection();
        onRequestSlot(slot, 'long_press');
      }}
      onPress={() => {
        signalNavigationSelection();
        onOpenMiniApp(app.id, slot);
      }}
      style={({ pressed }) => [
        styles.shortcut,
        selected && { backgroundColor: palette.primarySoft },
        pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { color: selected ? palette.primary : palette.mutedText },
        ]}
      >
        {app.shortName}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    bottom: 0,
    left: 20,
    position: 'absolute',
    right: 20,
    alignItems: 'center',
  },
  bar: {
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 6,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
    width: '100%',
  },
  compactBar: {
    alignItems: 'center',
    borderRadius: 34,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 6,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
    alignSelf: 'center',
  },
  exploreGesture: {
    flex: 1,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcut: {
    alignItems: 'center',
    borderRadius: 19,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: 3,
  },
  primaryTab: {
    borderRadius: 24,
    marginHorizontal: 4,
    marginTop: -18,
    minHeight: 68,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  compactPrimaryTab: {
    paddingHorizontal: 28,
    minWidth: 120,
    marginTop: 0,
    minHeight: 52,
    borderRadius: 26,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.97 }],
  },
  glyph: {
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    maxWidth: '100%',
  },
});
