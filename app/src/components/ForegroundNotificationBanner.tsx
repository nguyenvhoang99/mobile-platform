import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShellPalette } from '../config/palette';
import { InboxNotification } from '../notification';

type Props = {
  notification: InboxNotification | null;
  palette: ShellPalette;
  onDismiss: () => void;
  onPress: (notificationId: string) => void;
};

export function ForegroundNotificationBanner({
  notification,
  palette,
  onDismiss,
  onPress,
}: Props) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!notification) {
      return;
    }
    const timer = setTimeout(onDismiss, 5_000);
    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  if (!notification) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { top: insets.top + 8 }]}
    >
      <Pressable
        accessibilityLabel={`${notification.title}. ${notification.body}`}
        accessibilityRole="button"
        onPress={() => onPress(notification.notification_id)}
        style={({ pressed }) => [
          styles.banner,
          {
            backgroundColor: palette.surface,
            borderColor: palette.glassBorder,
            shadowColor: palette.shadow,
          },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.icon, { backgroundColor: palette.primarySoft }]}>
          <Text style={[styles.iconText, { color: palette.primary }]}>🔔</Text>
        </View>
        <View style={styles.copy}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: palette.text }]}
          >
            {notification.title}
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.body, { color: palette.mutedText }]}
          >
            {notification.body}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          hitSlop={12}
          onPress={event => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          <Text style={[styles.dismiss, { color: palette.mutedText }]}>×</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    left: 14,
    position: 'absolute',
    right: 14,
    zIndex: 100,
  },
  banner: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 8,
    flexDirection: 'row',
    padding: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconText: {
    fontSize: 19,
  },
  copy: {
    flex: 1,
    marginHorizontal: 11,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  dismiss: {
    fontSize: 23,
    lineHeight: 25,
  },
  pressed: {
    opacity: 0.84,
  },
});
