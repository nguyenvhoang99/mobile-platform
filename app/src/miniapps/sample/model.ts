export type SampleDateId = 'today' | 'tomorrow' | 'weekend';
export type BookingVisibility = 'private' | 'open';

export type SampleParticipant = {
  id: string;
  displayName: string;
};

export type SampleSlot = {
  id: string;
  dateId: SampleDateId;
  courtId: string;
  courtName: string;
  venue: string;
  startTime: string;
  endTime: string;
  priceVnd: number;
  capacity: number;
  owner: 'me' | 'other' | null;
  visibility: BookingVisibility;
  participants: SampleParticipant[];
};

export type SampleSlotInterval = {
  startAtMs: number;
  endAtMs: number;
};

export const sampleDates: readonly {
  id: SampleDateId;
  label: string;
  detail: string;
}[] = [
  { id: 'today', label: 'Hôm nay', detail: 'Tối nay' },
  { id: 'tomorrow', label: 'Ngày mai', detail: 'Sau giờ làm' },
  { id: 'weekend', label: 'Cuối tuần', detail: 'Sáng & tối' },
];

export const initialSampleSlots: readonly SampleSlot[] = [
  {
    id: 'today-court-1-1800',
    dateId: 'today',
    courtId: 'court-1',
    courtName: 'Sân 1',
    venue: 'CLB Cầu lông Bình Thạnh',
    startTime: '18:00',
    endTime: '19:00',
    priceVnd: 120_000,
    capacity: 4,
    owner: null,
    visibility: 'private',
    participants: [],
  },
  {
    id: 'today-court-2-1900',
    dateId: 'today',
    courtId: 'court-2',
    courtName: 'Sân 2',
    venue: 'CLB Cầu lông Bình Thạnh',
    startTime: '19:00',
    endTime: '20:30',
    priceVnd: 170_000,
    capacity: 4,
    owner: 'other',
    visibility: 'open',
    participants: [
      { id: 'demo-minh', displayName: 'Minh' },
      { id: 'demo-an', displayName: 'An' },
    ],
  },
  {
    id: 'today-court-3-2000',
    dateId: 'today',
    courtId: 'court-3',
    courtName: 'Sân 3',
    venue: 'Nhà thi đấu Phú Thọ',
    startTime: '20:00',
    endTime: '21:00',
    priceVnd: 140_000,
    capacity: 4,
    owner: 'me',
    visibility: 'open',
    participants: [
      { id: 'me', displayName: 'Bạn' },
      { id: 'demo-lan', displayName: 'Lan' },
    ],
  },
  {
    id: 'tomorrow-court-1-1800',
    dateId: 'tomorrow',
    courtId: 'court-1',
    courtName: 'Sân 1',
    venue: 'CLB Cầu lông Bình Thạnh',
    startTime: '18:00',
    endTime: '19:00',
    priceVnd: 120_000,
    capacity: 4,
    owner: null,
    visibility: 'private',
    participants: [],
  },
  {
    id: 'tomorrow-court-4-1930',
    dateId: 'tomorrow',
    courtId: 'court-4',
    courtName: 'Sân 4',
    venue: 'Nhà thi đấu Phú Thọ',
    startTime: '19:30',
    endTime: '21:00',
    priceVnd: 190_000,
    capacity: 4,
    owner: 'other',
    visibility: 'open',
    participants: [
      { id: 'demo-huy', displayName: 'Huy' },
      { id: 'demo-thao', displayName: 'Thảo' },
      { id: 'demo-vy', displayName: 'Vy' },
      { id: 'demo-tuan', displayName: 'Tuấn' },
    ],
  },
  {
    id: 'weekend-court-2-0800',
    dateId: 'weekend',
    courtId: 'court-2',
    courtName: 'Sân 2',
    venue: 'CLB Cầu lông Bình Thạnh',
    startTime: '08:00',
    endTime: '09:30',
    priceVnd: 150_000,
    capacity: 4,
    owner: null,
    visibility: 'private',
    participants: [],
  },
  {
    id: 'weekend-court-5-1800',
    dateId: 'weekend',
    courtId: 'court-5',
    courtName: 'Sân 5',
    venue: 'Sân Cầu lông Sala',
    startTime: '18:00',
    endTime: '20:00',
    priceVnd: 240_000,
    capacity: 4,
    owner: 'other',
    visibility: 'open',
    participants: [{ id: 'demo-linh', displayName: 'Linh' }],
  },
];

function clockParts(value: string): [number, number] | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? [hour, minute] : null;
}

/** Resolves demo date buckets to local device time. */
export function resolveSampleSlotInterval(
  slot: SampleSlot,
  now = new Date(),
): SampleSlotInterval | null {
  const startClock = clockParts(slot.startTime);
  const endClock = clockParts(slot.endTime);
  if (!startClock || !endClock) {
    return null;
  }

  const start = new Date(now);
  start.setSeconds(0, 0);
  if (slot.dateId === 'tomorrow') {
    start.setDate(start.getDate() + 1);
  } else if (slot.dateId === 'weekend') {
    const day = start.getDay();
    let daysUntilSaturday = day === 0 ? 6 : (6 - day + 7) % 7;
    start.setHours(startClock[0], startClock[1], 0, 0);
    if (daysUntilSaturday === 0 && start.getTime() <= now.getTime()) {
      daysUntilSaturday = 7;
    }
    start.setDate(start.getDate() + daysUntilSaturday);
  }
  start.setHours(startClock[0], startClock[1], 0, 0);

  const end = new Date(start);
  end.setHours(endClock[0], endClock[1], 0, 0);
  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return { startAtMs: start.getTime(), endAtMs: end.getTime() };
}

function updateSlot(
  slots: readonly SampleSlot[],
  slotId: string,
  update: (slot: SampleSlot) => SampleSlot,
): SampleSlot[] {
  return slots.map(slot => (slot.id === slotId ? update(slot) : slot));
}

export function bookSampleSlot(
  slots: readonly SampleSlot[],
  slotId: string,
  visibility: BookingVisibility,
): SampleSlot[] {
  return updateSlot(slots, slotId, slot =>
    slot.owner === null
      ? {
          ...slot,
          owner: 'me',
          visibility,
          participants: [{ id: 'me', displayName: 'Bạn' }],
        }
      : slot,
  );
}

export function joinOpenSampleSlot(
  slots: readonly SampleSlot[],
  slotId: string,
): SampleSlot[] {
  return updateSlot(slots, slotId, slot =>
    slot.owner === 'other' &&
    slot.visibility === 'open' &&
    slot.participants.length < slot.capacity &&
    !slot.participants.some(participant => participant.id === 'me')
      ? {
          ...slot,
          participants: [
            ...slot.participants,
            { id: 'me', displayName: 'Bạn' },
          ],
        }
      : slot,
  );
}

export function setSampleBookingVisibility(
  slots: readonly SampleSlot[],
  slotId: string,
  visibility: BookingVisibility,
): SampleSlot[] {
  return updateSlot(slots, slotId, slot =>
    slot.owner === 'me' ? { ...slot, visibility } : slot,
  );
}

export function removeSampleParticipant(
  slots: readonly SampleSlot[],
  slotId: string,
  participantId: string,
): SampleSlot[] {
  return updateSlot(slots, slotId, slot =>
    slot.owner === 'me' && participantId !== 'me'
      ? {
          ...slot,
          participants: slot.participants.filter(
            participant => participant.id !== participantId,
          ),
        }
      : slot,
  );
}

export function cancelSampleBooking(
  slots: readonly SampleSlot[],
  slotId: string,
): SampleSlot[] {
  return updateSlot(slots, slotId, slot =>
    slot.owner === 'me'
      ? {
          ...slot,
          owner: null,
          visibility: 'private',
          participants: [],
        }
      : slot,
  );
}
