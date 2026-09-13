import { HomeViewerProfile } from '../home/homeModel';
import { layoutTokens, typographyTokens } from './layout';
import { createMotionTokens } from './motion';
import { createPalette } from './palette';

/**
 * This is the one local seam for app-wide, remotely configurable presentation.
 * Keep policy and navigation mechanics out of this object; only values that can
 * safely vary without changing native behaviour belong here.
 */
export const appConfig = {
  palette: createPalette(),
  layout: layoutTokens,
  typography: typographyTokens,
  motion: createMotionTokens(),
  // Populate from the authenticated host profile when available. It is used
  // only to order first-run suggestions and is never added to tracking data.
  viewerProfile: null as HomeViewerProfile | null,
  tracking: {
    // Supply a signed remote-config endpoint to enable publishing. Until then,
    // events remain in the durable local queue.
    endpoint: undefined,
    hostAppVersion: '0.0.1',
    consentVersion: 1,
    // Feature flag per backend feedback 2026-08-30 §1.3 — gRPC disabled until infra ready.
    grpcEnabled: false as boolean,
    maxEventBytes: 16 * 1024,
    maxQueueBytes: 8 * 1024 * 1024,
    maxBatchBytes: 512 * 1024,
    cellularBatchBytes: 256 * 1024,
    maxBatchEvents: 200,
    maxWaitMs: {
      critical: 1_000,
      operational: 5_000,
      product: 30_000,
      diagnostic: 300_000,
    },
    retentionMs: {
      critical: 7 * 24 * 60 * 60 * 1_000,
      operational: 72 * 60 * 60 * 1_000,
      product: 24 * 60 * 60 * 1_000,
      diagnostic: 60 * 60 * 1_000,
    },
  },
  notification: {
    // The backend supplies this through signed remote config in production.
    // Until configured, APNs/FCM registration remains local to the device.
    registrationEndpoint: undefined,
    hostAppVersion: '0.0.1',
    maxInboxItems: 250,
    maxSeenIdsPerEvent: 50,
    reminderLeadMs: 60 * 60 * 1_000,
  },
  cards: {
    // MVP serves the bundled seed dataset from the device. Point this at the
    // platform backend to renew the catalog daily in the official build.
    endpoint: undefined as string | undefined,
    refreshIntervalMs: 24 * 60 * 60 * 1_000,
  },
} as const;
