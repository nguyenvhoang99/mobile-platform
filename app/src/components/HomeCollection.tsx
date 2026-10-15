import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ShellPalette } from '../config/palette';
import { useReducedMotion } from '../config/useReducedMotion';
import { signalNavigationSelection } from '../native/nativeShell';
import { signalRemoval } from '../native/haptics';
import { LineIcon } from '../ui/primitives/LineIcon';
import type { LineIconName } from '../ui/primitives/LineIcon';

export type HomeCollectionItem = {
  id: string;
  label: string;
  description: string;
  /** Giữ lại cho tương thích — tile hiện chỉ render text, không render icon. */
  glyph: string;
  /** Giữ lại cho tương thích — tile hiện chỉ render text, không render icon. */
  icon?: LineIconName;
  badge?: string;
};

export type HomeCollectionLayout = 'constellation' | 'list' | 'rail';

type Props = {
  items: readonly HomeCollectionItem[];
  layout: HomeCollectionLayout;
  palette: ShellPalette;
  selectedIds?: ReadonlySet<string>;
  editingId?: string | null;
  onPress?: (item: HomeCollectionItem) => void;
  onLongPress?: (item: HomeCollectionItem) => void;
  onRemove?: (item: HomeCollectionItem) => void;
  empty?: ReactNode;
};

export function HomeCollection({
  items,
  layout,
  palette,
  selectedIds = new Set(),
  editingId = null,
  onPress,
  onLongPress,
  onRemove,
  empty,
}: Props) {
  if (items.length === 0) {
    return <>{empty ?? null}</>;
  }

  const isEditing = editingId !== null;
  const content = items.map((item, index) => (
    <HomeCollectionTile
      editing={isEditing}
      item={item}
      key={item.id}
      layout={layout}
      onLongPress={onLongPress}
      onPress={onPress}
      onRemove={onRemove}
      palette={palette}
      position={index}
      selected={selectedIds.has(item.id)}
    />
  ));

  if (layout === 'rail') {
    return (
      <ScrollView
        contentContainerStyle={styles.rail}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View
      style={layout === 'constellation' ? styles.constellation : styles.list}
    >
      {content}
    </View>
  );
}

type TileProps = {
  item: HomeCollectionItem;
  layout: HomeCollectionLayout;
  palette: ShellPalette;
  position: number;
  selected: boolean;
  editing: boolean;
  onPress?: (item: HomeCollectionItem) => void;
  onLongPress?: (item: HomeCollectionItem) => void;
  onRemove?: (item: HomeCollectionItem) => void;
};

function HomeCollectionTile({
  item,
  layout,
  palette,
  position,
  selected,
  editing,
  onPress,
  onLongPress,
  onRemove,
}: TileProps) {
  const reducedMotion = useReducedMotion();
  const jiggle = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(editing ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;
  const [isExiting, setIsExiting] = useState(false);
  const prevSelected = useRef(false);

  useEffect(() => {
    if (editing && !reducedMotion && !isExiting) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(jiggle, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(jiggle, { toValue: -1, duration: 120, useNativeDriver: true }),
          Animated.timing(jiggle, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(jiggle, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    jiggle.setValue(0);
    return undefined;
  }, [editing, jiggle, reducedMotion, isExiting]);

  useEffect(() => {
    if (reducedMotion) {
      badgeScale.setValue(editing ? 1 : 0);
      return;
    }
    Animated.timing(badgeScale, {
      toValue: editing ? 1 : 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [editing, badgeScale, reducedMotion]);

  useEffect(() => {
    if (selected && !prevSelected.current && !isExiting && !reducedMotion) {
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.96, duration: 50, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
    }
    prevSelected.current = selected;
    if (!selected) pulse.setValue(1);
  }, [selected, isExiting, pulse, reducedMotion]);

  const handleRemovePress = () => {
    if (!onRemove || isExiting) return;
    signalNavigationSelection();
    signalRemoval();
    if (reducedMotion) {
      onRemove(item);
      return;
    }
    setIsExiting(true);
    Animated.timing(exitAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onRemove(item);
    });
  };

  const wrapperStyle = [
    layout === 'constellation'
      ? styles.constellationItem
      : layout === 'rail'
      ? styles.railItem
      : styles.listItem,
    layout === 'constellation' && position % 3 === 1
      ? styles.constellationOffset
      : null,
  ];
  const tileStyle = [
    styles.tile,
    layout === 'constellation'
      ? styles.constellationTile
      : layout === 'rail'
      ? styles.railTile
      : styles.listTile,
    {
      backgroundColor: selected ? palette.primarySoft : palette.surface,
      borderColor: selected ? palette.primary : palette.glassBorder,
      shadowColor: palette.shadow,
    },
  ];

  const animatedStyle = reducedMotion
    ? undefined
    : {
        transform: [
          ...(editing
            ? [
                {
                  rotate: jiggle.interpolate({
                    inputRange: [-1, 1],
                    outputRange: ['-1.2deg', '1.2deg'],
                  }),
                } as const,
              ]
            : []),
          { scale: pulse },
        ],
      };

  const badgeAnimatedStyle = {
    transform: [{ scale: badgeScale }],
    opacity: badgeScale,
  };

  const exitStyle = reducedMotion
    ? undefined
    : {
        opacity: exitAnim,
        transform: [{ scale: exitAnim }],
      };

  return (
    <Animated.View style={[wrapperStyle, exitStyle]}>
      <Animated.View style={animatedStyle}>
        <Pressable
          accessibilityHint={
            onLongPress
              ? selected
                ? 'Đã chọn. Nhấn giữ để chỉnh sửa trên Trang chủ.'
                : 'Nhấn giữ để thêm vào Trang chủ.'
              : undefined
          }
          accessibilityLabel={item.label}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          delayLongPress={420}
          onLongPress={
            onLongPress
              ? () => {
                  signalNavigationSelection();
                  onLongPress(item);
                }
              : undefined
          }
          onPress={
            onPress
              ? () => {
                  signalNavigationSelection();
                  onPress(item);
                }
              : undefined
          }
          style={({ pressed }) => [tileStyle, pressed && styles.pressed]}
        >
          <View style={layout === 'list' ? styles.listCopy : styles.centeredCopy}>
            <Text
              numberOfLines={layout === 'list' ? 1 : 2}
              style={[styles.label, { color: palette.text }]}
            >
              {item.label}
            </Text>
            <Text
              numberOfLines={layout === 'list' ? 2 : 1}
              style={[styles.description, { color: palette.mutedText }]}
            >
              {item.description}
            </Text>
          </View>
          {item.badge ? (
            <Text style={[styles.badge, { color: palette.primary }]}>
              {item.badge}
            </Text>
          ) : null}
          {selected && !editing ? (
            <View style={[styles.selected, { backgroundColor: palette.primary }]}>
              <Text style={[styles.selectedText, { color: palette.onPrimary }]}>
                ✓
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
      {onRemove ? (
        <Animated.View
          pointerEvents={editing && !isExiting ? 'auto' : 'none'}
          style={[styles.removeWrap, badgeAnimatedStyle]}
        >
          <Pressable
            accessibilityLabel={`Xóa ${item.label} khỏi Trang chủ`}
            accessibilityRole="button"
            onPress={handleRemovePress}
            style={[styles.remove, { backgroundColor: palette.danger }]}
          >
            <Text style={[styles.removeText, { color: palette.onDanger }]}>−</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

type AddProps = {
  label: string;
  palette: ShellPalette;
  onPress: () => void;
};

export function HomeAddCard({ label, palette, onPress }: AddProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => {
        signalNavigationSelection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.addCard,
        { borderColor: palette.glassBorder },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.addGlyph, { backgroundColor: palette.surface, borderWidth: 1.2, borderColor: palette.glassBorder }]}>
        <LineIcon name="plus" size={18} color={palette.primary} strokeWidth={1.6} />
      </View>
      <Text style={[styles.addLabel, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  constellation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  constellationItem: {
    aspectRatio: 1,
    padding: 4,
    width: '32%',
  },
  constellationOffset: {
    transform: [{ translateY: 20 }],
  },
  constellationTile: {
    borderRadius: 999,
    height: '100%',
    justifyContent: 'center',
    padding: 10,
  },
  rail: {
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  railItem: {
    height: 132,
    width: 132,
  },
  railTile: {
    borderRadius: 25,
    height: '100%',
    justifyContent: 'center',
    padding: 14,
  },
  list: {
    gap: 10,
  },
  listItem: {
    minHeight: 86,
  },
  listTile: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    minHeight: 86,
    padding: 14,
  },
  tile: {
    borderWidth: 1,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 15,
    elevation: 2,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  centeredCopy: {
    alignItems: 'center',
    marginTop: 8,
  },
  listCopy: {
    flex: 1,
    marginLeft: 13,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 3,
    textAlign: 'center',
  },
  badge: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 5,
    textTransform: 'uppercase',
  },
  selected: {
    alignItems: 'center',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
  },
  selectedText: {
    fontSize: 11,
    fontWeight: '900',
  },
  removeWrap: {
    position: 'absolute',
    right: -3,
    top: -3,
    width: 26,
    height: 26,
  },
  remove: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  removeText: {
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 20,
  },
  addCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    flexDirection: 'row',
    minHeight: 72,
    padding: 13,
  },
  addGlyph: {
    alignItems: 'center',
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  addGlyphText: {
    fontSize: 22,
    fontWeight: '700',
  },
  addLabel: {
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 13,
  },
});
