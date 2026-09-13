# 00 — Foundations

**Sources:** `app/src/config/palette.ts:1`, `app/src/config/layout.ts:1`, `app/src/config/motion.ts:1`, `app/src/config/appConfig.ts:1`, `policy/budgets.md:1`  
**Consumed via:** `app/src/ui/foundations/tokens.ts` (single re-export; no file outside `config/` may inline a literal).

## Principles

1. **Semantic, not literal.** Screens consume `palette.primary` / `spacing.md` — never `#5865F2` / `16`. Remote config can then re-theme without a native release (thin-shell invariant).
2. **Host-only vs tenant-safe.** `glass`, `glassBorder`, `scrim`, `shadow`, `statusBarStyle` are `ShellPalette`-only (`palette.ts:35`). They never enter `MiniAppPalette` or `tokens.json` broadly shared — a mini-app must not imitate trusted chrome.
3. **One motion vocabulary.** All durations/easings/distances come from `motion.ts:1`; ceilings are `policy/budgets.md:Motion design budgets`. Product config may tune **down**, never above `100/300` ms or `24` px. `reduceMotion` zeros travel and durations (accessibility invariant).
4. **No literals outside `config/`.** CI S2 fails a literal matching a budget row outside `budgets.ts`. Change `policy/budgets.md`, then regenerate `budgets.ts`.

---

## Color — `palette.ts:1`

### Shell palette (host screens)

```
canvas        #F4F7FB   page background (Home, MiniAppScreen canvas)
canvasAccent  #E7EDFF   hero/emphasis fills
surface       #FFFFFF   cards, sheets
surfaceElevated #FFFFFF elevated surfaces (modal sheets)
glass         rgba(255,255,255,0.78)   TabBar glass fill
glassBorder   rgba(255,255,255,0.92)   glass stroke
border        #DCE2EC   hairlines, card strokes
text          #162033   primary text
mutedText     #657085   secondary/caption
inverseText   #FFFFFF   on dark/primary
primary       #5865F2   actions, selection, links
onPrimary     #FFFFFF   text on primary
primarySoft   #E8EAFF   soft fills (avatar, selected states, close buttons)
success       #16794B   confirm states
warning       #9A5B00   cautions
danger        #C2353F   destructive / remove
onDanger      #FFFFFF   text on danger
focus         #3559E8   focus ring
disabled      #A8B0BF   disabled text/icon
scrim         rgba(14,22,38,0.42) consent/modal scrim
shadow        rgba(44,56,90,0.18) sheet/bar shadowColor
statusBarStyle dark-content
```

### Tenant-safe subset (`MiniAppPalette`)

All above **except** `glass`, `glassBorder`, `scrim`, `shadow`, `statusBarStyle`. Built via `miniAppPaletteFrom(palette)` (`palette.ts:50`). Served inside `createMiniAppDesignTokens()` (`miniAppDesignTokens.ts:1`) — container freezes it before web content runs.

### Usage rules

* Prefer `canvas` for screen bg, `surface` for cards, `primarySoft` for selected/soft fills, `border`/`glassBorder` for strokes. Do not invent `#EEF2FF`.
* `success/warning/danger/focus/disabled` are semantic — not decoration. Destructive actions use `danger`, not `primary`.
* Remote override: `createPalette(overrides)` from signed `appConfig.palette` — host screens update without code change.

### Swatches (for review — verify contrast AA on `text`/`mutedText` vs `canvas`/`surface`)

* Primary on surface, primarySoft selected, danger remove, muted detail text — check in Figma or `tokens.json:colors`.

---

## Typography — `layout.ts:31`

```
size:       caption 12 / label 14 / body 16 / heading 20 / title 28
lineHeight: caption 16 / label 20 / body 24 / heading 28 / title 34
weight:     regular 400 / medium 500 / semibold 600 / bold 700
```

Pairings enforced by `ui/primitives/Text` (`Text` variant → size+lineHeight+weight). Body copy `body/regular`, section headings `heading/bold`, screen title `title/bold`, badges `caption/bold`, labels `label/medium`.

Type scale is not configurable post-ship; spacing/motion may tune via remote config.

---

## Spacing / Radius / Size — `layout.ts:1`

```
spacing: none 0 / xxs 4 / xs 8 / sm 12 / md 16 / lg 24 / xl 32 / xxl 48
radius:  none 0 / sm  8 / md 12 / lg 20 / xl 28 / pill 999
size:    touchTarget 48 / icon 24
```

* `touchTarget 48` is the minimum hit area — every `Pressable`/`Button`/`IconButton` enforces it.
* Common compositions: card `md` radius + `md` padding, sheet `xl` radius, pill `pill` radius, header icon `touchTarget`.
* `xxs/xs` for micro gaps, `md/lg` for section gaps, `xl/xxl` for screen breathing.

---

## Motion — `motion.ts:1` + `policy/budgets.md:Motion design budgets`

```
durationMs: instant 0 / feedback 100 / standard 200 / emphasized 300
easing:     standard [0.2,0,0,1] / enter [0,0,0,1] / exit [0.3,0,1,1]
distance:   none 0 / micro 4 / small 12 / medium 24
scale:      rest 1 / pressed 0.98   (effective 0.97 in legacy GlassTabBar — will normalize to 0.98)
```

Ceilings (`policy/budgets.md`):

| Token | Default | Ceiling |
|-------|---------|---------|
| Feedback | 100 | 100 |
| Standard | 200 | 300 |
| Emphasized / sheet / nav | 300 | 300 |
| Travel | 24 | 24 |
| Reduced | 0 | 0 |

Constraints validated in `validateMotionTokens()` (`motion.ts:76`): `instant 0`, `none 0`, `rest 1`, durations ordered `feedback ≤ standard ≤ emphasized`, travel `0–24`, pressed `0.95–1`.

Gesture-tracked motion is not duration-limited while pointer is down; it must settle within `emphasized` on release. No infinite/looping/parallax.

### Reduced motion

`reduceMotion(tokens)` zeros durations and distances, `pressed → 1` (`motion.ts:122`). `ui` respects `useReducedMotion.ts:1`. `Modal` animation is `none` when reduced (`NotificationSheet.tsx:139` pattern becomes system-wide).

### Timings vs budgets

* `TAP_TO_VISUAL_RESPONSE 100ms p95`, `MINIAPP_SPLASH_VISIBLE 50/100`, `BRIDGE_ROUND_TRIP 16ms p95 (one frame)` — host surfaces must not budget away the frame (`policy/budgets.md:44`).

---

## Elevation

* `shadow` + default sheet/bar shadow `offset {0,12} radius 20 opacity 0.22 elevation 10` today — consolidate behind `Surface` primitive; do not re-invent per file.
* `scrim` for consent/modal backdrops (`ConsentSheet.tsx:scrim`). Not exposed to mini-apps.

---

## Remote override path

`app/src/config/appConfig.ts:1` is the one local seam for presentation values that vary by signed payload without changing navigation mechanics. Palette overrides flow through `createPalette(overrides)`; motion overrides through `createMotionTokens(overrides)` — both validated and serializable. Never read overrides directly from a component.

---

## Do / Don't

* Do use `palette.*` / `spacing.*` / `radius.*` / `motion.durationMs.*` / `Text` variants.
* Don't inline hex, numeric padding, or `StyleSheet` font sizes outside `config/` or `ui/foundations/`.
* Don't consume `glass/scrim/shadow` inside tenant-facing tokens or mini-app surfaces.

## Review checklist

- [ ] Palette roles cover all current screens (Home, MiniApp, sheets, TabBar) without needing a literal.
- [ ] Typography variants suffice for `HomeCollection` labels/descriptions + `MiniAppScreen` hero.
- [ ] Spacing/radius scale covers sheet/card/header comps without one-off values.
- [ ] Motion ceilings acceptable — product can tune down, not up.
- [ ] Host-only tokens (`glass/scrim/shadow`) correctly excluded from `tokens.json` tenant section.
