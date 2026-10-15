import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ShellPalette } from '../config/palette';
import {
  DeviceAccessKind,
  DeviceAccessResult,
  DeviceAccessStatus,
  requestDeviceAccess,
} from '../native/deviceAccess';
import { signalNavigationSelection } from '../native/nativeShell';

type AccessItem = {
  kind: DeviceAccessKind;
  glyph: string;
  title: string;
  subtitle: string;
};

const accessItems: AccessItem[] = [
  {
    kind: 'network',
    glyph: '⌁',
    title: 'Mạng',
    subtitle: 'Trạng thái Wi-Fi hoặc di động',
  },
  {
    kind: 'biometric',
    glyph: '◉',
    title: 'Đăng nhập',
    subtitle: 'Face ID hoặc vân tay',
  },
  {
    kind: 'weatherLocation',
    glyph: '⌖',
    title: 'Thời tiết',
    subtitle: 'Chỉ vị trí gần đúng',
  },
  {
    kind: 'voiceCommand',
    glyph: '⌁',
    title: 'Lệnh thoại',
    subtitle: 'Giọng nói được nhận dạng trên máy',
  },
];

type Props = {
  palette: ShellPalette;
  onAccessRequested: (kind: DeviceAccessKind) => void;
  onAccessCompleted: (
    kind: DeviceAccessKind,
    status: DeviceAccessStatus,
  ) => void;
};

export function AccessSetup({
  palette,
  onAccessRequested,
  onAccessCompleted,
}: Props) {
  const [pending, setPending] = useState<DeviceAccessKind | null>(null);
  const [result, setResult] = useState<DeviceAccessResult | null>(null);

  async function request(kind: DeviceAccessKind) {
    signalNavigationSelection();
    onAccessRequested(kind);
    setPending(kind);
    setResult(null);

    try {
      const accessResult = await requestDeviceAccess(kind);
      setResult(accessResult);
      onAccessCompleted(kind, accessResult.status);
    } catch {
      const accessResult: DeviceAccessResult = {
        status: 'error',
        message: 'Không thể hoàn tất yêu cầu trên thiết bị.',
      };
      setResult(accessResult);
      onAccessCompleted(kind, accessResult.status);
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.text }]}>
        Truy cập thiết bị
      </Text>
      <Text style={[styles.sectionBody, { color: palette.mutedText }]}>
        Chỉ yêu cầu sau khi bạn chọn một thao tác. Màn hình này không chia sẻ
        gì với mini-app.
      </Text>
      <View style={styles.grid}>
        {accessItems.map(item => {
          const isPending = pending === item.kind;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.title}
              disabled={pending !== null}
              key={item.kind}
              onPress={() => request(item.kind)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: palette.surface,
                  shadowColor: palette.shadow,
                },
                pressed && pending === null && styles.cardPressed,
              ]}
            >
              <View
                style={[styles.icon, { backgroundColor: palette.primarySoft }]}
              >
                {isPending ? (
                  <ActivityIndicator color={palette.primary} size="small" />
                ) : (
                  <Text style={[styles.glyph, { color: palette.primary }]}>
                    {item.glyph}
                  </Text>
                )}
              </View>
              <Text style={[styles.cardTitle, { color: palette.text }]}>
                {item.title}
              </Text>
              <Text style={[styles.cardSubtitle, { color: palette.mutedText }]}>
                {item.subtitle}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {result ? (
        <View style={[styles.result, { backgroundColor: palette.primarySoft }]}>
          <Text style={[styles.resultLabel, { color: palette.primary }]}>
            {result.status.replace('_', ' ')}
          </Text>
          <Text style={[styles.resultText, { color: palette.text }]}>
            {result.transcript
              ? `Đã nghe: “${result.transcript}”`
              : result.message}
          </Text>
          {result.transcript ? (
            <Text style={[styles.resultHint, { color: palette.mutedText }]}>
              Host chỉ lưu văn bản. Muốn chuyển cho mini-app cần capability
              lệnh đã được duyệt.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  card: {
    borderRadius: 20,
    minHeight: 128,
    padding: 14,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: '47%',
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  icon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  glyph: {
    fontSize: 19,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 12,
  },
  cardSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  result: {
    borderRadius: 16,
    marginTop: 14,
    padding: 14,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  resultText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  resultHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
});
