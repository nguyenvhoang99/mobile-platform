import { miniAppCatalog } from '../miniapps/catalog';

export type HomeViewerProfile = {
  age?: number;
  sex?: 'female' | 'male' | 'intersex' | 'unspecified';
};

import type { LineIconName } from '../ui/primitives/LineIcon';

export type HomeCategory = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  glyph: string; // kept for backwards compat / picker fallback
  icon: LineIconName; // Line (Outlined) — primary visual
  miniAppIds: readonly string[];
  audience: 'all' | 'young_adult' | 'adult' | 'older_adult';
};

export type HomePreferences = {
  version: 1;
  hasCustomized: boolean;
  pinnedCategoryIds: string[];
  pinnedMiniAppIds: string[];
};

export const homeCategoryCatalog: readonly HomeCategory[] = [
  {
    id: 'sport',
    name: 'Thể thao',
    shortName: 'Sport',
    description: 'Sport · Đặt sân và tìm người chơi cùng',
    glyph: '🏸',
    icon: 'trophy',
    miniAppIds: ['badminton'],
    audience: 'all',
  },
  {
    id: 'daily',
    name: 'Every day',
    shortName: 'Daily',
    description: 'Weather, travel, and quick notes',
    glyph: '✦',
    icon: 'sun',
    miniAppIds: ['weather', 'transit', 'notes'],
    audience: 'all',
  },
  {
    id: 'around_you',
    name: 'Around you',
    shortName: 'Nearby',
    description: 'What is happening where you are',
    glyph: '⌖',
    icon: 'map-pin',
    miniAppIds: ['weather', 'transit'],
    audience: 'older_adult',
  },
  {
    id: 'plan_focus',
    name: 'Plan & focus',
    shortName: 'Focus',
    description: 'Keep the day moving',
    glyph: '◷',
    icon: 'target',
    miniAppIds: ['notes', 'transit'],
    audience: 'young_adult',
  },
  {
    id: 'money',
    name: 'Money & markets',
    shortName: 'Money',
    description: 'Follow markets and keep a note',
    glyph: '◇',
    icon: 'trending-up',
    miniAppIds: ['market', 'notes'],
    audience: 'adult',
  },
  {
    id: 'finance',
    name: 'Tài chính',
    shortName: 'Finance',
    description: 'Tài chính · Chia tiền và so sánh thẻ',
    glyph: '💳',
    icon: 'credit-card',
    miniAppIds: ['card', 'split-bill'],
    audience: 'adult',
  },
] as const;

export function createDefaultHomePreferences(): HomePreferences {
  return {
    version: 1,
    hasCustomized: false,
    pinnedCategoryIds: [],
    pinnedMiniAppIds: [],
  };
}

function uniqueKnownIds(
  value: unknown,
  knownIds: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter(id => typeof id === 'string'))]
    .filter(id => knownIds.has(id))
    .slice(0, 24);
}

export function normalizeHomePreferences(value: unknown): HomePreferences {
  if (!value || typeof value !== 'object') {
    return createDefaultHomePreferences();
  }
  const candidate = value as Partial<HomePreferences>;
  return {
    version: 1,
    hasCustomized: candidate.hasCustomized === true,
    pinnedCategoryIds: uniqueKnownIds(
      candidate.pinnedCategoryIds,
      new Set(homeCategoryCatalog.map(category => category.id)),
    ),
    pinnedMiniAppIds: uniqueKnownIds(
      candidate.pinnedMiniAppIds,
      new Set(miniAppCatalog.map(app => app.id)),
    ),
  };
}

function audienceScore(
  audience: HomeCategory['audience'],
  age: number | undefined,
): number {
  if (audience === 'all' || age === undefined) {
    return audience === 'all' ? 3 : 1;
  }
  if (age < 30) {
    return audience === 'young_adult' ? 4 : 1;
  }
  if (age < 55) {
    return audience === 'adult' ? 4 : 1;
  }
  return audience === 'older_adult' ? 4 : audience === 'adult' ? 2 : 1;
}

function stableProfileTieBreaker(
  categoryId: string,
  profile: HomeViewerProfile,
): number {
  const source = `${profile.age ?? 0}:${
    profile.sex ?? 'unspecified'
  }:${categoryId}`;
  let hash = 0;
  for (const character of source) {
    hash = (hash * 31 + character.charCodeAt(0)) % 0xffffffff;
  }
  return hash / 0xffffffff;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function orderHomeCategorySuggestions(
  profile: HomeViewerProfile | null,
  random: () => number = Math.random,
): {
  categories: HomeCategory[];
  suggestedCategoryIds: ReadonlySet<string>;
} {
  if (!profile || (profile.age === undefined && profile.sex === undefined)) {
    return {
      categories: shuffled(homeCategoryCatalog, random),
      suggestedCategoryIds: new Set(),
    };
  }

  const categories = [...homeCategoryCatalog].sort((left, right) => {
    const score =
      audienceScore(right.audience, profile.age) -
      audienceScore(left.audience, profile.age);
    return (
      score ||
      stableProfileTieBreaker(left.id, profile) -
        stableProfileTieBreaker(right.id, profile)
    );
  });
  return {
    categories,
    suggestedCategoryIds: new Set(
      categories.slice(0, Math.min(3, categories.length)).map(item => item.id),
    ),
  };
}
