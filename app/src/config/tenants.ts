import { ShellPalette } from './palette';

/**
 * Multi-tenant MVP — per-province tenants on one binary.
 *
 * Mechanisms (native shell, bridge) are shared. Tenant variation lives in
 * signed remote config and the RN host — never in the binary. One store
 * binary serves all provinces.
 *
 * MVP scope: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng + fallback.
 * Future: expand to 63 provinces by adding entries, no code change.
 */

export const TENANT_IDS = ['vn-hn', 'vn-hcm', 'vn-dn', 'vn-fallback'] as const;
export type TenantId = (typeof TENANT_IDS)[number];

export type TenantMeta = {
  id: TenantId;
  label: string;
  shortLabel: string;
  provinceName: string;
  /** Approx centre for location resolution (cheap, runs in JS; native can refine). */
  centre: { lat: number; lon: number };
  /** Palette overrides applied via createPalette(profile.paletteOverrides). */
  paletteOverrides: Partial<ShellPalette>;
  /** Which mini-apps are listed, and in what order, for this tenant. */
  featuredAppIds: readonly string[];
  /** Human reason — shown in tenant picker. */
  description: string;
};

export const TENANTS: Record<TenantId, TenantMeta> = {
  'vn-hn': {
    id: 'vn-hn',
    label: 'Hà Nội',
    shortLabel: 'HN',
    provinceName: 'Hà Nội',
    centre: { lat: 21.0285, lon: 105.8542 },
    paletteOverrides: {
      // Cooler accent for Hanoi — still semantic, still contrast-checked.
      primary: '#3B5BDB',
      primarySoft: '#E2E8FF',
      canvasAccent: '#E6ECFF',
    },
    featuredAppIds: ['weather', 'transit', 'badminton', 'notes', 'market', 'card', 'split-bill'],
    description: 'Thủ đô — thời tiết, giao thông và tiện ích đô thị.',
  },
  'vn-hcm': {
    id: 'vn-hcm',
    label: 'TP. Hồ Chí Minh',
    shortLabel: 'HCM',
    provinceName: 'TP. Hồ Chí Minh',
    centre: { lat: 10.8231, lon: 106.6297 },
    paletteOverrides: {
      primary: '#E8590C',
      primarySoft: '#FFF0E2',
      canvasAccent: '#FFF2E6',
    },
    featuredAppIds: ['badminton', 'market', 'weather', 'transit', 'notes', 'card', 'split-bill'],
    description: 'Thành phố năng động — đặt sân cầu lông, chợ và di chuyển.',
  },
  'vn-dn': {
    id: 'vn-dn',
    label: 'Đà Nẵng',
    shortLabel: 'ĐN',
    provinceName: 'Đà Nẵng',
    centre: { lat: 16.0544, lon: 108.2022 },
    paletteOverrides: {
      // Ocean teal — distinct but inside AA contrast.
      primary: '#0B7285',
      primarySoft: '#E0F6F9',
      canvasAccent: '#E6F9FC',
    },
    featuredAppIds: ['weather', 'transit', 'market', 'notes', 'card', 'split-bill'],
    description: 'Thành phố biển — thời tiết, di chuyển và mua sắm.',
  },
  'vn-fallback': {
    id: 'vn-fallback',
    label: 'Toàn quốc',
    shortLabel: 'VN',
    provinceName: 'Toàn quốc',
    centre: { lat: 16.0, lon: 108.0 },
    paletteOverrides: {},
    featuredAppIds: ['weather', 'transit', 'notes', 'market', 'badminton', 'card', 'split-bill'],
    description: 'Danh mục chung — hiển thị khi chưa xác định được tỉnh/thành.',
  },
};

export const DEFAULT_TENANT: TenantId = 'vn-fallback';

/**
 * Signed tenant profile shape — what the (future) remote-config endpoint
 * returns. For MVP (mobile-only, no backend) we serve local TENANTS and
 * treat them as already-verified; the shape is kept so swapping to a real
 * signed fetch later is additive (no handler change).
 */
export type TenantProfile = {
  tenantId: TenantId;
  version: number;
  issuedAt: string; // ISO
  expiresAt: string; // ISO
  catalog: { featuredAppIds: readonly string[] };
  paletteOverrides: Partial<ShellPalette>;
  trackingTopicPrefix: string; // e.g. "vn-hcm"
};

// ---------------------------------------------------------------------------
// Location → tenant resolution
// ---------------------------------------------------------------------------

export type Coords = { lat: number; lon: number };

function haversineKm(a: Coords, b: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

/**
 * Nearest-tenant by haversine. MVP threshold: beyond 350 km → fallback.
 * Future native resolver can use reverse-geocode; the contract (coords → TenantId)
 * stays the same.
 *
 * Pure function — easy to test, no I/O, no permission.
 */
export function resolveTenantFromCoords(
  coords: Coords | null | undefined,
  candidates: TenantId[] = ['vn-hn', 'vn-hcm', 'vn-dn'],
): TenantId {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) {
    return DEFAULT_TENANT;
  }
  let best: TenantId = DEFAULT_TENANT;
  let bestKm = Infinity;
  for (const id of candidates) {
    const t = TENANTS[id];
    const d = haversineKm(coords, t.centre);
    if (d < bestKm) {
      bestKm = d;
      best = id;
    }
  }
  // If user is far from all three (e.g. abroad / other province), show national.
  if (bestKm > 350) return DEFAULT_TENANT;
  return best;
}

/**
 * Build a local TenantProfile for a tenant (MVP). In production this comes
 * from a signed fetch; here we mint it locally so downstream code already
 * consumes the same shape.
 */
export function localTenantProfile(tenantId: TenantId): TenantProfile {
  const meta = TENANTS[tenantId] ?? TENANTS[DEFAULT_TENANT];
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h local TTL
  return {
    tenantId: meta.id,
    version: 1,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    catalog: { featuredAppIds: meta.featuredAppIds },
    paletteOverrides: meta.paletteOverrides,
    trackingTopicPrefix: meta.id,
  };
}
