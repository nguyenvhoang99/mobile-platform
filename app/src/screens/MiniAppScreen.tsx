import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShellPalette } from '../config/palette';
import {
  ScrollDepthPercent,
  TrackedScrollView,
} from '../components/TrackedScrollView';
import { CardCatalogBody } from '../components/CardCatalogBody';
import { SplitBillBody } from '../components/SplitBillBody';
import { MiniAppManifest } from '../miniapps/catalog';
import { MiniAppFrame } from '../navigation/navigationBroker';
import { signalNavigationSelection } from '../native/nativeShell';
import { LineIcon } from '../ui/primitives/LineIcon';

type Props = {
  palette: ShellPalette;
  manifest: MiniAppManifest;
  frame: MiniAppFrame;
  onBack: () => void;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onOpenCrossApp: (linkId: string) => void;
  onScrollDepth: (depth: ScrollDepthPercent) => void;
  onTrackEvent: (
    name: string,
    version: number,
    data: Record<string, unknown>,
  ) => void;
};

function samplePath(pattern: string): string {
  return pattern
    .replace(':day', 'tomorrow')
    .replace(':routeId', '42')
    .replace(':noteId', 'welcome')
    .replace(':itemId', 'featured');
}

export const MiniAppScreen = memo(function MiniAppScreen({
  palette,
  manifest,
  frame,
  onBack,
  onClose,
  onNavigate,
  onOpenCrossApp,
  onScrollDepth,
  onTrackEvent,
}: Props) {
  const insets = useSafeAreaInsets();
  const currentPath = frame.history.at(-1) ?? manifest.rootRoute;

  return (
    <View style={[styles.screen, { backgroundColor: palette.canvas }]}>
      <View
        style={[
          styles.trustedHeader,
          {
            backgroundColor: palette.surface,
            borderBottomColor: palette.glassBorder,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => {
            signalNavigationSelection();
            onBack();
          }}
          style={[
            styles.headerButton,
            { backgroundColor: palette.primarySoft },
          ]}
        >
          <Text style={[styles.headerButtonText, { color: palette.primary }]}>
            ‹
          </Text>
        </Pressable>
        <View style={styles.identity}>
          <Text style={[styles.identityLabel, { color: palette.mutedText }]}>
            VERIFIED MINI-APP
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.identityName, { color: palette.text }]}
          >
            {manifest.name}
            {manifest.englishName ? ` · ${manifest.englishName}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close mini-app"
          accessibilityRole="button"
          onPress={() => {
            signalNavigationSelection();
            onClose();
          }}
          style={[styles.headerButton, { backgroundColor: palette.canvas }]}
        >
          <Text style={[styles.closeText, { color: palette.text }]}>×</Text>
        </Pressable>
      </View>

      <TrackedScrollView
        contentContainerStyle={styles.content}
        onScrollDepth={onScrollDepth}
        trackingResetKey={`${manifest.id}:${currentPath}`}
      >
        {manifest.id === 'card' ? (
          <CardCatalogBody
            palette={palette}
            path={currentPath}
            onNavigate={onNavigate}
            onTrackEvent={onTrackEvent}
          />
        ) : manifest.id === 'split-bill' ? (
          <SplitBillBody palette={palette} onTrackEvent={onTrackEvent} />
        ) : (
          <>
        <View
          style={[styles.hero, { backgroundColor: palette.canvasAccent }]}
        >
          <View
            style={[styles.appIcon, { backgroundColor: palette.surface, borderWidth: 1.2, borderColor: palette.glassBorder }]}
          >
            <LineIcon name={manifest.icon} size={28} color={palette.primary} strokeWidth={1.5} />
          </View>
          <Text style={[styles.eyebrow, { color: palette.primary }]}>
            HOST-CONTAINED EXPERIENCE
          </Text>
          <Text style={[styles.title, { color: palette.text }]}>
            {manifest.name}
          </Text>
          <Text style={[styles.body, { color: palette.mutedText }]}>
            This mini-app is loaded from the configured remote resource endpoint.
            The host owns navigation, identity, tracking, and native capabilities.
          </Text>
          <View
            style={[styles.endpointPill, { backgroundColor: palette.surface }]}
          >
            <Text style={[styles.endpointLabel, { color: palette.mutedText }]}>
              ENDPOINT:
            </Text>
            <Text numberOfLines={1} style={[styles.endpointText, { color: palette.primary }]}>
              {manifest.resourceEndpoint}
            </Text>
          </View>
          <View
            style={[styles.pathPill, { backgroundColor: palette.surface }]}
          >
            <Text style={[styles.pathText, { color: palette.text }]}>
              Route: {currentPath}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>
          Declared pages
        </Text>
        <View style={styles.actionList}>
          {manifest.routes.map(route => {
            const path = samplePath(route);
            return (
              <Pressable
                key={route}
                onPress={() => onNavigate(path)}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: palette.surface },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.actionTitle, { color: palette.text }]}>
                  {path}
                </Text>
                <Text
                  style={[styles.actionArrow, { color: palette.primary }]}
                >
                  →
                </Text>
              </Pressable>
            );
          })}
        </View>

        {manifest.crossAppLinks.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Approved cross-app links
            </Text>
            <View style={styles.actionList}>
              {manifest.crossAppLinks.map(link => (
                <Pressable
                  key={link.id}
                  onPress={() => onOpenCrossApp(link.id)}
                  style={({ pressed }) => [
                    styles.crossAction,
                    { backgroundColor: palette.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.crossActionText,
                      { color: palette.onPrimary },
                    ]}
                  >
                    {link.label}
                  </Text>
                  <Text
                    style={[styles.actionArrow, { color: palette.onPrimary }]}
                  >
                    ↗
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
          </>
        )}
      </TrackedScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  trustedHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  headerButtonText: { fontSize: 30, lineHeight: 31 },
  closeText: { fontSize: 24, lineHeight: 27 },
  identity: { alignItems: 'center', flex: 1 },
  identityLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  identityName: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  content: { padding: 20, paddingBottom: 142 },
  hero: { borderRadius: 28, padding: 22 },
  appIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  appGlyph: { fontSize: 25, fontWeight: '800' },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 18,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: 7 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  endpointPill: {
    alignSelf: 'stretch',
    borderRadius: 12,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  endpointLabel: { fontSize: 10, fontWeight: '800' },
  endpointText: { fontSize: 12, fontWeight: '700', flex: 1 },
  pathPill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pathText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 28,
  },
  actionList: { gap: 10 },
  action: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 16,
  },
  crossAction: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 16,
  },
  actionTitle: { fontSize: 13, fontWeight: '700' },
  crossActionText: { flex: 1, fontSize: 14, fontWeight: '800' },
  actionArrow: { fontSize: 18, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
