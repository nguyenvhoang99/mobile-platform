import {
  bookSampleSlot,
  cancelSampleBooking,
  initialSampleSlots,
  joinOpenSampleSlot,
  removeSampleParticipant,
  resolveSampleSlotInterval,
  setSampleBookingVisibility,
} from './model';

describe('sample booking model', () => {
  test('books an available slot and opens it to other players', () => {
    const slots = bookSampleSlot(
      initialSampleSlots,
      'today-court-1-1800',
      'open',
    );
    expect(slots.find(slot => slot.id === 'today-court-1-1800')).toMatchObject({
      owner: 'me',
      visibility: 'open',
      participants: [{ id: 'me' }],
    });
  });

  test('joins only an open slot with capacity', () => {
    const joined = joinOpenSampleSlot(
      initialSampleSlots,
      'today-court-2-1900',
    );
    expect(
      joined
        .find(slot => slot.id === 'today-court-2-1900')
        ?.participants.map(participant => participant.id),
    ).toContain('me');

    const full = joinOpenSampleSlot(
      initialSampleSlots,
      'tomorrow-court-4-1930',
    );
    expect(
      full
        .find(slot => slot.id === 'tomorrow-court-4-1930')
        ?.participants.map(participant => participant.id),
    ).not.toContain('me');
  });

  test('lets the owner manage visibility, participants, and cancellation', () => {
    const privateSlots = setSampleBookingVisibility(
      initialSampleSlots,
      'today-court-3-2000',
      'private',
    );
    expect(
      privateSlots.find(slot => slot.id === 'today-court-3-2000')?.visibility,
    ).toBe('private');

    const removed = removeSampleParticipant(
      privateSlots,
      'today-court-3-2000',
      'demo-lan',
    );
    expect(
      removed
        .find(slot => slot.id === 'today-court-3-2000')
        ?.participants.map(participant => participant.id),
    ).toEqual(['me']);

    const cancelled = cancelSampleBooking(removed, 'today-court-3-2000');
    expect(
      cancelled.find(slot => slot.id === 'today-court-3-2000'),
    ).toMatchObject({ owner: null, participants: [] });
  });

  test('resolves booking buckets into local start and end timestamps', () => {
    const now = new Date(2026, 7, 6, 10, 15);
    const tomorrow = initialSampleSlots.find(
      slot => slot.id === 'tomorrow-court-1-1800',
    )!;
    const interval = resolveSampleSlotInterval(tomorrow, now)!;

    expect(new Date(interval.startAtMs)).toEqual(new Date(2026, 7, 7, 18, 0));
    expect(new Date(interval.endAtMs)).toEqual(new Date(2026, 7, 7, 19, 0));
  });
});
