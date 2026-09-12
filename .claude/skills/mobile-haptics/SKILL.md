---
name: mobile-haptics
description: Own when and how the device vibrates — the taxonomy, intensity, and the gate that prevents haptic spam. Use when you consider adding Vibration.vibrate, Haptics.*, or selectionChanged, when an action changes an entity/resource, or when you feel tempted to "add a little buzz" to something. This skill decides if a haptic should exist; mobile-motion decides how it pairs with visual motion.
---

# Mobile Haptics

## Why this exists

Haptics are the only feedback channel that cannot be ignored, skimmed, or looked away from. A well-placed tap confirms an action the eye already understood; a gratuitous buzz teaches the user that vibration means nothing, and then the important one is missed too.

The failure is not missing haptics — it is every feature adding "a little vibrate" because it felt nice in the prototype. After five such additions, the app buzzes on navigation, on scroll, on success, on failure, and the user's thumb learns to discount it. At that point haptics are not feedback, they are noise, and they cannot be re-earned without an app update that removes most of them.

The second failure is intensity drift: a light tap implemented as `Vibration.vibrate(50)` because it "felt stronger and therefore more premium." On the low-tier device with a weaker motor, that 50ms is already the only intensity the hardware can do — the distinction between *selection* and *impact* is gone.

So the rule is not "haptics are good." It is: **haptics are scarce, typed, and gated.**

## The taxonomy — the only vibrations that exist

Like motion, haptics have a closed vocabulary. No raw `Vibration.vibrate(ms)` outside this file, no ad-hoc durations, no `Haptics.notificationAsync` invented per feature.

| Intent | iOS (HIG) | Android fallback | Duration / Pattern | When it is allowed (and only then) |
|---|---|---|---|---|
| **Selection** | `selectionChanged` / light | `Vibration.vibrate(8)` | 8ms, single | A *reversible* choice among peers: long-press to enter edit mode, moving focus between constellation tiles, toggling a filter. No entity has changed yet. |
| **Success – light** | `notificationSuccess` light / `impactLight` | `Vibration.vibrate(10)` | 10ms | An entity was *created or moved* by the user's explicit action and can be undone: pin category, pin mini-app, reorder. The most common correct haptic — this is what "pin" uses. |
| **Success – medium** | `impactMedium` | `Vibration.vibrate(20)` | 20ms | An entity was *removed* or *destroyed* by explicit action: unpin, remove, delete. Slightly heavier than creation so removal feels deliberate. |
| **Warning** | `notificationWarning` | `Vibration.vibrate([10,30,10])` | pattern | A destructive action *is about to happen* and the sheet is asking for confirmation. Not the deletion itself — the prompt that precedes it, if you show one. Use sparingly. |
| **Error** | `notificationError` | `Vibration.vibrate([10,30,20])` | pattern | The user's action *failed* due to a system constraint, not a validation message: persistence failed, limit reached (e.g. max pinned categories). Not for form errors. |
| **Heavy impact** | `impactHeavy` | `Vibration.vibrate(30)` | 30ms | Reserved for *physical metaphor* — e.g. a sheet hitting its limit, a drag hitting an edge. Almost never used on this app. If you think you need it, you probably need medium. |

Durations above are ceilings. iOS ignores duration and plays its curated waveform; Android plays the duration literally. Keep Android within the same perceptual family by staying inside these numbers — 50ms on Android is already heavy impact and will feel wrong on iOS.

If the action does not fit a row, it does not get a haptic. Navigation, scroll, pure viewing, typing, and success that is *system-driven* (sync finished, push received) are never haptic.

## The gating rule — the kill

**Adding a haptic is a gate. Proposing one requires a user (PM/design) decision on the same ticket, and the reviewer who is blocked by the gate cannot be the approver.**

Why a gate and not a lint: a lint can check *how* a haptic is played (tokens, thread), but it cannot check *whether* the moment deserved one. That is taste and product judgment, and taste that ships without a second pair of eyes is how every screen acquires a buzz.

Practically:

- A PR that adds `signalHaptic(` or `Vibration.vibrate` must have a linked design review or an explicit "haptic: approved" comment from the feature owner. CI tags the diff and fails without the label (`conformance: haptic addition without approval`).
- Removing a haptic needs no gate — ratchet down freely. Loosening (heavier intensity) is a gate.
- A haptic that is not in the table needs the table updated first, then the usage — never the reverse. If the table cannot justify the new row, the usage does not survive review.

This is the "ask user before adding haptic on any feature" the request asked for. Not a suggestion — a check that blocks.

## How to implement — also a kill

1. **No raw vibration outside the facade.** All haptics go through `src/native/haptics.ts` (`signalSelection`, `signalSuccess`, `signalRemoval`, etc.). Direct `Vibration.vibrate` or `Haptics.impactAsync` elsewhere fails CI (grep). One file owning the mapping means the mapping can be tuned for the device's motor without hunting.

2. **Intensity is not a parameter.** Callers do not pass `duration` or `style`. They call `signalSuccess()` and the facade chooses 8ms vs 10ms vs the native waveform. A component that chooses its own intensity has already decided it is special.

3. **Respect system settings.** iOS `UIFeedbackGenerator` is automatically suppressed when system Haptics are off; Android must check `Settings.System.HAPTIC_FEEDBACK_ENABLED` or simply follow `Vibration` — the platform already does. Do not add a bypass. Also respect `reduceMotion`? No — haptics and motion are independent; a user who disables motion may still want confirmation. Only suppress if the system haptic setting is off.

4. **Never haptic on render.** Haptics fire only in direct response to a user gesture (`onLongPress`, `onPress` of the `−` badge, `onRemove` commit). Firing in `useEffect`, on mount, or on prop change is a bug — it buzzes when the user did nothing. Grep for `signal*` inside `useEffect`/`render`.

5. **Pair with motion, do not replace it.** Every haptic must have a simultaneous visual confirmation (scale, jiggle, badge appear). A buzz without a visual is inaccessible to users who have haptics off and surprising to those who don't expect it.

## Pairing with motion (the 100ms window)

Motion explains, haptics confirms. They fire together, with the haptic at the *commit* point:

- **Long-press to edit:** `onLongPress` fires → `signalSelection()` (8ms) + tile enters jiggle (1.5° oscillation, 200ms period) + `−` badge scales in 100ms feedback. The haptic is the *enter* signal, not the remove.
- **Pin (creation):** commit `onPin*` → `signalSuccessLight()` (10ms) + newly pinned tile scales 0.96 → 1 with 100ms feedback, then settles. The list item that was long-pressed shows the `✓` state.
- **Unpin/remove (destruction):** tap `−` → `signalRemoval()` (20ms) + tile scales 1 → 0.96 → fades out 200ms standard, gap collapses. Slightly heavier than creation so the destructive nature is felt.

Do not add a second haptic on the subsequent navigation or toast. One haptic per user intention.

## What does not belong here

- **Motion choreography.** `mobile-motion` — direction, origin, duration. This skill only says if/when a haptic accompanies it.
- **Timing budgets.** `mobile-smoothness` — haptics are cheap, but a haptic that blocks the UI thread still violates the frame budget.
- **Generic feedback or toast copy.** `design` — the visual confirmation that must accompany every haptic is design taste.

## Hand off

`mobile-motion` for the visual that must co-occur. `human-gate` for the approval that must precede any new `signal*` call. `verify` with a haptic report: what changed (entity/resource), why this intensity, and the linked approval.
