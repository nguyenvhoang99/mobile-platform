# PoC Stage 1 — Documentation Index

> **Status:** Stage 1 complete — bare host + mini-app platform foundation on one binary, 6 capabilities, 4 tenants, location-first tenancy, tracking + notification + generic reminder Live Activity working in release on low-tier device. Payments deferred (contract hooks present). `app/docs/architecture-visual.md:1` is the generated visual; this folder is the hand-off.

This `docs/` folder is the **compact context** for building the next feature. Start here, not by re-reading the whole repo. Every doc points at the single source of truth — no duplicated numbers.

## What to read in which order

| Order | Doc | What it answers | When to open it |
|---|---|---|---|
| 0 | `CLAUDE.md:1` | Thesis, 4 invariants, layer picture, skill family split | Always first — 2-minute orientation |
| 1 | `docs/architecture.md` | System architecture: layers, trust/release tradeoffs, component map, file index, PoC scope vs deferred | Before any design — “where does this feature live?” |
| 2 | `docs/guidelines.md` | **Central checklist + skill routing + gates.** How to propose/implement a feature without breaking a principle; which skill owns what; definition of done; motion/haptics kills | Before writing code — copy the checklist into your PR description |
| 3 | `docs/host-core-components.md` | Host core modules: `App.tsx:132`, `navigationBroker.ts:21`, `bridge/`, `container/`, `config/`, `tracking/`, `notification/`, `tenancy`, `Live Activity` — responsibilities, boundaries, file paths | When you touch a core module or need to find the owner |
| 3b | `docs/native-ui-component-registry.md` | Stable cross-platform IDs for the native iOS/Android UI, with direct implementation links and mapping notes | When changing or reviewing a native UI surface |
| 3c | `docs/native-ui-design-plan.md` + `docs/native-ui-design-board.html` + `docs/native-ui-design-figma.json` | Proposed shared native design, 21 registry IDs, local feedback and editable Figma node links; validation gaps recorded | When reviewing cross-platform UI before implementation |
| 3d | `docs/native-ui-dock-review.html` + `docs/native-ui-dock-design.md` | Dock v0.5: central Explore/Home, center-origin swipe picker, optional shortcuts, minimize/resume floating handle, animations and Undo; Figma sync pending | When reviewing dock behavior before native implementation |
| 3e | `docs/native-ui-home-design.md` + `docs/native-ui-home-design.json` | Home v0.3 square category/app cards with 2–8 responsive columns, in the shared Home/Dock review; native implementation and Figma sync pending | When reviewing Home layout before implementation |
| 3f | `docs/native-ui-sandbox-design.md` + `docs/native-ui-dock-review.html` | Sandbox UI v0.4: host frame, Back/Close, scoped session drafts, consent and failure states; review prototype only, external native runtime still open | When reviewing mini-app host behavior before native implementation |
| 4 | `docs/features/tracking.md` | Tracking pipeline: declarations → journal → batch → transport | When you add/modify an event |
| 5 | `docs/features/notification.md` | Push → inbox → foreground banner → entrypoint activation → permission | When you add a notification category or deep link |
| 6 | `docs/features/live-activity.md` | Generic reminder → Live Activity (coordinator, attributes, extension) | When you touch reminder, calendar, or Live Activity |
| 7 | `docs/features/tenancy.md` | 4-tenant MVP on one binary, location-first resolve, per-tenant catalog/palette | When you add a tenant, catalog, or palette override |
| 7b | `docs/features/mini-app-container.md` | One WebView factory, isolation, CSP, navigation allowlist, warm pool, signing | When you touch WebView, isolation, or packaging |
| 7c | `docs/features/capability-bridge.md` | 10-step bridge, gates, quota, audit, 6 caps, versioning | When you add/modify a capability |
| 8 | `app/docs/architecture-visual.md:1` | Generated Mermaid visuals + sequence diagrams (L1/L2, bridge 10 steps, container, navigation, tracking, notification, tenancy) | When you need a diagram to paste into a design doc |
| 9 | `app/docs/mini-app-platform-standard.md:1` + `policy/*` | Normative host/mini-app contract and CI-enforced budgets/capabilities/conformance | When you define a capability, budget, or manifest field — CI reads these files |
| 10 | `app/docs/ai-development-standard.md:1` | How AI-generated code is produced and proven (P1-P10, H1-H8, T0-T11, mechanical DoD) | When you use an agent to generate host code |

## File / skill map (single source)

| Concern | Source of truth | CI reads? |
|---|---|---|
| Timing/memory/artifact/motion budgets | `policy/budgets.md:1` → `app/src/config/budgets.ts:1` | yes |
| Capability registry, tiers, `never_expose` | `policy/capabilities.yaml:1` → `app/src/bridge/registry.ts:24` | yes (`R1`) |
| Boundary invariants (C1-C9/R1-R3/B1-B10) | `policy/conformance.md:1` | yes |
| All numbers, in one place | `policy/budgets.md:1` | yes |
| Skill routing & invariants | `.claude/skills/mobile-spine/SKILL.md:1` | no — but budgets/conformance still bind |
| Layout, palette, motion, tenant tokens | `app/src/config/*` | no |
| Mini-app contract | `app/docs/mini-app-platform-standard.md:1` + manifest schema `app/src/miniapps/manifest/schema.json:1` | yes (`C9`) |

If this index conflicts with a policy file, the **policy file wins**.

## PoC Stage 1 — what is done vs deferred

**Done:** thin native shell, RN host (New Arch, Hermes, bare CLI), 6 host-mediated capabilities (`net.request`, `storage.kv`, `scanner.scan`, `location.current` coarse, `crypto.sign`, `notify.subscribe`) with 3 gates + quota + audit, one WebView factory with CSP/header/navigation containment/warm pool, signed packages (store+author, verify before first script), 4-tenant MVP (`vn-hn`/`vn-hcm`/`vn-dn`/`vn-fallback`) location-first, tracking journal, notification inbox + FCM/APNs, generic reminder Live Activity + calendar, design tokens + motion/haptics kills, 20 test suites, `scripts/verify.sh:1` green.

**Deferred (contract hooks present, no native money):** payments/PSP, 63-province expansion (add entries to `app/src/config/tenants.ts:32`), expanded capability surface, field baselines for `policy/budgets.md:68` provisional rows, store/review pipeline backend (local `pipeline/review.ts:35` + adversarial fixtures).

## How to add a feature after Stage 1

Copy the checklist from `docs/guidelines.md` into your ticket/PR, route via `mobile-spine`, run `scripts/verify.sh` locally — the mechanical DoD decides done, not a human's memory of having read this index.
