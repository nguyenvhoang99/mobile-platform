# Mini-app platform standard

**Status:** Draft platform standard, version 0.1  
**Applies to:** the native shell, React Native host surfaces, the future mini-app
container and SDK, and every first- or third-party mini-app  
**Normative terms:** **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are requirements,
recommendations, and options respectively.

## Contract status

This document defines the implementation and review standard. It is not yet a published
mini-app SDK contract.

The current capability registry is empty and the native origin-bound mini-app container
does not exist. Therefore, no external mini-app can request a device capability today.
Host-internal location, microphone, biometric, network-status, and notification code does
not change that fact. A capability becomes available to authors only when its registry
entry, native handler, manifest validation, SDK type, error contract, documentation,
audit tests, and conformance checks ship together.

Authority is deliberately split:

| Concern                                                     | Source of truth                  |
| ----------------------------------------------------------- | -------------------------------- |
| Capability existence, risk, consent, quotas, and tier reach | `../../policy/capabilities.yaml` |
| Timing, memory, artifact, telemetry, and motion budgets     | `../../policy/budgets.md`        |
| Machine-enforced boundary invariants                        | `../../policy/conformance.md`    |
| Current host color, layout, type, and motion values         | `../src/config/`                 |
| Current host navigation and telemetry declarations          | `../src/miniapps/catalog.ts`     |

If this document conflicts with one of those sources, the narrower source wins and this
document must be corrected.

## Platform principles

1. **The host owns trust.** Mini-app content must never imitate or replace permission,
   authentication, payment, notification, account, safety, or cross-app confirmation UI.
2. **The bridge is the only door.** No direct device API, filesystem, storage, network,
   new window, foreign navigation, or secondary message channel is allowed.
3. **Declare before use.** Pages, egress hosts, capabilities, public entrypoints,
   cross-app links, and tracking events are review-time declarations.
4. **Collect the least useful amount.** Prefer a picker, a derived result, a coarse value,
   or an expiring handle over bulk or raw data.
5. **One design language, semantic tokens.** The product palette may change without
   mini-app code changing. Literal product colors and private copies of the motion system
   are not allowed.
6. **Accessibility is behavior, not decoration.** Every core task works with large text,
   screen readers, reduced motion, and without a hidden gesture.
7. **All authority expires.** Consent, capability handles, package approval, and server
   grants are revocable and rechecked outside mini-app JavaScript.

## Package and manifest standard

A submitted mini-app MUST be an immutable, signed package. Runtime script download,
dynamic evaluation, remote code disguised as configuration, and unsigned subresources
are blocking review failures.

The eventual machine-readable manifest MUST declare:

- a stable app ID, human semantic version, monotonic machine version, publisher, and
  build provenance;
- every package page and a single root route;
- the minimum supported platform and WebView feature set;
- each capability with a version, localized purpose key, and requested consent scope;
- exact egress hosts, with no wildcard;
- public entrypoints and the sources allowed to open them;
- reviewed cross-app links and the input keys each link accepts;
- tracking event names, versions, priorities, and allowed data keys;
- supported locales, default locale, content rating, privacy-policy version, and data
  retention declaration.

The platform derives CSP and native egress policy from the same manifest. A declaration
does not grant authority; it makes the request reviewable. Declared-versus-actual mismatch
is rejection, not a warning.

## Privacy and native-capability standard

### Required request lifecycle

Every privacy or device request follows the same host-enforced sequence:

```text
meaningful user gesture
  → frozen capability handshake says the operation exists
  → G1: signed manifest declaration + review grant
  → G2: user consent for this mini-app in host-native UI
  → G3: host app's OS permission, only if still required
  → native execution with quota and lifecycle checks
  → append-only audit record
  → exactly one typed result
```

The three gates MUST run in that order and MUST NOT be implemented in mini-app code.
Identity, origin, app ID, user ID, publisher tier, and authority tokens MUST be derived by
the native container; a request payload cannot supply them.

The reviewed manifest supplies the purpose shown to the user. A mini-app MUST NOT send
prompt copy at runtime. This prevents one reviewed purpose from being replaced by another
after publication.

A request MUST:

- follow a recent user gesture inside the foreground, main-frame mini-app;
- ask at the first meaningful use, never at mini-app launch;
- request one coherent user outcome rather than a bundle of speculative permissions;
- terminate once with success, user cancellation, a typed denial, timeout, revocation,
  rate limit, invalid input, or an explicitly uncertain result;
- stop live access when the mini-app backgrounds, closes, is revoked, or loses its scope;
- use host-minted, instance-scoped handles for resources and large results.

The error contract MUST keep temporary consent denial separate from permanent consent
denial, and temporary OS denial separate from permanent OS denial. Unknown future codes
must fall through to a generic failure. Mini-apps may not automatically loop, re-prompt,
or open Settings.

### Consent UI

The host-native consent surface MUST show:

- the verified mini-app name and publisher;
- the specific capability and reviewed purpose;
- what data is returned, at what precision, and for how long;
- the requested scope: once, while using, session, or persistent;
- a clear Continue action and an equally reachable Not now action.

Persistent scope requires an explicit reviewer grant. A denial must leave the mini-app
usable through a fallback wherever its core value does not strictly require the feature.

When a platform picker already represents an explicit user choice, the picker is the
consent action; do not show a redundant consent sheet before it. When an OS permission is
needed, show a host rationale before spending the host app's shared OS prompt. After a
permanent OS denial, explain the fallback and offer a user-triggered route to host Settings;
never trigger repeated OS prompts.

Camera, microphone, and location use MUST have a host-owned live indicator naming the
mini-app, with a stop control and an inspectable per-app access history.

### Preferred capability shapes

| User need                        | Preferred capability                          | Data returned                                  | Rules                                                                                                                    |
| -------------------------------- | --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Call an app backend              | Host-mediated request to exact manifest hosts | Sanitized response or expiring body handle     | No cookies, host credentials, referrer, wildcard hosts, raw sockets, or direct `fetch`                                   |
| Know connectivity                | Coarse host network state                     | Offline, constrained, cellular, or Wi-Fi class | There is no user-facing Wi-Fi/cellular permission prompt; do not expose SSID, BSSID, carrier IDs, or local-network peers |
| Current weather                  | One-shot current location, coarse by default  | Coarse coordinates or a host-derived region    | Precise location is a separate reviewed purpose; continuous and background location are separate high-risk capabilities  |
| Scan a code                      | Host-owned scanner                            | Decoded value                                  | Camera frames never cross the bridge                                                                                     |
| Take a photo                     | Host-owned capture or system picker           | Expiring image handle                          | No raw path, bulk library, or silent capture                                                                             |
| Turn speech into a command       | Host-owned speech capture                     | Final text and confidence metadata             | Prefer transcription over raw audio; visible microphone indicator; stop on background or cancellation                    |
| Record audio                     | Explicit host recorder                        | Expiring audio handle                          | Higher risk than transcription, duration-bounded, no silent/background recording                                         |
| Authenticate or approve          | Sign a host-minted challenge                  | Hardware-backed assertion                      | Never biometric material or a `true`/`false` result supplied as authority                                                |
| Choose a contact, file, or photo | Platform picker                               | Selected, scoped handle or fields              | Pickers only; never bulk enumeration                                                                                     |
| Send notifications               | Host notification subscription flow           | Subscription state only                        | Push tokens and raw payloads never enter a mini-app                                                                      |

Adding any capability changes the security posture and public contract. It requires a
human gate, named owner, support horizon, quota, audit level, error set, consent class,
trust-tier decision, broker-first analysis, abuse cases, and an explicit list of what is
not exposed.

## Trusted chrome and navigation

The native shell owns the status area, mini-app identity header, back/close controls,
global navigation, account, permission activity indicators, foreground notification UI,
and all security-sensitive sheets.

Mini-app content MUST:

- stay below the host identity boundary and safe-area insets;
- navigate only to declared package routes;
- ask the host broker to open a reviewed public entrypoint in another mini-app;
- preserve its own page history without intercepting the host close action;
- avoid UI that looks like an OS prompt, host header, account screen, notification banner,
  payment sheet, or another mini-app;
- never open a foreign origin, arbitrary URL, new window, or platform intent.

Cross-app input is a small allowlisted value object. It contains no credentials or user
identity, and the destination validates it against its entrypoint declaration. Sensitive
or surprising transfers require a host-owned confirmation. Return is stack-based: closing
the destination restores the source mini-app state.

## Shared design system

### Token delivery

All host and mini-app UI consumes semantic tokens. Current sources are:

- `../src/config/palette.ts` for colors;
- `../src/config/layout.ts` for spacing, radius, type, and minimum control size;
- `../src/config/motion.ts` for duration, easing, travel, and pressed state;
- `../src/config/miniAppDesignTokens.ts` for the safe, serializable mini-app snapshot.

The container will freeze a versioned token snapshot before author code runs. A future
SDK may expose the same snapshot as typed JavaScript values and CSS custom properties,
but those exact public names do not ship until the native container enforces them.

Signed product configuration MAY replace semantic values. It MUST NOT add unknown tokens,
expose host-only tokens, weaken accessibility, or change security behavior. A theme update
is atomic; components must never render a mixture of old and new values.

### Color palette

Mini-apps receive content-safe semantic colors for canvas, surface, elevated surface,
border, primary action, primary-soft selection, text, muted text, inverse text, success,
warning, danger, focus, and disabled states.

Glass, glass border, scrim, shadow policy, and status-bar style are host-only. Liquid Glass
is the shell's navigation and trusted-layer treatment, not a texture mini-apps can use to
imitate host chrome.

Rules:

- Use `primary` for the main action and selected state, never as the only status signal.
- Use success, warning, and danger tokens only for their semantic meaning.
- Pair every state color with text, an icon, shape, or accessibility state.
- Text meets WCAG 2.2 AA contrast: 4.5:1 for normal text and 3:1 for large text; meaningful
  controls and focus indicators meet non-text contrast requirements.
- `onPrimary` and `onDanger` are paired tokens; never assume white works on a configured
  color.
- Mini-app brand art may keep its own colors inside content, but interactive controls use
  platform semantics. Per-mini-app theme overrides are not part of version 1.

### Layout and typography

- Use the shared spacing and radius scale; do not create near-duplicate values locally.
- Interactive regions are at least 48 by 48 logical pixels, even when the visible icon is
  smaller.
- Respect safe areas and keyboard insets. Content reflows instead of relying on a single
  screen size or orientation.
- Use system fonts and the shared type roles. Do not render essential copy as an image.
- Text supports system scaling up to 200% without clipping, overlap, or lost actions.
- Lists use platform virtualization, stable item identity, skeletons only for genuine
  loading, and pagination for unbounded data.

### Component patterns

The platform component vocabulary is intentionally small:

- layout: Screen, Stack, Inline, Divider, ScrollRegion;
- actions: Button, IconButton, Link, SegmentedControl;
- content: Text, Icon, Avatar, Card, ListRow, Badge;
- input: Field, SearchField, Checkbox, Radio, Switch, Date/Time picker;
- feedback: Progress, Skeleton, InlineError, EmptyState, Toast;
- overlays: Sheet and Dialog.

Each component MUST define default, pressed, focused, selected, disabled, loading, error,
and screen-reader states where applicable. Async actions acknowledge immediately, prevent
accidental duplicates, remain cancellable when possible, and expose completion or failure.
Destructive actions need confirmation or a safe undo path.

Protected components—ConsentSheet, CapabilityIndicator, MiniAppFrame, PaymentSheet,
CrossAppConfirmation, NotificationBanner, Account, and system Settings routing—are
host-only and are never included in the mini-app component kit.

Until the cross-runtime component kit exists, mini-app teams may implement content
components locally using the shared tokens and behavior rules. They may not introduce a
second token vocabulary or protected-looking component.

## Motion and animation standard

Motion has three allowed purposes: immediate feedback, explaining hierarchy, and
preserving spatial continuity. Decorative autoplay, infinite animation, parallax, large
background travel, repeated oscillation, and attention-stealing bounce are outside the
platform vocabulary.

| Token        | Intended use                                     | Default |
| ------------ | ------------------------------------------------ | ------: |
| `instant`    | reduced motion and discontinuous state changes   |    0 ms |
| `feedback`   | press, toggle, highlight, acknowledgement        |  100 ms |
| `standard`   | local state and content transitions              |  200 ms |
| `emphasized` | navigation, modal, sheet, large hierarchy change |  300 ms |

The motion budget and ceilings live only in `../../policy/budgets.md`. The code token file is
their implementation.

Rules:

- A press changes visual state immediately; animation duration does not delay feedback.
- Gesture-driven motion tracks the finger directly. On release it settles within the
  emphasized ceiling and in the same spatial direction.
- Prefer compositor-safe opacity and transform. Do not animate layout, large blur regions,
  image decoding, or per-frame JavaScript work on a critical interaction.
- Host React Native motion uses the platform-native animation driver for transform and
  opacity. Mini-app web content uses CSS or the Web Animations API with the same tokens.
  These are two runtime drivers for one motion contract, not two design systems.
- Motion is interruptible and starts from the current visual state after interruption.
- Do not use animation as the only indication that something changed.
- The host reads the system Reduce Motion preference and supplies effective zero-duration,
  zero-travel, no-scale tokens to every mini-app. Fades may be used only when they do not
  delay interaction or hide state.
- Theme or token changes do not animate automatically.

## Accessibility and input

The host and every mini-app target WCAG 2.2 AA behavior and platform accessibility APIs.
Apple and Android guidance are useful platform checks: [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/),
[Android app accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views),
and [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Every release MUST verify:

- meaningful accessible names, roles, values, states, and logical focus order;
- VoiceOver and TalkBack traversal without focus traps;
- large text, display zoom, bold text, high contrast, reduced transparency, and reduced
  motion where available;
- portrait and landscape where the mini-app declares both;
- no information conveyed only through color, motion, sound, hover, or haptics;
- captions or text equivalents for meaningful audio and video;
- tap or menu alternatives for swipe, drag, long-press, shake, and multi-touch actions;
- external keyboard and switch access for primary tasks where the platform supports them.

The existing host's swipe and long-press customization flows need explicit visible or
accessibility-action alternatives before this requirement can be marked enforced.

## Localization and content

- User-facing strings live in localized resources, not manifests as arbitrary runtime
  text and not concatenated fragments.
- The manifest declares a default locale and every supported locale. Consent purpose text
  is reviewed per locale.
- Layout supports right-to-left direction, long translations, locale-specific number,
  date, time, currency, name, and address formats.
- A mini-app may use its own voice in content, but host-owned security language remains
  host-owned and consistent.
- Error messages say what happened and what the user can do next. Raw native, network, or
  server error strings never reach UI.

## Loading, offline, empty, and failure states

Every screen with asynchronous content defines:

- initial loading with a stable layout;
- refresh without replacing usable content with a full-screen spinner;
- empty state with a relevant next action;
- offline state that preserves cached or locally committed work;
- retryable failure with bounded backoff;
- permanent or permission failure with a non-looping fallback;
- cancellation and uncertain completion for operations that may already have landed.

State that must survive WebView eviction is serialized through a bounded host contract.
Mini-apps cannot depend on cookies, localStorage, IndexedDB, or an always-live process.

## Network, storage, and data handling

- Network access is host-mediated, restricted to exact manifest hosts, quota-controlled,
  stripped of host credentials, and independently revocable.
- Persistence is a per-mini-app, per-user host capability with a quota. No cookies,
  localStorage, IndexedDB, raw filesystem paths, or cross-app storage.
- Sensitive results use short-lived handles and are erased when the purpose, scope, or
  retention period ends.
- Logs contain result codes and argument digests, never raw location, transcript, image,
  audio, contact, credential, notification content, or request body.
- User profile fields such as age or sex are not automatically shared with a mini-app.
  A separate reviewed contract and user-visible purpose would be required.
- Clipboard reads require an explicit paste action. Background work is host scheduled and
  cannot be requested as a generic primitive.

## Tracking and notifications

Mini-app events are declared in the signed manifest. The host derives event ID, app ID,
app version, session, timestamp, anonymous per-app user ID, network class, priority, and
consent version. A mini-app supplies only the declared event name/version and allowlisted
event data.

Tracking MUST NOT contain raw capability inputs or results. Scroll is recorded as bounded
depth milestones or view impressions, never per-frame telemetry. Host safety, capability
audit, and operational events cannot be disabled or reprioritized by a mini-app.

The host owns push tokens, delivery presentation, inbox state, foreground banners, and
notification-to-entrypoint validation. A mini-app may request a reviewed subscription or
schedule operation later, but never receives provider tokens or arbitrary push payloads.

## Performance and lifecycle

- Every animation and interaction is measured against `../../policy/budgets.md` on the low
  reference-device tier. Tail percentiles matter; averages do not.
- A capability that cannot answer within the bridge round-trip budget becomes an async
  operation and reports completion later.
- Scroll handlers do not bridge per frame. Streams coalesce and drop stale values rather
  than growing queues.
- Images are sized for display, decoded off the main thread, and never moved as large raw
  bridge payloads.
- The host may suspend or evict a mini-app at any time. The mini-app handles foreground,
  background, memory pressure, connectivity change, theme change, consent revocation, and
  termination without losing committed user work.
- Long-running camera, microphone, location, and sensor access terminates on background
  unless a separately reviewed capability explicitly permits otherwise.

## Security, review, and operations

Every submission passes package integrity, schema validation, declared-versus-actual
analysis, dynamic-code rejection, privacy review, capability diff, accessibility checks,
and performance smoke tests. Non-first-party releases use staged rollout with predeclared
halt conditions.

The platform maintains kill switches and expiring server authority at version, mini-app,
capability, and publisher scope. Revocation closes streams and invalidates handles
immediately. High-risk capabilities fail closed when their server grant is stale.

Publishers require a verified identity, reachable incident contact, privacy policy,
retention statement, and security-response commitment. Trust tier belongs to the
publisher, not to a single app or launch deadline.

## Definition of conforming

A mini-app is conforming only when all applicable checks pass:

- package and both signatures verified before any script runs;
- manifest validated by the same schema the author received;
- all pages, hosts, capabilities, links, and events are declared and actually used;
- no unavailable web feature or direct device/network/storage access is attempted;
- capability requests satisfy gesture, gate order, scope, quota, audit, lifecycle, and
  typed-result rules;
- design uses only the supplied semantic tokens and no protected-host imitation;
- accessibility, localization, loading, offline, and failure state checks pass;
- performance and package budgets pass;
- privacy declarations match observed data movement;
- staged rollout and revocation metadata exist.

## Enforcement rollout

| Area                                                          | Current state                     | Required before external mini-apps                                      |
| ------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Semantic host palette                                         | Implemented                       | Validate signed theme input and contrast in CI                          |
| Shared layout, typography, and motion tokens                  | Implemented baseline              | Consume them throughout host UI and expose a frozen container snapshot  |
| Reduced-motion token transform                                | Used by current host modals       | Bind the same preference to the future container snapshot               |
| Safe mini-app token subset                                    | Implemented utility               | Inject only after verified package setup                                |
| Navigation declarations and tracking allowlists               | Implemented for host demo catalog | Move to signed machine-readable manifest schema and pipeline validation |
| Native host device access                                     | Host-only                         | Do not expose; add capabilities individually through the gated process  |
| Origin-bound native capability bridge                         | Not implemented                   | Required                                                                |
| Three-gate consent enforcement and access history             | Not implemented                   | Required                                                                |
| Shared cross-runtime component kit                            | Not implemented                   | Required for full UI conformance; protected components remain host-only |
| Accessibility alternatives to host gesture-only customization | Partial                           | Required for host conformance                                           |
| Package signing, review, rollout, and revocation pipeline     | Not implemented                   | Required                                                                |

This table is intentionally candid. A standard becomes a platform contract only where
the boundary enforces it; external publication remains blocked until the mandatory rows
are complete.
