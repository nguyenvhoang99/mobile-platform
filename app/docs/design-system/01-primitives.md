# 01 — Primitives

**Replaces:** per-screen `View`/`Text`/`Pressable` inlines in `GlassTabBar.tsx:1`, `HomeCollection.tsx:1`, `HomeScreen.tsx:1`, `MiniAppScreen.tsx:1`, `NotificationSheet.tsx:1`, `ConsentSheet.tsx:1`  
**Depends on:** `00-foundations.md` (tokens) · `app/src/config/layout.ts:1` · `app/src/ui/foundations/tokens.ts`

Primitives are the lowest host-RN building blocks. One way per thing (`Distinct Ways = 1` — `policy/conformance.md`). They add no native module.

---

## Box

Thin `View` wrapper that only accepts spacing/radius/color tokens.

```tsx
import { Box } from '@/ui/primitives/Box';

<Box padding="md" gap="sm" radius="lg" bg="surface" borderColor="border" />
```

Props: `padding | paddingHorizontal | paddingVertical | gap | radius | bg | borderColor | style?`. Values are keys of `spacing`/`radius`/`palette` — raw numbers/hex rejected. Used to remove repeated `StyleSheet.create({ card: { padding: 16, borderRadius: 16 } })`.

## Stack

Opinionated `Box` presets for common layouts.

* `HStack` / `VStack` — `flexDirection` + `gap` + `align`/`justify`.
* `Center` — `alignItems/justifyContent: center`.

Replaces repeated `flexDirection: 'row', gap: 12` blocks in `HomeScreen` header/topRow.

## Text

Single typographic primitive — enforces `size↔lineHeight` pairing from `typographyTokens`.

```tsx
import { Text } from '@/ui/primitives/Text';

<Text variant="heading" weight="bold" color="text">Home</Text>
<Text variant="body" color="mutedText" numberOfLines={2}>Verified mini-app · v1</Text>
<Text variant="caption" weight="bold" color="primary">For you</Text>
```

Variants: `caption | label | body | heading | title` → each binds `size` + `lineHeight`. Weight overrides allowed `regular/medium/semibold/bold`. Color is a `palette` key (never a literal). Replaces scattered `fontSize: 19` / `lineHeight: 22` in `GlassTabBar.tsx:glyph`.

## Pressable

One interactive primitive. Every host tap target must go through it (or `Button` which wraps it).

```tsx
import { Pressable } from '@/ui/primitives/Pressable';

<Pressable onPress={onHome} haptics="selection" hitSlop={8} variant="subtle">
  <Text variant="label" weight="bold">Home</Text>
</Pressable>
```

Behavior:
* `touchTarget 48` minimum enforced (wraps smaller children with hitSlop).
* Pressed: `opacity 0.76 + scale 0.98` (normalized from legacy `0.97` in `GlassTabBar.tsx:213`), disabled: `opacity 0.45 + palette.disabled`.
* Calls `signalNavigationSelection()` via `haptics="selection|none"` prop if caller opts in — no per-file import of `nativeShell`.
* Respects `useReducedMotion` — no scale when reduced.
* `accessibilityRole`/`accessibilityLabel`/`accessibilityState` required for nav surfaces (`tab`, `button`) — mirrors current `GlassTabBar` a11y hints.

All existing `Pressable` calls in `HomeCollectionTile`, `NotificationSheet`, `ConsentSheet` migrate to this primitive. Raw `react-native/Pressable` import outside `ui/primitives/` will be lint-flagged.

## Divider

Hairline primitive.

```tsx
<Divider orientation="horizontal" color="border" spacing="md" />
```

`height: StyleSheet.hairlineWidth`, color from `palette.border`/`glassBorder`. Replaces ad-hoc borderBottom shims.

---

## Sizing & a11y

* Every pressable enforces `touchTarget 48` (`size.touchTarget`) — smaller glyphs are centered within it.
* `Text` reports correct `allowFontScaling` and respects Dynamic Type.
* `Pressable` forwards `accessibilityHint` (e.g., `Long press to replace this shortcut` currently in `GlassTabBar.tsx:191`).

## Migration

1. Add `Box`/`Text`/`Pressable` in one PR, migrate `HomeCollectionTile` first (most repeated).
2. Codemod remaining sheets/screens; delete duplicate `pressed` styles per file.
3. Add grep check: `from 'react-native' import .*Pressable` outside `app/src/ui/primitives/` → fail (enforces `Distinct Ways = 1`).

## Review checklist

- [ ] Variants cover Home/MiniApp/header/collection copy without one-offs.
- [ ] `Pressable` pressed/disabled/reduced behavior matches desired product feel (tune `scale.pressed 0.95–1` if needed — not above 1).
- [ ] Box props sufficient; no raw `style={{ padding: 17 }}` escapes needed.
- [ ] A11y props ergonomics acceptable to product teams.
