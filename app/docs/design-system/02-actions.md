# 02 — Actions

**Depends on:** `01-primitives.md` (`Text`, `Pressable`, tokens)  
**Replaces:** ad-hoc buttons in `ConsentSheet.tsx:30`, `HomeCollection.tsx:HomeAddCard`, `MiniAppScreen.tsx:94` header/buttons, `NotificationSheet.tsx:permission` CTA, `ForegroundNotificationBanner`

All actions route through `Pressable` — no second interaction implementation.

---

## Button

```tsx
import { Button } from '@/ui/actions/Button';

<Button variant="primary" size="md" onPress={onAllow}>Cho phép</Button>
<Button variant="secondary" size="md" onPress={onDeny}>Để sau</Button>
<Button variant="ghost" size="sm" onPress={onRemove}>Remove</Button>
<Button variant="danger" size="md" onPress={onDanger}>Remove shortcut</Button>
```

| Prop | Values |
|------|--------|
| `variant` | `primary` (filled `primary`/`onPrimary`) · `secondary` (stroke `border`/`text`) · `ghost` (soft `primarySoft`/`primary`) · `danger` (filled `danger`/`onDanger`) |
| `size` | `sm` 36h / `md` 48h (`touchTarget`) / `lg` 56h |
| `loading` | shows `ActivityIndicator` in `onPrimary`/`primary`, disables press, keeps terminal width |
| `disabled` | `palette.disabled` text/bg, `accessibilityState.disabled` |
| `fullWidth` | `true` makes flex:1 (ConsentSheet actions) |
| `leadingIcon` / `trailingIcon` | glyph slot (e.g., `→` `↗` in `MiniAppScreen` actions) |

Visuals:
* `radius: lg 20` (primary/secondary/danger), `pill 999` optional via `pill` prop for avatar-adjacent chips.
* Pressed uses `Pressable` system (`opacity 0.76, scale 0.98`, reduced → no scale).
* Focus ring `palette.focus` (visible on web/desktop harnesses; RN outline via border).

Current mapping:

* `ConsentSheet` primary `Cho phép` → `Button primary md fullWidth`
* `ConsentSheet` secondary `Để sau` → `Button secondary md fullWidth`
* `HomeAddCard` `＋` → `Button ghost md` with `leadingIcon="＋"`
* `MiniAppScreen` route rows (`→`) and cross-app rows (`↗`) → `Button secondary md` / `Button primary md`

## IconButton

Circular hit-target for header chrome. Replaces repeated 38×38 Pressables in `MiniAppScreen.tsx:100`.

```tsx
import { IconButton } from '@/ui/actions/IconButton';

<IconButton glyph="‹" label="Back" variant="soft" onPress={onBack} />   // primarySoft bg
<IconButton glyph="×" label="Close mini-app" variant="canvas" onPress={onClose} />
<IconButton glyph="🔔" label="Open notifications" badge={unreadCount} onPress={openNotes} />
```

| Prop | Values |
|------|--------|
| `variant` | `soft` (`primarySoft`/`primary`) · `canvas` (`canvas`) · `primary` (`primary`/`onPrimary`) |
| `size` | `sm` 38 (header) / `md` 48 (dock) |
| `badge` | number — renders `primary` dot with `onPrimary` count (≤9 vs `9+`) as in `HomeScreen.tsx:headerActions` |
| `haptics` | forwarded to `Pressable` (`selection` for nav) |

Both sizes enforce `touchTarget 48` via hitSlop when visual is smaller.

## Link (text action)

For inline text affordances (not yet widespread) — `Text variant="label" color="primary" weight="semibold"` inside `Pressable variant="subtle"`. Provided for completeness; prefer `Button ghost` for standalone CTAs.

## States & a11y

* `accessibilityRole="button"` always; `accessibilityLabel` required when glyph-only (`Back`, `Close mini-app`).
* `loading` does not remove the button from layout (prevents shift); a11y announces busy.
* Disabled is `palette.disabled` — no custom grey.

## Performance / budgets

* No extra native module; `hitSlop`/`scale` cost < 1 frame. Bridge not involved.
* Avoid per-button `StyleSheet.create` — sizing comes from tokens.

## Usage guardrails

* Do not use `Pressable` directly for primary flows — go through `Button`/`IconButton` so theming stays centralized.
* Do not create `PrimaryButton` / `SecondaryButton` components — one `Button` with `variant` (Distinct Ways = 1).
* Consent surfaces (`ConsentSheet`) must remain host-native. Mini-app code must never render a fake `Button primary` that imitates the consent CTA — review will flag that via visual regression.

## Review checklist

- [ ] Variant names (`primary/secondary/ghost/danger`) match product language.
- [ ] Sizes cover header (38), standard (48), and large CTAs (56) without custom heights.
- [ ] IconButton badge spec matches notification design (`NotificationSheet` bell in `HomeScreen`).
- [ ] Loading/disabled specs acceptable.
