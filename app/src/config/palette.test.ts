import { createPalette, miniAppPaletteFrom } from './palette';

describe('createPalette', () => {
  it('allows a product palette to replace semantic tokens', () => {
    const palette = createPalette({ primary: '#000000', onPrimary: '#F5F5F5' });

    expect(palette.primary).toBe('#000000');
    expect(palette.onPrimary).toBe('#F5F5F5');
    expect(palette.canvas).toBeDefined();
    expect(palette.danger).toBeDefined();
    expect(palette.focus).toBeDefined();
  });

  it('keeps trusted shell chrome out of the mini-app palette', () => {
    const palette = miniAppPaletteFrom(createPalette());

    expect(palette.primary).toBeDefined();
    expect('glass' in palette).toBe(false);
    expect('scrim' in palette).toBe(false);
    expect('statusBarStyle' in palette).toBe(false);
  });
});
