# Bridge audit — 2026-09-27

Status: first-party React Native PoC only. This is not proof of third-party or native
WebView enforcement. The demo client is constructed by the host; mini-app UI receives
only narrow storage and pilot bill-extraction methods. It cannot set session identity.

## Corrections in this pass

- Registry minimum tier is checked for every call; absent tier defaults to sandbox.
- Version, operation, unknown envelope/argument fields, object shape and registry payload
  caps are checked by the host PoC. Bill input schema is checked before requesting consent.
- Consent capability, scope and expiry must match; a once grant is consumed. The client
  obtains consent through a host callback and returns revoked after disposal.
- Token bucket state is now persisted between calls on the bound client, including denied
  requests; negative clock elapsed time cannot create tokens.
- KV namespaces use an encoded tuple, preventing delimiter collisions. Data is memory-only;
  this API does not promise durable storage.
- Scanner, location, crypto, notification subscription and network calls no longer return
  fabricated success. They return `UNAVAILABLE` after valid gates/input until real scoped
  adapters exist. Network egress is disabled because RN fetch does not establish the required
  native redirect, credential and bounded-response boundary.

## Remaining work for research / approval

| Feature | Actual state | Needed next |
| --- | --- | --- |
| `storage.kv` | Real in-memory, scoped host map | Durable encrypted storage, lifecycle cleanup, native quotas and session binding |
| `net.request` | Unavailable | Native exact-host egress, redirect validation, cookie isolation, response bounds, cancellation |
| `scanner.scan` | Unavailable | Host-owned scanner UI returning decoded data, gesture/lifecycle contract |
| `location.current` | Unavailable | Coarse region adapter under current no-OS-permission registry contract; precise access is not approved |
| `crypto.sign` | Unavailable | Native hardware-backed, host-minted challenge protocol and biometric UI |
| `notify.subscribe` | Unavailable | Real backend topic subscription/permission lifecycle; an in-memory boolean is not delivery registration |
| `ai.extract_bill` | First-party pilot; unavailable | Native image picker, local model availability/inference, cancellation and output validation |
| Live Activity / calendar / reminder | Host APIs only | Approved capability contract before exposing lifecycle/handles through external bridge |

`ai.extract_bill` remains product-shaped leakage: VND-specific bill fields are encoded in
the host contract. Keep the sample bill use case, but a future approved generic structured
extraction capability should move the bill schema/prompt into the mini-app. No generic AI
capability was silently added, and no local LLM inference is implemented by this pass.

Platform-wide gaps: native frame/origin-bound transport, reviewed signed grants, native
consent/gesture and OS-permission revalidation, revoke/teardown cancellation, global quotas,
cryptographic durable audit, and real device/CI evidence. The current JS audit hash is not
cryptographic and its in-memory log is not production retention. A host-created RN facade
must not be reused as a security boundary for untrusted WebView content.

Validation in this pass: source inspection only; tests and native builds were not run.
Performance/build budgets remain unverified on reference devices. No dependencies added.
