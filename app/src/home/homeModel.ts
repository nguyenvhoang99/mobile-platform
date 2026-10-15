import { miniAppCatalog } from '../miniapps/catalog';
import { BUNDLED_CATEGORY_DISPLAY } from '../content/displayContent';

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
  { id: 'other', ...BUNDLED_CATEGORY_DISPLAY.other, miniAppIds: ['test'], audience: 'all' },
  {
    id: 'sport',
    name: BUNDLED_CATEGORY_DISPLAY.sport.name,
    shortName: BUNDLED_CATEGORY_DISPLAY.sport.shortName,
    description: BUNDLED_CATEGORY_DISPLAY.sport.description,
    glyph: BUNDLED_CATEGORY_DISPLAY.sport.glyph,
    icon: BUNDLED_CATEGORY_DISPLAY.sport.icon,
    miniAppIds: ['badminton'],
    audience: 'all',
  },
  {
    id: 'daily',
    name: BUNDLED_CATEGORY_DISPLAY.daily.name,
    shortName: BUNDLED_CATEGORY_DISPLAY.daily.shortName,
    description: BUNDLED_CATEGORY_DISPLAY.daily.description,
    glyph: BUNDLED_CATEGORY_DISPLAY.daily.glyph,
    icon: BUNDLED_CATEGORY_DISPLAY.daily.icon,
    miniAppIds: ['weather', 'transit', 'notes'],
    audience: 'all',
  },
  {
    id: 'around_you',
    name: BUNDLED_CATEGORY_DISPLAY.around_you.name,
    shortName: BUNDLED_CATEGORY_DISPLAY.around_you.shortName,
    description: BUNDLED_CATEGORY_DISPLAY.around_you.description,
    glyph: BUNDLED_CATEGORY_DISPLAY.around_you.glyph,
    icon: BUNDLED_CATEGORY_DISPLAY.around_you.icon,
    miniAppIds: ['weather', 'transit'],
    audience: 'older_adult',
  },
  {
    id: 'plan_focus',
    name: BUNDLED_CATEGORY_DISPLAY.plan_focus.name,
    shortName: BUNDLED_CATEGORY_DISPLAY.plan_focus.shortName,
    description: BUNDLED_CATEGORY_DISPLAY.plan_focus.description,
    glyph: BUNDLED_CATEGORY_DISPLAY.plan_focus.glyph,
    icon: BUNDLED_CATEGORY_DISPLAY.plan_focus.icon,
    miniAppIds: ['notes', 'transit'],
    audience: 'young_adult',
  },
  {
    id: 'money',
    name: BUNDLED_CATEGORY_DISPLAY.money.name,
    shortName: BUNDLED_CATEGORY_DISPLAY.money.shortName,
    description: BUNDLED_CATEGORY_DISPLAY.money.description,
    glyph: BUNDLED_CATEGORY_DISPLAY.money.glyph,
    icon: BUNDLED_CATEGORY_DISPLAY.money.icon,
    miniAppIds: ['market', 'notes'],
    audience: 'adult',
  },
  {
    id: 'finance',
    name: BUNDLED_CATEGORY_DISPLAY.finance.name,
    shortName: BUNDLED_CATEGORY_DISPLAY.finance.shortName,
    description: BUNDLED_CATEGORY_DISPLAY.finance.description,
    glyph: BUNDLED_CATEGORY_DISPLAY.finance.glyph,
    icon: BUNDLED_CATEGORY_DISPLAY.finance.icon,
    miniAppIds: ['card'],
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
