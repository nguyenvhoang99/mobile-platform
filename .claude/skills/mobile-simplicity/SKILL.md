---
name: mobile-simplicity
description: Refuse what the mobile codebase should not carry — dependencies, abstractions, configuration surface, and second ways to do the same thing — using countable budgets and a ratchet instead of taste. Use the moment someone proposes adding a library, says "let's build an abstraction for this", "we could support both", "just add a flag", or "it's only one more dependency", and whenever an RN upgrade is painful or a build is getting slower. Run this before `mobile-architecture` admits anything new.
---

# Mobile Simplicity

## Why this exists

React Native apps rarely die of a slow list. They die of two hundred direct
dependencies, forty native modules, and a build nobody understands — and then
the next React Native upgrade is a two-quarter project instead of an afternoon,
so it gets postponed, and postponing it makes the following one worse. The app
is still fast. It is just no longer changeable, which is the same thing as dead.

The opposite failure is real and less common: the not-invented-here codebase
that wrote its own animation library, badly, and now maintains a worse
Reanimated with no community and one expert who left. Refusing everything is not
simplicity, it is just a different pile of code with your name on it.

So this skill is not about taste, and it is not about writing less code today.
It is about **refusal with an alternative and a number attached.** A refusal
with no alternative is a blocked task, and a preference with no number is an
argument you will lose to whoever is most insistent this week.

## The one question

**What does carrying this cost for three years, across every RN upgrade?**

Not what it costs to add. Adding is always cheap — that is why the surface
grows. Ask what it costs to still have it after four upgrades, two platform
version bumps, and the departure of whoever added it.

This question is also what makes a **native** dependency categorically more
expensive than a JS one rather than merely bigger. A JS dependency that goes
unmaintained is a fork you can vendor in an afternoon. A native dependency that
goes unmaintained is a veto on your next upgrade, and you will discover that on
the day you can least afford it.

## Track 1: dependency admission

Score every proposed dependency. Any row landing in the right-hand column is
not a veto, but it must be argued in the refusal log rather than waved past.

| Signal | Cheap to carry | Expensive to carry |
|---|---|---|
| Native code | pure JS/TS | ships native code |
| New Architecture support | first-class, maintained | patched, forked, or "works for now" |
| Maintenance | released this quarter, several maintainers | last release 18 months ago, one maintainer |
| Transitive count | adds 0–2 | adds 30 |
| Size delta | under the ratchet | needs a ratchet exemption |
| What we do if abandoned | vendor 200 lines | rewrite a subsystem |
| Replaces | nothing we have | something we already have — see Track 3 |

**Prefer the platform, then the framework, then a dependency, then our own
code — in that order, and skip a step only with a reason written down.** Most
"we need a library for this" turns out to be forty lines against an API that
already exists, and the forty lines never break on upgrade.

**A dependency that exists to save writing code you understand is the worst
trade in the list.** You take on the upgrade liability to avoid the part that
was never hard.

## Dependency policy — host owns its critical contracts

The host must own its critical contracts — package verification, identity, payment, storage, update, and lifecycle. From the host reference:

- Prefer platform APIs and internal adapters for security-, identity-, runtime-, payment-, storage-, update-, and lifecycle-critical behavior. A library that owns your signature check is a host release you cannot ship.
- Use a third-party library when it removes substantial non-differentiating work *and* has compatible New Arch support, platform coverage, maintenance, licensing, testability, and acceptable binary/performance cost.
- Wrap consequential libraries behind host-owned ports so mini-app contracts and domain code do not inherit their APIs — the wrapper protects the contract, not "future swapping".
- Do not add a package for a small utility already expressible with the platform or existing deps — forty lines against an API that already exists is cheaper than a transitive tree.
- Do not reimplement mature cryptography, media codecs, or security protocols to reduce count — the second implementation will be wrong and unpatched.
- Record why a new native dependency is needed and how it is removed or replaced if abandoned — this is the `policy/dependency-decisions.md` entry that makes the next upgrade possible.

Before accepting a native dependency, check: RN New Arch support, iOS/Android targets and build tools, threading/lifecycle/privacy manifest, binary size/transitive deps/startup work, maintenance/license/security history, tests with multiple instances, and ability to patch or replace.

## Track 2: abstraction admission

**Two call sites is not a pattern.** Wait for the third, because the shape you
infer from two is usually wrong, and a wrong abstraction is more expensive than
the duplication it replaced — duplication is visible and a bad abstraction is
load-bearing.

**Wrap a dependency only when you intend to swap it.** A house wrapper around
`fetch`, a logging facade, a storage interface with one implementation: these
buy nothing and cost a layer that every reader must now traverse. If the reason
is "in case we swap it later", note that you will rewrite the wrapper anyway
when the second implementation reveals what the interface should have been.

**An abstraction that must be understood before the code it hides is a net
loss.** If explaining the indirection takes longer than explaining the three
concrete cases, delete it.

## Track 3: one way to do a thing

This is the track that actually decays, because nobody ever proposes a second
way — a second way arrives as a reasonable local decision and then stays.

**Every capability, pattern, and library has exactly one blessed form.** One
navigation library. One storage mechanism. One data-fetching approach. One
animation approach. One way to define a native module.

**Migration means finishing.** A half-finished migration is the most expensive
state a codebase can be in: two systems, two sets of bugs, and every new
engineer learning both. If a migration cannot be finished, it should not be
started — and if one has stalled, finishing it beats any new work, because it is
already charging interest.

**Deleting the old way is part of adding the new one, in the same change where
possible.** Left to a follow-up ticket, it becomes permanent.

## Track 4: configuration and flag surface

Every flag doubles a code path in principle and, in practice, produces a
combination nobody has ever run.

- **A flag needs an owner and a removal date at creation.** Without those it is
  permanent, and a permanent flag is just a branch you forgot to merge.
- **Rollout flags are deleted after rollout.** The flag was for the rollout.
- **Kill switches are exempt** — they are meant to be permanent, and they are
  the reason the shell can be thin. Say which is which at creation.
- **Config that has never been changed is not config.** Inline it.

## The countable budgets

Counters, all of them, all in `policy/budgets.md`, all checked in CI. Stopwatch
and gauge budgets are `mobile-smoothness`; if the number comes from counting
rather than timing or measuring, it is here.

- Android download size and iOS thinned install size
- Hermes bytecode bundle size
- Direct runtime dependencies
- Native modules, counted separately — the number that predicts upgrade pain
- Distinct ways to do each thing in Track 3, where the budget is one
- Open flags past their removal date, where the budget is zero
- RN version lag

## The ratchet

**Adopt a growth limit before you adopt an absolute limit.** You almost never
know the correct absolute value on day one, and arguing about it delays having
any check at all. A relative limit — no more than a few percent growth per
release without a gate — is enforceable immediately and catches the real failure
mode, which is not one careless release but forty releases each adding one
percent.

Ratchet rules that keep it honest: the ceiling moves down when a release comes
in under it, never up on its own. Raising it is a gate per `human-gate`, with a
refusal-log entry explaining what was bought. A ratchet that can be raised by
whoever is blocked by it is not a ratchet.

## Worked examples

**Adding MMKV for faster key-value storage.** Native code, and we already have
one storage mechanism. The gain is real but it is a stopwatch claim with no
measurement behind it. → refuse pending a `mobile-smoothness` attribution
showing storage on a critical path. If it is, admit it *and delete the old
mechanism in the same change*.

**Adding a second navigation library for one screen with an unusual
transition.** Track 3 violation, and the cost lands on everyone who later has to
know which screens use which. → refuse. Build the transition in the blessed
library or make the screen native per `mobile-architecture`.

**Wrapping `fetch` in a house client.** If it adds auth, retry, and tracing that
every call needs, it is not a wrapper, it is a feature — admit it. If it exists
to make swapping HTTP libraries easy, → refuse.

**Keeping both Fabric and the legacy render path alive during migration.** Two
render paths mean every rendering bug must be diagnosed twice and every
component tested twice. → allowed only with a finish date and an owner; without
those, → refuse and finish the migration first.

**A pure-TS date formatting library, 4 kB, no transitive deps, actively
maintained.** Cheap on every row. → admit without ceremony. Refusal has a cost
too, and spending judgment here is how the discipline gets a reputation for
obstruction.

## The refusal log

Refusals that are not written down get re-proposed every quarter, and the fourth
proposal succeeds because everyone who remembers the reasoning has moved on.
Keep the log next to the budgets:

```markdown
## <What was proposed> — <date>

**Proposed by / for:** <who, and the problem they were actually solving. The
problem is usually real even when the solution is refused.>

**What carrying it would have cost:** <Concrete, on the rows above. "Adds a
native module and 30 transitive deps, and blocks upgrades if abandoned" — not
"adds complexity".>

**Decision:** <admitted | refused | admitted with conditions>

**What we did instead:** <Required for a refusal. If this is empty the refusal
is just a blocked task, and it will be overturned.>

**Revisit when:** <The condition that would change the answer — a measurement, a
third call site, an upstream release. "Never" is a legitimate entry; vagueness
is not.>
```

Admissions go in the log too. A log of only refusals reads as an obstruction
record, and the admissions are what make the refusals credible.

## Do not do this

- **Do not treat this as a style guide.** Naming, formatting, and review
  nitpicking are `simplify` and `verify`. This skill only decides what the
  codebase carries.
- **Do not optimize runtime here.** `mobile-smoothness`. "Simpler" and "faster"
  are different claims and conflating them lets an unmeasured performance
  argument win a complexity argument.
- **Do not "rewrite it in native to make it simpler".** That trades a counter for
  a stopwatch and usually loses both — fewer dependencies, worse frame budget,
  and now it ships through store review.
- **Do not refuse a capability on simplicity grounds.** A simplicity argument is
  not a security argument, and dressing one as the other means the real security
  reasoning never gets written down. `native-capability` caps its own surface.
- **Do not refuse without naming the alternative.** Covered above because it is
  the single most common way this skill gets ignored.
- **Do not let the budgets live only here.** If they are not in
  `policy/budgets.md` and checked in CI, this skill is a document nobody opens.
  The CI check is what works on the week nobody reads it.

## Hand off

`mobile-architecture` once something is admitted, to decide which layer it lands
in. `mobile-smoothness` when the admission argument rests on a timing or memory
claim — that claim needs a measurement, not an assertion. `human-gate` to raise
a ratchet ceiling.
