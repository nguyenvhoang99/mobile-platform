/**
 * Budgets — generated view over policy/budgets.md (S2)
 *
 * Single-source rule: no budget number may be inlined elsewhere in the
 * codebase. Import from this file instead. CI fails a literal that matches a
 * budget row outside this module (S2). To change a value, edit
 * policy/budgets.md and regenerate this file — direct edits here will be
 * overwritten.
 *
 * Source: policy/budgets.md @ reference device = Samsung Galaxy A14 (low tier)
 * Generation: manual for MVP; future: codegen script reading the markdown table.
 */

// ── Derived (not negotiable) ────────────────────────────────────────────
export const FRAME_BUDGET_MS_60HZ = 16.67 as const;
export const FRAME_BUDGET_MS_120HZ = 8.33 as const;
export const FROZEN_FRAME_MS = 700 as const;
export const BRIDGE_ROUND_TRIP_P95_MS = 16 as const; // one frame @60Hz — bridge must not cost a frame
export const BRIDGE_ROUND_TRIP_P50_MS = 5 as const;
export const SYNC_HOST_CALL_MS = 1 as const;

// ── Perceptual ───────────────────────────────────────────────────────────
export const TAP_TO_VISUAL_RESPONSE_P95_MS = 100 as const;
export const MINIAPP_SPLASH_VISIBLE_P50_MS = 50 as const;
export const MINIAPP_SPLASH_VISIBLE_P95_MS = 100 as const;

// ── Provisional (treat as guesses; baseline on low tier, then ratchet) ──
export const SLOW_FRAMES_RATIO = 0.01 as const; // under 1%
export const NAVIGATION_TRANSITION_COMMITTED_P95_MS = 300 as const;
export const MINIAPP_FIRST_PAINT_WARM_P50_MS = 350 as const;
export const MINIAPP_FIRST_PAINT_WARM_P95_MS = 800 as const;
export const MINIAPP_FIRST_PAINT_COLD_P50_MS = 700 as const;
export const MINIAPP_FIRST_PAINT_COLD_P95_MS = 1500 as const;
export const MAX_CONCURRENT_WEBVIEWS = 3 as const;

// ── Motion ceilings (from budgets.md Motion design budgets) ──────────────
export const MOTION_FEEDBACK_MS = 100 as const;
export const MOTION_STANDARD_MS = 200 as const;
export const MOTION_EMPHASIZED_MS = 300 as const;
export const MOTION_TRAVEL_PX = 24 as const;
export const MOTION_REDUCED_MS = 0 as const;

// ── Telemetry delivery budgets ───────────────────────────────────────────
export const TELEMETRY = {
  critical: { maxWaitMs: 1_000, targetRequestKB: 64, retentionMs: 7 * 24 * 60 * 60 * 1000 },
  operational: { maxWaitMs: 5_000, targetRequestKB: 128, retentionMs: 72 * 60 * 60 * 1000 },
  product: { maxWaitMs: 30_000, targetRequestKB: 256, retentionMs: 24 * 60 * 60 * 1000 },
  diagnostic: { maxWaitMs: 300_000, targetRequestKB: 512, retentionMs: 60 * 60 * 1000 },
} as const;

export const TELEMETRY_QUEUE = {
  singleEventKB: 16,
  singleRequestKB: 512,
  singleRequestEvents: 200,
  durableJournalMB: 8,
} as const;

// ── Counter budgets (simplicity — growth limits) ─────────────────────────
export const COUNTER = {
  // Ratchets — no more than +2% per release without a gate.
  androidDownloadSizeRatchetPct: 2,
  iosThinnedSizeRatchetPct: 2,
  distinctWaysPerThing: 1,
  openFlagsPastRemovalDate: 0,
  rnVersionLag: '2 minors or 6 months',
} as const;

// ── Reference devices (from budgets.md Reference devices table) ───────────
export const REFERENCE_DEVICES = {
  low: { model: 'Samsung Galaxy A14 (SM-A145F)', os: 'Android 14, One UI 6', note: 'budgets stated against this' },
  mid: { model: 'Samsung Galaxy A54 5G', os: 'Android 14, One UI 6.1', note: 'mid-tier reference' },
  high: { model: 'iPhone 14', os: 'iOS 18', note: 'high-tier / iOS reference' },
} as const;

// ── Trace markers (owned — every profiler merely reads) ──────────────────
export const TRACE_MARKERS = [
  'process_start',
  'native_init_done',
  'bundle_evaluated',
  'first_meaningful_frame',
  'miniapp_tap',
  'miniapp_splash_visible',
  'miniapp_first_paint',
  'bridge_request',
  'bridge_response',
  'tenant_resolved',
  'tenant_profile_applied',
] as const;
export type TraceMarker = (typeof TRACE_MARKERS)[number];
