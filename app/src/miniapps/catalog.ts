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
import { BUNDLED_MINI_APP_DISPLAY } from '../content/displayContent';

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
    name: BUNDLED_MINI_APP_DISPLAY.badminton.name,
    shortName: BUNDLED_MINI_APP_DISPLAY.badminton.shortName,
    glyph: BUNDLED_MINI_APP_DISPLAY.badminton.glyph,
    icon: BUNDLED_MINI_APP_DISPLAY.badminton.icon,
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
    name: BUNDLED_MINI_APP_DISPLAY.weather.name,
    shortName: BUNDLED_MINI_APP_DISPLAY.weather.shortName,
    glyph: BUNDLED_MINI_APP_DISPLAY.weather.glyph,
    icon: BUNDLED_MINI_APP_DISPLAY.weather.icon,
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
        label: 'Xem xe gần đây',
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
    name: BUNDLED_MINI_APP_DISPLAY.transit.name,
    shortName: BUNDLED_MINI_APP_DISPLAY.transit.shortName,
    glyph: BUNDLED_MINI_APP_DISPLAY.transit.glyph,
    icon: BUNDLED_MINI_APP_DISPLAY.transit.icon,
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
        label: 'Xem thời tiết điểm đến',
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
    name: BUNDLED_MINI_APP_DISPLAY.notes.name,
    shortName: BUNDLED_MINI_APP_DISPLAY.notes.shortName,
    glyph: BUNDLED_MINI_APP_DISPLAY.notes.glyph,
    icon: BUNDLED_MINI_APP_DISPLAY.notes.icon,
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
    name: BUNDLED_MINI_APP_DISPLAY.market.name,
    shortName: BUNDLED_MINI_APP_DISPLAY.market.shortName,
    glyph: BUNDLED_MINI_APP_DISPLAY.market.glyph,
    icon: BUNDLED_MINI_APP_DISPLAY.market.icon,
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
    name: BUNDLED_MINI_APP_DISPLAY.card.name,
    shortName: BUNDLED_MINI_APP_DISPLAY.card.shortName,
    glyph: BUNDLED_MINI_APP_DISPLAY.card.glyph,
    icon: BUNDLED_MINI_APP_DISPLAY.card.icon,
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
    id: 'sample',
    name: BUNDLED_MINI_APP_DISPLAY.sample.name,
    shortName: BUNDLED_MINI_APP_DISPLAY.sample.shortName,
    glyph: BUNDLED_MINI_APP_DISPLAY.sample.glyph,
    icon: BUNDLED_MINI_APP_DISPLAY.sample.icon,
    version: 1,
    resourceEndpoint: 'bundle://sample-rn-poc',
    rootRoute: '/',
    routes: ['/'],
    publicEntrypoints: [],
    crossAppLinks: [],
    capabilities: [
      { name: 'storage.kv', version: 1, purposeKey: 'demo memory-only storage' },
      { name: 'ai.extract_bill', version: 1, purposeKey: 'demo on-device bill extraction' },
    ],
    trackingEvents: [],
  },
  {
    id: 'test',
    ...BUNDLED_MINI_APP_DISPLAY.test,
    version: 1,
    resourceEndpoint: 'bundle://native-integration-test',
    rootRoute: '/', routes: ['/'], publicEntrypoints: [], crossAppLinks: [],
    capabilities: [], trackingEvents: [],
  },
] as const;

export function findMiniApp(appId: string): MiniAppManifest | undefined {
  return miniAppCatalog.find(app => app.id === appId);
}
