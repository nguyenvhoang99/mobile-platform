import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShellPalette } from '../config/palette';
import { useReducedMotion } from '../config/useReducedMotion';
import { miniAppCatalog } from '../miniapps/catalog';
import { DockSlot } from '../navigation/navigationBroker';
import { ScrollDepthPercent, TrackedScrollView } from './TrackedScrollView';

type Props = {
  palette: ShellPalette;
  slot: DockSlot | null;
  selectedAppId: string | null;
  onClose: () => void;
  onSelect: (appId: string) => void;
  onClear: () => void;
  onScrollDepth: (depth: ScrollDepthPercent) => void;
};

export function MiniAppPickerModal({
  palette,
  slot,
  selectedAppId,
  onClose,
  onSelect,
  onClear,
  onScrollDepth,
}: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const slotLabel = slot === 'left' ? 'trái' : slot === 'right' ? 'phải' : 'đã chọn';
  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      transparent
      visible={slot !== null}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={() => undefined}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              paddingBottom: Math.max(insets.bottom, 18),
              shadowColor: palette.shadow,
            },
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: palette.primarySoft }]}
          />
          <Text style={[styles.eyebrow, { color: palette.primary }]}>
            TÙY CHỈNH
          </Text>
          <Text style={[styles.title, { color: palette.text }]}>
            Chọn mini-app
          </Text>
          <Text style={[styles.body, { color: palette.mutedText }]}>
            Ứng dụng sẽ nằm ở phía {slotLabel} của Khám phá. Nhấn giữ để đổi sau.
          </Text>
          <TrackedScrollView
            contentContainerStyle={styles.list}
            onScrollDepth={onScrollDepth}
            showsVerticalScrollIndicator={false}
            trackingResetKey={`mini-app-picker:${slot ?? 'closed'}`}
          >
            {miniAppCatalog.map(app => {
              const selected = app.id === selectedAppId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={app.id}
                  onPress={() => onSelect(app.id)}
                  style={({ pressed }) => [
                    styles.appRow,
                    {
                      backgroundColor: selected
                        ? palette.primarySoft
                        : palette.canvas,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.appCopy}>
                    <Text style={[styles.appName, { color: palette.text }]}>
                      {app.name}
                    </Text>
                    <Text
                      style={[styles.appMeta, { color: palette.mutedText }]}
                    >
                      Gói đã xác minh · v{app.version}
                    </Text>
                  </View>
                  <Text style={[styles.check, { color: palette.primary }]}>
                    {selected ? '✓' : '›'}
                  </Text>
                </Pressable>
              );
            })}
          </TrackedScrollView>
          <View style={styles.actions}>
            {selectedAppId ? (
              <Pressable
                onPress={onClear}
                style={[
                  styles.secondaryAction,
                  { backgroundColor: palette.primarySoft },
                ]}
              >
                <Text style={[styles.actionText, { color: palette.primary }]}>
                  Gỡ lối tắt
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={[
                styles.secondaryAction,
                { backgroundColor: palette.canvas },
              ]}
            >
              <Text style={[styles.actionText, { color: palette.text }]}>
                Hủy
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20, 28, 50, 0.3)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  sheet: {
    borderRadius: 30,
    maxHeight: '86%',
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
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 18,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 6,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  list: {
    gap: 10,
    paddingVertical: 18,
  },
  appRow: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    minHeight: 72,
    padding: 12,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  appCopy: {
    flex: 1,
  },
  appName: {
    fontSize: 15,
    fontWeight: '800',
  },
  appMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  check: {
    fontSize: 19,
    fontWeight: '800',
    marginHorizontal: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
