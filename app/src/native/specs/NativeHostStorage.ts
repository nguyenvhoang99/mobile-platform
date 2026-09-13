import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * HostStorage — single source of truth for the native boundary (S3).
 * Codegen generates `NativeHostStorageSpec` (Android) and the ObjC spec
 * protocol (iOS) from this file. Every method here MUST exist natively;
 * forward-compatible extras stay in `src/native/hostStorage.ts` as optionals.
 */
export interface Spec extends TurboModule {
  loadDockSelection(): Promise<string | null>;
  saveDockSelection(selection: string): Promise<void>;
  loadHomePreferences(): Promise<string | null>;
  saveHomePreferences(preferences: string): Promise<void>;
  loadTrackingEvents(): Promise<string>;
  appendTrackingEvent(event: string): Promise<void>;
  replaceTrackingEvents(events: string): Promise<void>;
  getOrCreateAnonymousId(scope: string): Promise<string>;
  loadNotifications(): Promise<string>;
  saveNotifications(notifications: string): Promise<void>;
  loadCardDataset(): Promise<string>;
  saveCardDataset(json: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('HostStorage');
