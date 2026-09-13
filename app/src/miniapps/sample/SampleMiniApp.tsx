import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  bookSampleSlot,
  cancelSampleBooking,
  initialSampleSlots,
  joinOpenSampleSlot,
  sampleDates,
  SampleDateId,
  SampleSlot,
} from './model';

type Props = {
  onClose?: () => void;
};

export function SampleMiniApp({ onClose }: Props) {
  const [slots, setSlots] = useState<SampleSlot[]>(() => [...initialSampleSlots]);
  const [selectedDate, setSelectedDate] = useState<SampleDateId>('today');

  const filteredSlots = useMemo(
    () => slots.filter(slot => slot.dateId === selectedDate),
    [slots, selectedDate],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.badge}>SAMPLE WEB MINI APP</Text>
          {onClose ? (
            <Pressable
              accessibilityLabel="Close mini-app"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>×</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.title}>Cầu lông / Badminton</Text>
        <Text style={styles.subtitle}>
          Sample source demonstrating decoupled mini-app execution.
        </Text>
      </View>

      <View style={styles.dateSelector}>
        {sampleDates.map(date => (
          <Pressable
            key={date.id}
            onPress={() => setSelectedDate(date.id)}
            style={[
              styles.dateTab,
              selectedDate === date.id && styles.dateTabActive,
            ]}
          >
            <Text
              style={[
                styles.dateLabel,
                selectedDate === date.id && styles.dateLabelActive,
              ]}
            >
              {date.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {filteredSlots.map(slot => (
          <View key={slot.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.courtName}>{slot.courtName}</Text>
              <Text style={styles.time}>
                {slot.startTime} - {slot.endTime}
              </Text>
            </View>
            <Text style={styles.venue}>{slot.venue}</Text>
            <Text style={styles.price}>
              {new Intl.NumberFormat('vi-VN').format(slot.priceVnd)}đ
            </Text>

            <View style={styles.actions}>
              {slot.owner === null && (
                <Pressable
                  onPress={() =>
                    setSlots(prev => bookSampleSlot(prev, slot.id, 'open'))
                  }
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionBtnText}>Đặt sân</Text>
                </Pressable>
              )}
              {slot.owner === 'other' && slot.visibility === 'open' && (
                <Pressable
                  onPress={() =>
                    setSlots(prev => joinOpenSampleSlot(prev, slot.id))
                  }
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionBtnText}>Tham gia ghép</Text>
                </Pressable>
              )}
              {slot.owner === 'me' && (
                <Pressable
                  onPress={() =>
                    setSlots(prev => cancelSampleBooking(prev, slot.id))
                  }
                  style={[styles.actionBtn, styles.actionCancel]}
                >
                  <Text style={styles.actionBtnText}>Hủy đặt</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#1e293b',
  },
  closeBtnText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  dateSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dateTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  dateTabActive: {
    backgroundColor: '#10b981',
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
  },
  dateLabelActive: {
    color: '#ffffff',
  },
  list: {
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  courtName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  time: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  venue: {
    fontSize: 13,
    color: '#94a3b8',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 6,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  actionCancel: {
    backgroundColor: '#ef4444',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
