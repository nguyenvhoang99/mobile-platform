import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GlassTabBar } from './src/components/GlassTabBar';
import { ExploreSheet } from './src/components/ExploreSheet';
import { ForegroundNotificationBanner } from './src/components/ForegroundNotificationBanner';
import { MiniAppPickerModal } from './src/components/MiniAppPickerModal';
import { appConfig } from './src/config/appConfig';
import { createPalette } from './src/config/palette';
import { createBridgeClient } from './src/bridge/client';
import { registerAllHandlers } from './src/bridge/register';
import type { BridgeSession } from './src/bridge/types';
import {
  createDefaultHomePreferences,
  HomePreferences,
  normalizeHomePreferences,
} from './src/home/homeModel';
import { findMiniApp, miniAppCatalog } from './src/miniapps/catalog';
import { catalogForTenant } from './src/miniapps/catalogTenant';
import { useTenant } from './src/hooks/useTenant';
import { TenantPickerSheet } from './src/components/TenantPickerSheet';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import {
  closeMiniApps,
  createNavigationState,
  DockSelection,
  DockSlot,
  goBack,
  MiniAppFrame,
  navigateInsideMiniApp,
  openCrossMiniApp,
  openDockMiniApp,
  openNotificationMiniApp,
  showShell,
} from './src/navigation/navigationBroker';
import {
  loadDockSelection,
  loadHomePreferences,
  saveDockSelection,
  saveHomePreferences,
} from './src/native/hostStorage';
import { applyShellChrome } from './src/native/nativeShell';
import {
  InboxNotification,
  notification,
  NotificationPermissionStatus,
} from './src/notification';
import { HomeScreen } from './src/screens/HomeScreen';
import { MiniAppScreen } from './src/screens/MiniAppScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import { tracking } from './src/tracking';
import {
  MiniAppLoadTracker,
  MiniAppLoadRequestTime,
} from './src/tracking/miniAppLoadTracker';

const emptyDock: DockSelection = { left: null, right: null };
const emptyNotificationSnapshot = {
  items: [] as readonly InboxNotification[],
  unreadCount: 0,
  permissionStatus: 'unavailable' as NotificationPermissionStatus,
};

// eslint-disable-next-line no-void
function runAsync(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

function validDockSelection(selection: DockSelection, catalog = miniAppCatalog): DockSelection {
  const known = new Set(catalog.map(app => app.id));
  return {
    left: selection.left && known.has(selection.left) ? selection.left : null,
    right:
      selection.right &&
      known.has(selection.right) &&
      selection.right !== selection.left
        ? selection.right
        : null,
  };
}

function currentRoute(frame: MiniAppFrame): string {
  return frame.history.at(-1) ?? frame.entrypoint;
}

function sameVisibleMiniApp(
  previous: MiniAppFrame | undefined,
  next: MiniAppFrame | undefined,
): boolean {
  return (
    previous?.appId === next?.appId &&
    previous?.entrypoint === next?.entrypoint &&
    (previous ? currentRoute(previous) : null) ===
      (next ? currentRoute(next) : null)
  );
}

async function recordMiniAppOpened(
  frame: MiniAppFrame,
  source: string,
): Promise<void> {
  await tracking.trackHost('navigation_opened', {
    destination: frame.appId,
    source,
  });
  await tracking.trackHost('mini_app_opened', {
    mini_app_id: frame.appId,
    entrypoint_id: frame.entrypoint,
    source,
  });
  await tracking.trackHost('mini_app_route_viewed', {
    mini_app_id: frame.appId,
    route: currentRoute(frame),
    source,
  });
}

async function recordMiniAppsClosed(
  frames: readonly MiniAppFrame[],
  reason: string,
): Promise<void> {
  for (const frame of frames) {
    await tracking.trackHost('mini_app_closed', {
      mini_app_id: frame.appId,
      reason,
    });
  }
}

function removedMiniApps(
  previous: readonly MiniAppFrame[],
  next: readonly MiniAppFrame[],
): MiniAppFrame[] {
  const retained = new Set(next.map(frame => frame.appId));
  return previous.filter(frame => !retained.has(frame.appId));
}

function App() {
  const { tenantId, profile, loading: tenantLoading, switchTenant } = useTenant();
  const palette = useMemo(
    () => (profile ? createPalette(profile.paletteOverrides) : appConfig.palette),
    [profile],
  );
  const viewerProfile = appConfig.viewerProfile;
  const tenantCatalog = useMemo(
    () => (tenantId ? catalogForTenant(tenantId) : miniAppCatalog),
    [tenantId],
  );

  const [navigation, setNavigation] = useState(createNavigationState);
  const navigationRef = useRef(navigation);
  const [dockSelection, setDockSelection] = useState<DockSelection>(emptyDock);
  const [homePreferences, setHomePreferences] = useState<HomePreferences>(
    createDefaultHomePreferences,
  );
  const homePreferencesRef = useRef(homePreferences);
  const [homePreferencesLoaded, setHomePreferencesLoaded] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<DockSlot | null>(null);
  const [notificationSnapshot, setNotificationSnapshot] = useState(
    emptyNotificationSnapshot,
  );
  const [foregroundNotification, setForegroundNotification] =
    useState<InboxNotification | null>(null);
  const [exploreSheetOpen, setExploreSheetOpen] = useState(false);
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [miniAppLoads] = useState(
    () => new MiniAppLoadTracker(
      (name, data, occurredAtMs) => tracking.trackHost(name, data, { occurredAtMs }),
    ),
  );

  const commitNavigation = useCallback(
    (
      next: ReturnType<typeof createNavigationState>,
      launch?: { source: string; requested: MiniAppLoadRequestTime },
    ) => {
      const previous = navigationRef.current.miniApps.at(-1);
      const frame = next.miniApps.at(-1);
      if (
        launch && frame && (
          previous?.sessionId !== frame.sessionId || !sameVisibleMiniApp(previous, frame)
        )
      ) {
        const manifest = findMiniApp(frame.appId);
        if (manifest) {
          miniAppLoads.begin(
            frame,
            manifest.version,
            launch.source,
            navigationRef.current.miniApps.some(
              item => item.sessionId === frame.sessionId,
            )
              ? 'existing_session' : 'new_session',
            launch.requested,
          );
          if (AppState.currentState === 'background') {
            miniAppLoads.cancel('background');
          }
        }
      }
      miniAppLoads.navigationChanged(frame);
      navigationRef.current = next;
      setNavigation(next);
    },
    [miniAppLoads],
  );

  const commitHomePreferences = useCallback((next: HomePreferences) => {
    const normalized = normalizeHomePreferences(next);
    homePreferencesRef.current = normalized;
    setHomePreferences(normalized);
    runAsync(saveHomePreferences(normalized));
  }, []);

  useEffect(() => {
    applyShellChrome(palette);
  }, [palette]);

  useEffect(() => {
    let active = true;
    runAsync(
      loadDockSelection().then(selection => {
        if (active) {
          setDockSelection(validDockSelection(selection, tenantCatalog));
        }
      }),
    );
    runAsync(
      loadHomePreferences()
        .then(preferences => {
          if (active) {
            homePreferencesRef.current = preferences;
            setHomePreferences(preferences);
          }
        })
        .finally(() => {
          if (active) {
            setHomePreferencesLoaded(true);
          }
        }),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribeNotifications = notification.subscribe(snapshot => {
      if (active) {
        setNotificationSnapshot(snapshot);
      }
    });
    const unsubscribeForeground = notification.onForegroundReceived(item => {
      if (active) {
        setForegroundNotification(item);
      }
    });
    const unsubscribeActivation = notification.onActivated(
      ({ notification: activeNotification }) => {
        if (!activeNotification.target) {
          return;
        }
        const requested = miniAppLoads.requestTime();
        const current = navigationRef.current;
        const result = openNotificationMiniApp(
          current,
          activeNotification.target.mini_app_id,
          activeNotification.target.entrypoint_id,
          activeNotification.target.input,
        );
        if (result.ok) {
          const frame = result.state.miniApps.at(-1);
          const removed = removedMiniApps(
            current.miniApps,
            result.state.miniApps,
          );
          commitNavigation(result.state, { source: 'notification', requested });
          if (removed.length > 0) {
            runAsync(recordMiniAppsClosed(removed, 'notification_replaced'));
          }
          if (frame) {
            runAsync(recordMiniAppOpened(frame, 'notification'));
          }
          return;
        }
        runAsync(
          tracking.trackHost('navigation_denied', {
            operation: 'notification_open',
            reason: result.error,
          }),
        );
      },
    );
    runAsync(
      tracking.start().then(async () => {
        if (!active) {
          return;
        }
        await tracking.trackHost('app_started', {});
        await tracking.trackHost('screen_viewed', {
          screen: 'home',
          source: 'app_launch',
        });
        await notification.start();
      }),
    );
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runAsync(notification.refreshPermissionStatus());
        runAsync(((tracking as unknown as { notifyForeground?: () => Promise<void> }).notifyForeground?.() ?? Promise.resolve()));
      } else {
        if (state === 'background') miniAppLoads.cancel('background');
        runAsync(((tracking as unknown as { notifyBackground?: () => Promise<void> }).notifyBackground?.() ?? Promise.resolve()));
        runAsync(tracking.flush('app_background'));
      }
    });
    return () => {
      active = false;
      miniAppLoads.cancel('host_unmounted');
      subscription.remove();
      unsubscribeNotifications();
      unsubscribeForeground();
      unsubscribeActivation();
      notification.stop();
      tracking.stop();
    };
  }, [commitNavigation, miniAppLoads]);

  const openMiniApp = useCallback(
    (
      appId: string,
      source: 'navigation_bar' | 'mini_app_picker' | 'home_pinned' | 'category',
    ) => {
      const requested = miniAppLoads.requestTime();
      const current = navigationRef.current;
      const result = openDockMiniApp(current, appId);
      if (!result.ok) {
        runAsync(
          tracking.trackHost('navigation_denied', {
            operation: `${source}_open`,
            reason: result.error,
          }),
        );
        return;
      }

      const previousFrame = current.miniApps.at(-1);
      const nextFrame = result.state.miniApps.at(-1);
      const removed = removedMiniApps(current.miniApps, result.state.miniApps);
      commitNavigation(result.state, { source, requested });
      if (removed.length > 0) {
        runAsync(recordMiniAppsClosed(removed, `${source}_switch`));
      }
      if (nextFrame && !sameVisibleMiniApp(previousFrame, nextFrame)) {
        runAsync(recordMiniAppOpened(nextFrame, source));
      }
    },
    [commitNavigation, miniAppLoads],
  );

  const changeHomePreference = useCallback(
    (
      itemType: 'category' | 'mini_app',
      itemId: string,
      action: 'pin' | 'remove',
      source: string,
    ) => {
      const current = homePreferencesRef.current;
      const key =
        itemType === 'category' ? 'pinnedCategoryIds' : 'pinnedMiniAppIds';
      const items = current[key];
      const nextItems =
        action === 'pin'
          ? items.includes(itemId)
            ? items
            : [...items, itemId]
          : items.filter(id => id !== itemId);
      if (nextItems === items && current.hasCustomized) {
        return;
      }
      commitHomePreferences({
        ...current,
        hasCustomized: true,
        [key]: nextItems,
      });
      runAsync(
        tracking.trackHost('home_preference_changed', {
          item_type: itemType,
          item_id: itemId,
          action,
          source,
        }),
      );
    },
    [commitHomePreferences],
  );

  const openMiniAppFromNavigationBar = useCallback(
    (appId: string, slot: DockSlot) => {
      runAsync(
        tracking.trackHost('navigation_bar_clicked', {
          destination: appId,
          mini_app_id: appId,
          slot,
        }),
      );
      openMiniApp(appId, 'navigation_bar');
    },
    [openMiniApp],
  );

  const showHome = useCallback(() => {
    const current = navigationRef.current;
    if (current.miniApps.length > 0) {
      runAsync(recordMiniAppsClosed(current.miniApps, 'navigation_bar'));
    }
    commitNavigation(showShell(current, 'explore'));
  }, [commitNavigation]);

  const showAccount = useCallback(() => {
    const current = navigationRef.current;
    commitNavigation(showShell(current, 'account'));
    runAsync(
      (async () => {
        await tracking.trackHost('navigation_opened', {
          destination: 'account',
          source: 'avatar',
        });
        await tracking.trackHost('screen_viewed', {
          screen: 'account',
          source: 'avatar',
        });
      })(),
    );
  }, [commitNavigation]);

  const openPicker = useCallback(
    (slot: DockSlot, gesture: 'tap' | 'swipe' | 'long_press') => {
      setPickerSlot(slot);
      runAsync(
        (async () => {
          await tracking.trackHost('navigation_customization_requested', {
            slot,
            gesture,
            current_mini_app_id:
              navigationRef.current.miniApps.at(-1)?.appId ?? null,
          });
          await tracking.trackHost('navigation_opened', {
            destination: 'mini_app_picker',
            source: gesture,
          });
          await tracking.trackHost('screen_viewed', {
            screen: 'mini_app_picker',
            source: gesture,
          });
        })(),
      );
    },
    [],
  );

  const selectDockApp = useCallback(
    (appId: string) => {
      if (!pickerSlot) {
        return;
      }
      setDockSelection(current => {
        const otherSlot: DockSlot = pickerSlot === 'left' ? 'right' : 'left';
        const next: DockSelection = {
          ...current,
          [pickerSlot]: appId,
          [otherSlot]: current[otherSlot] === appId ? null : current[otherSlot],
        };
        runAsync(saveDockSelection(next));
        return next;
      });
      runAsync(
        (async () => {
          await tracking.trackHost('entrypoint_clicked', {
            entrypoint_id: appId,
            surface: 'mini_app_picker',
            destination: appId,
            mini_app_id: appId,
          });
          await tracking.trackHost('dock_slot_changed', {
            slot: pickerSlot,
            mini_app_id: appId,
          });
        })(),
      );
      setPickerSlot(null);
      openMiniApp(appId, 'mini_app_picker');
    },
    [openMiniApp, pickerSlot],
  );

  const clearDockSlot = useCallback(() => {
    if (!pickerSlot) {
      return;
    }
    setDockSelection(current => {
      const next = { ...current, [pickerSlot]: null };
      runAsync(saveDockSelection(next));
      return next;
    });
    runAsync(
      (async () => {
        await tracking.trackHost('entrypoint_clicked', {
          entrypoint_id: 'remove_shortcut',
          surface: 'mini_app_picker',
          destination: 'explore',
          mini_app_id: null,
        });
        await tracking.trackHost('dock_slot_changed', {
          slot: pickerSlot,
          mini_app_id: null,
        });
      })(),
    );
    setPickerSlot(null);
  }, [pickerSlot]);

  const closePicker = useCallback(() => {
    if (!pickerSlot) {
      return;
    }
    runAsync(
      tracking.trackHost('entrypoint_clicked', {
        entrypoint_id: 'cancel_picker',
        surface: 'mini_app_picker',
        destination: navigationRef.current.miniApps.at(-1)?.appId ?? 'home',
        mini_app_id: navigationRef.current.miniApps.at(-1)?.appId ?? null,
      }),
    );
    setPickerSlot(null);
  }, [pickerSlot]);

  const navigateMiniApp = useCallback(
    (path: string) => {
      const current = navigationRef.current;
      const sourceFrame = current.miniApps.at(-1);
      if (sourceFrame) {
        runAsync(
          tracking.trackHost('entrypoint_clicked', {
            entrypoint_id: path,
            surface: 'mini_app_routes',
            destination: path,
            mini_app_id: sourceFrame.appId,
          }),
        );
      }
      const result = navigateInsideMiniApp(current, path);
      if (!result.ok) {
        runAsync(
          tracking.trackHost('navigation_denied', {
            operation: 'internal_route',
            reason: result.error,
          }),
        );
        return;
      }
      const frame = result.state.miniApps.at(-1);
      commitNavigation(result.state);
      if (frame) {
        runAsync(
          (async () => {
            await tracking.trackHost('navigation_opened', {
              destination: currentRoute(frame),
              source: 'internal_route',
            });
            await tracking.trackHost('mini_app_route_viewed', {
              mini_app_id: frame.appId,
              route: currentRoute(frame),
              source: 'internal_route',
            });
          })(),
        );
      }
    },
    [commitNavigation],
  );

  const openCrossAppLink = useCallback(
    (linkId: string) => {
      const requested = miniAppLoads.requestTime();
      const current = navigationRef.current;
      const sourceFrame = current.miniApps.at(-1);
      const sourceManifest = sourceFrame
        ? findMiniApp(sourceFrame.appId)
        : undefined;
      const link = sourceManifest?.crossAppLinks.find(
        item => item.id === linkId,
      );
      if (sourceFrame) {
        runAsync(
          tracking.trackHost('entrypoint_clicked', {
            entrypoint_id: linkId,
            surface: 'mini_app_cross_links',
            destination: link?.targetAppId ?? 'unknown',
            mini_app_id: sourceFrame.appId,
          }),
        );
      }
      const result = openCrossMiniApp(current, linkId, { area: 'current' });
      if (!result.ok) {
        runAsync(
          tracking.trackHost('navigation_denied', {
            operation: 'cross_app',
            reason: result.error,
          }),
        );
        return;
      }
      const frame = result.state.miniApps.at(-1);
      const removed = removedMiniApps(current.miniApps, result.state.miniApps);
      commitNavigation(result.state, { source: 'cross_app', requested });
      if (removed.length > 0) {
        runAsync(recordMiniAppsClosed(removed, 'cross_app_replaced'));
      }
      if (frame) {
        runAsync(recordMiniAppOpened(frame, 'cross_app'));
      }
    },
    [commitNavigation, miniAppLoads],
  );

  const goBackFromMiniApp = useCallback(() => {
    const current = navigationRef.current;
    const frame = current.miniApps.at(-1);
    if (!frame) {
      return;
    }
    runAsync(
      tracking.trackHost('entrypoint_clicked', {
        entrypoint_id: 'back',
        surface: 'mini_app_header',
        destination:
          frame.history.at(-2) ?? current.miniApps.at(-2)?.appId ?? 'home',
        mini_app_id: frame.appId,
      }),
    );
    const next = goBack(current);
    const nextFrame = next.miniApps.at(-1);
    commitNavigation(next);
    if (frame.history.length > 1 && nextFrame) {
      runAsync(
        (async () => {
          await tracking.trackHost('navigation_opened', {
            destination: currentRoute(nextFrame),
            source: 'back',
          });
          await tracking.trackHost('mini_app_route_viewed', {
            mini_app_id: nextFrame.appId,
            route: currentRoute(nextFrame),
            source: 'back',
          });
        })(),
      );
      return;
    }
    runAsync(recordMiniAppsClosed([frame], 'back'));
    if (nextFrame) {
      runAsync(recordMiniAppOpened(nextFrame, 'back_resume'));
    } else {
      runAsync(
        (async () => {
          await tracking.trackHost('navigation_opened', {
            destination: 'explore',
            source: 'mini_app_back',
          });
          await tracking.trackHost('screen_viewed', {
            screen: 'home',
            source: 'mini_app_back',
          });
        })(),
      );
    }
  }, [commitNavigation]);

  const closeAllMiniApps = useCallback(() => {
    const current = navigationRef.current;
    const frame = current.miniApps.at(-1);
    if (!frame) {
      return;
    }
    runAsync(
      (async () => {
        await tracking.trackHost('entrypoint_clicked', {
          entrypoint_id: 'close',
          surface: 'mini_app_header',
          destination: 'home',
          mini_app_id: frame.appId,
        });
        await recordMiniAppsClosed(current.miniApps, 'close_button');
        await tracking.trackHost('navigation_opened', {
          destination: 'explore',
          source: 'mini_app_close',
        });
        await tracking.trackHost('screen_viewed', {
          screen: 'home',
          source: 'mini_app_close',
        });
      })(),
    );
    commitNavigation(closeMiniApps(current));
  }, [commitNavigation]);

  // Re-validate dock when tenant changes (tenant’s featured set may not include a docked id)
  useEffect(() => {
    if (!tenantId) return;
    setDockSelection(current => validDockSelection(current, tenantCatalog));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const activeFrame = navigation.miniApps.at(-1);
  const activeManifest = activeFrame
    ? findMiniApp(activeFrame.appId)
    : undefined;

  // Host-only React Native preview. This does not authenticate an external
  // WebView session or prove native-origin enforcement; the real bridge runtime
  // is still a separate platform gap.
  const sampleBridge = useMemo(() => {
    if (activeFrame?.appId !== 'sample' || !tenantId || !activeManifest) {
      return undefined;
    }
    const session: BridgeSession = {
      tier: 'first_party',
      appId: activeFrame.appId,
      tenantId,
      userId: 'local-preview-user',
      origin: 'host://sample-preview',
      isMainFrame: true,
    };
    return createBridgeClient({
      session,
      manifestCapabilities: (activeManifest.capabilities ?? []).map(capability => capability.name),
    });
  }, [activeFrame?.appId, activeFrame?.sessionId, activeManifest, tenantId]);

  useEffect(() => {
    registerAllHandlers();
  }, []);

  useEffect(() => () => sampleBridge?.dispose(), [sampleBridge]);

  const screen = useMemo(() => {
    if (activeFrame && activeManifest) {
      return (
        <MiniAppScreen
          key={activeFrame.sessionId}
          frame={activeFrame}
          manifest={activeManifest}
          onBack={goBackFromMiniApp}
          onClose={closeAllMiniApps}
          onNavigate={navigateMiniApp}
          onOpenCrossApp={openCrossAppLink}
          onScrollDepth={depth => {
            runAsync(
              tracking.trackHost('mini_app_scroll_depth', {
                mini_app_id: activeFrame.appId,
                route: currentRoute(activeFrame),
                depth_percent: depth,
              }),
            );
          }}
          onTrackEvent={(name, version, data) => {
            runAsync(
              tracking.trackMiniApp(
                {
                  appId: activeFrame.appId,
                  appVersion: activeManifest.version,
                  sessionId: activeFrame.sessionId,
                },
                name,
                version,
                data,
              ),
            );
          }}
          palette={palette}
          bridge={sampleBridge}
          loadSignals={miniAppLoads.signalsFor(activeFrame)}
        />
      );
    }
    if (navigation.shell === 'account') {
      return (
        <PlaceholderScreen
          onBack={() => {
            commitNavigation(showShell(navigationRef.current, 'explore'));
          }}
          onAccessCompleted={(kind, status) => {
            runAsync(
              tracking.trackHost('device_access_completed', {
                access_kind: kind,
                status,
              }),
            );
          }}
          onAccessRequested={kind => {
            runAsync(
              tracking.trackHost('device_access_requested', {
                access_kind: kind,
              }),
            );
          }}
          onScrollDepth={depth => {
            runAsync(
              tracking.trackHost('screen_scroll_depth', {
                screen: 'account',
                depth_percent: depth,
              }),
            );
          }}
          palette={palette}
          route="account"
        />
      );
    }
    return (
      <HomeScreen
        notificationPermissionStatus={notificationSnapshot.permissionStatus}
        notifications={notificationSnapshot.items}
        notificationUnreadCount={notificationSnapshot.unreadCount}
        onEntrypointClicked={interaction => {
          runAsync(
            tracking.trackHost('entrypoint_clicked', {
              entrypoint_id: interaction.entrypointId,
              surface: interaction.surface,
              destination: interaction.destination,
            }),
          );
        }}
        onNotificationPermissionRequest={() => {
          runAsync(
            tracking.trackHost('entrypoint_clicked', {
              entrypoint_id: 'enable_notifications',
              surface: 'notification_inbox',
              destination: 'notification_permission',
            }),
          );
          runAsync(notification.requestPermission());
        }}
        onNotificationPress={notificationId => {
          runAsync(notification.activateFromInbox(notificationId));
        }}
        onNotificationsOpened={() => {
          runAsync(notification.recordInboxOpened());
          runAsync(
            tracking.trackHost('screen_viewed', {
              screen: 'notification_inbox',
              source: 'notification_bell',
            }),
          );
        }}
        onNotificationsSeen={notificationIds => {
          runAsync(notification.markSeen(notificationIds));
        }}
        onOpenAccount={showAccount}
        onOpenMiniApp={(appId, source) => {
          openMiniApp(appId, source);
        }}
        onPinCategory={(categoryId, source) => {
          changeHomePreference('category', categoryId, 'pin', source);
        }}
        onPinMiniApp={(appId, source) => {
          changeHomePreference('mini_app', appId, 'pin', source);
        }}
        onRemoveCategory={categoryId => {
          changeHomePreference('category', categoryId, 'remove', 'home');
        }}
        onRemoveMiniApp={appId => {
          changeHomePreference('mini_app', appId, 'remove', 'home');
        }}
        onScrollDepth={depth => {
          runAsync(
            tracking.trackHost('screen_scroll_depth', {
              screen: 'home',
              depth_percent: depth,
            }),
          );
        }}
        onSurfaceScrollDepth={(surface, depth) => {
          runAsync(
            tracking.trackHost('screen_scroll_depth', {
              screen: surface,
              depth_percent: depth,
            }),
          );
        }}
        onSurfaceViewed={(surface, source) => {
          runAsync(
            tracking.trackHost('screen_viewed', {
              screen: surface,
              source,
            }),
          );
        }}
        palette={palette}
        preferences={homePreferences}
        preferencesLoaded={homePreferencesLoaded}
        viewerProfile={viewerProfile}
      />
    );
  }, [
    activeFrame,
    activeManifest,
    miniAppLoads,
    sampleBridge,
    closeAllMiniApps,
    changeHomePreference,
    commitNavigation,
    goBackFromMiniApp,
    homePreferences,
    homePreferencesLoaded,
    navigateMiniApp,
    navigation,
    openCrossAppLink,
    palette,
    showAccount,
    notificationSnapshot,
    openMiniApp,
    viewerProfile,
  ]);

  if (tenantLoading || !tenantId) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle={palette.statusBarStyle} />
        <View style={[styles.loading, { backgroundColor: palette.canvas }]}>
          <ActivityIndicator color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.mutedText }]}>
            Đang xác định khu vực của bạn…
          </Text>
          <Text style={[styles.loadingSub, { color: palette.mutedText }]}>
            Vị trí chỉ dùng để chọn tỉnh/thành và sẽ tự động chọn Toàn quốc sau 4 giây nếu không phản hồi.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chọn tỉnh thủ công"
            onPress={() => setTenantPickerOpen(true)}
            style={[styles.manualPickBtn, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <Text style={[styles.manualPickText, { color: palette.primary }]}>Chọn thủ công</Text>
          </Pressable>
        </View>
        <TenantPickerSheet
          palette={palette}
          visible={tenantPickerOpen}
          selectedId={tenantId}
          onSelect={id => {
            if (id !== tenantId) miniAppLoads.cancel('tenant_changed');
            void switchTenant(id);
            setTenantPickerOpen(false);
          }}
          onClose={() => setTenantPickerOpen(false)}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={palette.statusBarStyle} />
      <View style={[styles.app, { backgroundColor: palette.canvas }]}>
        {screen}
        <GlassTabBar
          activeMiniAppId={activeFrame?.appId ?? null}
          dockSelection={dockSelection}
          onExplore={() => setExploreSheetOpen(true)}
          onHome={showHome}
          onOpenMiniApp={openMiniAppFromNavigationBar}
          onRequestSlot={openPicker}
          palette={palette}
        />
        <MiniAppPickerModal
          onClear={clearDockSlot}
          onClose={closePicker}
          onScrollDepth={depth => {
            runAsync(
              tracking.trackHost('screen_scroll_depth', {
                screen: 'mini_app_picker',
                depth_percent: depth,
              }),
            );
          }}
          onSelect={selectDockApp}
          palette={palette}
          selectedAppId={pickerSlot ? dockSelection[pickerSlot] : null}
          slot={pickerSlot}
        />
        <ForegroundNotificationBanner
          notification={foregroundNotification}
          onDismiss={() => {
            runAsync(
              tracking.trackHost('entrypoint_clicked', {
                entrypoint_id: 'dismiss_foreground_notification',
                surface: 'foreground_notification',
                destination: 'current_view',
              }),
            );
            setForegroundNotification(null);
          }}
          onPress={notificationId => {
            setForegroundNotification(null);
            runAsync(notification.activateForeground(notificationId));
          }}
          palette={palette}
        />
        <ExploreSheet
          palette={palette}
          visible={exploreSheetOpen}
          tenantId={tenantId!}
          onClose={() => setExploreSheetOpen(false)}
          onOpenMiniApp={appId => {
            setExploreSheetOpen(false);
            openMiniApp(appId, 'navigation_bar');
          }}
          onOpenTenantPicker={() => setTenantPickerOpen(true)}
        />
        <TenantPickerSheet
          palette={palette}
          visible={tenantPickerOpen}
          selectedId={tenantId}
          onSelect={id => {
            if (id !== tenantId) miniAppLoads.cancel('tenant_changed');
            void switchTenant(id);
            setTenantPickerOpen(false);
          }}
          onClose={() => setTenantPickerOpen(false)}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  loadingSub: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  manualPickBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  manualPickText: {
    fontSize: 13,
    fontWeight: '800',
  },
});

export default App;
