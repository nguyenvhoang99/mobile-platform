import {
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';

import { REMOTE_PUSH_ENABLED } from '../config/remotePush';
import {
  CalendarEventRequest,
  CalendarEventResult,
  NativeNotificationEvent,
  NativeReminderRequest,
  NotificationPermissionStatus,
  PushRegistrationResult,
  ReminderResult,
} from '../notification/types';
import type {Spec as NotificationSpec} from './specs/NativeNotification';
import NotificationModule from './specs/NativeNotification';

const nativeModule = NotificationModule as NotificationSpec | null;

// The spec returns untyped result maps; shape contracts (`ReminderResult`,
// `CalendarEventResult`, `PushRegistrationResult`) are enforced by native
// construction on both platforms.
async function asResult<T>(promise: Promise<unknown>): Promise<T> {
  return (await promise) as unknown as T;
}

function parseEvent(value: unknown): NativeNotificationEvent | null {
  try {
    const candidate =
      typeof value === 'string'
        ? (JSON.parse(value) as Partial<NativeNotificationEvent>)
        : (value as Partial<NativeNotificationEvent>);
    if (
      !candidate ||
      typeof candidate.native_event_id !== 'string' ||
      (candidate.type !== 'received' && candidate.type !== 'opened') ||
      typeof candidate.payload !== 'string' ||
      typeof candidate.occurred_at_ms !== 'number'
    ) {
      return null;
    }
    return {
      native_event_id: candidate.native_event_id,
      type: candidate.type,
      payload: candidate.payload,
      app_state: candidate.app_state ?? 'unknown',
      provider_message_id: candidate.provider_message_id ?? null,
      occurred_at_ms: candidate.occurred_at_ms,
    };
  } catch {
    return null;
  }
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    return (await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    ))
      ? 'authorized'
      : 'not_determined';
  }
  return nativeModule?.getPermissionStatus
    ? asResult<NotificationPermissionStatus>(
        nativeModule.getPermissionStatus(),
      )
    : 'unavailable';
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED
      ? 'authorized'
      : 'denied';
  }
  return nativeModule?.requestPermission
    ? asResult<NotificationPermissionStatus>(nativeModule.requestPermission())
    : 'unavailable';
}

export async function registerForRemoteNotifications(): Promise<PushRegistrationResult> {
  // TEMP: iOS remote push disabled until Apple Developer account / APNs key exists.
  // See src/config/remotePush.ts — local notifications remain enabled.
  if (Platform.OS === 'ios' && !REMOTE_PUSH_ENABLED.ios) {
    return { status: 'unavailable', provider: 'apns', token: null };
  }
  if (Platform.OS === 'android' && !REMOTE_PUSH_ENABLED.android) {
    return { status: 'unavailable', provider: 'fcm', token: null };
  }
  return nativeModule?.registerForRemoteNotifications
    ? asResult<PushRegistrationResult>(
        nativeModule.registerForRemoteNotifications(),
      )
    : {
        status: 'unavailable',
        provider: Platform.OS === 'ios' ? 'apns' : 'fcm',
        token: null,
      };
}

export async function getPendingNotificationEvents(): Promise<
  NativeNotificationEvent[]
> {
  if (!nativeModule?.getPendingEvents) {
    return [];
  }
  try {
    const raw = JSON.parse(await nativeModule.getPendingEvents()) as unknown[];
    return Array.isArray(raw)
      ? raw.flatMap(value => {
          const event = parseEvent(value);
          return event ? [event] : [];
        })
      : [];
  } catch {
    return [];
  }
}

export function acknowledgeNotificationEvent(
  nativeEventId: string,
): Promise<void> {
  return nativeModule?.acknowledgeEvent
    ? nativeModule.acknowledgeEvent(nativeEventId)
    : Promise.resolve();
}

export function scheduleNativeReminder(
  request: NativeReminderRequest,
): Promise<ReminderResult> {
  const runner = nativeModule?.scheduleReminder;
  const { input, ...nativeRequest } = request;
  return runner
    ? asResult<ReminderResult>(
        runner(JSON.stringify({ ...nativeRequest, targetInput: input })),
      )
    : Promise.resolve({
        status: 'unavailable',
        surface: null,
        reminderAtMs: request.reminderAtMs,
        activityId: null,
      });
}

export function cancelNativeReminder(
  id: string,
): Promise<void> {
  const runner = nativeModule?.cancelReminder;
  return runner
    ? runner(id)
    : Promise.resolve();
}

export function presentNativeCalendarEvent(
  request: CalendarEventRequest,
): Promise<CalendarEventResult> {
  const runner = nativeModule?.presentCalendarEvent;
  return runner
    ? asResult<CalendarEventResult>(runner(JSON.stringify(request)))
    : Promise.resolve({ status: 'unavailable' });
}

export function subscribeToNativeNotificationEvents(
  listener: (event: NativeNotificationEvent) => void,
): () => void {
  if (!nativeModule) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(nativeModule);
  const subscription = emitter.addListener('notificationEvent', raw => {
    const event = parseEvent(raw);
    if (event) {
      listener(event);
    }
  });
  return () => subscription.remove();
}
