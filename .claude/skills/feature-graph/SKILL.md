---
name: feature-graph
description: Visualize feature dependency trees after every change — feature→feature, feature→components, feature→permissions. Use when implementing or modifying any host feature, adding/removing a component, or changing a bridge capability/permission. Generates and refreshes app/docs/feature-graph.{json,md,html}. Scope is strictly those three relationship types; no architecture, sequence, or infrastructure detail.
---

# Feature Graph

## Why this exists

You are new to this codebase. After each change you need a one-page answer to three questions without reading every file:

1. **What calls what** — feature→feature edges.
2. **What renders or owns what** — feature→components (screens, components, services, native modules).
3. **What authority it needs** — feature→permissions (bridge capabilities, OS permissions, deviceAccess kinds, trust tier).

Without an auto-refreshed graph, those answers rot one PR after you write them. This skill exists to rebuild them mechanically after every implementation so the visual stays true.

**Scope discipline:** This skill covers only the three relationships above. Anything else (file-tree, sequence, budgets, tenancy deep-dives) belongs in `architecture-visual.*` or `CLAUDE.md` layers. Do not let this doc sprawl.

## When to invoke

* After adding, removing, or moving any feature code.
* After adding/removing/renaming a component, screen, hook, or service.
* After touching `policy/capabilities.yaml`, `src/bridge/registry.ts`, `src/native/deviceAccess.ts`, or any `src/bridge/handlers/*` / `src/native/*`.
* Before review when the reviewer will ask "what depends on this?".

If you changed `src/` and you have not re-run this skill, the docs are stale.

## Inputs (single source)

| Artifact | What it provides |
|---|---|
| `app/scripts/feature-graph.mjs` | Generator. Reads feature registry inline + scans imports (`grep -R from '`) + `policy/capabilities.yaml` + `src/bridge/registry.ts` + `src/native/deviceAccess.ts`. |
| `app/scripts/feature-graph.config.json` | Optional overrides. Leave absent for derived defaults; add an entry only when auto-derivation is wrong. |
| `policy/capabilities.yaml` | Canonical permission set (6 capabilities, never_expose). |
| `src/bridge/registry.ts` | Typed mirror of `capabilities.yaml` (R1 check). |
| `src/miniapps/catalog.ts` | Mini-app feature registrations (badminton, weather, transit, notes, market, card). |

Do not invent a second registry. The inline registry in `feature-graph.mjs` is the definition; `feature-graph.config.json` is the patch.

## Procedure (order matters)

1. **Classify scope.** Confirm the touched area is feature, component, or permission. If it is not one of those three, this skill is not the right place — route via `mobile-spine`.
2. **Regenerate.**
   ```bash
   npm run feature:graph          # from app/ — runs node ./scripts/feature-graph.mjs
   # or
   node ./scripts/feature-graph.mjs   # from app/
   ```
   This overwrites:
   * `app/docs/feature-graph.json` — structured source (edges, nodes, permissions).
   * `app/docs/feature-graph.md` — reviewed artifact (mermaid + tables for the 3 scopes).
   * `app/docs/feature-graph.html` — interactive copy (mermaid + filterable tables).
3. **Inspect diff.** Open the generated `feature-graph.md` and verify:
   * Any new feature→feature edge you introduced appears.
   * Any removed edge disappears.
   * Component ownership matches the files you touched.
   * Permission column shows the correct `capabilities.yaml` entry or `deviceAccessKind`.
4. **Commit.** Include the three generated files in the same PR as the code change — reviewers see the impact without reading the diff.
5. **Hook.** If you used the hook below, confirm the post-change hook ran or run it manually — do not leave a PR with code delta but no graph delta.

## Hook: run after every implementation

No manual gate is reliable in the week it matters. Two options, either satisfies the requirement:

**A) npm script (recommended)**
`package.json:scripts` contains `feature:graph`. Invoke it at the end of any implementation turn that touched `src/` (agent workflow must include it as the last step before `typecheck`/`test`).

**B) Local post-check (optional)**
Add a lightweight git hook that reminds or auto-runs:
```bash
# app/scripts/hooks/install-feature-graph-hook.sh
ln -sf ../../scripts/hooks/feature-graph-post-commit.sh .git/hooks/post-commit
```
The hook script runs `node app/scripts/feature-graph.mjs` when `app/src/**` or `policy/capabilities.yaml` changed. The generated files are then a one-line `git add` away. CI does not block on this; review does.

In agent runs, prefer (A) unconditionally — hooks are for local iteration, not for agent truth.

## Output spec

### `feature-graph.json`

```json
{
  "generatedAt": "ISO-8601",
  "features": [
    { "id": "home", "label": "Home", "layer": "host", "components": ["src/screens/HomeScreen.tsx"], "permissions": [] }
  ],
  "edges": [
    { "from": "home", "to": "navigation", "reason": "dock selection + per-feature imports", "evidence": "src/screens/HomeScreen.tsx:import ..." }
  ],
  "featureComponents": { "home": ["src/screens/HomeScreen.tsx", "src/components/HomeCollection.tsx"] },
  "featurePermissions": { "home": [] },
  "capabilityRegistry": ["net.request", "storage.kv", "..."],
  "neverExpose": ["dynamic code execution", "..."]
}
```

### `feature-graph.md`

Contains exactly three visuals + tables:
* **§1 Feature→Feature** — mermaid flowchart + edge table (from, to, reason).
* **§2 Feature→Components** — mermaid block + per-feature file list (screens, components, hooks, services, native).
* **§3 Feature→Permissions** — per-feature table (capability, consent class, osPermission, brokerUi, minTier, deviceAccessKind).

Any content outside those three scopes has drifted — delete it.

### `feature-graph.html`

Same three sections rendered as interactive mermaid + filterable tables with the same `mermaid@10` header as `architecture-visual.html`. Not a replacement — a scoped companion.

## Feature registry (canonical)

Derived features (change only via `feature-graph.mjs` inline registry; overrides in `feature-graph.config.json`):

| ID | Label | Layer | Notes |
|---|---|---|---|
| `app` | App Orchestration | host | `App.tsx` — hubs tenant, navigation, dock, tracking, notifications, haptics |
| `home` | Home & Personalization | host | `HomeScreen`, `HomeCollection`, `homeModel`, viewer suggestions, pin/unpin |
| `navigation` | Navigation & Dock | host | `navigationBroker`, `GlassTabBar`, `MiniAppScreen` frame chrome, cross-app links |
| `explore` | Explore & Catalog | host | `ExploreSheet`, `MiniAppPickerModal`, `HomeCollectionPickerModal`, `catalog.ts` filtered by tenant |
| `tenant` | Tenant & Localization | host | `tenants.ts:4`, `useTenant.ts:location-first`, `tenantStorage.ts` |
| `container` | Mini-App Container | container | `MiniAppContainer.tsx` (only factory), `csp.ts`, `navigationGuard.ts`, `warmPool.ts`, `signer.ts` |
| `pipeline` | Pipeline & Review | governance | `pipeline/review.ts:7 checks`, `manifest/validator.ts`, `archiveSafety.ts` |
| `bridge` | Bridge & Handlers | bridge | `registry.ts:6`, `handler.ts:10-step`, `gates.ts:G1-G3`, `handlers/*` |
| `tracking` | Tracking & Telemetry | host | `trackingService.ts:journal→batch→transport`, `trace.ts`, `TrackedScrollView.tsx` |
| `notifications` | Notifications | host | `notificationService.ts`, `notification/index.ts`, `NotificationSheet`, `ForegroundNotificationBanner` |
| `deviceAccess` | Device Access | native | `native/deviceAccess.ts` (`network/biometric/weatherLocation/voiceCommand`), host-only |
| `storage` | Host Storage | native | `native/hostStorage.ts`, `MiniAppContainer` NOT using web storage (pool safety) |
| `cards` | Cards Domain | domain | `cards/*` — example domain reusing container+bridge+tracking |
| `designSystem` | Design System | host | `ui/foundations`, `ui/primitives`, `ui/actions` — replaces per-screen inlines |
| `haptics` | Haptics & Motion | native | `native/haptics.ts`, `native/nativeShell.ts`, `config/motion.ts`, `config/useReducedMotion.ts` |

Mini-app tenant-set (`src/miniapps/catalog.ts:6`): `badminton`, `weather`, `transit`, `notes`, `market`, `card` — each carries `publicEntrypoints`, `crossAppLinks`, `trackingEvents` (allowed dataKeys only).

Capabilities (`policy/capabilities.yaml:6`, `src/bridge/registry.ts:6`): `net.request` (medium, sandbox), `storage.kv` (low, sandbox), `scanner.scan` (medium, self_serve, `host_scanner`), `location.current` (high, partner_verified), `crypto.sign` (high, partner_verified, `biometric_prompt`), `notify.subscribe` (low, self_serve, while_using) + `never_expose:*`.

## Drift signal

You have drifted when:

* `feature-graph.md` contains sequence, budget, or infra content — strip it.
* A feature lists components it does not import or that belong to another feature — move the import or the row.
* A permission column lists a literal hex, a raw OS permission, or a string not in `capabilities.yaml` / `DeviceAccessKind` — go through `palette.ts` or the registry.
* A handler was added but `feature-graph.json:capabilityRegistry` is unchanged — sync `registry.ts` + `capabilities.yaml` first (R1).

## Conformance

This skill does not add blocking CI checks. It adds a review artifact. The one check that remains is: **PRs that change `src/**` or `policy/capabilities.yaml` SHOULD include a `feature-graph.*` diff.** If they do not, ask why before approving.
