import { loadHomePreferences, saveHomePreferences } from './hostStorage';

describe('home preference storage', () => {
  test('persists normalized category and mini-app selections', async () => {
    await saveHomePreferences({
      version: 1,
      hasCustomized: true,
      pinnedCategoryIds: ['daily', 'unknown'],
      pinnedMiniAppIds: ['weather', 'unknown'],
    });

    await expect(loadHomePreferences()).resolves.toEqual({
      version: 1,
      hasCustomized: true,
      pinnedCategoryIds: ['daily'],
      pinnedMiniAppIds: ['weather'],
    });
  });
});
