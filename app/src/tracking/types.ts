import { MiniAppPriority } from '../miniapps/catalog';

export type TrackingPriority = MiniAppPriority;

export type TrackingSource =
  | 'native'
  | 'react_native'
  | 'mini_app'
  | 'bridge'
  | 'runtime';

export type TrackingEventEnvelope = {
  /** Deprecated: use `${session_id}:${event_index}` — kept for migration of persisted lines */
  event_id: string;
  /** Monotonic per session, persisted in hostStorage. Idempotency key = `${session_id}:${event_index}` */
  event_index: number;
  event_name: string;
  event_version: number;
  event_data: Record<string, unknown>;
  occurred_at_ms: number;
  /** Deprecated: use event_index. Kept for reading old persisted events */
  queue_sequence: number;
  source_type: TrackingSource;
  mini_app_id: string | null;
  mini_app_version: number | null;
  host_app_version: string;
  platform: 'ios' | 'android';
  session_id: string; // UUIDv7, renewed after 30m background
  mini_app_session_id: string | null;
  user_id: string | null;
  anonymous_id: string;
  priority: TrackingPriority;
  trace_id: string | null;
  privacy_class: 'essential' | 'analytics' | 'sensitive' | 'restricted';
  consent_version: number;
  sdk_version: number;
  network_at_event: TrackingNetworkKind;
  attempt_count: number;
};

export type TrackingNetworkKind =
  | 'offline'
  | 'wifi'
  | 'cellular'
  | 'roaming'
  | 'constrained'
  | 'unknown';

export type TrackingNetworkSnapshot = {
  kind: TrackingNetworkKind;
  reachable: boolean;
};

export type TrackingBatch = {
  batch_id: string;
  sent_at_ms: number;
  reason: string;
  events: TrackingEventEnvelope[];
};

export type TrackingTransportResult = {
  acceptedEventIds: readonly string[];
  permanentlyRejectedEventIds?: readonly string[];
  quarantinedEventIds?: readonly string[];
  rejectedReasons?: Record<string, string>;
};

export interface TrackingTransport {
  readonly kind: 'http' | 'grpc';
  isAvailable(snapshot: TrackingNetworkSnapshot): boolean;
  send(batch: TrackingBatch): Promise<TrackingTransportResult>;
}
