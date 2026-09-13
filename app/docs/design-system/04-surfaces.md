# 04 — Surfaces

**Depends on:** `00-foundations.md`, `01-primitives.md`, `02-actions.md`  
**Replaces:** `NotificationSheet.tsx:1`, `ConsentSheet.tsx:1`, `ExploreSheet.tsx:1`, `TenantPickerSheet.tsx:1`, `MiniAppPickerModal.tsx:1`, `HomeCollectionPickerModal.tsx:1` — four modals + two sheets → one Sheet/Modal + Scrim.

Duplicate surfaces are the most expensive duplication: each fork inlines its own backdrop, handle, animation, and dynamic height, and each will drift when product tweaks one.

---

## Scrim

```tsx
import { Scrim } from '@/ui/surfaces/Scrim';
<Scrim color="scrim" onPress={onClose} />   // palette.scrim rgba(14,22,38,0.42)
```

* Full-screen `Pressable` backdrop that dismisses on tap. `accessibilityRole="button"` optional for modal scrim.
* Used by `ConsentSheet` (`View scrim + sheet`) and all bottom sheets. Host-only token `scrim` — not in `MiniAppPalette`.

## Sheet (bottom)

The one bottom-sheet primitive. Covers notification inbox, explore, tenant picker, mini-app picker, collection picker.

```tsx
import { Sheet } from '@/ui/surfaces/Sheet';

<Sheet
  visible={open}
  onClose={onClose}
  detent="auto"            // 'auto' | 'full' | numeric height
  handle                 // shows the  → primarySoft pill
  backdrop={<Scrim />}
  reducedMotion={reduced} // from useReducedMotion()
>
  <Sheet.Header title="Notifications" onClose={onClose} />
  <Sheet.Body>{children}</Sheet.Body>
</Sheet>
```

Spec (unified from three files):

* Backdrop: `rgba(20,28,50,0.28)` for inbox-style sheets; `palette.scrim` for consent-blocking modals — `Sheet` accepts either via `backdrop`.
* Container: `bg surface`, `borderTopRadius xl 28`, `shadow shadow`, `padding 16–20`, `maxHeight ~90%` of viewport minus `insets.bottom`.
* Handle: `width 36 height 4 radius pill` `bg primarySoft`, centered, `marginBottom 12`.
* Header: `title heading/bold text` + trailing `IconButton sm soft` `×` (replaces per-file `heading`/`close` blocks in `NotificationSheet.tsx:heading`).
* Animation: `Modal animationType="fade"` when reduced, else `slide` for bottom sheets — consolidates `reducedMotion ? 'none' : 'fade'` in `NotificationSheet.tsx:139`.
* Height: `auto` measures content and caps at dynamic height (today `NotificationSheet` computes `HEADER 72 + PERMISSION 76? + LIST` up to `maxVisibleItems 3 * ITEM_HEIGHT 92`). Other sheets are fixed/auto per content.
* A11y: `accessibilityViewIsModal`, focus traps handled by `Modal`, close on `onRequestClose` (hardware back).

Usage mapping:

* `NotificationSheet` → `Sheet detent="auto" handle` + permission banner (from `06-feedback.md`) + `FlatList` content.
* `ExploreSheet` / `TenantPickerSheet` / `MiniAppPickerModal` / `HomeCollectionPickerModal` → `Sheet detent="full|auto"` + `PickerList` (from `07-forms.md`).

## Modal (centered)

For blocking consent and alerts that are not bottom sheets.

```tsx
import { Modal } from '@/ui/surfaces/Modal';

<Modal visible={visible} onClose={onDeny} size="md" backdrop={<Scrim color="scrim" />}>
  <Modal.Kicker>MARC</Modal.Kicker>
  <Modal.Title>{request.miniAppName} muốn sử dụng</Modal.Title>
  <Modal.Capability>{request.capability}</Modal.Capability>
  <Text variant="body" color="mutedText">{request.purpose}</Text>
  <HStack gap="md"><Button secondary onPress={onDeny}>Để sau</Button><Button primary onPress={onAllow}>Cho phép</Button></HStack>
</Modal>
```

Spec (from `ConsentSheet.tsx:1`):

* Overlay: `flex 1 justifyContent flex-end` on mobile for sheets vs `center` for Modals; `Modal` centers, `Sheet` docks bottom.
* Container: `bg surfaceElevated`, `radius xl 28` (sheet) / `lg 20` (modal), `padding 20`.
* Consent copy slots: `kicker 9/800 mutedText`, `title 18/800 text`, `capability 14/700 primary`, `purpose 13/18 mutedText` — now via `Text` variants.
* Actions: `HStack gap md` two `Button fullWidth` — replaces per-file `secondaryBtn`/`primaryBtn` styles.

## Dialog

Alert-style variant of `Modal` for confirms (e.g., `Remove shortcut?`). Slimmer padding, single action row.

## Behavior

* All sheets/modals share the same `Modal` root, scrim press, and hardware-back handling — no second `Modal` factory.
* `onClose` vs `onAllow`/`onDeny` are explicit; a consent decision must emit one terminal reply (mirrors bridge terminal-reply invariant).
* Scroll inside `Sheet.Body` uses `TrackedScrollView` pattern (thresholds `[25,50,75,100]`) — scroll-tracking is not re-invented per sheet.

## Migration

1. Land `Scrim` + `Sheet` with `NotificationSheet` as pilot (highest complexity due to dynamic height + permission banner).
2. Migrate `ConsentSheet` to `Modal` (blocking, `scrim` backdrop) — keep copy keys intact.
3. Migrate remaining pickers to `Sheet` + `PickerList`; delete `ExploreSheet`, `TenantPickerSheet`, `MiniAppPickerModal`, `HomeCollectionPickerModal` shells (keep data wiring).

## Review checklist

- [ ] Single Sheet covers both inbox (auto height) and picker (full) use cases.
- [ ] `scrim` vs lighter `rgba(20,28,50,0.28)` backdrop choice final per surface (blocking vs non-blocking).
- [ ] Handle presence default (inbox yes, consent modal no) acceptable.
- [ ] Reduced-motion behavior (`none` vs `fade` vs `slide`) matches a11y expectations.
