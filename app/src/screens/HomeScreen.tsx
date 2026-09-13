import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HomeAddCard,
  HomeCollection,
  HomeCollectionItem,
} from '../components/HomeCollection';
import { HomeCollectionPickerModal } from '../components/HomeCollectionPickerModal';
import { NotificationSheet } from '../components/NotificationSheet';
import {
  ScrollDepthPercent,
  TrackedScrollView,
} from '../components/TrackedScrollView';
import { ShellPalette } from '../config/palette';
import {
  HomeCategory,
  homeCategoryCatalog,
  HomePreferences,
  HomeViewerProfile,
  orderHomeCategorySuggestions,
} from '../home/homeModel';
import { findMiniApp } from '../miniapps/catalog';
import { signalSuccessLight, signalSelection } from '../native/haptics';
import { signalNavigationSelection } from '../native/nativeShell';
import { LineIcon, LineGlyph } from '../ui/primitives/LineIcon';
import {
  InboxNotification,
  NotificationPermissionStatus,
} from '../notification';

type Props = {
  palette: ShellPalette;
  preferences: HomePreferences;
  preferencesLoaded: boolean;
  viewerProfile: HomeViewerProfile | null;
  onPinCategory: (categoryId: string, source: string) => void;
  onRemoveCategory: (categoryId: string) => void;
  onPinMiniApp: (appId: string, source: string) => void;
  onRemoveMiniApp: (appId: string) => void;
  onOpenMiniApp: (appId: string, source: 'home_pinned' | 'category') => void;
  onOpenAccount: () => void;
  notifications: readonly InboxNotification[];
  notificationPermissionStatus: NotificationPermissionStatus;
  notificationUnreadCount: number;
  onNotificationPress: (notificationId: string) => void;
  onNotificationsSeen: (notificationIds: readonly string[]) => void;
  onNotificationPermissionRequest: () => void;
  onNotificationsOpened: () => void;
  onEntrypointClicked: (interaction: {
    entrypointId: string;
    surface: string;
    destination: string;
  }) => void;
  onSurfaceViewed: (surface: string, source: string) => void;
  onScrollDepth: (depth: ScrollDepthPercent) => void;
  onSurfaceScrollDepth: (surface: string, depth: ScrollDepthPercent) => void;
};

function categoryItem(
  category: HomeCategory,
  suggested: boolean,
): HomeCollectionItem {
  return {
    id: category.id,
    label: category.name,
    description: category.description,
    glyph: category.glyph,
    icon: category.icon,
    badge: suggested ? 'For you' : undefined,
  };
}

function miniAppItem(appId: string): HomeCollectionItem | null {
  const app = findMiniApp(appId);
  return app
    ? {
        id: app.id,
        label: app.name,
        description: `${
          app.englishName ? `${app.englishName} · ` : ''
        }Verified mini-app · v${app.version}`,
        glyph: app.glyph,
        icon: app.icon,
      }
    : null;
}

function definedItems(
  items: readonly (HomeCollectionItem | null)[],
): HomeCollectionItem[] {
  return items.filter((item): item is HomeCollectionItem => item !== null);
}

export const HomeScreen = memo(function HomeScreen({
  palette,
  preferences,
  preferencesLoaded,
  viewerProfile,
  onPinCategory,
  onRemoveCategory,
  onPinMiniApp,
  onRemoveMiniApp,
  onOpenMiniApp,
  onOpenAccount,
  notifications,
  notificationPermissionStatus,
  notificationUnreadCount,
  onNotificationPress,
  onNotificationsSeen,
  onNotificationPermissionRequest,
  onNotificationsOpened,
  onEntrypointClicked,
  onSurfaceViewed,
  onScrollDepth,
  onSurfaceScrollDepth,
}: Props) {
  const insets = useSafeAreaInsets();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editingMiniAppId, setEditingMiniAppId] = useState<string | null>(null);
  const suggestionOrder = useMemo(
    () => orderHomeCategorySuggestions(viewerProfile),
    [viewerProfile],
  );
  const selectedCategoryIds = useMemo(
    () => new Set(preferences.pinnedCategoryIds),
    [preferences.pinnedCategoryIds],
  );
  const selectedMiniAppIds = useMemo(
    () => new Set(preferences.pinnedMiniAppIds),
    [preferences.pinnedMiniAppIds],
  );
  const suggestedItems = suggestionOrder.categories.map(category =>
    categoryItem(
      category,
      suggestionOrder.suggestedCategoryIds.has(category.id),
    ),
  );
  const pinnedCategoryItems = definedItems(
    preferences.pinnedCategoryIds.map(id => {
      const category = homeCategoryCatalog.find(item => item.id === id);
      return category ? categoryItem(category, false) : null;
    }),
  );
  const pinnedMiniAppItems = definedItems(
    preferences.pinnedMiniAppIds.map(miniAppItem),
  );
  const activeCategory = activeCategoryId
    ? homeCategoryCatalog.find(category => category.id === activeCategoryId)
    : undefined;
  const activeCategoryMiniApps = definedItems(
    activeCategory?.miniAppIds.map(miniAppItem) ?? [],
  );

  const handlePinCategory = useCallback(
    (id: string, source: string) => {
      signalSuccessLight();
      onPinCategory(id, source);
    },
    [onPinCategory],
  );

  const handlePinMiniApp = useCallback(
    (id: string, source: string) => {
      signalSuccessLight();
      onPinMiniApp(id, source);
    },
    [onPinMiniApp],
  );

  const handleEnterEditCategory = useCallback((id: string) => {
    signalSelection();
    setEditingCategoryId(id);
  }, []);

  const handleEnterEditMiniApp = useCallback((id: string) => {
    signalSelection();
    setEditingMiniAppId(id);
  }, []);

  function openCategory(categoryId: string) {
    const category = homeCategoryCatalog.find(item => item.id === categoryId);
    if (!category) {
      return;
    }
    setEditingCategoryId(null);
    setActiveCategoryId(categoryId);
    onEntrypointClicked({
      entrypointId: categoryId,
      surface: 'home_categories',
      destination: 'category_mini_apps',
    });
    onSurfaceViewed('category_mini_apps', categoryId);
  }

  function openCategoryPicker() {
    setEditingCategoryId(null);
    setCategoryPickerOpen(true);
    onEntrypointClicked({
      entrypointId: 'add_categories',
      surface: 'home_categories',
      destination: 'category_picker',
    });
    onSurfaceViewed('category_picker', 'add_more');
  }

  return (
    <TrackedScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 22 }]}
      onScrollDepth={onScrollDepth}
      showsVerticalScrollIndicator={false}
      trackingResetKey="home"
    >
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: palette.text }]}>Home</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Open notifications"
            accessibilityRole="button"
            onPress={() => {
              signalNavigationSelection();
              onEntrypointClicked({
                entrypointId: 'notification_bell',
                surface: 'home_header',
                destination: 'notifications',
              });
              setNotificationsOpen(true);
              onNotificationsOpened();
            }}
            style={[
              styles.headerButton,
              {
                backgroundColor: palette.glass,
                borderColor: palette.glassBorder,
              },
            ]}
          >
            <LineIcon name="bell" size={18} color={palette.text} strokeWidth={1.5} />
            {notificationUnreadCount > 0 ? (
              <View
                style={[
                  styles.notificationBadge,
                  { backgroundColor: palette.primary },
                ]}
              >
                <Text
                  style={[
                    styles.notificationBadgeText,
                    { color: palette.onPrimary },
                  ]}
                >
                  {notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="Open account"
            accessibilityRole="button"
            onPress={() => {
              signalNavigationSelection();
              onEntrypointClicked({
                entrypointId: 'account_avatar',
                surface: 'home_header',
                destination: 'account',
              });
              onOpenAccount();
            }}
            style={({ pressed }) => [
              styles.avatar,
              { backgroundColor: palette.primarySoft },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.avatarText, { color: palette.primary }]}>
              MP
            </Text>
          </Pressable>
        </View>
      </View>

      {!preferencesLoaded ? (
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: palette.mutedText }]}>
            Loading your Home…
          </Text>
        </View>
      ) : !preferences.hasCustomized ? (
        <View style={styles.firstRun}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            Choose what matters
          </Text>
          <Text style={[styles.sectionBody, { color: palette.mutedText }]}>
            Press and hold a category to place it on Home.
          </Text>
          <View style={styles.constellationWrap}>
            <HomeCollection
              items={suggestedItems}
              layout="constellation"
              onLongPress={item => handlePinCategory(item.id, 'first_run')}
              palette={palette}
            />
          </View>
        </View>
      ) : (
        <>
          {pinnedMiniAppItems.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                  Pinned apps
                </Text>
                {editingMiniAppId ? (
                  <Pressable
                    accessibilityLabel="Done editing"
                    accessibilityRole="button"
                    onPress={() => setEditingMiniAppId(null)}
                    style={[styles.doneBadge, { backgroundColor: palette.primarySoft }]}
                  >
                    <Text style={[styles.doneBadgeText, { color: palette.primary }]}>Done</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={[styles.sectionHint, { color: palette.mutedText }]}>
                Hold an app to edit.
              </Text>
              <View style={styles.railWrap}>
                <HomeCollection
                  editingId={editingMiniAppId}
                  items={pinnedMiniAppItems}
                  layout="rail"
                  onLongPress={item => handleEnterEditMiniApp(item.id)}
                  onPress={item => {
                    if (editingMiniAppId) {
                      setEditingMiniAppId(null);
                      return;
                    }
                    onEntrypointClicked({
                      entrypointId: item.id,
                      surface: 'home_pinned_apps',
                      destination: item.id,
                    });
                    onOpenMiniApp(item.id, 'home_pinned');
                  }}
                  onRemove={item => {
                    setEditingMiniAppId(null);
                    onRemoveMiniApp(item.id);
                  }}
                  palette={palette}
                  selectedIds={selectedMiniAppIds}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                Your categories
              </Text>
              {editingCategoryId ? (
                <Pressable
                  accessibilityLabel="Done editing"
                  accessibilityRole="button"
                  onPress={() => setEditingCategoryId(null)}
                  style={[styles.doneBadge, { backgroundColor: palette.primarySoft }]}
                >
                  <Text style={[styles.doneBadgeText, { color: palette.primary }]}>Done</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.sectionHint, { color: palette.mutedText }]}>
              Tap an app to open. Hold category to edit.
            </Text>
            {pinnedCategoryItems.length === 0 ? (
              <Text style={[styles.empty, { color: palette.mutedText }]}>
                Nothing pinned yet.
              </Text>
            ) : (
              pinnedCategoryItems.map(catItem => {
                const cat = homeCategoryCatalog.find(c => c.id === catItem.id);
                if (!cat) return null;
                const miniApps = definedItems(cat.miniAppIds.map(miniAppItem));
                const visible = miniApps.slice(0, 5);
                const hasMore = miniApps.length > 5;
                const isEditingThis = editingCategoryId === cat.id;
                return (
                  <View key={cat.id} style={styles.categoryBlock}>
                    <Pressable
                      accessibilityLabel={cat.name}
                      accessibilityRole="button"
                      delayLongPress={420}
                      onLongPress={() => handleEnterEditCategory(cat.id)}
                      onPress={() => {
                        if (editingCategoryId) {
                          setEditingCategoryId(null);
                          return;
                        }
                        openCategory(cat.id);
                      }}
                      style={styles.categoryHeader}
                    >
                      <LineIcon name={cat.icon} size={22} color={palette.primary} strokeWidth={1.5} />
                      <Text style={[styles.categoryTitle, { color: palette.text }]}>{cat.name}</Text>
                      <Text style={[styles.categoryCount, { color: palette.mutedText }]}>{miniApps.length}</Text>
                      <View style={styles.categoryHeaderSpacer} />
                      {isEditingThis ? (
                        <Pressable
                          accessibilityLabel={`Remove ${cat.name}`}
                          accessibilityRole="button"
                          onPress={() => {
                            setEditingCategoryId(null);
                            onRemoveCategory(cat.id);
                          }}
                          style={[styles.categoryRemove, { backgroundColor: palette.danger }]}
                        >
                          <LineGlyph name="x" size={12} color={palette.onDanger} />
                        </Pressable>
                      ) : (
                        <LineGlyph name="chevron-right" size={14} color={palette.mutedText} />
                      )}
                    </Pressable>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.categoryRail}
                      style={styles.categoryRailWrap}
                    >
                      {visible.map(app => (
                        <Pressable
                          key={app.id}
                          accessibilityLabel={app.label}
                          accessibilityRole="button"
                          onPress={() => {
                            onEntrypointClicked({
                              entrypointId: app.id,
                              surface: `category:${cat.id}`,
                              destination: app.id,
                            });
                            onOpenMiniApp(app.id, 'category');
                          }}
                          style={({ pressed }) => [
                            styles.miniAppTile,
                            {
                              backgroundColor: palette.surface,
                              borderColor: palette.glassBorder,
                              shadowColor: palette.shadow,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <LineIcon name={app.icon ?? 'home'} size={26} color={palette.primary} strokeWidth={1.4} />
                          <Text numberOfLines={1} style={[styles.miniAppLabel, { color: palette.text }]}>
                            {app.label}
                          </Text>
                        </Pressable>
                      ))}
                      {hasMore ? (
                        <Pressable
                          accessibilityLabel={`View all ${miniApps.length} apps in ${cat.name}`}
                          accessibilityRole="button"
                          onPress={() => openCategory(cat.id)}
                          style={({ pressed }) => [
                            styles.miniAppTile,
                            styles.moreTile,
                            {
                              backgroundColor: palette.primarySoft,
                              borderColor: palette.primary,
                              shadowColor: palette.shadow,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <LineIcon name="more-horizontal" size={22} color={palette.primary} strokeWidth={1.6} />
                          <Text style={[styles.miniAppLabel, { color: palette.primary }]}>View all</Text>
                          <Text style={[styles.moreCount, { color: palette.primary }]}>{miniApps.length} apps</Text>
                        </Pressable>
                      ) : null}
                    </ScrollView>
                  </View>
                );
              })
            )}
            <View style={styles.addWrap}>
              <HomeAddCard
                label="Add more categories"
                onPress={openCategoryPicker}
                palette={palette}
              />
            </View>
          </View>
        </>
      )}

      <HomeCollectionPickerModal
        body="Press and hold a category to add it to Home."
        items={suggestedItems}
        layout="constellation"
        onClose={() => setCategoryPickerOpen(false)}
        onItemLongPress={item => handlePinCategory(item.id, 'category_picker')}
        onScrollDepth={depth => onSurfaceScrollDepth('category_picker', depth)}
        palette={palette}
        selectedIds={selectedCategoryIds}
        title="Add categories"
        trackingKey="category-picker"
        visible={categoryPickerOpen}
      />
      <HomeCollectionPickerModal
        body="Tap to open. Press and hold an app to pin it above your categories."
        items={activeCategoryMiniApps}
        layout="list"
        onClose={() => setActiveCategoryId(null)}
        onItemLongPress={item => handlePinMiniApp(item.id, 'category')}
        onItemPress={item => {
          onEntrypointClicked({
            entrypointId: item.id,
            surface: `category:${activeCategory?.id ?? 'unknown'}`,
            destination: item.id,
          });
          setActiveCategoryId(null);
          onOpenMiniApp(item.id, 'category');
        }}
        onScrollDepth={depth =>
          onSurfaceScrollDepth('category_mini_apps', depth)
        }
        palette={palette}
        selectedIds={selectedMiniAppIds}
        title={activeCategory?.name ?? 'Mini-apps'}
        trackingKey={`category-mini-apps:${activeCategory?.id ?? 'closed'}`}
        visible={activeCategory !== undefined}
      />
      <NotificationSheet
        notifications={notifications}
        onNotificationPress={onNotificationPress}
        onClose={() => {
          onEntrypointClicked({
            entrypointId: 'close_notifications',
            surface: 'notification_inbox',
            destination: 'home',
          });
          setNotificationsOpen(false);
        }}
        onRequestPermission={onNotificationPermissionRequest}
        onSeen={onNotificationsSeen}
        onScrollDepth={depth =>
          onSurfaceScrollDepth('notification_inbox', depth)
        }
        palette={palette}
        permissionStatus={notificationPermissionStatus}
        visible={notificationsOpen}
      />
    </TrackedScrollView>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingBottom: 142,
    paddingHorizontal: 20,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  bellGlyph: {
    fontSize: 20,
    lineHeight: 22,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.96 }],
  },
  notificationBadge: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1.5,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -3,
    top: -3,
  },
  notificationBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  loadingText: {
    fontSize: 14,
  },
  firstRun: {
    marginTop: 34,
  },
  section: {
    marginTop: 32,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doneBadge: {
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  doneBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  sectionHint: {
    fontSize: 12,
    marginBottom: 13,
    marginTop: 5,
  },
  constellationWrap: {
    marginTop: 20,
  },
  railWrap: {
    marginHorizontal: -20,
  },
  empty: {
    fontSize: 13,
    paddingVertical: 18,
  },
  addWrap: {
    marginTop: 11,
  },
  categoryBlock: {
    marginTop: 18,
    gap: 10,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  categoryCount: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  categoryHeaderSpacer: {
    flex: 1,
  },
  categoryRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  categoryRailWrap: {
    marginHorizontal: -20,
  },
  categoryRail: {
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  miniAppTile: {
    width: 92,
    height: 92,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
  },
  miniAppLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  moreTile: {
    borderStyle: 'dashed',
    borderWidth: 1.4,
  },
  moreCount: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
});
