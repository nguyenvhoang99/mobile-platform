# AI development standard

**Status:** Draft, version 0.1
**Applies to:** every change to this repository — the native shell, the React Native
host, the capability bridge, the container, the pipeline, the SDK, and the docs — all
of which is written by coding agents.
**Normative terms:** **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are requirements,
recommendations, and options respectively.

## Why this exists

Every line of host source here is generated. Nobody reads most diffs, and the people who
could cannot review speed, boundary discipline, or honesty into existence by reading.
This is not a temporary condition to be fixed by hiring; it is the operating model. The
platform was designed for it before it was stated: `policy/conformance.md` exists because
guards that depend on someone choosing to read a document do not bind. Generated code is
the general form of that reader.

Two facts shape everything below.

**The failure mode of generated code is never a crash.** An agent implementing a
capability produces something that works — the scanner scans, the screen renders. What it
also does is cache a consent inside the WebView, inline a budget constant, add a second
way to fetch data, return a platform error carrying a filesystem path, or quietly weaken
the test that would have caught the last three. Each defect is silent, plausible, and
ships. Guards aimed at crashes miss all of it; the ordinary suite stays green while the
invariant dies.

**Human review of a generated diff is theater for anything checkable.** A person skimming
a two-thousand-line agent diff catches tone, not a reordered permission gate or a test
rewritten to match the bug. So humans move up the stack: they decide what should exist,
what it may cost, and what is refused — and machines verify that what exists conforms.
Review time is the scarce resource; spending it on greppable properties wastes the one
thing automation cannot supply.

The recursive thesis that organizes this file: **a coding agent is an untrusted tenant of
this repository**, governed by the same model as a mini-app publisher — untrusted until
proven, least authority, declared-before-use, one audited door, audited actions,
revocable access. Nothing here grants an agent trust. Everything here gives its output a
door that checks.

## Sources of truth

Authority stays split exactly as in `mini-app-platform-standard.md`:

| Concern | Source of truth |
| --- | --- |
| Capability existence, risk, consent, quotas, tier reach | `../../policy/capabilities.yaml` |
| Timing, memory, artifact, telemetry, motion budgets | `../../policy/budgets.md` |
| Machine-enforced boundary invariants (C/R/B rules) | `../../policy/conformance.md` |
| Platform behavior standard | `mini-app-platform-standard.md` |
| Dependency admissions and refusals | `../../policy/dependency-decisions.md` |
| How agent-written change is produced and proven | this document |

If this document conflicts with one of those sources, the narrower source wins and this
document MUST be corrected. This file MUST NOT restate a number, a capability rule, or a
boundary check that lives in one of those files — two places asserting one rule is how a
rule stops being true. It owns only the production regime that keeps them true.

## Principles

**P1 — Assume the author read nothing.** Every constraint binds mechanically in CI or it
does not exist. A convention an agent must remember is a convention an agent will invent
differently next session. Anything load-bearing migrates from prose into a schema, a
grep, a generated type, or a gate.

**P2 — Machines check, humans decide.** Human judgment is spent only where a machine
genuinely cannot answer: whether something should exist, what a budget tradeoff is worth,
user-facing copy, tier and admission calls, incident response. Never line-by-line review
of a property a script could decide.

**P3 — Spec before code.** The registry entry, manifest field, error enum entry, budget
row, schema, and its tests exist and are human-approved before the implementation is
generated. Code is the cheapest artifact in the repo and the least trusted; it is
generated *against* the spec, never as the spec. An implementation that arrives before
its specification has skipped the only review that matters.

**P4 — Structure is the guard.** Thin shell, one bridge, one factory, one way to do each
thing, one scroll container, one component vocabulary. Every degree of freedom removed
from the codebase is a way generation can go wrong that no longer exists. Simplicity here
is a safety mechanism first and a maintainability benefit second.

**P5 — Ratchets beat absolutes, and whoever is blocked cannot relax them.** Ceilings move
down when beaten and rise only through a gate with a named owner and a measurement. This
applies beyond budgets: dependency counts, coverage floors, fixture-suite size, snapshot
baselines. A limit any agent can raise to get unstuck is not a limit.

**P6 — Adversarial by default.** Every pipeline, checker, and generator is tested against
inputs that must fail. A review pipeline tested only against cooperative packages becomes
an approver (`mini-app-pipeline`); a test suite generated alongside the code it tests
becomes the code's biographer. Both failures are the same shape: green where red was the
specification.

**P7 — Provenance and reversibility.** Every change carries what produced it — task ID,
agent identity, governing skill, the spec it implements. Remote layers are preferred
precisely because they roll back; native-shell additions are rare, gated, and assumed to
be stuck with us. "Was this the code we reviewed?" must be answerable from records, not
from anyone's memory of a session.

**P8 — Honesty over parity.** Unmeasured numbers stay marked provisional or unresolved;
platform gaps are stated, not smoothed; generated documentation MUST NOT promise behaviour
the enforcement does not perform (`mini-app-contract`'s drift signal, applied to our own
docs). An honest gap survives contact with production; a claimed guarantee becomes an
incident citation.

**P9 — One door for authority.** No capability decision outside native code, no trust
decision outside the registry, no identity derived from payload, and no second channel
into the codebase — no direct-to-main pushes, no merge without the checks, no "temporary"
skip for one task. The moment a change path bypasses CI, only that path gets used under
deadline.

**P10 — The agent is a tenant.** Least authority per task; declared-before-use for every
surface it touches; every action auditable after the fact; access revocable mid-task.
The same reasoning that forbids giving one mini-app a side channel forbids giving one
agent session a path around the registry, the budgets, or the gates.

## Guards

Layered by where each binds. Layers earlier in the list are cheaper and run more often;
a defect that survives a layer should be rare at the next.

### G-A — Generation-time guards (inside the agent loop)

- Every task **MUST** route through `mobile-spine` and record which skill governed it. A
  change spanning two table rows **MUST** read both skills before writing anything.
- Build-skill drift signals are self-checks, not trivia: writing an authority check in
  JavaScript, enabling web storage to fix something, keying a branch to a publisher,
  documenting unenforced behaviour — each **MUST** stop the task, not be deferred.
- Stop-and-gate triggers (`bridge-wiring`, `container-wiring`, `mini-app-pipeline`) are
  honored as terminations, not worked around. An agent that hits a gate reports the gate.
- The agent **MUST** run the mechanical definition of done (below) itself and report its
  output before claiming completion. "Should pass" is not a run.
- Fresh context per task. State travels through the repo and the task record, never
  through an agent's memory of a previous session.

### G-B — Static conformance (every change, cheap)

The C1–C9 and R1–R3 rules of `policy/conformance.md` run on every change, unchanged. On
top, the generation regime adds process checks owned by this file:

| # | Rule | Failure it closes |
|---|---|---|
| S1 | Dependency changes require a linked `dependency-decisions.md` entry; native-module count and transitive delta are reported per change | the drive-by library, added because it made generation easier |
| S2 | Budget-owned numbers are imported from a module generated out of `policy/budgets.md`; a literal matching a budget row fails unless imported | invented constants that drift from policy and get cited as fact |
| S3 | Boundary types are generated (Codegen, manifest schema, capabilities registry). Hand-written signatures at those boundaries fail; a schema change **MUST** include regenerated artifacts in the same change | hand-maintained types drifting from native reality until they crash |
| S4 | Public surfaces are snapshot-gated: the frozen handshake, the error enum, the published schema, `capabilities.yaml`. Any diff requires a gate label | additive-only versioning violated silently by regeneration |
| S5 | Test weakening requires a gate label: deleting or skipping a test, removing assertions, loosening thresholds — when in the same change as the code under test | the suite rewritten to describe the bug |
| S6 | Provenance required on every commit/task record (see H7); missing provenance fails the merge | unattributable change nobody can reason about later |
| S7 | Mechanically flagged one-way doors: diffs touching native shell paths, key hierarchy, isolation rows, or the never-expose list carry a gate label detected by path/pattern, not by reviewer vigilance | the irreversible change discovered at review instead of at design |

S-rules protect the *production regime*; they graduate into `policy/conformance.md`
through its normal admission process once they have caught something real. No rule may
exist in both files.

### G-C — Behavioural conformance (targeted tests)

B1–B10 stand as written. For generated code specifically:

- Every parser that touches bytes we do not control — archive entries, manifest, bridge
  envelope, navigation decisions, channel-pointer sequence handling — carries fuzz and
  property tests. Generated parsers are precisely where edge cases are invented wrong.
- Compatibility shims are tested against recorded real mini-app traffic, never against a
  fixture the generating agent also wrote (`native-capability`).
- Fail-closed drills are part of the suite: token revoked mid-call, renderer death on a
  pooled instance, network loss during a money operation, pointer replay with a lower
  sequence number. Each asserts the system ends in the safe state, not just that it logs.

### G-D — Budget and counter gates

Owned by `mobile-smoothness` (stopwatches/gauges) and `mobile-simplicity` (counters),
reading `policy/budgets.md`. Non-negotiable mechanics: fixed low-tier lab device;
compare against the ratcheted baseline, never the previous run; fail on breach, never
warn; noise handled with repetition and percentiles, not wider thresholds.

### G-E — Runtime and field guards

App-owned trace markers; field percentiles comparable to lab; per-mini-app crash and
renderer-death attribution; staged rollout of every remote JS update with halt conditions
declared before the ramp; kill switches backed by server-side authority expiry. These
catch what generation-time checking structurally cannot: interaction effects between
independently generated features.

### G-F — Human gates

Always gated, no exceptions for deadlines, tier, or who asks: new capability; tier
change; budget loosening; conformance-rule removal or downgrade to advisory; isolation-row
change; native-shell addition; new native dependency; key-hierarchy change; test
weakening (S5); public-surface diff (S4); purpose strings and user-facing copy. Packaging
per `human-gate`. Whoever is blocked by a rule cannot be the person who relaxes it.

## Harnesses

What agents work inside. The harness is why feature velocity survives P1–P10: an agent
inside narrow doors moves fast because it is never deciding what the doors should be.

- **H1 — Skill family as the guardrail layer.** Decide-vs-build routing, drift signals,
  stop-and-gate lists. The agent's judgment is spent inside the skill's boundaries, not
  on the boundaries themselves.
- **H2 — Machine-readable policy as the only spec source.** `budgets.md`,
  `capabilities.yaml`, `conformance.md`, and the manifest schema are single-file truths
  that both CI and agents read. Agents cite rows; they do not paraphrase them.
- **H3 — Completeness templates.** The capability template (registry), container
  conformance checklist, performance report, admission record, refusal log, layer-decision
  record. Each forces fields that cannot be silently skipped; a template row left empty
  is visible, which is the point.
- **H4 — Mechanical definition of done.** One script runs typecheck, lint, unit tests,
  static conformance, the behavioural subset, budget counters, provenance validation, and
  registry agreement. Exit code decides done. No human judges "is it finished".
- **H5 — Adversarial fixture suites as deliverables.** Must-reject packages live in the
  repo like code, grow like a ratchet, and fail the build if admitted. Removing one is a
  gate, same as removing a conformance rule.
- **H6 — Device lab harness.** Fixed low-tier reference device(s), trace markers emitted
  by the app, percentile extraction, comparison against ratcheted baselines. Field data
  reads the same markers so the two stay comparable.
- **H7 — Provenance harness.** Task records retained: task ID, agent identity/version,
  governing skill(s), spec references, verification output. Answers "was this the code we
  reviewed" from records — build provenance for our own source, mirroring what
  `mini-app-pipeline` requires of publishers. Requires VCS history as the anchor.
- **H8 — Context hygiene.** Fresh agent per task; the spec excerpt travels with the task,
  not a model of the whole repo; both relevant skills read when a change spans rows.
  Hallucinated APIs and forgotten constraints mostly enter through stale context.

## Tests

Ordered by when they are written relative to the code. T0–T2 are written with the spec;
the rest verify implementations against it.

| Layer | What it proves | Written |
|---|---|---|
| T0 Spec tests | Each registry entry, schema field, enum value, and budget row has a named test stating required behaviour, written from policy before implementation exists | with the spec, human-approved |
| T1 Unit/model tests | Pure logic — models, services, brokers, reducers | with the change |
| T2 Contract tests | Validator equals published schema (same file); handshake frozen before author script; error enum closed in both directions; API diff additive-only | with the surface |
| T3 Boundary behavioural | B1–B10 of `policy/conformance.md` | with the boundary |
| T4 Adversarial fixtures | The pipeline rejects everything in the must-reject suite | continuously, ratchet-only growth |
| T5 Fuzz / property | Untrusted-byte parsers survive arbitrary input safely | with each parser |
| T6 Compatibility | N−2 skew matrix; recorded real traffic replay across shimmed versions | with each contract change |
| T7 Performance | Lab percentiles vs ratcheted budgets; zero frozen frames; steady-state memory and thermal-length sessions | per change on the lab device |
| T8 Fail-closed drills | Revocation, renderer death, network loss, pointer replay end safe | with the mechanism |
| T9 E2E device smoke | Gate order G1→G2→G3; native payment sheet amount; splash timeout; kill switch at open | per release candidate |
| T10 Health-gate rehearsal | Rollout halt conditions fire on synthetic signals before real ones arrive | with each rollout config |
| T11 Meta-tests | The guards themselves work: a known-bad canary submitted through the real pipeline is rejected; a disabled check fails the build; fixture suites still contain their fixtures | continuously |

### Anti-test-gaming rules

Generated tests fail in ways handwritten suites rarely do, so three rules apply:

- **Tests derive from policy, not from behaviour.** A test that asserts what the code
  currently does is a description, not a check. T0 exists so every important assertion
  predates the code it tests and cannot be shaped by it.
- **Coverage floors on boundary modules** — bridge handlers, container configuration,
  package verifier, consent records — set as a ratchet, never an absolute.
- **Test and implementation diffs travel together and are checked together**: S5 fires
  mechanically when the same change grows the code while shrinking what verifies it.

## Definition of done (mechanical)

A change is done when the harness says so — nothing else counts:

1. Typecheck and lint clean.
2. Full unit suite green; coverage floor held.
3. Static conformance green: C1–C9, R1–R3, S1–S7.
4. Behavioural subset green: B-rules touched by the change.
5. Counter budgets within ratchet; performance report attached if a stopwatch/gauge row
   was plausibly affected ("none" is a valid answer and **MUST** be argued).
6. Provenance record complete (H7).
7. Registry agreement holds; public surfaces unchanged or gate-labeled.
8. Docs regenerated where a surface changed — enforcement and documentation ship
   together, per `mini-app-contract`.

If any item fails, the change is not done and no gate label exists that makes it done
except a human gate.

## What humans actually do

Bounded deliberately, mirroring `mini-app-governance`'s reviewer list:

- Answer gates, with reasoning recorded — the decision is precedent.
- Approve specs and their T0 tests for any new surface.
- Own refusals and admissions in the dependency log, with alternatives named.
- Write purpose strings and user-facing copy (`design`).
- Set tiers, budgets, and rollout policy; respond to incidents.
- Read the audit trail and the meta-test results, and tighten the harness when either
  shows a silent failure.

Everything else is the machine's job, including most of what is traditionally called
code review.

## Why this does not strangle feature work

Feature throughput comes from the same mechanisms that constrain risk:

- Most product work lands in the RN host layer — the auto tier of `autonomy-triage`. No
  gate, no ceremony, just the mechanical definition of done.
- The small component vocabulary, one navigation stack, one data-fetching pattern mean
  generation starts from a shape it cannot get badly wrong.
- Templates make completeness cheaper than omission: filling the capability template is
  faster than arguing about what a capability needs.
- The refusal log prevents quarterly re-litigation of settled dependencies, which is
  where human attention actually drains away.
- Remote layers absorb mistakes: a bad RN-host or mini-app change rolls back in minutes.
  Speed is safe exactly where release agility is high — that is the layer rule working.

A stable, reliable, feature-rich app built by agents is not achieved by trusting agents
more. It is achieved by making the trusted parts small, mechanical, and impossible to
bypass quietly.

## Relationship to the other policy files

- `policy/conformance.md` keeps sole ownership of boundary rules; discoveries land there
  through its own admission process ("real silent defect"), never here.
- `policy/budgets.md` keeps sole ownership of numbers; this file only demands agents
  import rather than inline them.
- `policy/capabilities.yaml` keeps sole ownership of the surface; S4 makes its diffs
  visible, it does not change admission rules.
- `mini-app-platform-standard.md` defines platform behaviour for authors; this file
  defines how our own generated code is fit to implement it.

## Enforcement status

Intentionally candid, mirroring the platform standard:

| Area | Current state | Required before external mini-apps |
| --- | --- | --- |
| Skill family, routing, drift signals | Implemented | — |
| Unit/model test layer | Partial (models and services covered) | Broadened to all host modules |
| Static conformance checks wired in CI | Defined (C/R/S), not wired — repo has no CI yet | All C/R/S blocking on every change |
| Budget codegen module (S2) | Not implemented | Required |
| Public-surface snapshots (S4) | Not implemented | Required before any handshake ships |
| Test-weakening detection (S5) | Not implemented | Required |
| Provenance trail (H7) | Not implemented — requires VCS anchor | Required |
| Device lab harness + markers (H6) | Markers defined; no lab device wired | Required for the perf gate |
| Adversarial fixture suites | Defined, none built | Required before review pipeline runs |
| Meta-canary (T11) | Not implemented | Required before pipeline goes live |
| Staged rollout + health gates | Not implemented | Required |

Adding a row to this table is free; marking one complete requires the covering check to
exist and block.

<!-- Field notes begin here. Record: date, which guard/test caught what, or which -->
<!-- silent failure got through and what now covers it. -->
