import type {Spec as HostStorageSpec} from './specs/NativeHostStorage';
import HostStorageModule from './specs/NativeHostStorage';

import {
  createDefaultHomePreferences,
  HomePreferences,
  normalizeHomePreferences,
} from '../home/homeModel';
import { DockSelection } from '../navigation/navigationBroker';

// Implemented methods come from the Codegen spec (single source of truth).
// The optionals are forward-compatible extras a not-yet-rebuilt native binary
// may lack; they are never part of the spec until native implements them.
type NativeHostStorage = HostStorageSpec & {
  getOrCreateDeviceSecret?: () => Promise<string>;
  loadTrackingSession?: () => Promise<string | null>;
  saveTrackingSession?: (sessionJson: string) => Promise<void>;
};

const nativeStorage = HostStorageModule as NativeHostStorage | null;

let fallbackDock: DockSelection = { left: null, right: null };
let fallbackHomePreferences = createDefaultHomePreferences();
let fallbackEvents: string[] = [];
let fallbackNotifications = '[]';
const fallbackAnonymousIds = new Map<string, string>();
let fallbackCardDataset = '';
let fallbackDeviceSecret: string | null = null;
let fallbackTrackingSession: string | null = null;

export async function loadDockSelection(): Promise<DockSelection> {
  const raw = nativeStorage
    ? await nativeStorage.loadDockSelection()
    : JSON.stringify(fallbackDock);
  if (!raw) {
    return { left: null, right: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DockSelection>;
    return {
      left: typeof parsed.left === 'string' ? parsed.left : null,
      right: typeof parsed.right === 'string' ? parsed.right : null,
    };
  } catch {
    return { left: null, right: null };
  }
}

export async function saveDockSelection(
  selection: DockSelection,
): Promise<void> {
  fallbackDock = selection;
  await nativeStorage?.saveDockSelection(JSON.stringify(selection));
}

export async function loadHomePreferences(): Promise<HomePreferences> {
  const raw = nativeStorage?.loadHomePreferences
    ? await nativeStorage.loadHomePreferences()
    : JSON.stringify(fallbackHomePreferences);
  if (!raw) {
    return createDefaultHomePreferences();
  }
  try {
    return normalizeHomePreferences(JSON.parse(raw));
  } catch {
    return createDefaultHomePreferences();
  }
}

export async function saveHomePreferences(
  preferences: HomePreferences,
): Promise<void> {
  fallbackHomePreferences = normalizeHomePreferences(preferences);
  await nativeStorage?.saveHomePreferences?.(
    JSON.stringify(fallbackHomePreferences),
  );
}

export async function loadTrackingEventLines(): Promise<string[]> {
  const raw = nativeStorage
    ? await nativeStorage.loadTrackingEvents()
    : fallbackEvents.join('\n');
  return raw.split('\n').filter(Boolean);
}

export async function appendTrackingEventLine(event: string): Promise<void> {
  fallbackEvents.push(event);
  await nativeStorage?.appendTrackingEvent(event);
}

export async function replaceTrackingEventLines(
  events: readonly string[],
): Promise<void> {
  fallbackEvents = [...events];
  await nativeStorage?.replaceTrackingEvents(events.join('\n'));
}

export async function loadNotificationsJson(): Promise<string> {
  return nativeStorage?.loadNotifications
    ? nativeStorage.loadNotifications()
    : fallbackNotifications;
}

export async function saveNotificationsJson(
  notifications: string,
): Promise<void> {
  fallbackNotifications = notifications;
  await nativeStorage?.saveNotifications?.(notifications);
}

export async function getOrCreateAnonymousId(scope: string): Promise<string> {
  if (nativeStorage) {
    return nativeStorage.getOrCreateAnonymousId(scope);
  }
  const existing = fallbackAnonymousIds.get(scope);
  if (existing) {
    return existing;
  }
  const created = `anonymous-${scope}-${Math.random().toString(36).slice(2)}`;
  fallbackAnonymousIds.set(scope, created);
  return created;
}

export async function getOrCreateDeviceSecret(): Promise<string> {
  if (nativeStorage?.getOrCreateDeviceSecret) {
    return nativeStorage.getOrCreateDeviceSecret();
  }
  if (fallbackDeviceSecret) return fallbackDeviceSecret;
  // 32-byte random hex = 64 hex chars
  const bytes = new Uint8Array(32);
  const gCrypto = (globalThis as unknown as { crypto?: { getRandomValues?: (b: Uint8Array) => void } }).crypto;
  if (gCrypto?.getRandomValues) {
    gCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  fallbackDeviceSecret = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return fallbackDeviceSecret;
}

export type TrackingSessionState = {
  sessionId: string;
  nextEventIndex: number;
  lastActiveMs: number;
};

export async function loadTrackingSession(): Promise<TrackingSessionState | null> {
  const raw = nativeStorage?.loadTrackingSession
    ? await nativeStorage.loadTrackingSession()
    : fallbackTrackingSession;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TrackingSessionState;
    if (
      typeof parsed.sessionId === 'string' &&
      typeof parsed.nextEventIndex === 'number' &&
      typeof parsed.lastActiveMs === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveTrackingSession(state: TrackingSessionState): Promise<void> {
  const json = JSON.stringify(state);
  fallbackTrackingSession = json;
  await nativeStorage?.saveTrackingSession?.(json);
}

// Test helper — reset in-memory fallbacks
export function __resetHostStorageForTests(): void {
  fallbackEvents = [];
  fallbackAnonymousIds.clear();
  fallbackDeviceSecret = null;
  fallbackTrackingSession = null;
  fallbackDock = { left: null, right: null };
  fallbackHomePreferences = createDefaultHomePreferences();
  fallbackNotifications = '[]';
  fallbackCardDataset = '';
}

export async function loadCardDatasetJson(): Promise<string> {
  // Newer methods may be absent from a not-yet-rebuilt native binary.
  if (nativeStorage?.loadCardDataset) {
    try {
      return await nativeStorage.loadCardDataset();
    } catch {
      return fallbackCardDataset;
    }
  }
  return fallbackCardDataset;
}

export async function saveCardDatasetJson(json: string): Promise<void> {
  fallbackCardDataset = json;
  await nativeStorage?.saveCardDataset?.(json);
}
