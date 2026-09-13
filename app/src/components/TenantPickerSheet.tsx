import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShellPalette } from '../config/palette';
import { TENANTS, TenantId } from '../config/tenants';

export function TenantPickerSheet({
  palette,
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  palette: ShellPalette;
  visible: boolean;
  selectedId: TenantId | null;
  onSelect: (id: TenantId) => void;
  onClose: () => void;
}) {
  const mvpIds: TenantId[] = ['vn-hn', 'vn-hcm', 'vn-dn'];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: palette.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: palette.surfaceElevated }]}>
          <Text style={[styles.title, { color: palette.text }]}>Chọn tỉnh / thành phố</Text>
          <Text style={[styles.subtitle, { color: palette.mutedText }]}>
            Ứng dụng sẽ hiển thị mini-app phù hợp với khu vực của bạn. Bạn có thể đổi lại trong Cài đặt.
          </Text>
          {mvpIds.map(id => {
            const t = TENANTS[id];
            const isSelected = selectedId === id;
            return (
              <Pressable
                key={id}
                onPress={() => onSelect(id)}
                style={[
                  styles.row,
                  { backgroundColor: isSelected ? palette.primarySoft : palette.canvas, borderColor: palette.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: palette.text }]}>{t.label}</Text>
                  <Text style={[styles.rowDesc, { color: palette.mutedText }]}>{t.description}</Text>
                </View>
                <Text style={{ color: palette.primary, fontWeight: '800' }}>{isSelected ? '●' : '○'}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={{ color: palette.mutedText, fontWeight: '700' }}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', padding: 12 },
  sheet: { borderRadius: 20, padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  rowLabel: { fontSize: 15, fontWeight: '800' },
  rowDesc: { fontSize: 11, lineHeight: 14, marginTop: 2 },
  closeBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 6 },
});
