# Conformance

## How to use this file

The four build skills — `bridge-wiring`, `container-wiring`, `mini-app-contract`,
`mini-app-pipeline` — each explain how to cross one boundary of the stack without breaking
an invariant. This file is the part of that which a machine checks.

**It exists because every other guard in this platform depends on someone choosing to read
a document.** An agent implementing a capability at speed, or a contributor who has never
opened `.claude/skills/`, is exactly the case the skills cannot reach. A CI check reaches
them. So the rules below are not a summary of the skills — they are the subset that
survives nobody reading anything.

Each rule names the invariant it protects, because a rule whose reason is lost gets
deleted by whoever it blocks next quarter.

## What belongs here, and what does not

A rule earns a place only if all three hold:

1. **It protects one of the four invariants** in `mobile-spine`, not a preference.
2. **Violating it is silent.** If the failure mode is a crash or a red test, the ordinary
   test suite already covers it and a conformance rule is duplication.
3. **A machine can decide it** — a grep, a schema comparison, a targeted test. "A reviewer
   should notice" is not a check.

Rule 2 is the one that keeps this file short. Most bugs announce themselves; these do not.

## Cheap checks — static, run on every change

These are greps or file comparisons. They cost nothing, so there is no argument for
sampling them.

| # | Rule | Invariant | Owner |
|---|---|---|---|
| C1 | Exactly one call site constructs a mini-app WebView | one bridge, one tenancy model | `container-wiring` |
| C2 | No consent, permission, or tier check appears in mini-app-facing JavaScript | the bridge is the only door | `bridge-wiring` |
| C3 | No bridge handler reads an identity, origin, appId, or user field from the request envelope | untrusted until proven | `bridge-wiring` |
| C4 | No handler accepts a filesystem path, and none returns an absolute path | the bridge is the only door | `bridge-wiring` |
| C5 | No publisher or mini-app identifier appears in signer, checker, or rollout code | untrusted until signed | `mini-app-pipeline` |
| C6 | No `Intent` parsing anywhere in the container path | one tenancy model | `container-wiring` |
| C7 | No RN scroll handler is attached to a mini-app WebView | budgets hold | `container-wiring` |
| C8 | No production build path emits a deprecation console warning | it is a third party's UI | `mini-app-contract` |
| C9 | The manifest validator and the published schema are the same file | the contract cannot drift from the check | `mini-app-contract` |

C1 and C5 do the most work per line of check. C1 is what stops a second, unreviewed
container existing at all; C5 is what stops the tier system quietly becoming advisory.

## Registry agreement — run on every change

Three sets that must be identical. Each mismatch is a real defect, and each is invisible
without the check.

| # | Rule | What a mismatch means |
|---|---|---|
| R1 | Every registered bridge handler has an entry in `capabilities.yaml`, and every entry has a handler | a handler with no entry is an undeclared capability; an entry with no handler is a promise nothing keeps |
| R2 | Every capability in `capabilities.yaml` is documented, and every documented capability is in the registry | undocumented capabilities get used through reverse engineering, and then the reverse engineering is the contract |
| R3 | Every published error code is producible by some handler, and every code a handler returns is published | an unpublished code is one an author cannot branch on, so they will retry blindly |

## Behavioural checks — targeted tests

These need a real container or a real handler. They are slower, and they are the ones that
catch the failures that ship.

| # | Rule | Invariant |
|---|---|---|
| B1 | Storage, cookies, and file access assert off on a constructed container — asserted, not assumed from the constructor | one tenancy model |
| B2 | CSP is present as a response header and absent as a `<meta>` tag, serving a real package | the author cannot set their own policy |
| B3 | Navigation to a foreign origin, a foreign scheme, and an undeclared path are all cancelled | one tenancy model |
| B4 | The renderer-death handler is attached to pooled and hidden instances, not only visible ones | one mini-app cannot kill the host |
| B5 | First script execution happens after signature verification returns | untrusted until signed |
| B6 | Every handler returns a terminal reply on its timeout path | a lost reply is the largest source of hangs |
| B7 | Every handler emits an audit record before its reply | the log is what an incident is reconstructed from |
| B8 | A high-risk capability fails closed when its server token is revoked | authority expires rather than being reached |
| B9 | A lower pointer sequence number is rejected | downgrade and replay both die |
| B10 | Each feature named unavailable in the platform statement is absent inside a real container | we do not promise what we do not enforce |

B4 is the one most often missing, because the pooled instance is invisible in every manual
test — and on Android it is the instance that takes the host process down.

## Adversarial fixtures

**A review pipeline tested only against cooperative packages degrades into an approver.**
Keep a suite of packages that must be rejected, and fail the build if the pipeline admits
any of them:

- a capability called but not declared
- a remote script fetched at runtime
- a wildcard network host
- path traversal in an archive entry
- a valid store signature with a missing author signature
- a manifest whose declared version is lower than the installed floor
- a `<meta>` CSP attempting to loosen the served header
- a page attempting to reach the raw bridge handler with a forged appId

The last one is the most important and the easiest to forget: it is the only fixture that
proves C2 and C3 are actually load-bearing rather than merely present.

## Budgets are checked separately

Timing, memory, and counter budgets live in `policy/budgets.md` with their own gate. Do not
duplicate them here — two files asserting the same number is two numbers.

## How to add a rule

Add it when a real defect gets through and the postmortem shows the failure was silent. A
rule invented in advance for a failure that has never happened is how this file grows into
something people skip.

State the invariant, the check, and the owning skill. If you cannot name the invariant, the
rule is a preference and belongs in a linter config instead.

## How to remove one

**Removing a rule is a gate**, per `human-gate`, with the reasoning recorded. Whoever is
blocked by a rule cannot be the person who deletes it — that is the same principle as
budgets, and for the same reason: the week a check is inconvenient is the week it is doing
its job.

Turning a rule from blocking to advisory counts as removing it. An advisory conformance
rule is a report nobody reads.

---

<!-- Violations found in the field begin here, newest at the bottom. -->
<!-- Record: date, rule number or "new", what shipped, and whether a check now covers it. -->
<!-- An entry with no covering check is the highest-value work in this file. -->
