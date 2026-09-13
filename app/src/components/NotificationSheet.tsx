import { useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';

import { ShellPalette } from '../config/palette';
import { useReducedMotion } from '../config/useReducedMotion';
import {
  InboxNotification,
  NotificationPermissionStatus,
} from '../notification';
import {
  ScrollDepthPercent,
  useScrollDepthTracking,
} from './TrackedScrollView';

const ITEM_HEIGHT = 92; // approx per notification row (padding + 3 lines)
const PERMISSION_BANNER_HEIGHT = 76;
const HEADER_HEIGHT = 72;
const SHEET_PADDING = 48; // top + bottom padding

type Props = {
  palette: ShellPalette;
  visible: boolean;
  notifications: readonly InboxNotification[];
  permissionStatus: NotificationPermissionStatus;
  maxVisibleItems?: number;
  onClose: () => void;
  onNotificationPress: (notificationId: string) => void;
  onRequestPermission: () => void;
  onSeen: (notificationIds: readonly string[]) => void;
  onScrollDepth: (depth: ScrollDepthPercent) => void;
};

function relativeTime(timestamp: number): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (elapsedMinutes < 1) {
    return 'Now';
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  return `${Math.floor(elapsedHours / 24)}d`;
}

export function NotificationSheet({
  palette,
  visible,
  notifications,
  permissionStatus,
  maxVisibleItems = 3,
  onClose,
  onNotificationPress,
  onRequestPermission,
  onSeen,
  onScrollDepth,
}: Props) {
  const reducedMotion = useReducedMotion();
  const onSeenRef = useRef(onSeen);
  useEffect(() => {
    onSeenRef.current = onSeen;
  }, [onSeen]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<InboxNotification>[] }) => {
      const ids = viewableItems.flatMap(token =>
        token.isViewable && token.item?.notification_id
          ? [token.item.notification_id]
          : [],
      );
      if (ids.length > 0) {
        onSeenRef.current(ids);
      }
    },
  ).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 500,
  }).current;
  const handleScroll = useScrollDepthTracking(
    `notification-inbox:${visible}`,
    onScrollDepth,
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<InboxNotification>) => (
      <Pressable
        accessibilityLabel={`${item.title}. ${item.body}`}
        accessibilityRole="button"
        onPress={() => onNotificationPress(item.notification_id)}
        style={({ pressed }) => [
          styles.notification,
          { backgroundColor: palette.canvasAccent },
          item.seen_at_ms === null && {
            borderColor: palette.primary,
            borderWidth: 1,
          },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.notificationHeading}>
          <Text
            numberOfLines={1}
            style={[styles.notificationTitle, { color: palette.text }]}
          >
            {item.title}
          </Text>
          <Text style={[styles.notificationTime, { color: palette.mutedText }]}>
            {relativeTime(item.created_at_ms)}
          </Text>
        </View>
        <Text
          numberOfLines={3}
          style={[styles.notificationBody, { color: palette.mutedText }]}
        >
          {item.body}
        </Text>
        <Text style={[styles.category, { color: palette.primary }]}>
          {item.category.replaceAll('_', ' ')}
        </Text>
      </Pressable>
    ),
    [onNotificationPress, palette],
  );

  const needsPermission =
    permissionStatus === 'not_determined' || permissionStatus === 'denied';
  const permissionWasDenied = permissionStatus === 'denied';

  const visibleCount = Math.min(notifications.length, maxVisibleItems);
  const dynamicListHeight =
    notifications.length === 0
      ? 160 // empty state min-height
      : visibleCount * ITEM_HEIGHT + (visibleCount - 1) * 10; // 10 = gap
  const dynamicSheetHeight =
    HEADER_HEIGHT +
    (needsPermission ? PERMISSION_BANNER_HEIGHT : 0) +
    dynamicListHeight +
    SHEET_PADDING;

  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'fade'}
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={() => undefined}
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, shadowColor: palette.shadow, height: dynamicSheetHeight },
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: palette.primarySoft }]}
          />
          <View style={styles.heading}>
            <Text style={[styles.title, { color: palette.text }]}>
              Notifications
            </Text>
            <Pressable
              accessibilityLabel="Close notifications"
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.close, { backgroundColor: palette.primarySoft }]}
            >
              <Text style={[styles.closeText, { color: palette.primary }]}>
                ×
              </Text>
            </Pressable>
          </View>
          {needsPermission ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRequestPermission}
              style={[
                styles.permission,
                { backgroundColor: palette.primarySoft },
              ]}
            >
              <View style={styles.permissionCopy}>
                <Text style={[styles.permissionTitle, { color: palette.text }]}>
                  {permissionWasDenied ? 'Alerts are off' : 'Enable alerts'}
                </Text>
                <Text
                  style={[styles.permissionBody, { color: palette.mutedText }]}
                >
                  {permissionWasDenied
                    ? 'Turn on notifications in system settings to receive alerts.'
                    : 'Inbox delivery works now. Allow system alerts when the app is away.'}
                </Text>
              </View>
              <Text style={[styles.enable, { color: palette.primary }]}>
                {permissionWasDenied ? 'Settings' : 'Enable'}
              </Text>
            </Pressable>
          ) : null}
          <FlatList
            contentContainerStyle={
              notifications.length === 0 ? styles.emptyList : styles.list
            }
            data={[...notifications]}
            keyExtractor={item => item.notification_id}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: palette.text }]}>
                  You're all caught up
                </Text>
                <Text style={[styles.emptyBody, { color: palette.mutedText }]}>
                  New updates will appear here.
                </Text>
              </View>
            }
            onViewableItemsChanged={onViewableItemsChanged}
            onScroll={handleScroll}
            renderItem={renderItem}
            scrollEventThrottle={200}
            showsVerticalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Alias for compatibility
export const NotificationsSheet = NotificationSheet;

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20, 28, 50, 0.28)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 5,
    width: 42,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  close: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeText: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 27,
  },
  permission: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    marginTop: 16,
    padding: 14,
  },
  permissionCopy: {
    flex: 1,
    paddingRight: 12,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  permissionBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  enable: {
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    gap: 10,
    paddingBottom: 24,
    paddingTop: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 220,
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center',
  },
  notification: {
    borderColor: 'transparent',
    borderRadius: 18,
    padding: 15,
  },
  notificationHeading: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  notificationTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  notificationTime: {
    fontSize: 11,
    marginLeft: 12,
  },
  notificationBody: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  category: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.78,
  },
});
