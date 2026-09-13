# 07 — Forms & Pickers

**Depends on:** `00-foundations.md`, `01-primitives.md`, `04-surfaces.md`, `05-data-display.md`  
**Replaces:** `MiniAppPickerModal.tsx:1`, `HomeCollectionPickerModal.tsx:1`, `TenantPickerSheet.tsx:1`, `ExploreSheet.tsx:1`, `AccessSetup.tsx` controls, ad-hoc search inputs

No new native text-input module this cycle. Forms are host surfaces; mini-app forms live in WebView and are out of scope.

---

## PickerList

The content inside every sheet picker. One list, three current forks collapsed.

```tsx
import { PickerList } from '@/ui/forms/PickerList';

<Sheet visible={pickerOpen} onClose={closePicker}>
  <Sheet.Header title="Choose a shortcut" />
  <PickerList
    items={apps.map(a => ({ id: a.id, label: a.name, description: a.englishName, glyph: a.glyph }))}
    selectedId={selectedAppId}
    onSelect={selectDockApp}
    onClear={clearDockSlot}   // renders "Remove shortcut" footer (danger)
    empty={<EmptyState title="No mini-apps" />}
  />
</Sheet>
```

* Item row: `Card radius lg 20` + `Pressable`, `glyphCircle primarySoft/primary`, `label text bold`, `description mutedText`, selected `border primary + bg primarySoft`, matches `HomeCollectionTile` visuals but in `list` layout.
* Footer: `Remove shortcut` (`Button ghost danger`, `appId null` path as in `MiniAppPickerModal onClear`) — shared across dock pickers.
* Accessory: right-aligned `✓ primary` when selected (same as tile selected state).
* Search variant (`ExploreSheet`): `PickerList` with `filter` prop (`TextInput` host stub, not `TextInput` import — uses RN `TextInput` wrapped via `ui/forms/SearchField`).

Current picker sheets mapped:

* `MiniAppPickerModal` → `Sheet auto` + `PickerList` (dock slots `left|right`, existing `selectDockApp`/`clearDockSlot` callbacks).
* `TenantPickerSheet` → `Sheet auto` + `PickerList` (region tenants).
* `HomeCollectionPickerModal` → `Sheet full` + `PickerList` (categories/mini-apps).
* `ExploreSheet` → `Sheet full` + `PickerList filter` (branded explore catalog).

## SearchField

Minimal host search input for `ExploreSheet` filter. Not a general form input system.

```tsx
<SearchField value={query} onChange={setQuery} placeholder="Search mini-apps" />
```

`bg canvas`, `border border`, `radius lg 20`, `padding sm 12`, `icon 24`, `text body`. No form validation library; debounced filtering lives in `HomeScreen`/catalog.

## Segment (filter)

Covered in `03-navigation.md` but listed here for discoverability — filter chips for host catalogs.

## Consent / AccessSetup surface

`AccessSetup.tsx` (biometric/location helpers) becomes a `Banner` + `Button` pattern over `Scrim/Modal` — not a separate atom. Keeps the three-gate ordering visible: review grant → per-mini-app consent → OS prompt. No new capability-like widget introduced without `native-capability` review.

## States

* `disabled` uses `palette.disabled` for row text/icon.
* `empty` uses `EmptyState` (from `06-feedback.md`) inside `PickerList`.
* Keyboard: `PickerList` inside `Sheet` avoids `.avoidKeyboard` complexity today; search field uses `KeyboardAvoidingView` if needed (no new dep).

## Migration

1. Land `PickerList` and migrate `TenantPickerSheet` first (simplest, no search).
2. Migrate `MiniAppPickerModal` + `HomeCollectionPickerModal`.
3. Migrate `ExploreSheet` search variant — keep catalog data wiring (`tenantCatalog` etc.) in `HomeScreen`, only visual shell moves to `PickerList`.

## Review checklist

- [ ] Single `PickerList` covers tenant, mini-app, and category picking without special cases.
- [ ] SearchField scope acceptable (explore-only) vs. a fuller Input primitive next cycle.
- [ ] Remove-shortcut footer placement (bottom of list vs. separate sheet section) final.
- [ ] Empty states match product copy.
