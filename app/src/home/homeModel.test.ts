import {
  createDefaultHomePreferences,
  homeCategoryCatalog,
  normalizeHomePreferences,
  orderHomeCategorySuggestions,
} from './homeModel';

describe('home model', () => {
  test('normalizes persisted preferences against reviewed catalogs', () => {
    expect(
      normalizeHomePreferences({
        version: 99,
        hasCustomized: true,
        pinnedCategoryIds: ['daily', 'unknown', 'daily'],
        pinnedMiniAppIds: ['weather', 'unknown', 'weather'],
      }),
    ).toEqual({
      version: 1,
      hasCustomized: true,
      pinnedCategoryIds: ['daily'],
      pinnedMiniAppIds: ['weather'],
    });
    expect(normalizeHomePreferences(null)).toEqual(
      createDefaultHomePreferences(),
    );
  });

  test('uses a random order when profile data is unavailable', () => {
    const result = orderHomeCategorySuggestions(null, () => 0);

    expect(result.categories).toHaveLength(homeCategoryCatalog.length);
    expect(new Set(result.categories.map(item => item.id))).toEqual(
      new Set(homeCategoryCatalog.map(item => item.id)),
    );
    expect(result.suggestedCategoryIds.size).toBe(0);
  });

  test('prioritizes age-relevant categories without sex stereotypes', () => {
    const result = orderHomeCategorySuggestions({ age: 34, sex: 'female' });

    expect(result.categories[0].audience).toBe('adult');
    expect(result.suggestedCategoryIds.size).toBe(3);
  });
});
