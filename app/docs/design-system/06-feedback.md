# 06 — Feedback

**Depends on:** `00-foundations.md`, `01-primitives.md`  
**Replaces:** `ForegroundNotificationBanner.tsx:1`, `NotificationSheet.tsx:permission` banner, empty/loading states in `HomeScreen.tsx:68`, `MiniAppScreen` error slots

Feedback tells the user what happened and what to do next. It uses only semantic colors (`success/warning/danger/primary`) — no literal reds.

---

## Banner

Inline surfaces for permission/status prompts. Today `NotificationSheet` renders a permission CTA (`needsPermission ? primarySoft`) and `HomeScreen` renders first-run hints.

```tsx
import { Banner } from '@/ui/feedback/Banner';

<Banner tone="soft" title="Enable alerts" actionLabel="Enable" onAction={requestPermission}>
  Inbox delivery works now. Allow system alerts when the app is away.
</Banner>
<Banner tone="warning" title="Alerts are off" actionLabel="Settings" onAction={openSettings}>
  Turn on notifications in system settings to receive alerts.
</Banner>
```

Tones: `soft` (`primarySoft`/`primary`), `warning` (`warning` bg soft), `danger`, `info` (`canvasAccent`). `tone` controls `bg` + `title`/`body` colors.

Layout: `radius lg 20`, `padding md 16`, `gap xs 8`, title `label/bold text`, body `body/mutedText`, action `Button ghost sm` or inline `Text primary bold`.

Current usages consolidated: `NotificationSheet.tsx:permission`, foreground inline prompts.

## Toast (lightweight)

For transient confirms (e.g., `Added to Home`). Not a modal — auto-dismiss `~2500ms`, `standard 200` in/out, `reduced → 0`. Today handled via in-place UI — introduced here to avoid ad-hoc `setTimeout` toasts per screen.

```tsx
<Toast tone="success" message="Added to Home" />
```

`bg surfaceElevated`, `shadow`, `radius lg 20`, `padding sm/md`, `Text body/medium`.

## ForegroundNotificationBanner

Becomes a `Banner` variant docked top with auto-dismiss, not a separate atom.

```tsx
<ForegroundBanner notification={item} onPress={activate} onDismiss={dismiss} />
```

Spec from `ForegroundNotificationBanner.tsx`: slides from top under safe area, `surfaceElevated` bg, tap goes to notification target via `openNotificationMiniApp`.

## EmptyState

For `FlatList empty` (`You're all caught up` in `NotificationSheet.tsx:empty`) and empty search/catalog results.

```tsx
<EmptyState
  glyph="✦"
  title="You're all caught up"
  body="New updates will appear here."
  action={<Button ghost onPress={onExplore}>Explore mini-apps</Button>}
/>
```

Centered, `padding xl 32`, `glyph primary 28`, `title heading/bold text`, `body body/mutedText`.

## Loader

For `HomeScreen` `Loading your Home…` and pinned-rail skeletons.

```tsx
<Loader label="Loading your Home…" />
<Skeleton count={3} layout="rail" />
```

`Loader` is `ActivityIndicator` + `Text label mutedText`. `Skeleton` reuses `Card`/`CollectionTile` shapes with `canvasAccent` shimmer placeholder (no extra dependency).

## Inline status (permission granularity)

Permission banners distinguish `not_determined` (`Enable alerts` → request) vs `denied` (`Alerts are off` → Settings) per `NotificationSheet.tsx:needsPermission` / `permissionWasDenied`. That branching stays in `Banner` props, not forked components.

## Review checklist

- [ ] Banner tones sufficient (soft/warning/danger) vs. adding a literal alert red.
- [ ] Toast timing acceptable (2.5 s) and respects `reducedMotion`.
- [ ] EmptyState copy (`You're all caught up`) final vs. longer guidance.
- [ ] Loader vs skeleton preference for Home pinned sections.
