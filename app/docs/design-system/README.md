# Host Design System

**Owner:** React Native host (`app/src/ui/` + `app/src/config/`)  
**Status:** v0.1 — collections proposed, batch 1–2 scaffolded, batches 3–5 documented. Review before broad adoption.  
**Source of truth:** `app/src/config/palette.ts`, `app/src/config/layout.ts`, `app/src/config/motion.ts`, `policy/budgets.md` (numbers), `policy/conformance.md` (distinct-ways = 1).

## Why this exists

The host had N ad-hoc surfaces (`GlassTabBar`, `HomeCollection`, `NotificationSheet`, `ConsentSheet`, `TenantPickerSheet`, `MiniAppPickerModal`, `HomeCollectionPickerModal`, `ForegroundNotificationBanner`, `TrackedScrollView`, `MiniAppScreen` trusted header) each inlining its own spacing, pressed state, and sheet logic. That violates the counter budget `Distinct Ways = 1` (`policy/budgets.md:170`) and makes remote theming impossible — a color change today touches 8 files and ships via store review.

The design system collapses those into one vocabulary, consumable via semantic tokens, with no new runtime dependency (keeps `COUNTER` budgets flat per `mobile-simplicity`).

## Architecture

```
policy/budgets.md  ──►  app/src/config/budgets.ts  (generated, no literals elsewhere — S2)
policy/budgets.md  ──►  app/src/config/palette|layout|motion.ts  (semantic tokens)
app/src/config/*   ──►  app/src/ui/foundations/tokens.ts          (single re-export)
app/src/ui/*       ──►  host screens & components
app/docs/design-system/*.md + tokens.json  ──►  review artifact (this folder)
```

* **Thin shell invariant** (`CLAUDE.md:13`): nothing in `app/android|app/ios/` — system is host-RN, remotely updatable.
* **Bridge is only door**: `glass/scrim/shadow/statusBarStyle` stay `ShellPalette`-only, never in `MiniAppPalette` or `tokens.json` handed out broadly (`app/src/config/palette.ts:15`).
* **Motion**: single vocab from `app/src/config/motion.ts:1`; ceilings from `policy/budgets.md:Motion design budgets`. `reduceMotion` zeroing is not optional.

## Collections (review order)

| # | Doc | Collection | What it consolidates | Status |
|---|-----|------------|----------------------|--------|
| 0 | `00-foundations.md` | **Foundations** — Color, Typography, Spacing, Radius, Size, Motion, Elevation | `palette.ts` / `layout.ts` / `motion.ts` literals; remote override path | Ready for review |
| 1 | `01-primitives.md` | **Primitives** — Box, Stack, Text, Pressable, Divider | Per-screen `View`/`Text`/`Pressable` inlines | Ready, scaffolded in `src/ui/primitives/` |
| 2 | `02-actions.md` | **Actions** — Button, IconButton | `ConsentSheet` allow/deny, `HomeAddCard`, header buttons | Ready, scaffolded |
| 3 | `03-navigation.md` | **Navigation** — Header (Trusted), TabBar/Glass, Segment | `GlassTabBar`, `MiniAppScreen` trusted header | Documented |
| 4 | `04-surfaces.md` | **Surfaces** — Sheet, Modal, Scrim | 4 picker/sheet variants → 1 | Documented |
| 5 | `05-data-display.md` | **Data Display** — Card, CollectionTile (constellation/rail/list), Badge, Pill, Avatar | `HomeCollection`, `CardCatalogBody`, hero pills | Documented |
| 6 | `06-feedback.md` | **Feedback** — Banner, Toast, EmptyState, Loader | `ForegroundNotificationBanner`, permission banner | Documented |
| 7 | `07-forms.md` | **Forms** — PickerList, Search, Consent surface | `TenantPickerSheet`, `MiniAppPickerModal` + `AccessSetup` | Documented |
| 8 | `08-patterns.md` | **Patterns** — Home, MiniApp frame, tracking/a11y | Composition of batches 1–4 with `TrackedScrollView` | Documented |
| — | `tokens.json` | Generated snapshot (palette + layout + typography + motion) | Mirrors `MiniAppDesignTokens` shape, host-safe subset | Generated |

Review flow: **Foundations → Primitives → Navigation/Surfaces → Data/Feedback/Forms → Patterns**. Each batch is buildable independently and ratchets `Distinct Ways = 1`.

## How to review

1. Start with `00-foundations.md` — if tokens are wrong, everything downstream is wrong.
2. Pick one batch per review session; each doc has a **Review checklist** at the end.
3. Add comments inline or open issues; direct edits to `app/src/config/budgets.ts` are blocked (S2) — change `policy/budgets.md` instead.
4. After approval, components land in `app/src/ui/<collection>/` with stories usable from `HomeScreen` / `MiniAppScreen`.

## Quick links

* Tokens at a glance → `tokens.json`
* Current surfaces that will migrate → `app/src/components/GlassTabBar.tsx:1`, `app/src/components/HomeCollection.tsx:1`, `app/src/components/NotificationSheet.tsx:1`, `app/src/components/ConsentSheet.tsx:1`
* Budgets → `policy/budgets.md:Stopwatch and gauge budgets`, `policy/budgets.md:Motion design budgets`, `policy/budgets.md:Counter budgets`

## Ratchet plan

* No new runtime dependency this cycle (keeps `COUNTER.direct runtime dependencies` ratchet).
* One `Sheet` replaces 4 modals; one `Pressable` replaces ~8 pressed inlines — each PR deletes a duplicated file or block and is CI-gateable via `Distinct Ways` grep.
* Per-release size ratchet `+2%` (`policy/budgets.md`) monitored; design-system bundle must not breach it.
