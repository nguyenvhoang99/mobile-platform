import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccessSetup } from '../components/AccessSetup';
import {
  ScrollDepthPercent,
  TrackedScrollView,
} from '../components/TrackedScrollView';
import { ShellPalette } from '../config/palette';
import { DeviceAccessKind, DeviceAccessStatus } from '../native/deviceAccess';

type Props = {
  palette: ShellPalette;
  route: 'account';
  onBack?: () => void;
  onAccessRequested: (kind: DeviceAccessKind) => void;
  onAccessCompleted: (
    kind: DeviceAccessKind,
    status: DeviceAccessStatus,
  ) => void;
  onScrollDepth: (depth: ScrollDepthPercent) => void;
};

const copy = {
  account: {
    eyebrow: 'HOST ACCOUNT',
    title: 'Your shell, on your terms.',
    body: 'Account controls remain host-owned and never depend on a mini-app WebView.',
  },
};

export function PlaceholderScreen({
  palette,
  route,
  onBack,
  onAccessRequested,
  onAccessCompleted,
  onScrollDepth,
}: Props) {
  const insets = useSafeAreaInsets();
  const content = copy[route];

  return (
    <TrackedScrollView
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + 10 }]}
      onScrollDepth={onScrollDepth}
      style={[styles.scroll, { backgroundColor: palette.canvas }]}
      trackingResetKey="account"
    >
      {onBack ? (
        <Pressable
          accessibilityLabel="Go back to Home"
          accessibilityRole="button"
          onPress={onBack}
          style={[styles.backBtn, { backgroundColor: palette.primarySoft }]}
        >
          <Text style={[styles.backBtnText, { color: palette.primary }]}>
            ‹
          </Text>
          <Text style={[styles.backBtnLabel, { color: palette.primary }]}>
            Home
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: palette.primary }]}>
          {content.eyebrow}
        </Text>
        <Text style={[styles.title, { color: palette.text }]}>
          {content.title}
        </Text>
        <Text style={[styles.body, { color: palette.mutedText }]}>
          {content.body}
        </Text>
        <AccessSetup
          onAccessCompleted={onAccessCompleted}
          onAccessRequested={onAccessRequested}
          palette={palette}
        />
      </View>
    </TrackedScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    overflow: 'hidden',
    paddingBottom: 142,
    paddingHorizontal: 28,
  },
  scroll: {
    flex: 1,
  },
  backBtn: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtnText: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 26,
  },
  backBtnLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 40,
    marginTop: 12,
    maxWidth: 300,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 300,
  },
});
