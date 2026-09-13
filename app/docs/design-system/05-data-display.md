# 05 — Data Display

**Depends on:** `00-foundations.md`, `01-primitives.md`  
**Replaces:** visual layer of `HomeCollection.tsx:1`, `CardCatalogBody.tsx:1`, `HomeScreen.tsx:category/miniApp` sections, `MiniAppScreen.tsx:hero` + route rows

Data display is the host's catalog/mini-app content presentation. It never imitates host-trusted chrome.

---

## Card

Base container for catalog and mini-app content.

```tsx
import { Card } from '@/ui/data/Card';

<Card padding="md" radius="lg" bordered elevated={false}>
  <Text variant="heading" weight="bold">Cầu lông</Text>
  <Text variant="body" color="mutedText">Verified mini-app · v1</Text>
</Card>
```

* `bg surface`, `borderColor glassBorder` (selected state `primary`), `radius lg 20` / `xl 28`, `shadow shadow` optional.
* Padding `md 16` (list) vs `lg 24` (hero). No custom hex.

## CollectionTile

The item inside `HomeCollection`. Today `HomeCollectionTile` branches on `layout` (`constellation | rail | list`) and on `selected`/`editing`/`badge`. The system keeps those states explicitly.

```tsx
import { CollectionTile } from '@/ui/data/CollectionTile';

<CollectionTile
  glyph="🏸"
  label="Cầu lông"
  description="Verified mini-app · v1"
  badge="For you"
  selected={selectedIds.has(id)}
  editing={editingId === id}
  layout="rail"                // 'constellation' | 'rail' | 'list'
  onPress={() => onOpen(id)}
  onLongPress={() => startEdit(id)}
  onRemove={() => onRemove(id)}
/>
```

Spec (from `HomeCollection.tsx:TileProps Styles`):

* Wrapper: `constellationItem` (staggered `position % 3 === 1` offset) / `railItem` (horizontal scroll) / `listItem` (row). Layout prop replaces scattered `wrapperStyle`.
* Tile: `tile` + `constellationTile`/`railTile`/`listTile`; `bg selected?primarySoft:surface`, `borderColor selected?primary:glassBorder`, `shadowColor shadow`.
* Glyph circle: `bg primarySoft`, `glyph primary 19/700` inside `glyphCircle` (`constellationGlyphCircle` variant sized per layout).
* Copy: `label text` (`numberOfLines list?1:2`), `description mutedText` (`list?2:1`). Centered for constellation/rail, `listCopy` for list.
* Selected check: `bg primary` circle `✓ onPrimary` when `selected && !editing`.
* Editing remove: trailing `IconButton primary` `−` when `editing && onRemove` (`HomeCollection.tsx:remove`).
* Pressed: `Pressable` system (`opacity 0.76 scale 0.98`), `delayLongPress 420`, `signalNavigationSelection()` on press/longPress, a11y hint `Long press to add to Home` vs `Long press to edit` etc.

### Collection layouts

* `HomeCollection` itself becomes a thin orchestrator: `Collection layout="constellation"` wraps first-run `suggestedItems` (from `orderHomeCategorySuggestions(viewerProfile)`), `layout="rail"` wraps `pinnedCategoryItems`/`pinnedMiniAppItems` (horizontal `ScrollView`), `layout="list"` for explore/picker. Data mapping stays in `HomeScreen.tsx:categoryItem()` / `miniAppItem()`.

## Badge

```tsx
<Badge label="For you" tone="soft" />   // primary on primarySoft
<Badge label="9+" tone="primary" />     // onPrimary on primary (notification count)
```

`radius pill`, `padding xxs/xs`, `Text variant="caption" weight="bold"`.

## Pill

For endpoint/path chips in `MiniAppScreen.tsx:160`.

```tsx
<Pill label="ENDPOINT:" tone="muted" />
<Pill label="Route: /bookings" tone="soft" />
<Pill label={manifest.resourceEndpoint} tone="primarySoft" truncate />
```

`bg surface`, `radius md 12`, `padding xs/sm`, icon-less today. Replaces repeated `endpointPill`/`pathPill` styles.

## Avatar

For account profile in `HomeScreen.tsx:avatar`.

```tsx
<Avatar initials="MP" size="md" tone="soft" /> // bg primarySoft / text primary
```

Sizes `sm 32 / md 40 / lg 56`, `radius pill`.

## Hero

For `MiniAppScreen` hero section (app icon + eyebrow + title + body + pills).

```tsx
<Hero glyph="🏸" eyebrow="HOST-CONTAINED EXPERIENCE" title={manifest.name} body={...} palette={palette} />
```

`bg canvasAccent, radius xl 28, padding lg 24`, `appIcon 54 radius 18 bg primarySoft`. Kept as a pattern over `Card` rather than a separate component if preferred — documented here for review.

## Action rows

Route rows and cross-app link rows (`→` / `↗`) are `Card` + `Pressable` + `Text` + `Badge` compositions (or `Button` secondary/primary when CTA emphasis warrants). Spec: `minHeight 58, radius 18, paddingHorizontal 16`, background `surface` (route) / `primary` (cross-app), arrow `primary` / `onPrimary`.

## Review checklist

- [ ] `CollectionTile` states (default/selected/editing/badge) cover first-run constellation vs pinned rail without extra variants.
- [ ] `constellationOffset` stagger (every 3rd item offset) preserved or intentionally removed.
- [ ] Card/hero radius/padding values not too generous on A14 low-tier viewport.
- [ ] Route vs cross-app row affordance distinct enough (stroke vs filled primary).
