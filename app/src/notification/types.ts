export type NotificationPermissionStatus =
  | 'authorized'
  | 'provisional'
  | 'denied'
  | 'not_determined'
  | 'unavailable';

export type NotificationAppState =
  | 'foreground'
  | 'background'
  | 'terminated'
  | 'unknown';

export type NotificationTarget = {
  mini_app_id: string;
  entrypoint_id: string;
  input: Record<string, unknown>;
};

export type RemoteNotificationPayload = {
  notification_id: string;
  dedupe_key: string | null;
  category: string;
  title: string;
  body: string;
  created_at_ms: number;
  expires_at_ms: number | null;
  target: NotificationTarget | null;
};

export type InboxNotification = RemoteNotificationPayload & {
  received_at_ms: number;
  seen_at_ms: number | null;
  inbox_seen_at_ms: number | null;
  opened_at_ms: number | null;
  received_tracked_at_ms: number | null;
};

export type NativeNotificationEvent = {
  native_event_id: string;
  type: 'received' | 'opened';
  payload: string;
  app_state: NotificationAppState;
  provider_message_id: string | null;
  occurred_at_ms: number;
};

export type PushRegistrationResult = {
  status: 'registered' | 'unavailable' | 'failed';
  provider: 'apns' | 'fcm';
  token: string | null;
};

export type LiveActivitySurface =
  | 'ios_live_activity'
  | 'android_live_update'
  | 'ongoing_notification'
  | 'local_notification';

export type ReminderRequest = {
  id: string;
  title: string;
  /** Explicit body copy. Defaults to "<title> · <location>" when omitted. */
  body?: string;
  startAtMs: number;
  endAtMs: number;
  /** Optional location, suitable for physical or virtual events. */
  location?: string;
  /** Notification channel (Android). Defaults to a generic channel. */
  channelId?: string;
  channelName?: string;
  /** Payload category. Defaults to a generic scheduled-reminder category. */
  category?: string;
  /** Optional deep-link routing. All-or-nothing with entrypointId. */
  targetAppId?: string;
  entrypointId?: string;
  input?: Record<string, string>;
};

export type NativeReminderRequest = ReminderRequest & {
  reminderAtMs: number;
};

export type ReminderStatus =
  | 'scheduled'
  | 'active'
  | 'permission_denied'
  | 'unavailable'
  | 'failed';

export type ReminderResult = {
  status: ReminderStatus;
  surface: LiveActivitySurface | null;
  reminderAtMs: number;
  activityId: string | null;
};

export type CalendarEventRequest = ReminderRequest & {
  /** Free-form notes attached to the calendar event (≤1000 chars). */
  description?: string;
  /** Reminder lead time hint for the calendar app (0–1440 min). */
  alarmMinutes?: number;
};

export type CalendarEventStatus =
  | 'presented'
  | 'unavailable'
  | 'failed';

export type CalendarEventResult = {
  status: CalendarEventStatus;
};
