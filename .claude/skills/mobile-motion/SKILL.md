---
name: mobile-motion
description: Own the choreography of appearing/disappearing UI — why a component moves, where it comes from, how it explains its source — and the kill that enforces it. Use when something fades, slides, scales, or a sheet/modal appears, when an animation feels surprising, or when you add or change any Animated/Reanimated/NativeDriver usage. This skill owns the spatial model; mobile-smoothness owns the timing budgets it must not exceed.
---

# Mobile Motion

## Why this exists

Most animation work optimizes the curve and ignores the vector. A sheet that fades in from nowhere is technically smooth and still disorienting, because the user cannot answer *why* it appeared. The same sheet sliding up from the CTA that was just tapped is instantly legible, even at the same duration, because the motion carries the causal link.

The failure is not jank — it is surprise. A component that appears without a traceable source forces the user to re-scan the screen to rebuild their spatial model. Do that twice and the app feels arbitrary, however fast its frames are. The fix is not more animation, it is animation that *explains*.

The opposite failure is choreography for its own sake: parallax, bounce, staggered entrances that look polished in a prototype and become exhausting at the thirtieth repetition. Motion has exactly three jobs — immediate feedback, explaining hierarchy, preserving spatial continuity — and any motion that does not serve one of them is outside the vocabulary.

## The principle: every appearance has a source

**No component appears without an identifiable source. The animation vector is source → destination.**

If the user cannot point at the pixel that *caused* the appearance, the animation is wrong, regardless of how smooth it is. The source is always one of:

- **A CTA or affordance the user just touched** (most common)
- **A trigger element that expands** (small card → large detail)
- **The screen edge that owns the layer** (system sheet, nav)

If you cannot name the source, you are not ready to animate.

## The spatial model

Think of the screen as a stack of layers with a single, stable axis:

- **Bottom owns transient layers** — sheets, pickers, modals triggered from the tab bar or a bottom CTA. They enter by sliding *up* from off-screen bottom toward the center, and leave by sliding *down*. Distance is not 24px — it is the sheet's own height. This is the only motion that uses full travel.
- **Center owns expansions** — a small tile that becomes a larger surface. It enters by scaling *out* from the trigger's bounds to its final bounds while fading in, and collapses back to the trigger. The eye tracks the growing rectangle.
- **Lateral owns navigation** — list → detail, or tab → tab. It slides on the X-axis by at most 24px (the `medium` distance token) with a 300ms emphasized budget. The outgoing screen exits opposite the incoming one so the stack direction is unambiguous.
- **In-place owns content swaps** — filter change, tab content update. It fades through (fade out 100ms → fade in 200ms), no travel, no scale.

A sheet that scales in from the center breaks the model as badly as a card that slides in from the bottom. The budget may still pass, but the user is lost.

## Taxonomy — the only motions that exist

| Source → Destination | Motion | Duration | Easing | Travel/Scale | Example |
|---|---|---|---|---|---|
| Bottom CTA/tab → sheet/modal | **Slide Y** from off-screen bottom | `emphasized` 300ms | `enter` on appear, `exit` on dismiss | sheet height | Explore, category picker, notification inbox |
| Small trigger → larger surface | **Scale + fade** from trigger bounds | `emphasized` 300ms | `enter`/`exit` | `rest 1` → `pressed 0.98` reversed + fade | Home tile → detail, constellation → list |
| List item → detail | **Shared axis X** | `emphasized` 300ms | `standard` | `medium` 24px | Category → mini-apps |
| Same layer content change | **Fade through** | `feedback` 100ms + `standard` 200ms | `standard` | none | Filter, search results |
| Any press | **Feedback** | `feedback` 100ms | `standard` | `pressed` 0.98 | Every tappable tile/card |

Anything not in this table — parallax, bounce, stagger, rotation, parallax — is not part of the vocabulary. Propose it and it must go through a gate, because the default outcome of "just this once" is forty such animations that each felt reasonable in isolation.

## Budgets are ceilings, not targets

Motion tokens live in `src/config/motion.ts` and are the *implementation* of `policy/budgets.md` motion budgets (`mobile-smoothness` owns the numbers):

- `durationMs` — 0/100/200/300, with `instant` forced to 0, ordered feedback < standard < emphasized, all capped at 300.
- `distance` — 0/4/12/24, capped at 24 for non-gesture travel (except bottom sheets, which travel their own height — this is the single exception and is explicitly called out).
- `scale` — 1 → 0.98.
- `easing` — standard `[0.2,0,0,1]`, enter `[0,0,0,1]`, exit `[0.3,0,1,1]`.

Product config may tune *downward* via overrides; it may never exceed ceilings, add a curve, or invent a duration. A `reduceMotion` variant forces all durations and distances to 0 and scale to 1 — sheets still appear, but with no travel and no time. If an animation is essential when reduced-motion is on, it was too clever.

## How to implement — the kill

The kill is not a person in review. It is a set of mechanical checks that make the wrong thing fail the build:

1. **No hardcoded animation values.** Duration, distance, easing, and scale must be read from `createMotionTokens()` / `useReducedMotion()`. Grep for `duration: 250`, `Animated.timing({ duration:` with a literal, or `easing: [0.4, 0, ...]` outside `motion.ts`. Those fail CI (`policy/conformance.md` — motion token lint). One file owning the numbers means one number, not three.

2. **Every animated appearance declares its source.** The component that triggers the appearance owns the animation. A sheet rendered without `origin: 'bottom'` (or `originBounds` for expand) is a missing source. In code this surfaces as a required prop: `<Sheet origin="bottom">`, `<Expand fromBounds={triggerRect}>`. A modal with `animationType="fade"` and no origin is rejected.

3. **Off the JS thread or it will jank when it matters.** Any `Slide`, `Scale`, or `Shared axis` motion must use the native driver (`useNativeDriver: true`) or a Reanimated UI-thread worklet. `PanResponder` + JS-thread interpolation is a frame-budget bug waiting for the low-tier device. `mobile-smoothness` measures it; this skill forbids the construction that causes it.

4. **Reduced motion is not a branch, it is a transform.** Call `useReducedMotion()` and feed its result to the same component. Do not write `if (reduceMotion) return <View>` — that forks the UI and the fork is never tested. The token transform (`reduceMotion()` returning zeros) keeps one tree.

5. **Dismiss is the reverse of appear.** If a sheet slides up on enter, it slides down on exit with the *same* duration/easing, reversed. A sheet that slides up to appear and fades to dismiss breaks the spatial promise. The component must own both directions.

When any of these is violated, the change does not ship — not because a reviewer caught it, but because the lint/test did. A warning is a breach that ships.

## Reduced motion and accessibility

- All distance and duration tokens become 0; scale becomes 1. Content is still discoverable, but instantly. Do not gate *information* behind motion — a badge that only appears after a slide is invisible when reduced-motion is on.
- Motion never carries meaning alone. A state change announced only by slide or scale also changes text, icon, or `accessibilityState`.
- The host reads the system Reduce Motion preference and injects the reduced token set to every mini-app. Mini-apps do not re-implement the check.

## Worked examples

**Bottom CTA → sheet.** CTA at screen bottom → `ExploreSheet` / `HomeCollectionPickerModal`. Sheet `origin="bottom"`, `enter: slide Y` from `translateY: sheetHeight` to `0`, `emphasized 300ms`, `easing.enter`, native driver. Dismiss: same reversed with `easing.exit`. Background scrim fades 200ms `standard`. No scale.

**Small tile → larger surface.** Tap a 32% constellation tile → it scales from its measured bounds to the list layout. Measure trigger `onLayout` rect, pass as `fromBounds`, animate `scale` from `triggerWidth/destWidth` → 1 and `translate` from trigger center → dest center, plus fade. 300ms emphasized.

**Long-press edit mode.** Trigger is the pressed tile itself → minus badge scales in from `0` → `1` with 100ms feedback + fade, tile enters subtle jiggle (see haptics skill for the accompanying tap). Not a slide — the source is the tile's own corner.

## What does not belong here

- **Timing budgets and measurement.** `mobile-smoothness` owns the numbers and the trace markers; this skill only says how to spend them.
- **Haptic choreography.** `mobile-haptics` — motion explains, haptics confirms. They are paired but owned separately.
- **Component API design.** The sheet/modal component owns its props; this skill only constrains which props must exist.
- **Generic performance or navigation architecture.** `mobile-architecture` and `verify`.

## Hand off

`mobile-smoothness` for the budgets this choreography must not exceed. `mobile-haptics` for the confirming tap that accompanies the visual. `verify` with a motion report naming the appearance, its source, and the token used — "slide from bottom, emphasized 300ms, native driver" is checkable, "smooth" is not.
