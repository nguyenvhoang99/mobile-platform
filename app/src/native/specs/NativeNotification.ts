import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * NotificationModule — single source of truth for the native boundary (S3).
 * JSON payloads cross as strings; result maps are `Object` (parsed in
 * `src/native/notification.ts`). `addListener`/`removeListeners` serve the
 * event emitter and are implemented by the platform bases.
 */
export interface Spec extends TurboModule {
  getPermissionStatus(): Promise<string>;
  requestPermission(): Promise<string>;
  registerForRemoteNotifications(): Promise<Object>;
  getPendingEvents(): Promise<string>;
  acknowledgeEvent(nativeEventId: string): Promise<void>;
  scheduleReminder(requestJson: string): Promise<Object>;
  cancelReminder(id: string): Promise<void>;
  presentCalendarEvent(requestJson: string): Promise<Object>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('NotificationModule');
