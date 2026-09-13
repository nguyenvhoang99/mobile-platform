export type MiniAppPriority =
  | 'critical'
  | 'operational'
  | 'product'
  | 'diagnostic';

export type MiniAppEventDeclaration = {
  name: string;
  version: number;
  priority: MiniAppPriority;
  allowedDataKeys: readonly string[];
};

export type MiniAppEntrypoint = {
  name: string;
  path: string;
  allowedSources: readonly string[];
  allowedInputKeys: readonly string[];
};

export type MiniAppLink = {
  id: string;
  label: string;
  targetAppId: string;
  targetEntrypoint: string;
  allowedInputKeys: readonly string[];
};

export type MiniAppCapability = {
  name: string;
  version: number;
  purposeKey: string;
  scope?: 'once' | 'while_using' | 'session' | 'persistent';
};

import type { LineIconName } from '../ui/primitives/LineIcon';

export type MiniAppManifest = {
  id: string;
  name: string;
  englishName?: string;
  shortName: string;
  glyph: string; // kept for compat
  icon: LineIconName; // Line (Outlined) primary
  version: number;
  resourceEndpoint: string;
  routes: readonly string[];
  rootRoute: string;
  publicEntrypoints: readonly MiniAppEntrypoint[];
  crossAppLinks: readonly MiniAppLink[];
  trackingEvents: readonly MiniAppEventDeclaration[];
  capabilities?: readonly MiniAppCapability[];
  egressHosts?: readonly string[];
};

export const miniAppCatalog: readonly MiniAppManifest[] = [
  {
    id: 'badminton',
    name: 'Cầu lông',
    englishName: 'Badminton',
    shortName: 'Cầu lông',
    glyph: '🏸',
    icon: 'badminton',
    version: 1,
    resourceEndpoint: 'https://miniapps.platform.local/badminton',
    rootRoute: '/',
    routes: ['/', '/bookings'],
    publicEntrypoints: [
      {
        name: 'book',
        path: '/',
        allowedSources: ['host_notification'],
        allowedInputKeys: ['date_id'],
      },
      {
        name: 'my_bookings',
        path: '/bookings',
        allowedSources: ['host_notification'],
        allowedInputKeys: ['booking_id'],
      },
    ],
    crossAppLinks: [],
    trackingEvents: [
      {
        name: 'slot_list_viewed',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['date_id', 'source'],
      },
      {
        name: 'slot_booked',
        version: 1,
        priority: 'operational',
        allowedDataKeys: ['slot_id', 'court_id', 'start_time', 'visibility'],
      },
      {
        name: 'open_match_joined',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['slot_id', 'participant_count'],
      },
      {
        name: 'booking_visibility_changed',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['slot_id', 'visibility'],
      },
      {
        name: 'booking_participant_removed',
        version: 1,
        priority: 'operational',
        allowedDataKeys: ['slot_id', 'participant_count'],
      },
      {
        name: 'booking_cancelled',
        version: 1,
        priority: 'operational',
        allowedDataKeys: ['slot_id'],
      },
      {
        name: 'booking_reminder_scheduled',
        version: 1,
        priority: 'operational',
        allowedDataKeys: [
          'slot_id',
          'status',
          'surface',
          'reminder_offset_minutes',
        ],
      },
      {
        name: 'booking_reminder_cancelled',
        version: 1,
        priority: 'operational',
        allowedDataKeys: ['slot_id', 'reason'],
      },
      {
        name: 'calendar_add_requested',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['slot_id', 'source'],
      },
      {
        name: 'calendar_add_completed',
        version: 1,
        priority: 'operational',
        allowedDataKeys: ['slot_id', 'source', 'status'],
      },
    ],
  },
  {
    id: 'weather',
    name: 'Local Weather',
    shortName: 'Weather',
    glyph: '☀',
    icon: 'cloud-sun',
    version: 1,
    resourceEndpoint: 'https://miniapps.platform.local/weather',
    rootRoute: '/',
    routes: ['/', '/forecast/:day', '/saved'],
    publicEntrypoints: [
      {
        name: 'forecast',
        path: '/',
        allowedSources: ['transit', 'host_notification'],
        allowedInputKeys: ['area'],
      },
    ],
    crossAppLinks: [
      {
        id: 'open_transit',
        label: 'Check nearby transit',
        targetAppId: 'transit',
        targetEntrypoint: 'nearby',
        allowedInputKeys: ['area'],
      },
    ],
    trackingEvents: [
      {
        name: 'forecast_viewed',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['day', 'source'],
      },
    ],
  },
  {
    id: 'transit',
    name: 'City Transit',
    shortName: 'Transit',
    glyph: '↝',
    icon: 'bus',
    version: 1,
    resourceEndpoint: 'https://miniapps.platform.local/transit',
    rootRoute: '/',
    routes: ['/', '/route/:routeId', '/favorites'],
    publicEntrypoints: [
      {
        name: 'nearby',
        path: '/',
        allowedSources: ['weather', 'host_notification'],
        allowedInputKeys: ['area'],
      },
    ],
    crossAppLinks: [
      {
        id: 'open_weather',
        label: 'Check destination weather',
        targetAppId: 'weather',
        targetEntrypoint: 'forecast',
        allowedInputKeys: ['area'],
      },
    ],
    trackingEvents: [
      {
        name: 'route_viewed',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['route_id', 'source'],
      },
    ],
  },
  {
    id: 'notes',
    name: 'Quick Notes',
    shortName: 'Notes',
    glyph: '✎',
    icon: 'file-text',
    version: 1,
    resourceEndpoint: 'https://miniapps.platform.local/notes',
    rootRoute: '/',
    routes: ['/', '/note/:noteId'],
    publicEntrypoints: [],
    crossAppLinks: [],
    trackingEvents: [
      {
        name: 'note_opened',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['source'],
      },
    ],
  },
  {
    id: 'market',
    name: 'Daily Market',
    shortName: 'Market',
    glyph: '◇',
    icon: 'shopping-bag',
    version: 1,
    resourceEndpoint: 'https://miniapps.platform.local/market',
    rootRoute: '/',
    routes: ['/', '/item/:itemId', '/watchlist'],
    publicEntrypoints: [],
    crossAppLinks: [],
    trackingEvents: [
      {
        name: 'item_viewed',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['item_id', 'source'],
      },
    ],
  },
  {
    id: 'card',
    name: 'Thẻ',
    englishName: 'Card',
    shortName: 'Thẻ',
    glyph: '💳',
    icon: 'credit-card',
    version: 1,
    resourceEndpoint: 'https://miniapps.platform.local/card',
    rootRoute: '/',
    routes: ['/', '/card/:cardId'],
    publicEntrypoints: [],
    crossAppLinks: [],
    trackingEvents: [
      {
        name: 'benefit_search_performed',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['query_length', 'result_count'],
      },
      {
        name: 'card_detail_viewed',
        version: 1,
        priority: 'product',
        allowedDataKeys: ['card_id', 'source'],
      },
    ],
  },
  {
    id: 'split-bill',
    name: 'Chia tiền',
    englishName: 'Split Bill',
    shortName: 'Chia tiền',
    glyph: '₫',
    icon: 'split',
    version: 1,
    resourceEndpoint: 'https://miniapps.platform.local/split-bill',
    rootRoute: '/',
    routes: ['/', '/bill/:billId', '/settle/:billId'],
    publicEntrypoints: [],
    crossAppLinks: [],
    capabilities: [
      { name: 'storage.kv', version: 1, purposeKey: 'persist bill draft', scope: 'while_using' },
      { name: 'scanner.scan', version: 1, purposeKey: 'scan VietQR', scope: 'once' },
      { name: 'net.request', version: 1, purposeKey: 'fetch VietQR bank list', scope: 'once' },
    ],
    egressHosts: ['vietqr.net'],
    trackingEvents: [
      { name: 'bill_created', version: 1, priority: 'product', allowedDataKeys: ['participant_count'] },
      { name: 'bill_item_added', version: 1, priority: 'product', allowedDataKeys: ['input_mode', 'has_ask_back'] },
      { name: 'bill_settled', version: 1, priority: 'product', allowedDataKeys: ['participant_count', 'item_count', 'transfer_count'] },
      { name: 'vietqr_parsed', version: 1, priority: 'product', allowedDataKeys: ['has_amount', 'bank_bin'] },
    ],
  },
] as const;

export function findMiniApp(appId: string): MiniAppManifest | undefined {
  return miniAppCatalog.find(app => app.id === appId);
}
