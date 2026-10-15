import {
  NotificationService,
  parseRemoteNotification,
} from './notificationService';
import { NativeNotificationEvent, NativeReminderRequest } from './types';
import { HostTrackingEventName } from '../tracking/trackingService';

function payload(id: string) {
  return JSON.stringify({
    notification_id: id,
    category: 'weather_update',
    title: 'Rain nearby',
    body: 'Rain is expected in 20 minutes.',
    created_at_ms: 1_000,
    target_app_id: 'weather',
    entrypoint_id: 'forecast',
    target_input: { area: 'current' },
  });
}

function nativeEvent(
  id: string,
  type: NativeNotificationEvent['type'] = 'received',
): NativeNotificationEvent {
  return {
    native_event_id: `native-${id}-${type}`,
    type,
    payload: payload(id),
    app_state: type === 'received' ? 'foreground' : 'terminated',
    provider_message_id: `provider-${id}`,
    occurred_at_ms: 2_000,
  };
}

function harness(pending: NativeNotificationEvent[] = []) {
  let stored = '[]';
  const tracked: Array<{
    name: HostTrackingEventName;
    data: Record<string, unknown>;
  }> = [];
  const acknowledged: string[] = [];
  const scheduled: number[] = [];
  const scheduledRequests: NativeReminderRequest[] = [];
  const calendarEvents: string[] = [];
  const cancelled: string[] = [];
  const service = new NotificationService(
    {
      hostAppVersion: 'test',
      maxInboxItems: 20,
      maxSeenIdsPerEvent: 2,
      reminderLeadMs: 60 * 60 * 1_000,
    },
    {
      now: () => 3_000,
      tracker: {
        trackHost: async (name, data) => {
          tracked.push({ name, data });
          return `event-${tracked.length}`;
        },
      },
      persistence: {
        load: async () => stored,
        save: async value => {
          stored = value;
        },
      },
      native: {
        permissionStatus: async () => 'authorized',
        requestPermission: async () => 'authorized',
        register: async () => ({
          status: 'unavailable',
          provider: 'fcm',
          token: null,
        }),
        pendingEvents: async () => pending,
        acknowledge: async id => {
          acknowledged.push(id);
        },
        subscribe: () => () => undefined,
        scheduleReminder: async request => {
          scheduled.push(request.reminderAtMs);
          scheduledRequests.push(request);
          return {
            status: 'scheduled',
            surface: 'local_notification',
            reminderAtMs: request.reminderAtMs,
            activityId: null,
          };
        },
        cancelReminder: async id => {
          cancelled.push(id);
        },
        presentCalendarEvent: async request => {
          calendarEvents.push(request.id);
          return { status: 'presented' };
        },
      },
    },
  );
  return {
    service,
    tracked,
    acknowledged,
    scheduled,
    scheduledRequests,
    calendarEvents,
    cancelled,
    stored: () => stored,
  };
}

describe('notification service', () => {
  test('validates, persists, and tracks a received foreground notification', async () => {
    const { service, tracked, acknowledged, stored } = harness([
      nativeEvent('notification-1'),
    ]);
    const foreground: string[] = [];
    service.onForegroundReceived(item => foreground.push(item.notification_id));

    await service.start();

    expect(service.getSnapshot()).toMatchObject({
      unreadCount: 1,
      permissionStatus: 'authorized',
    });
    expect(service.getSnapshot().items[0].notification_id).toBe(
      'notification-1',
    );
    expect(foreground).toEqual(['notification-1']);
    expect(tracked[0]).toMatchObject({
      name: 'notification_received',
      data: {
        notification_id: 'notification-1',
        app_state: 'foreground',
      },
    });
    expect(JSON.parse(stored())[0].received_tracked_at_ms).toBe(3_000);
    expect(acknowledged).toEqual(['native-notification-1-received']);
  });

  test('tracks a system-notification click and emits the validated target', async () => {
    const { service, tracked } = harness([
      nativeEvent('notification-2', 'opened'),
    ]);
    const activations: string[] = [];
    service.onActivated(({ notification, source }) => {
      activations.push(`${notification.target?.mini_app_id}:${source}`);
    });

    await service.start();

    expect(tracked.map(event => event.name)).toEqual([
      'notification_received',
      'notification_clicked',
    ]);
    expect(activations).toEqual(['weather:system_notification']);
    expect(service.getSnapshot().unreadCount).toBe(0);

    await service.markSeen(['notification-2']);
    expect(tracked.at(-1)).toMatchObject({
      name: 'notification_inbox_seen',
      data: { notification_ids: ['notification-2'] },
    });
  });

  test('records only newly visible notification IDs and batches the list', async () => {
    const { service, tracked } = harness([
      nativeEvent('notification-1'),
      nativeEvent('notification-2'),
      nativeEvent('notification-3'),
    ]);
    await service.start();

    await service.markSeen([
      'notification-1',
      'notification-2',
      'notification-3',
    ]);
    await service.markSeen(['notification-1', 'notification-2']);

    const seenEvents = tracked.filter(
      event => event.name === 'notification_inbox_seen',
    );
    expect(seenEvents.map(event => event.data.notification_ids)).toEqual([
      ['notification-1', 'notification-2'],
      ['notification-3'],
    ]);
    expect(service.getSnapshot().unreadCount).toBe(0);
  });

  test('rejects malformed, expired, or half-declared navigation targets', () => {
    expect(
      parseRemoteNotification('{"title":"missing fields"}', 2_000),
    ).toBeNull();
    expect(
      parseRemoteNotification(
        JSON.stringify({
          notification_id: 'expired',
          category: 'update',
          title: 'Expired',
          body: 'Old',
          created_at_ms: 1_000,
          expires_at_ms: 1_500,
        }),
        2_000,
      ),
    ).toBeNull();
    expect(
      parseRemoteNotification(
        JSON.stringify({
          notification_id: 'bad-target',
          category: 'update',
          title: 'Target',
          body: 'Missing entrypoint',
          created_at_ms: 1_000,
          target_app_id: 'weather',
        }),
        2_000,
      ),
    ).toBeNull();
  });

  test('schedules the reminder exactly one hour before event', async () => {
    const { service, scheduled } = harness();

    const result = await service.scheduleReminder({
      id: 'tomorrow-court-1-1800',
      startAtMs: 8_000_000,
      endAtMs: 11_600_000,
      title: 'Sân 1',
      location: 'CLB Bình Thạnh',
    });

    expect(result.status).toBe('scheduled');
    expect(scheduled).toEqual([4_400_000]);
  });

  test('composes generic copy and routing in React Native, not native code', async () => {
    const { service, scheduledRequests } = harness();

    const result = await service.scheduleReminder({
      id: 'match-42',
      startAtMs: 8_000_000,
      endAtMs: 11_600_000,
      title: 'Quarterfinal',
      location: 'Court 3',
      category: 'match_reminder',
      targetAppId: 'sports',
      entrypointId: 'my_matches',
      input: { match_id: 'match-42' },
    });

    expect(result.status).toBe('scheduled');
    expect(scheduledRequests).toHaveLength(1);
    expect(scheduledRequests[0]).toMatchObject({
      id: 'match-42',
      title: 'Quarterfinal',
      body: 'Quarterfinal · Court 3',
      category: 'match_reminder',
      targetAppId: 'sports',
      entrypointId: 'my_matches',
      input: { match_id: 'match-42' },
      reminderAtMs: 4_400_000,
    });
  });

  test('rejects a reminder with an oversized body', async () => {
    const { service, scheduledRequests } = harness();

    const result = await service.scheduleReminder({
      id: 'match-42',
      startAtMs: 8_000_000,
      endAtMs: 11_600_000,
      title: 'Quarterfinal',
      location: 'Court 3',
      body: 'B'.repeat(601),
    });

    expect(result.status).toBe('failed');
    expect(scheduledRequests).toEqual([]);
  });

  test('cancels a scheduled reminder', async () => {
    const { service, cancelled } = harness();

    await service.cancelReminder('tomorrow-court-1-1800');
    expect(cancelled).toEqual(['tomorrow-court-1-1800']);
  });

  test('opens a validated event in the native calendar UI', async () => {
    const { service, calendarEvents } = harness();

    const result = await service.presentCalendarEvent({
      id: 'tomorrow-court-1-1800',
      startAtMs: 8_000_000,
      endAtMs: 11_600_000,
      title: 'Sân 1',
      location: 'CLB Bình Thạnh',
    });

    expect(result.status).toBe('presented');
    expect(calendarEvents).toEqual(['tomorrow-court-1-1800']);
  });

  test('rejects an expired calendar event before it reaches native code', async () => {
    const { service, calendarEvents } = harness();

    const result = await service.presentCalendarEvent({
      id: 'expired-slot',
      startAtMs: 1_000,
      endAtMs: 2_000,
      title: 'Expired slot',
      location: 'Venue',
    });

    expect(result.status).toBe('failed');
    expect(calendarEvents).toEqual([]);
  });
});
