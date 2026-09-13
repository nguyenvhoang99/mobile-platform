// @ts-nocheck - uses Node fs/path in Jest, not RN lib
/**
 * Static guards — catch continuous-render anti-patterns before they ship.
 * These are cheap `grep`-style checks that run in CI on every change.
 * A failing guard means a PR introduced churn that will cost frames on the
 * low device `Galaxy A14` `policy/budgets.md:48`.
 *
 * Rules: only silent failures belong in `policy/conformance.md:19`.
 * These guards are not in conformance.md but enforce the same invariant:
 * JS thread must stay idle when idle.
 */
import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');

function read(file: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, file), 'utf8');
}

describe('staticGuards: continuous-render prevention', () => {
  it('critical surfaces use React.memo (single door to prevent tab-bar churn)', () => {
    // Already tested in renderStability.test.tsx, double-guard via source scan
    expect(read('components/GlassTabBar.tsx')).toMatch(/memo\(/);
    expect(read('screens/HomeScreen.tsx')).toMatch(/memo\(/);
    expect(read('screens/MiniAppScreen.tsx')).toMatch(/memo\(/);
  });

  it('GlassTabBar PanResponder is memoized via useMemo (not recreated per render)', () => {
    const src = read('components/GlassTabBar.tsx');
    expect(src).toMatch(/useMemo\(\s*\(\)\s*=>\s*PanResponder\.create/);
    // onRequestSlot must be dep, not [] or missing
    expect(src).toMatch(/\[onRequestSlot\]/);
  });

  it('HomeScreen memoizes derived collections (prevents O(n) filter on every render)', () => {
    const src = read('screens/HomeScreen.tsx');
    // selectedCategoryIds / selectedMiniAppIds / suggestionOrder must be useMemo
    expect((src.match(/useMemo\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(/selectedCategoryIds/);
    expect(src).toMatch(/suggestionOrder/);
  });

  it('App.tsx handlers are useCallback with stable deps (no inline () => per render)', () => {
    const src = read('../App.tsx');
    // Every on* handler that is passed to memo child must be useCallback
    const cbs = (src.match(/useCallback\(/g) ?? []).length;
    expect(cbs).toBeGreaterThanOrEqual(8); // commitNavigation, openMiniApp, showHome, etc.
    // navigationRef is used to avoid `navigation` dep churn
    expect(src).toMatch(/navigationRef\.current/);
    // palette must be useMemo so memo children don't churn on every App render
    expect(src).toMatch(/const palette = useMemo\(/);
    expect(src).toMatch(/createPalette\(profile\.paletteOverrides\)/);
  });

  it('no setState in render path — useEffect has active guard (prevents loop after unmount)', () => {
    // App.tsx `useEffect:200` must guard `setState` with `if (active)` to avoid
    // setState during render or after unmount -> continuous loop on fast navigation
    const app = read('../App.tsx');
    expect(app).toMatch(/let active = true/);
    expect(app).toMatch(/if \(active\)/);
    expect(app).toMatch(/return \(\) => \{\s+active = false/);
    // HomeScreen should use useState for local UI, not direct set in render
    const home = read('screens/HomeScreen.tsx');
    expect(home).toMatch(/useState\(false\)/);
    expect(home).toMatch(/useState<string \| null>/);
  });

  it('StyleSheet.create is used, not inline style objects in critical files', () => {
    // Inline `style={{` in render creates new object every commit -> child re-render
    // Allow at most 2 per file (for pressed state), but critical surfaces should use StyleSheet
    for (const file of ['components/GlassTabBar.tsx', 'screens/HomeScreen.tsx']) {
      const src = read(file);
      // GlassTabBar uses StyleSheet + pressed array, should have 0 `style={{` with object literal
      // Count `style={{` that is object literal, not `style={[`
      const risky = (src.match(/style=\{\{[^{\[]/g) ?? []).length;
      expect(risky).toBeLessThanOrEqual(1);
    }
    // Ensure StyleSheet.create exists
    expect(read('components/GlassTabBar.tsx')).toMatch(/StyleSheet\.create/);
    expect(read('screens/HomeScreen.tsx')).toMatch(/StyleSheet\.create/);
  });

  it('lists have stable keys (no index keys)', () => {
    // Check that HomeCollection / actionList use `key={route}` or `key={link.id}` or `key={item.id}`, not `index`
    const home = read('screens/HomeScreen.tsx');
    const mini = read('screens/MiniAppScreen.tsx');
    expect(home).not.toMatch(/key=\{index\}/);
    expect(mini).toMatch(/key=\{route\}/);
    expect(mini).toMatch(/key=\{link\.id\}/);
  });

  it('no `setTimeout`/`setInterval` without cleanup in effect (leaked timer -> render storm)', () => {
    // App.tsx must clear timer on stop, trackingService must clear timer
    expect(read('../App.tsx')).toMatch(/subscription\.remove\(\)/);
    expect(read('tracking/trackingService.ts')).toMatch(/clearTimeout\(this\.timer\)/);
    expect(read('tracking/trackingService.ts')).toMatch(/stop\(\)[\s\S]*clearTimeout/);
  });

  it('animations use native-reworkable props (transform/opacity) and motion budgets', () => {
    // Check that GlassTabBar pressed uses transform scale, not height
    const glass = read('components/GlassTabBar.tsx');
    expect(glass).toMatch(/transform:\s*\[\{ scale:/);
    expect(glass).not.toMatch(/height:\s*\{[^}]*pressed/);
    // motion.ts must be single source
    const motion = read('config/motion.ts');
    expect(motion).toMatch(/durationMs/);
    expect(read('config/budgets.ts')).toMatch(/MOTION_FEEDBACK_MS/);
  });

  it('single WebView creation site (C1) still holds `policy/conformance.md:36`', () => {
    // Cheap check: only one file constructs a WebView
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '__tests__') continue;
        if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.tsx')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'performance') continue; // this file contains the string '<WebView' in its assertion
          files.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
      }
      return files;
    };
    const files = walk(SRC_ROOT);
    const webViewCtors = files.filter(f => fs.readFileSync(f, 'utf8').includes('<WebView'));
    // Only MiniAppContainer should have <WebView
    expect(webViewCtors.map(f => path.relative(SRC_ROOT, f))).toEqual(['miniapps/container/MiniAppContainer.tsx']);
  });
});
