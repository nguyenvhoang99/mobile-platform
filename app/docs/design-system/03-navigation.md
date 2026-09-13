# 03 — Navigation

**Depends on:** `00-foundations.md`, `01-primitives.md`, `02-actions.md`  
**Replaces:** `app/src/components/GlassTabBar.tsx:1`, `app/src/screens/MiniAppScreen.tsx:68` (trusted header), ad-hoc header in `app/src/screens/HomeScreen.tsx:75`

Navigation is host-owned chrome. Mini-apps never render this layer; they receive the palette subset via `miniAppPaletteFrom` and must not imitate it.

---

## TrustedHeader

The bar above every mini-app frame. It is the user's assurance of tenancy.

```tsx
import { TrustedHeader } from '@/ui/navigation/TrustedHeader';

<TrustedHeader
  title={manifest.name}
  subtitle={manifest.englishName}
  onBack={goBack}
  onClose={closeAll}
/>
```

Spec (from `MiniAppScreen.tsx:68`):

* Container: `surface`, `borderBottomColor: glassBorder`, `borderBottomWidth: 1`, `paddingTop: insets.top + 8`, `paddingBottom: 12`, `paddingHorizontal: 16`, `flexDirection: row, alignItems: center`.
* Leading/trailing: `IconButton size="sm" variant="soft|cavas"` (`‹` / `×`, 38 visual, 48 hit).
* Center: `kicker` `VERIFIED MINI-APP` (`caption 12, weight bold, mutedText, letterSpacing 1`) + `title` (`body 16 or heading 20, bold, text`) ellipsized.
* Background is `surface` (not `glass`) so it is distinct from the floating `TabBar`. Used only in `MiniAppScreen`.

No mini-app may render a header with the same kicker/label — visual regression will flag imitation.

## TabBar / TabBar.Glass

The floating bottom control. Today `GlassTabBar.tsx:1` has two modes — `compactBar` (no slots) and `bar` (left + Explore + right). The system unifies them.

```tsx
import { TabBar } from '@/ui/navigation/TabBar';

<TabBar
  variant="glass"
  activeId={activeMiniAppId}
  slots={dockSelection}             // { left, right }
  onExplore={openExplore}
  onHome={showHome}
  onOpenMiniApp={openMiniAppFromBar}
  onRequestSlot={openPicker}       // (slot, gesture: 'swipe'|'long_press') => void
/>
```

Spec (consolidated from `GlassTabBar.tsx:Styles`):

* Position: `absolute bottom 0 left 20 right 20`, `paddingBottom: max(insets.bottom, 12)`, `alignItems: center`.
* Glass bar: `bg: glass`, `borderColor: glassBorder`, `borderWidth: 1`, `borderRadius: 30` (full) / `34` (compact), `minHeight 66`, `paddingHorizontal 6`, `shadowColor: shadow, offset 0/12 radius 20 opacity 0.22 elevation 10`.
* Explore primary tab: `bg primary` / `text onPrimary`, `borderRadius 24` (full) / `26` (compact), `minHeight 68` (full, `marginTop -18`) / `52` (compact), `shadow offset 0/8 radius 12 opacity 0.28`, glyph `✦ 19/700`.
* Shortcut slot: `borderRadius 19, minHeight 52, flex 1`, selected `bg primarySoft / text primary`, unselected `mutedText`; label `11/700`.
* Interactions: swipe on Explore (`PanResponder dx>16 && dx>dy*1.25 → dx< -44 left, >44 right`) → `onRequestSlot`; long press 420 ms on shortcuts → `onRequestSlot`; short press → `signalNavigationSelection()` then nav. All via `Pressable` haptics `selection`.

Modes:

* `compact` (no dock slots) — centered primary `Explore`, `minWidth 120`, `marginTop 0`.
* `full` — `ShortcutSlot left | Explore | ShortcutSlot right`. Empty slot renders `⌂ Home` (selected when `activeId === null`).

Empty slot hint: `Tap to go Home, or long press to assign a mini-app shortcut`. Assigned slot hint: `Long press to replace this shortcut`. Swipe hint: `Swipe left or right to choose a mini-app shortcut` (a11y hints preserved).

## Segment / Tabs (host, not mini-app)

For host filter surfaces (e.g., future category filters). Not `GlassTabBar`.

```tsx
<Segment value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }]} />
```

`pill 999` container `surface`, selected `primarySoft`/`primary`, unselected `text`/`mutedText`.

## Motion & a11y

* Tab switches emit `signalNavigationSelection()` (haptics) — kept inside `TabBar`, not call-site.
* TabBar settle uses `motion.easing.standard` + `durationMs.emphasized 300` max; track gesture directly while dragging.
* `accessibilityRole="tab"`, `accessibilityState.selected` per slot — mirrors current implementation.

## Migration

1. Extract `TrustedHeader` from `MiniAppScreen.tsx` (no behavior change).
2. Wrap `GlassTabBar` as `TabBar.Glass` — existing swipe/pan logic moves inside, call sites pass `slots`/`onRequestSlot`.
3. Delete per-screen header shims in `HomeScreen`.

## Review checklist

- [ ] `TrustedHeader` copy (`VERIFIED MINI-APP`) and colors final vs localized variant.
- [ ] Glass blur/opacity acceptable on A14 low-tier (no perf cliff; uses plain `rgba`, not `BlurView`).
- [ ] Swipe/long-press thresholds (44 px, 420 ms) remain desired.
- [ ] Compact vs full mode breakpoint (any slot assigned) still correct.
