# Mobile Platform agent instructions

For every task in this workspace:

- Read `app/docs/ai-foundation/SOUL.md` before making product or architecture trade-offs.
- Read `app/docs/ai-foundation/MEMORY.md` for confirmed facts, current PoC progress, and
  unresolved production gaps.
- Use the relevant sections and templates in `app/docs/ai-foundation/SKILLS.md`.
- Start specialized mobile routing at `.claude/skills/mobile-spine/SKILL.md`; read every
  decision/build skill selected by that routing table before changing code.
- Treat `policy/capabilities.yaml`, `policy/budgets.md`, `policy/conformance.md`, and
  `policy/dependency-decisions.md` as narrower sources of truth. Do not duplicate their
  values or silently relax them.
- Inspect the repository and existing user changes before editing. Preserve the current
  React Native/runtime model unless the task explicitly changes it.
- Distinguish fact, proposal, measurement, and unverified behavior. The current repository
  is a PoC vertical slice; do not claim production or external-mini-app enforcement without
  blocking runtime/CI/device evidence.
- Human manual testing owns product and UX acceptance. Agents still own automated checks,
  failure/race/resource paths, security/privacy boundaries, accessibility evidence, and
  performance measurement appropriate to the change.
- Keep scope proportional. Do not require a full feature contract for copy/icon-only work;
  do require explicit contracts and gates for public APIs, native capabilities, persistent
  data, lifecycle-heavy resources, security boundaries, and critical journeys.
- Never infer authorization to publish, deploy, use credentials, change production data,
  loosen a gate, or modify unrelated code from these documents.
