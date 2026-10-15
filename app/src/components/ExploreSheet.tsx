import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ShellPalette } from '../config/palette';
import { useReducedMotion } from '../config/useReducedMotion';
import { TenantId, TENANTS } from '../config/tenants';
import { catalogForTenant } from '../miniapps/catalogTenant';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type Props = {
  palette: ShellPalette;
  visible: boolean;
  tenantId: TenantId;
  onClose: () => void;
  onOpenMiniApp: (appId: string) => void;
  onOpenTenantPicker?: () => void;
};

export function ExploreSheet({
  palette,
  visible,
  tenantId,
  onClose,
  onOpenMiniApp,
  onOpenTenantPicker,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      // Slight delay so the modal animation completes before keyboard opens
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, reducedMotion ? 0 : 150);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
    }
  }, [visible, reducedMotion]);

  const handleSend = useCallback(() => {
    const text = query.trim();
    if (!text) return;
    setMessages(prev => [
      ...prev,
      { id: `${Date.now()}-user`, role: 'user', text },
    ]);
    setQuery('');
    Keyboard.dismiss();
  }, [query]);

  const tenantMeta = TENANTS[tenantId];
  const suggestedApps = catalogForTenant(tenantId).slice(0, 5);

  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'slide'}
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <Pressable onPress={onClose} style={styles.backdrop}>
          <Pressable
            accessibilityViewIsModal
            onPress={() => undefined}
            style={[
              styles.sheet,
              { backgroundColor: palette.surface, shadowColor: palette.shadow },
            ]}
          >
            {/* Handle */}
            <View
              style={[styles.handle, { backgroundColor: palette.primarySoft }]}
            />

            {/* Header */}
            <View style={styles.heading}>
              <Text style={[styles.title, { color: palette.text }]}>
                Khám phá
              </Text>
              <Pressable
                accessibilityLabel="Đóng khám phá"
                accessibilityRole="button"
                onPress={onClose}
                style={[
                  styles.closeBtn,
                  { backgroundColor: palette.primarySoft },
                ]}
              >
                <Text style={[styles.closeBtnText, { color: palette.primary }]}>
                  ×
                </Text>
              </Pressable>
            </View>

            {/* Tenant context */}
            <Pressable
              onPress={onOpenTenantPicker}
              style={[styles.tenantPill, { backgroundColor: palette.canvasAccent, borderColor: palette.glassBorder }]}
            >
              <Text style={[styles.tenantPillText, { color: palette.mutedText }]}>
                Khu vực: <Text style={{ color: palette.text, fontWeight: '800' }}>{tenantMeta.label}</Text> · {tenantMeta.provinceName}
              </Text>
              {onOpenTenantPicker ? (
                <Text style={[styles.tenantPillAction, { color: palette.primary }]}>Đổi</Text>
              ) : null}
            </Pressable>

            {/* Suggested app chips */}
            <View style={styles.chips}>
              {suggestedApps.map(app => (
                <Pressable
                  key={app.id}
                  accessibilityLabel={`Mở ${app.name}`}
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    onOpenMiniApp(app.id);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: palette.primarySoft },
                    pressed && styles.chipPressed,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.chipLabel, { color: palette.primary }]}
                  >
                    {app.shortName ?? app.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Message history */}
            {messages.length > 0 && (
              <View style={styles.messages}>
                {messages.map(msg => (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageBubble,
                      msg.role === 'user'
                        ? [
                            styles.userBubble,
                            { backgroundColor: palette.primary },
                          ]
                        : [
                            styles.assistantBubble,
                            { backgroundColor: palette.canvasAccent },
                          ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        {
                          color:
                            msg.role === 'user'
                              ? palette.onPrimary
                              : palette.text,
                        },
                      ]}
                    >
                      {msg.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Chat input */}
            <View
              style={[
                styles.inputRow,
                {
                  backgroundColor: palette.canvasAccent,
                  borderColor: palette.glassBorder,
                },
              ]}
            >
              <TextInput
                ref={inputRef}
                autoFocus
                multiline={false}
                placeholder="Tìm kiếm hoặc hỏi bất cứ điều gì…"
                placeholderTextColor={palette.mutedText}
                returnKeyType="send"
                style={[styles.input, { color: palette.text }]}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSend}
              />
              <Pressable
                accessibilityLabel="Gửi"
                accessibilityRole="button"
                disabled={!query.trim()}
                onPress={handleSend}
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: palette.primary },
                  !query.trim() && styles.sendBtnDisabled,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.sendBtnText, { color: palette.onPrimary }]}>
                  ↑
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 28, 50, 0.28)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 14,
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
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  closeBtn: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeBtnText: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 27,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipGlyph: {
    fontSize: 16,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipPressed: {
    opacity: 0.75,
  },
  tenantPill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  tenantPillText: {
    fontSize: 12,
    flex: 1,
  },
  tenantPillAction: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
  },
  messages: {
    gap: 8,
    marginBottom: 12,
    maxHeight: 200,
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  sendBtn: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  sendBtnText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
