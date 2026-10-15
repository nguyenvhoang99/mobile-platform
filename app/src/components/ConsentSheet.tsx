import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShellPalette } from '../config/palette';

export type ConsentRequest = {
  miniAppName: string;
  publisherName: string;
  capability: string;
  purpose: string;
  dataDescription: string;
  scope: 'once' | 'while_using' | 'session' | 'persistent';
};

export function ConsentSheet({
  palette,
  request,
  visible,
  onAllow,
  onDeny,
}: {
  palette: ShellPalette;
  request: ConsentRequest | null;
  visible: boolean;
  onAllow: () => void;
  onDeny: () => void;
}) {
  if (!request) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDeny}>
      <View style={[styles.scrim, { backgroundColor: palette.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: palette.surfaceElevated }]}>
          <Text style={[styles.kicker, { color: palette.mutedText }]}>XÁC NHẬN QUYỀN TRUY CẬP</Text>
          <Text style={[styles.title, { color: palette.text }]}>{request.miniAppName} muốn sử dụng</Text>
          <Text style={[styles.capability, { color: palette.primary }]}>{request.capability}</Text>
          <Text style={[styles.purpose, { color: palette.mutedText }]}>{request.purpose}</Text>
          <Text style={[styles.dataDesc, { color: palette.mutedText }]}>{request.dataDescription}</Text>
          <Text style={[styles.scope, { color: palette.mutedText }]}>
            Phạm vi: {scopeLabel(request.scope)}
          </Text>
          <Text style={[styles.publisher, { color: palette.mutedText }]}>Nhà phát hành: {request.publisherName}</Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Để sau"
              onPress={onDeny}
              style={[styles.secondaryBtn, { borderColor: palette.border }]}
            >
              <Text style={[styles.secondaryText, { color: palette.text }]}>Để sau</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cho phép"
              onPress={onAllow}
              style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            >
              <Text style={[styles.primaryText, { color: palette.onPrimary }]}>Cho phép</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function scopeLabel(s: ConsentRequest['scope']): string {
  switch (s) {
    case 'once':
      return 'một lần';
    case 'while_using':
      return 'khi đang dùng';
    case 'session':
      return 'phiên hiện tại';
    case 'persistent':
      return 'lâu dài (cần phê duyệt riêng)';
  }
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  sheet: { borderRadius: 20, padding: 20 },
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 18, fontWeight: '800', marginTop: 6 },
  capability: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  purpose: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  dataDesc: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  scope: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  publisher: { fontSize: 11, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14 },
  secondaryText: { fontWeight: '700' },
  primaryBtn: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14 },
  primaryText: { fontWeight: '800' },
});
