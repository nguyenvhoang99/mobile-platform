# Sample host capability demos

Status: bundled React Native PoC, not an isolated or signed WebView mini-app.
`SampleMiniApp` receives a narrow `BridgeClient` from the host. The sample never
constructs caller identity, grants itself consent, imports native modules, or calls
host notification/Live Activity services directly. The existing booking model is
retained as explicitly labeled local fixture behavior.

## Current flows

- Storage: write, read and delete `sample_note` through the host bridge. The
  existing storage handler uses a process-memory map; success does not mean a
  durable disk write. Use synthetic notes only.
- Bill extraction: call the existing first-party pilot `ai.extract_bill` through
  `extractBill({locale, idempotencyKey, hint?})`. No image bytes or paths leave
  the host. The current native facade reports `UNAVAILABLE` on both platforms;
  no inference engine or model is supplied by this sample. The UI displays this
  failure and supports manual amount/recipient entry without inventing an AI result.
- If a future adapter returns a valid extraction, display model, confidence,
  timestamp, masked account, line items and review fields. Amount and recipient
  remain editable; confirming only marks this in-memory draft reviewed. No bill
  creation, storage or payment is performed. Editing while a request is pending
  prevents its late response from replacing the user's draft.
- Scanner, location, hardware signing, notification subscription and network
  adapters remain unavailable. Reminder, calendar and Live Activity have no
  approved public mini-app capability. These gaps appear as text, with no direct
  service workaround or fake success.

## State and resource contract

The component owns a draft and one in-flight request. A synchronous ref blocks
rapid duplicate taps; all bridge actions are disabled until that request settles.
Draft fields and close remain usable. Errors retain user input and use closed
bridge codes rather than raw native errors. No automatic retry occurs. Unmount
ignores late UI completion; host session revocation owns capability cancellation.
There is no claim that unmount rolls back work already accepted by the host.
Closing loses the draft, as stated beside the form. No raw extraction is logged,
tracked, or persisted. UI uses semantic button/input roles, names, disabled states,
status announcements, wrapping actions and no animation.

## Manual acceptance script (not executed)

1. Open Sample in the host on iOS/Android. Confirm the RN PoC label and the
   difference between fixture booking and host operations are visible.
2. Enter a synthetic note, write, read, delete and read again. Expect memory-only
   success and then an empty result. Restart the host; do not expect durability.
3. Request bill extraction. If the host injects a consent UI, exercise denial
   and approval; without that UI expect `CONSENT_REQUIRED`. An approved request
   must currently end with `UNAVAILABLE`, never fabricated amounts or a picker/
   model-ready claim. Enter amount and recipient manually, correct an invalid
   amount, and confirm review. No bill or payment should be created.
4. With a future real adapter, review missing/low-confidence fields and edit
   during a slow extraction. Late output must not overwrite edits. Close while
   pending and reopen; previous UI output must not attach to the new screen.
5. Check VoiceOver/TalkBack labels, status announcements, large text, keyboard
   access and close during pending operations. Repeated taps must not duplicate
   calls. Human testing owns UX acceptance.

## Evidence and budgets

Source inspection only; no tests, build, typecheck or device measurement run for
this change. Runtime, accessibility and policy enforcement remain unverified.
No dependencies, native modules, scripts, Pods, Gradle plugins or patches added by
these sample changes. Startup, memory, frame timing, JS bundle size and build timing
have no before/after measurement; measure release builds on the reference devices
and canonical rows in `policy/budgets.md` before making performance claims. There
is no new eager device work, animation loop, timer or persisted schema. Rollback:
remove the demo component/mount, retaining existing booking source and public API.
