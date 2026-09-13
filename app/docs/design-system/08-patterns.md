# 08 — Patterns

**Depends on:** `00-foundations.md` through `07-forms.md`  
**Composes:** `HomeScreen.tsx:1`, `MiniAppScreen.tsx:1`, `App.tsx:1`, `TrackedScrollView.tsx:1`, `app/src/config/useReducedMotion.ts:1`

Patterns are not new components — they document how the primitives compose into the two host screens and their tracking/a11y contracts. Follow these and you get the system for free.

---

## Home

Composition: `Trusted? no` — Home is host-owned, not a tenant frame.

```
<SafeArea + canvas>                          // palette.canvas, paddingTop insets.top+22 (HomeScreen.tsx:content)
  <HomeHeader>                               // title "Home" heading/bold text + bell IconButton + avatar Avatar
  <Banner|EmptyState> ?firstRun              // constellation prompt "Choose what matters"
  <Section title hint>                       // "Pinned apps" / "For you"
    <Collection layout="constellation|rail|list">
      <CollectionTile ... />                 // selected / editing / badge states (05)
    </Collection>
    <HomeAddCard /> → Button ghost
  </Section>
  <TrackedScrollView trackingResetKey="home">
</SafeArea>
<TabBar.Glass /> + <Sheet><PickerList /></Sheet>
```

* Data: `pinnedMiniAppItems` / `pinnedCategoryItems` via `categoryItem()` / `miniAppItem()` (`HomeScreen.tsx:helpers`); first-run `suggestedItems` from `orderHomeCategorySuggestions(viewerProfile)`.
* Interactions: `onLongPress` (420 ms) → edit; `onPress` → `onOpenMiniApp`; `onRemove` via editing remove button. All `signalNavigationSelection()` via `Pressable`.
* Search/explore: `ExploreSheet` → `Sheet full` + `PickerList filter` (07).
* Tracking: `onScrollDepth` → `tracking.trackHost('screen_scroll_depth'|'mini_app_scroll_depth', { depth_percent })` at thresholds `[25,50,75,100]` (`TrackedScrollView.tsx:scrollDepthThresholds`). Reset keys: `home` vs. `category:id:channel` etc. Keep `trackingResetKey` semantics — regressing them double-counts product events.

## MiniApp frame

```
<TrustedHeader title subtitle onBack onClose />   // 03-navigation, surface + glassBorder bottom
<TrackedScrollView trackingResetKey="${manifest.id}:${currentPath}">
  <Hero glyph eyebrow title body pills />        // 05-data-display hero, canvasAccent
  <Section "Declared pages">                     // Card route rows → Button secondary
  <Section "Approved cross-app links">           // Card rows → Button primary (↗)
  <CardCatalogBody /> ?card
</TrackedScrollView>
```

* Chrome ownership: host owns `TrustedHeader` and back/close wiring (`navigationBroker goBack/closeMiniApps`). Mini-app content is captive inside `TrackedScrollView`; never let a mini-app render a fake back/close bar.
* Route resolution: `samplePath(pattern)` (`MiniAppScreen.tsx:samplePath`) stays host logic — pattern rendering not a design-system concern.

## Consent / Permission

```
<Scrim color="scrim" />
<Modal>                                         // centered, blocking, scrim backdrop
  <Kicker> <Title> <Capability primary>          // Text variants (00)
  <Banner> ?permission rationale                // 06-feedback
  <HStack><Button secondary>Để sau</><Button primary>Cho phép</></HStack>
</Modal>
```

Host-native only — `ConsentSheet.tsx:1` copy keys and ordering preserved. No mini-app JS renders a consent lookalike.

## Notification inbox

```
<Sheet detent="auto" handle>                    // 04-surfaces dynamic height
  <Sheet.Header title="Notifications" />
  <Banner tone="soft|warning" ?needsPermission> // 06
  <FlatList content={notifications} renderItem={Pressable Card} />
  <EmptyState "You're all caught up" />
</Sheet>
<ForegroundBanner />                            // 06 docked top, auto-dismiss
```

`viewabilityConfig itemVisiblePercentThreshold 60 / minimumViewTime 500` drives `onSeen` (as in `NotificationSheet.tsx:viewabilityConfig`). Keep that exact config or product `markSeen` regresses.

## Accessibility

* `touchTarget 48` everywhere via `Pressable`/`Button`/`IconButton`/`CollectionTile` (size.touchTarget).
* `reduceMotion` via `useReducedMotion()` — `Sheet`/`Modal` animations `none`/`fade`, pressed scale neutralized, scroll not jank-injected.
* Screen reader: `GlassTabBar` and `CollectionTile` hints (`Tap to go Home, or long press…`, `Long press to add to Home`) are author-facing labels — keep them on the primitive, not the screen.
* Dynamic Type: `Text` respects font scaling; `Sheet` caps at 90% height so zoomed text still scrolls.

## Tracking composition

Every `TrackedScrollView` must forward `onScrollDepth` and carry a stable `trackingResetKey` (screen identity). Thresholds are exactly `[25,50,75,100]` — central in `TrackedScrollView.tsx` and documented in `app/docs/mini-app-platform-standard.md:Telemetry`. Do not re-define per screen.

## Do / Don't

* Do use `Sheet` + `PickerList` + `CollectionTile` for any new catalog surface — don't add a fourth picker modal.
* Do route every host action through `Button`/`IconButton`/`Pressable` — don't reach for raw `Pressable`/`TouchableOpacity` outside `ui/`.
* Don't add a second motion vocabulary — import `motion.durationMs`/`easing` from foundations.

## Review checklist

- [ ] Home composition covers first-run constellation, pinned rail/list, and explore without extra components.
- [ ] MiniApp frame trusted-header pattern distinct from mini-app content and not replicable inside the WebView.
- [ ] Notification inbox viewability/seen contract preserved.
- [ ] Tracking reset keys + thresholds unchanged from current product pipeline.
- [ ] Reduced-motion and touch-target invariants verifiably kept.
