# PoC Stage 1 — Documentation Index

> **Status:** PoC Stage 1 vertical slice exists — bare host, capability/container models,
> four tenants, tracking, notification, and Live Activity code are present. This is not a
> production-readiness claim: real WebView/native-boundary enforcement, blocking CI and
> device-lab evidence remain incomplete. See `docs/ai-foundation/MEMORY.md` for the
> evidence-based status. Payments are deferred.

This `docs/` folder is the **compact context** for building the next feature. Start with
`docs/ai-foundation/`, not by re-reading the whole repo. Every doc points at the single
source of truth — no duplicated numbers.

## What to read in which order

| Order | Doc | What it answers | When to open it |
|---|---|---|---|
| 0 | `docs/ai-foundation/SOUL.md`, `MEMORY.md`, `SKILLS.md` | Shared principles, verified/current context, workflows and contracts for AI-first delivery | Always first; read SKILLS sections proportional to the task |
| 1 | `CLAUDE.md:1` | Thesis, 4 invariants, layer picture, skill family split | 2-minute platform orientation |
| 2 | `docs/architecture.md` | System architecture: layers, trust/release tradeoffs, component map, file index, PoC scope vs deferred | Before any design — “where does this feature live?” |
| 3 | `docs/guidelines.md` | **Central checklist + skill routing + gates.** How to propose/implement a feature without breaking a principle; which skill owns what; definition of done; motion/haptics kills | Before writing code — copy the checklist into your PR description |
| 4 | `docs/host-core-components.md` | Host core modules: `App.tsx:132`, `navigationBroker.ts:21`, `bridge/`, `container/`, `config/`, `tracking/`, `notification/`, `tenancy`, `Live Activity` — responsibilities, boundaries, file paths | When you touch a core module or need to find the owner |
| 5 | `docs/features/tracking.md` | Tracking pipeline: declarations → journal → batch → transport | When you add/modify an event |
| 5a | `docs/features/mini-app-load-performance.md` | Host launch timings, interruption semantics and browser-metric limitations | When measuring mini-app load performance |
| 6 | `docs/features/notification.md` | Push → inbox → foreground banner → entrypoint activation → permission | When you add a notification category or deep link |
| 7 | `docs/features/live-activity.md` | Generic reminder → Live Activity (coordinator, attributes, extension) | When you touch reminder, calendar, or Live Activity |
| 8 | `docs/features/tenancy.md` | 4-tenant MVP on one binary, location-first resolve, per-tenant catalog/palette | When you add a tenant, catalog, or palette override |
| 8b | `docs/features/mini-app-container.md` | One WebView factory, isolation, CSP, navigation allowlist, warm pool, signing | When you touch WebView, isolation, or packaging |
| 8c | `docs/features/capability-bridge.md` | 10-step bridge, gates, quota, audit, 6 caps, versioning | When you add/modify a capability |
| 9 | `app/docs/architecture-visual.md:1` | Generated Mermaid visuals + sequence diagrams (L1/L2, bridge 10 steps, container, navigation, tracking, notification, tenancy) | When you need a diagram to paste into a design doc |
| 10 | `app/docs/mini-app-platform-standard.md:1` + `policy/*` | Normative host/mini-app contract and declared budgets/capabilities/conformance | When you define a capability, budget, or manifest field; verify what CI actually enforces |
| 11 | `app/docs/ai-development-standard.md:1` | How AI-generated code is produced and proven (P1-P10, H1-H8, T0-T11, mechanical DoD) | When you use an agent to generate host code |

## File / skill map (single source)

| Concern | Source of truth | Current mechanical coverage |
|---|---|---|
| Timing/memory/artifact/motion budgets | `policy/budgets.md:1` → `app/src/config/budgets.ts:1` | Local scripts/models; no hosted blocking CI yet |
| Capability registry, tiers, `never_expose` | `policy/capabilities.yaml:1` → `app/src/bridge/registry.ts:24` | Local R1 checks; no hosted blocking CI yet |
| Boundary invariants (C1-C9/R1-R3/B1-B10) | `policy/conformance.md:1` | Static subset scripted; behavioral coverage partial |
| All numbers, in one place | `policy/budgets.md:1` | Ledger exists; several baselines unresolved |
| Skill routing & invariants | `.claude/skills/mobile-spine/SKILL.md:1` | Prose routing; policy checks carry enforcement |
| Layout, palette, motion, tenant tokens | `app/src/config/*` | Runtime validation is partial |
| Mini-app contract | `app/docs/mini-app-platform-standard.md:1` + manifest schema `app/src/miniapps/manifest/schema.json:1` | Local schema agreement target; public gate incomplete |

If this index conflicts with a policy file, the **policy file wins**.

## PoC Stage 1 — what is done vs deferred

**PoC present:** thin native shell, RN host (New Arch, Hermes, bare CLI), models and
handlers for 6 capabilities, container/CSP/navigation/warm-pool models, signing utilities,
4-tenant MVP, tracking journal, notification integration, generic reminder Live Activity, design
tokens, tests, and local verification scripts.

**Not yet production-enforced:** real linked WebView and origin scheme handler, pre-script
verification at the container boundary, fully native authority checks, blocking CI, device
lab/field baselines, complete adversarial suites, public-surface snapshots, rollout/revocation
backend, payments/PSP, 63-province expansion, and expanded capability surface.

## How to add a feature after Stage 1

Copy the checklist from `docs/guidelines.md` into your ticket/PR, route via `mobile-spine`, run `scripts/verify.sh` locally — the mechanical DoD decides done, not a human's memory of having read this index.
