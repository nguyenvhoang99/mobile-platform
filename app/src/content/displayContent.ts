import type { LineIconName } from '../ui/primitives/LineIcon';

/**
 * displayContent.ts — nguồn text hiển thị duy nhất cho mini-app và category.
 *
 * Vai trò:
 * - `catalog.ts` (mini-app) và `homeModel.ts` (category) lấy `name`/`shortName`/
 *   `description` từ đây, không khai báo copy rời rạc trong từng file.
 * - Field `icon`/`glyph` vẫn tồn tại cho mỗi mini-app/category để tương thích,
 *   nhưng UI hiện tại chỉ render text (không render icon content).
 *
 * Vì sao nằm ở RN host (TypeScript):
 * - Đây là copy/product content, không phải mechanism — theo layer rule nó phải
 *   sống ở tầng update được từ xa, không nằm trong native binary.
 * - PoC hiện tại bundle sẵn trong máy (`BUNDLED_*`); đường sync remote đã chừa
 *   sẵn qua `resolveDisplayContent()` (xem mục "SYNC REMOTE" bên dưới).
 */

// ---------------------------------------------------------------------------
// Mini-app display content
// ---------------------------------------------------------------------------

export type MiniAppId =
  | 'badminton'
  | 'weather'
  | 'transit'
  | 'notes'
  | 'market'
  | 'card'
  | 'sample'
  | 'test';

export type MiniAppDisplay = {
  /** Tên đầy đủ hiển thị trên Home tile / header. */
  name: string;
  /** Tên ngắn hiển thị trên TabBar / chip (không gian hẹp). */
  shortName: string;
  /** Giữ lại cho tương thích — UI hiện không render. */
  icon: LineIconName;
  /** Giữ lại cho tương thích — UI hiện không render. */
  glyph: string;
};

export const BUNDLED_MINI_APP_DISPLAY: Record<MiniAppId, MiniAppDisplay> = {
  badminton: {
    name: 'Cầu lông',
    shortName: 'Cầu lông',
    icon: 'badminton',
    glyph: '🏸',
  },
  weather: {
    name: 'Thời tiết',
    shortName: 'Thời tiết',
    icon: 'cloud-sun',
    glyph: '☀',
  },
  transit: {
    name: 'Giao thông',
    shortName: 'Giao thông',
    icon: 'bus',
    glyph: '↝',
  },
  notes: {
    name: 'Ghi chú nhanh',
    shortName: 'Ghi chú',
    icon: 'file-text',
    glyph: '✎',
  },
  market: {
    name: 'Chợ hôm nay',
    shortName: 'Chợ',
    icon: 'shopping-bag',
    glyph: '◇',
  },
  card: {
    name: 'Thẻ',
    shortName: 'Thẻ',
    icon: 'credit-card',
    glyph: '💳',
  },
  test: { name: 'Test', shortName: 'Test', icon: 'more-horizontal', glyph: '⚙' },
  sample: {
    name: 'SDK Demo',
    shortName: 'Demo',
    icon: 'more-horizontal',
    glyph: '◉',
  },
};

// ---------------------------------------------------------------------------
// Category display content
// ---------------------------------------------------------------------------

export type CategoryId =
  | 'sport'
  | 'daily'
  | 'around_you'
  | 'plan_focus'
  | 'money'
  | 'finance'
  | 'other';

export type CategoryDisplay = {
  name: string;
  shortName: string;
  description: string;
  /** Giữ lại cho tương thích — UI hiện không render. */
  icon: LineIconName;
  /** Giữ lại cho tương thích — UI hiện không render. */
  glyph: string;
};

export const BUNDLED_CATEGORY_DISPLAY: Record<CategoryId, CategoryDisplay> = {
  other: { name: 'Khác', shortName: 'Khác', description: 'Kiểm thử integration native', icon: 'more-horizontal', glyph: '⚙' },
  sport: {
    name: 'Thể thao',
    shortName: 'Thể thao',
    description: 'Đặt sân và tìm người chơi cùng',
    icon: 'trophy',
    glyph: '🏸',
  },
  daily: {
    name: 'Hằng ngày',
    shortName: 'Hằng ngày',
    description: 'Thời tiết, đi lại và ghi chú nhanh',
    icon: 'sun',
    glyph: '✦',
  },
  around_you: {
    name: 'Quanh bạn',
    shortName: 'Gần bạn',
    description: 'Có gì đang diễn ra quanh bạn',
    icon: 'map-pin',
    glyph: '⌖',
  },
  plan_focus: {
    name: 'Kế hoạch & tập trung',
    shortName: 'Tập trung',
    description: 'Giữ nhịp ngày của bạn',
    icon: 'target',
    glyph: '◷',
  },
  money: {
    name: 'Tiền & chợ giá',
    shortName: 'Tiền',
    description: 'Theo dõi giá cả và ghi chú',
    icon: 'trending-up',
    glyph: '◇',
  },
  finance: {
    name: 'Tài chính',
    shortName: 'Tài chính',
    description: 'So sánh thẻ',
    icon: 'credit-card',
    glyph: '💳',
  },
};

// ---------------------------------------------------------------------------
// Bundle + getters (single access point cho UI)
// ---------------------------------------------------------------------------

export const DISPLAY_CONTENT_VERSION = 1;

export type DisplayContentBundle = {
  version: number;
  miniApps: Record<MiniAppId, MiniAppDisplay>;
  categories: Record<CategoryId, CategoryDisplay>;
};

export const BUNDLED_DISPLAY_CONTENT: DisplayContentBundle = {
  version: DISPLAY_CONTENT_VERSION,
  miniApps: BUNDLED_MINI_APP_DISPLAY,
  categories: BUNDLED_CATEGORY_DISPLAY,
};

export function getMiniAppDisplay(
  appId: string,
  bundle: DisplayContentBundle = BUNDLED_DISPLAY_CONTENT,
): MiniAppDisplay | undefined {
  return (bundle.miniApps as Record<string, MiniAppDisplay>)[appId];
}

export function getCategoryDisplay(
  categoryId: string,
  bundle: DisplayContentBundle = BUNDLED_DISPLAY_CONTENT,
): CategoryDisplay | undefined {
  return (bundle.categories as Record<string, CategoryDisplay>)[categoryId];
}

// ---------------------------------------------------------------------------
// SYNC REMOTE (đường chừa sẵn — chưa active trong PoC)
// ---------------------------------------------------------------------------
//
// Khi có remote storage cho content, implement theo các bước sau (không đổi
// call-site, vì UI chỉ đọc qua getter/bundle ở trên):
//
// 1. Cung cấp một `DisplayContentFetcher` gọi signed endpoint (ví dụ tenant
//    profile mở rộng hoặc remote-config có version + `issuedAt`/`expiresAt` +
//    chữ ký store/author). KHÔNG dùng HTTP fetch trần trong mini-app plane;
//    fetch (nếu cần) chạy ở RN host qua capability `net.request` đã khai báo.
// 2. Verify chữ ký trước khi apply — copy remote không chữ ký hợp lệ phải bị
//    loại bỏ và fallback về `BUNDLED_DISPLAY_CONTENT` (mini-app/remote là
//    untrusted cho đến khi signature + tier chứng minh ngược lại).
// 3. Cache bundle đã verify trên máy với TTL (dùng host storage, key theo
//    `version`), hết hạn thì dùng cache cũ + refresh nền, không block UI.
// 4. Gọi `resolveDisplayContent(fetcher)` lúc khởi động (nền, ngoài critical
//    path của first frame) rồi truyền bundle xuống UI.
//

export type DisplayContentFetcher = () => Promise<DisplayContentBundle | null>;

function pickDefined<T extends object>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) {
    return base;
  }
  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as T;
}

export async function resolveDisplayContent(
  fetcher?: DisplayContentFetcher,
  fallback: DisplayContentBundle = BUNDLED_DISPLAY_CONTENT,
): Promise<DisplayContentBundle> {
  if (!fetcher) {
    return fallback;
  }
  let remote: DisplayContentBundle | null = null;
  try {
    remote = await fetcher();
  } catch {
    remote = null;
  }
  if (!remote) {
    return fallback;
  }
  // Remote thắng từng record có khai báo; thiếu thì giữ bundled.
  const miniApps = { ...fallback.miniApps };
  for (const [id, patch] of Object.entries(remote.miniApps ?? {})) {
    const base = (fallback.miniApps as Record<string, MiniAppDisplay>)[id];
    if (base) {
      (miniApps as Record<string, MiniAppDisplay>)[id] = pickDefined(base, patch);
    }
  }
  const categories = { ...fallback.categories };
  for (const [id, patch] of Object.entries(remote.categories ?? {})) {
    const base = (fallback.categories as Record<string, CategoryDisplay>)[id];
    if (base) {
      (categories as Record<string, CategoryDisplay>)[id] = pickDefined(base, patch);
    }
  }
  return { version: remote.version ?? fallback.version, miniApps, categories };
}
