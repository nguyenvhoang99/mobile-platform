import { Linking, Platform } from 'react-native';
import { REMOTE_PUSH_ENABLED } from '../config/remotePush';

import {
  acknowledgeNotificationEvent,
  cancelNativeReminder,
  getNotificationPermissionStatus,
  getPendingNotificationEvents,
  presentNativeCalendarEvent,
  registerForRemoteNotifications,
  requestNotificationPermission,
  scheduleNativeReminder,
  subscribeToNativeNotificationEvents,
} from '../native/notification';
import {
  loadNotificationsJson,
  saveNotificationsJson,
} from '../native/hostStorage';
import {
  HostTrackingContext,
  HostTrackingEventName,
} from '../tracking/trackingService';
import { tracking } from '../tracking';
import {
  CalendarEventRequest,
  CalendarEventResult,
  InboxNotification,
  NativeNotificationEvent,
  NativeReminderRequest,
  NotificationAppState,
  NotificationPermissionStatus,
  PushRegistrationResult,
  ReminderRequest,
  ReminderResult,
  RemoteNotificationPayload,
} from './types';

export type NotificationConfig = {
  maxInboxItems: number;
  maxSeenIdsPerEvent: number;
  registrationEndpoint?: string;
  hostAppVersion: string;
  reminderLeadMs?: number;
};

type Tracker = {
  trackHost: (
    name: HostTrackingEventName,
    data: Record<string, unknown>,
    context?: HostTrackingContext,
  ) => Promise<string | null>;
};

type NativeClient = {
  permissionStatus: () => Promise<NotificationPermissionStatus>;
  requestPermission: () => Promise<NotificationPermissionStatus>;
  register: () => Promise<PushRegistrationResult>;
  pendingEvents: () => Promise<NativeNotificationEvent[]>;
  acknowledge: (nativeEventId: string) => Promise<void>;
  subscribe: (listener: (event: NativeNotificationEvent) => void) => () => void;
  scheduleReminder: (
    request: NativeReminderRequest,
  ) => Promise<ReminderResult>;
  cancelReminder: (id: string) => Promise<void>;
  presentCalendarEvent: (
    request: CalendarEventRequest,
  ) => Promise<CalendarEventResult>;
};

type Persistence = {
  load: () => Promise<string>;
  save: (value: string) => Promise<void>;
};

type NotificationDependencies = {
  now?: () => number;
  tracker?: Tracker;
  native?: NativeClient;
  persistence?: Persistence;
  uploadToken?: (registration: PushRegistrationResult) => Promise<void>;
};

type NotificationSnapshot = {
  items: readonly InboxNotification[];
  unreadCount: number;
  permissionStatus: NotificationPermissionStatus;
};

type Activation = {
  notification: InboxNotification;
  source: 'system_notification' | 'foreground_banner' | 'inbox';
};

const identifierPattern = /^[A-Za-z0-9._:-]{1,160}$/;

function finiteTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength
    ? value
    : null;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  try {
    return JSON.stringify(record).length <= 4096 ? record : null;
  } catch {
    return null;
  }
}

function normalizedEnvelope(raw: unknown): Record<string, unknown> | null {
  const root = plainRecord(raw);
  if (!root) {
    return null;
  }
  const nested = plainRecord(root.data);
  return nested ? { ...root, ...nested } : root;
}

export function parseRemoteNotification(
  rawPayload: string,
  now: number,
): RemoteNotificationPayload | null {
  try {
    const root = normalizedEnvelope(JSON.parse(rawPayload));
    if (!root) {
      return null;
    }
    const aps = plainRecord(root.aps);
    const alert = plainRecord(aps?.alert);
    const notificationId = boundedString(root.notification_id, 160);
    const category = boundedString(root.category, 80);
    const title =
      boundedString(root.title, 180) ?? boundedString(alert?.title, 180);
    const body =
      boundedString(root.body, 600) ?? boundedString(alert?.body, 600);
    const createdAt = finiteTimestamp(root.created_at_ms ?? root.created_at);
    const expiresAt = finiteTimestamp(root.expires_at_ms ?? root.expires_at);
    if (
      !notificationId ||
      !identifierPattern.test(notificationId) ||
      !category ||
      !identifierPattern.test(category) ||
      !title ||
      !body ||
      !createdAt ||
      (expiresAt !== null && expiresAt <= now)
    ) {
      return null;
    }

    const targetAppId = boundedString(root.target_app_id, 100);
    const entrypointId = boundedString(root.entrypoint_id, 100);
    const targetInput = root.target_input ?? root.input;
    const input = targetInput === undefined ? {} : plainRecord(targetInput);
    if ((targetAppId === null) !== (entrypointId === null) || input === null) {
      return null;
    }

    return {
      notification_id: notificationId,
      dedupe_key: boundedString(root.dedupe_key, 160),
      category,
      title,
      body,
      created_at_ms: createdAt,
      expires_at_ms: expiresAt,
      target:
        targetAppId && entrypointId
          ? {
              mini_app_id: targetAppId,
              entrypoint_id: entrypointId,
              input,
            }
          : null,
    };
  } catch {
    return null;
  }
}

function validStoredNotification(value: unknown): InboxNotification | null {
  const record = plainRecord(value);
  if (!record) {
    return null;
  }
  const payload = parseRemoteNotification(JSON.stringify(record), Date.now());
  const receivedAt = finiteTimestamp(record.received_at_ms);
  if (!payload || !receivedAt) {
    return null;
  }
  return {
    ...payload,
    received_at_ms: receivedAt,
    seen_at_ms: finiteTimestamp(record.seen_at_ms),
    inbox_seen_at_ms: finiteTimestamp(record.inbox_seen_at_ms),
    opened_at_ms: finiteTimestamp(record.opened_at_ms),
    received_tracked_at_ms: finiteTimestamp(record.received_tracked_at_ms),
  };
}

const defaultNativeClient: NativeClient = {
  permissionStatus: getNotificationPermissionStatus,
  requestPermission: requestNotificationPermission,
  register: registerForRemoteNotifications,
  pendingEvents: getPendingNotificationEvents,
  acknowledge: acknowledgeNotificationEvent,
  subscribe: subscribeToNativeNotificationEvents,
  scheduleReminder: scheduleNativeReminder,
  cancelReminder: cancelNativeReminder,
  presentCalendarEvent: presentNativeCalendarEvent,
};

const defaultPersistence: Persistence = {
  load: loadNotificationsJson,
  save: saveNotificationsJson,
};

export class NotificationService {
  private items: InboxNotification[] = [];
  private permissionStatus: NotificationPermissionStatus = 'unavailable';
  private readonly listeners = new Set<
    (snapshot: NotificationSnapshot) => void
  >();
  private readonly activationListeners = new Set<
    (activation: Activation) => void
  >();
  private readonly foregroundListeners = new Set<
    (item: InboxNotification) => void
  >();
  private readonly processingNativeEvents = new Set<string>();
  private nativeEventQueue: Promise<void> = Promise.resolve();
  private unsubscribeNative: (() => void) | null = null;
  private started = false;
  private readonly now: () => number;
  private readonly tracker: Tracker;
  private readonly native: NativeClient;
  private readonly persistence: Persistence;
  private readonly uploadToken: (
    registration: PushRegistrationResult,
  ) => Promise<void>;

  constructor(
    private readonly config: NotificationConfig,
    dependencies: NotificationDependencies = {},
  ) {
    this.now = dependencies.now ?? Date.now;
    this.tracker = dependencies.tracker ?? tracking;
    this.native = dependencies.native ?? defaultNativeClient;
    this.persistence = dependencies.persistence ?? defaultPersistence;
    this.uploadToken =
      dependencies.uploadToken ??
      (registration => this.uploadRegistrationToken(registration));
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    this.items = await this.loadInbox();
    this.permissionStatus = await this.native.permissionStatus();
    this.emit();
    this.unsubscribeNative = this.native.subscribe(event => {
      this.enqueueNativeEvent(event).catch(() => undefined);
    });
    const pending = await this.native.pendingEvents();
    for (const event of pending) {
      await this.enqueueNativeEvent(event);
    }
    // TEMP: skip remote registration on iOS until APNs is configured.
    // Local reminders/calendar still work; they don't require remote registration.
    const remotePushEnabled =
      Platform.OS === 'ios' ? REMOTE_PUSH_ENABLED.ios : REMOTE_PUSH_ENABLED.android;
    if (remotePushEnabled) {
      this.native
        .register()
        .then(registration =>
          registration.status === 'registered' && registration.token
            ? this.uploadToken(registration)
            : undefined,
        )
        .catch(() => undefined);
    }
  }

  stop(): void {
    this.started = false;
    this.unsubscribeNative?.();
    this.unsubscribeNative = null;
  }

  subscribe(listener: (snapshot: NotificationSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  onActivated(listener: (activation: Activation) => void): () => void {
    this.activationListeners.add(listener);
    return () => this.activationListeners.delete(listener);
  }

  onForegroundReceived(
    listener: (item: InboxNotification) => void,
  ): () => void {
    this.foregroundListeners.add(listener);
    return () => this.foregroundListeners.delete(listener);
  }

  async requestPermission(): Promise<NotificationPermissionStatus> {
    if (this.permissionStatus === 'denied') {
      await Linking.openSettings();
      return this.permissionStatus;
    }
    this.permissionStatus = await this.native.requestPermission();
    this.emit();
    return this.permissionStatus;
  }

  async refreshPermissionStatus(): Promise<void> {
    const status = await this.native.permissionStatus();
    if (status !== this.permissionStatus) {
      this.permissionStatus = status;
      this.emit();
    }
  }

  async scheduleReminder(
    request: ReminderRequest,
  ): Promise<ReminderResult> {
    const leadMs = this.config.reminderLeadMs ?? 60 * 60 * 1_000;
    const reminderAtMs = request.startAtMs - leadMs;
    const id = request.id ?? request.bookingId ?? '';
    const title = request.title ?? request.courtName ?? '';
    const location = request.location ?? request.venue ?? '';
    // Copy and routing are composed here in React Native. The native shell
    // only renders and delivers what it receives — never product content.
    const body = request.body ?? (location ? `${title} · ${location}` : title);

    if (
      !identifierPattern.test(id) ||
      !Number.isFinite(request.startAtMs) ||
      !Number.isFinite(request.endAtMs) ||
      request.startAtMs <= this.now() ||
      request.endAtMs <= request.startAtMs ||
      reminderAtMs >= request.endAtMs ||
      title.length === 0 ||
      title.length > 100 ||
      body.length === 0 ||
      body.length > 600 ||
      location.length > 180
    ) {
      return {
        status: 'failed',
        surface: null,
        reminderAtMs,
        activityId: null,
      };
    }

    let status = await this.native.permissionStatus();
    if (status === 'not_determined') {
      status = await this.native.requestPermission();
      this.permissionStatus = status;
      this.emit();
    }
    if (status !== 'authorized' && status !== 'provisional') {
      return {
        status: status === 'denied' ? 'permission_denied' : 'unavailable',
        surface: null,
        reminderAtMs,
        activityId: null,
      };
    }

    try {
      return await this.native.scheduleReminder({
        ...request,
        id,
        bookingId: id,
        title,
        courtName: title,
        body,
        location,
        venue: location,
        reminderAtMs,
      });
    } catch {
      return {
        status: 'failed',
        surface: null,
        reminderAtMs,
        activityId: null,
      };
    }
  }

  async cancelReminder(id: string): Promise<void> {
    if (!identifierPattern.test(id)) {
      return;
    }
    await this.native.cancelReminder(id);
  }

  async presentCalendarEvent(
    request: CalendarEventRequest,
  ): Promise<CalendarEventResult> {
    const id = request.id ?? request.bookingId ?? '';
    const title = request.title ?? request.courtName ?? '';
    const location = request.location ?? request.venue ?? '';

    if (
      !identifierPattern.test(id) ||
      !Number.isFinite(request.startAtMs) ||
      !Number.isFinite(request.endAtMs) ||
      request.startAtMs <= this.now() ||
      request.endAtMs <= request.startAtMs ||
      title.length === 0 ||
      title.length > 100 ||
      location.length === 0 ||
      location.length > 180
    ) {
      return { status: 'failed' };
    }

    try {
      return await this.native.presentCalendarEvent({
        ...request,
        id,
        bookingId: id,
        title,
        courtName: title,
        location,
        venue: location,
      });
    } catch {
      return { status: 'failed' };
    }
  }

  async recordInboxOpened(): Promise<void> {
    await this.tracker.trackHost('notification_inbox_opened', {
      unread_count: this.snapshot().unreadCount,
    });
  }

  async markSeen(notificationIds: readonly string[]): Promise<void> {
    const unseen = new Set(
      this.items
        .filter(item => item.inbox_seen_at_ms === null)
        .map(item => item.notification_id),
    );
    const collected = new Set<string>();
    const newlySeen = notificationIds.filter(notificationId => {
      if (!unseen.has(notificationId) || collected.has(notificationId)) {
        return false;
      }
      collected.add(notificationId);
      return true;
    });
    if (newlySeen.length === 0) {
      return;
    }
    const seenAt = this.now();
    const seen = new Set(newlySeen);
    this.items = this.items.map(item =>
      seen.has(item.notification_id)
        ? {
            ...item,
            seen_at_ms: item.seen_at_ms ?? seenAt,
            inbox_seen_at_ms: seenAt,
          }
        : item,
    );
    await this.persist();
    this.emit();
    for (
      let index = 0;
      index < newlySeen.length;
      index += this.config.maxSeenIdsPerEvent
    ) {
      const ids = newlySeen.slice(
        index,
        index + this.config.maxSeenIdsPerEvent,
      );
      await this.tracker.trackHost('notification_inbox_seen', {
        notification_ids: ids,
        visible_count: ids.length,
      });
    }
  }

  async activateFromInbox(notificationId: string): Promise<void> {
    const item = this.items.find(
      notification => notification.notification_id === notificationId,
    );
    if (item) {
      await this.activate(item, 'inbox', 'foreground', this.now());
    }
  }

  async activateForeground(notificationId: string): Promise<void> {
    const item = this.items.find(
      notification => notification.notification_id === notificationId,
    );
    if (item) {
      await this.activate(item, 'foreground_banner', 'foreground', this.now());
    }
  }

  getSnapshot(): NotificationSnapshot {
    return this.snapshot();
  }

  private async processNativeEvent(
    event: NativeNotificationEvent,
  ): Promise<void> {
    if (this.processingNativeEvents.has(event.native_event_id)) {
      return;
    }
    this.processingNativeEvents.add(event.native_event_id);
    let shouldAcknowledge = false;
    try {
      const payload = parseRemoteNotification(event.payload, this.now());
      if (!payload) {
        shouldAcknowledge = true;
        return;
      }
      const { item, wasInserted } = await this.receive(
        payload,
        event.app_state,
        event.provider_message_id,
        event.occurred_at_ms,
      );
      if (
        event.type === 'received' &&
        wasInserted &&
        event.app_state === 'foreground' &&
        !item.category.endsWith('_reminder')
      ) {
        this.foregroundListeners.forEach(listener => listener(item));
      }
      if (event.type === 'opened') {
        await this.activate(
          item,
          'system_notification',
          event.app_state,
          event.occurred_at_ms,
        );
      }
      shouldAcknowledge = true;
    } finally {
      if (shouldAcknowledge) {
        await this.native
          .acknowledge(event.native_event_id)
          .catch(() => undefined);
      }
      this.processingNativeEvents.delete(event.native_event_id);
    }
  }

  private enqueueNativeEvent(event: NativeNotificationEvent): Promise<void> {
    this.nativeEventQueue = this.nativeEventQueue
      .catch(() => undefined)
      .then(() => this.processNativeEvent(event));
    return this.nativeEventQueue;
  }

  private async receive(
    payload: RemoteNotificationPayload,
    appState: NotificationAppState,
    providerMessageId: string | null,
    receivedAt: number,
  ): Promise<{ item: InboxNotification; wasInserted: boolean }> {
    let item = this.items.find(
      notification => notification.notification_id === payload.notification_id,
    );
    const wasInserted = !item;
    if (!item) {
      item = {
        ...payload,
        received_at_ms: receivedAt,
        seen_at_ms: null,
        inbox_seen_at_ms: null,
        opened_at_ms: null,
        received_tracked_at_ms: null,
      };
      this.items = [item, ...this.items]
        .sort((left, right) => right.created_at_ms - left.created_at_ms)
        .slice(0, this.config.maxInboxItems);
      await this.persist();
      this.emit();
    }

    if (item.received_tracked_at_ms === null) {
      const trackedAt = this.now();
      await this.tracker.trackHost(
        'notification_received',
        {
          notification_id: item.notification_id,
          category: item.category,
          app_state: appState,
          target_app_id: item.target?.mini_app_id ?? null,
          provider_message_id: providerMessageId,
        },
        { occurredAtMs: receivedAt, sourceType: 'native' },
      );
      this.items = this.items.map(candidate =>
        candidate.notification_id === item?.notification_id
          ? { ...candidate, received_tracked_at_ms: trackedAt }
          : candidate,
      );
      item = this.items.find(
        candidate => candidate.notification_id === payload.notification_id,
      )!;
      await this.persist();
    }
    return { item, wasInserted };
  }

  private async activate(
    item: InboxNotification,
    source: Activation['source'],
    appState: NotificationAppState,
    openedAt: number,
  ): Promise<void> {
    this.items = this.items.map(candidate =>
      candidate.notification_id === item.notification_id
        ? {
            ...candidate,
            opened_at_ms: openedAt,
            seen_at_ms: candidate.seen_at_ms ?? openedAt,
          }
        : candidate,
    );
    const activated = this.items.find(
      candidate => candidate.notification_id === item.notification_id,
    )!;
    await this.persist();
    this.emit();
    await this.tracker.trackHost(
      'notification_clicked',
      {
        notification_id: activated.notification_id,
        category: activated.category,
        app_state: appState,
        target_app_id: activated.target?.mini_app_id ?? null,
        entrypoint_id: activated.target?.entrypoint_id ?? null,
        interaction_source: source,
      },
      {
        occurredAtMs: openedAt,
        sourceType:
          source === 'system_notification' ? 'native' : 'react_native',
      },
    );
    this.activationListeners.forEach(listener =>
      listener({ notification: activated, source }),
    );
  }

  private async loadInbox(): Promise<InboxNotification[]> {
    try {
      const parsed = JSON.parse(await this.persistence.load()) as unknown[];
      return Array.isArray(parsed)
        ? parsed
            .flatMap(value => {
              const item = validStoredNotification(value);
              return item ? [item] : [];
            })
            .sort((left, right) => right.created_at_ms - left.created_at_ms)
            .slice(0, this.config.maxInboxItems)
        : [];
    } catch {
      return [];
    }
  }

  private persist(): Promise<void> {
    return this.persistence.save(JSON.stringify(this.items));
  }

  private snapshot(): NotificationSnapshot {
    return {
      items: this.items,
      unreadCount: this.items.filter(item => item.seen_at_ms === null).length,
      permissionStatus: this.permissionStatus,
    };
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach(listener => listener(snapshot));
  }

  private async uploadRegistrationToken(
    registration: PushRegistrationResult,
  ): Promise<void> {
    if (!this.config.registrationEndpoint || !registration.token) {
      return;
    }
    const response = await fetch(this.config.registrationEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: registration.provider,
        token: registration.token,
        host_app_version: this.config.hostAppVersion,
      }),
    });
    if (!response.ok) {
      throw new Error(`Push token registration failed with ${response.status}`);
    }
  }
}
