import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShellPalette } from '../config/palette';
import { useReducedMotion } from '../config/useReducedMotion';
import { ScrollDepthPercent, TrackedScrollView } from './TrackedScrollView';
import {
  HomeCollection,
  HomeCollectionItem,
  HomeCollectionLayout,
} from './HomeCollection';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  items: readonly HomeCollectionItem[];
  layout: HomeCollectionLayout;
  selectedIds: ReadonlySet<string>;
  palette: ShellPalette;
  trackingKey: string;
  onClose: () => void;
  onItemPress?: (item: HomeCollectionItem) => void;
  onItemLongPress: (item: HomeCollectionItem) => void;
  onScrollDepth: (depth: ScrollDepthPercent) => void;
};

export function HomeCollectionPickerModal({
  visible,
  title,
  body,
  items,
  layout,
  selectedIds,
  palette,
  trackingKey,
  onClose,
  onItemPress,
  onItemLongPress,
  onScrollDepth,
}: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={() => undefined}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.canvas,
              paddingBottom: Math.max(insets.bottom, 18),
              shadowColor: palette.shadow,
            },
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: palette.primarySoft }]}
          />
          <View style={styles.header}>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: palette.text }]}>
                {title}
              </Text>
              <Text style={[styles.body, { color: palette.mutedText }]}>
                {body}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Done"
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.done, { backgroundColor: palette.primarySoft }]}
            >
              <Text style={[styles.doneText, { color: palette.primary }]}>
                Done
              </Text>
            </Pressable>
          </View>
          <TrackedScrollView
            contentContainerStyle={styles.content}
            onScrollDepth={onScrollDepth}
            showsVerticalScrollIndicator={false}
            trackingResetKey={`${trackingKey}:${visible}`}
          >
            <HomeCollection
              items={items}
              layout={layout}
              onLongPress={onItemLongPress}
              onPress={onItemPress}
              palette={palette}
              selectedIds={selectedIds}
            />
          </TrackedScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20, 28, 50, 0.28)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 10,
  },
  sheet: {
    borderRadius: 30,
    maxHeight: '88%',
    minHeight: 440,
    paddingHorizontal: 20,
    paddingTop: 14,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 5,
    width: 42,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 18,
  },
  copy: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  done: {
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  doneText: {
    fontSize: 13,
    fontWeight: '800',
  },
  content: {
    paddingBottom: 18,
    paddingTop: 20,
  },
});
