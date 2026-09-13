/**
 * Single container configuration — the ONLY place a mini-app WebView is configured.
 * C1: exactly one call site constructs a mini-app WebView; this file IS that site's config.
 *
 * Every row maps to mini-app-runtime's isolation checklist. A change here is a
 * tenancy-model change and gates (container-wiring: Stop and gate when…).
 *
 * Do NOT add an options bag. Per-app variation belongs in the signed manifest
 * and store record, never in container config (container-wiring Step 1).
 */

export const CONTAINER_CONFIG = {
  // Storage — load-bearing for warm-pool safety. Pooled WebViews never held anything.
  domStorageEnabled: false,
  thirdPartyCookiesEnabled: false as boolean,
  sharedCookiesEnabled: false,
  saveFormDataDisabled: true,

  // File access — all off.
  allowFileAccess: false,
  allowFileAccessFromFileURLs: false,
  allowUniversalAccessFromFileURLs: false,
  allowContentAccess: false,

  // Debug — asserted off in release (B1).
  // In JS we cannot flip the native flag; we assert it via test (B1).

  // Incognito / data store — keep pooled instances generic (no per-app store).
  incognito: true,

  // JavaScript must be on (mini-apps are JS), but no other escape hatches.
  javaScriptEnabled: true,
  injectedJavaScriptBeforeContentLoaded: undefined as string | undefined, // set per-instance via SDK stub

  // Navigation — handled in navigationGuard.ts
  // CSP — header, not meta (B2), built in csp.ts
  // Renderer death — handler attached on every instance including pooled (B4)
} as const;

// Guard helper for tests — asserts the config matches the isolation checklist.
export function assertContainerConfigShape(config: typeof CONTAINER_CONFIG): void {
  if (config.domStorageEnabled !== false) throw new Error('domStorage must be false');
  if (config.allowFileAccess !== false) throw new Error('allowFileAccess must be false');
  if (config.allowUniversalAccessFromFileURLs !== false) throw new Error('allowUniversalAccessFromFileURLs must be false');
  if (config.incognito !== true) throw new Error('incognito must be true for pool safety');
}
