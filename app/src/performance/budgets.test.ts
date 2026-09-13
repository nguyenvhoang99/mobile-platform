// @ts-nocheck - uses Node fs/path in Jest, not RN lib
/**
 * Budgets are law — `policy/budgets.md` is single source.
 * These tests ensure `src/config/budgets.ts` stays in sync and that
 * JS never hard-codes a budget number that should be imported.
 *
 * If this fails, the fix is to edit `policy/budgets.md` and regenerate
 * `src/config/budgets.ts`, not to update the test.
 */
import {
  FRAME_BUDGET_MS_60HZ,
  FRAME_BUDGET_MS_120HZ,
  FROZEN_FRAME_MS,
  BRIDGE_ROUND_TRIP_P50_MS,
  BRIDGE_ROUND_TRIP_P95_MS,
  TAP_TO_VISUAL_RESPONSE_P95_MS,
  MINIAPP_SPLASH_VISIBLE_P50_MS,
  MINIAPP_SPLASH_VISIBLE_P95_MS,
  MAX_CONCURRENT_WEBVIEWS,
  MOTION_FEEDBACK_MS,
  MOTION_STANDARD_MS,
  MOTION_EMPHASIZED_MS,
  MOTION_TRAVEL_PX,
  TRACE_MARKERS,
  TELEMETRY,
  TELEMETRY_QUEUE,
} from '../config/budgets';
import { createMotionTokens } from '../config/motion';

describe('performance budgets — single source `src/config/budgets.ts:1`', () => {
  it('frame budgets are derived, not provisional', () => {
    expect(FRAME_BUDGET_MS_60HZ).toBeCloseTo(16.67, 1);
    expect(FRAME_BUDGET_MS_120HZ).toBeCloseTo(8.33, 1);
    expect(FROZEN_FRAME_MS).toBe(700);
    // bridge must not cost a frame
    expect(BRIDGE_ROUND_TRIP_P95_MS).toBe(16);
    expect(BRIDGE_ROUND_TRIP_P50_MS).toBe(5);
  });

  it('tap and splash budgets are perceptual / derived', () => {
    expect(TAP_TO_VISUAL_RESPONSE_P95_MS).toBe(100);
    expect(MINIAPP_SPLASH_VISIBLE_P50_MS).toBe(50);
    expect(MINIAPP_SPLASH_VISIBLE_P95_MS).toBe(100);
  });

  it('max concurrent WebViews is provisional 3 with LRU', () => {
    expect(MAX_CONCURRENT_WEBVIEWS).toBe(3);
  });

  it('motion ceilings match `policy/budgets.md:96` and are enforced', () => {
    expect(MOTION_FEEDBACK_MS).toBe(100);
    expect(MOTION_STANDARD_MS).toBe(200);
    expect(MOTION_EMPHASIZED_MS).toBe(300);
    expect(MOTION_TRAVEL_PX).toBe(24);
    // createMotionTokens must reject tuning beyond ceilings
    expect(() => createMotionTokens({ durationMs: { emphasized: 301 } })).toThrow();
    expect(() => createMotionTokens({ distance: { medium: 25 } })).toThrow();
    // reduced motion is invariant 0
    const tokens = createMotionTokens();
    expect(tokens.durationMs.instant).toBe(0);
  });

  it('trace markers are app-owned and single source `policy/budgets.md:58`', () => {
    // every budget in budgets.md references these markers
    expect(TRACE_MARKERS).toEqual(
      expect.arrayContaining([
        'process_start',
        'native_init_done',
        'bundle_evaluated',
        'first_meaningful_frame',
        'miniapp_tap',
        'miniapp_splash_visible',
        'miniapp_first_paint',
        'bridge_request',
        'bridge_response',
      ]),
    );
    // no duplicates, owned by app, tools merely read
    expect(new Set(TRACE_MARKERS).size).toBe(TRACE_MARKERS.length);
  });

  it('telemetry budgets are provisional but present `policy/budgets.md:110`', () => {
    // MAX queue wait per priority
    expect(TELEMETRY.critical.maxWaitMs).toBe(1_000);
    expect(TELEMETRY.operational.maxWaitMs).toBe(5_000);
    expect(TELEMETRY.product.maxWaitMs).toBe(30_000);
    expect(TELEMETRY.diagnostic.maxWaitMs).toBe(300_000);
    // single event / request caps
    expect(TELEMETRY_QUEUE.singleEventKB).toBe(16);
    expect(TELEMETRY_QUEUE.singleRequestKB).toBe(512);
    expect(TELEMETRY_QUEUE.singleRequestEvents).toBe(200);
    expect(TELEMETRY_QUEUE.durableJournalMB).toBe(8);
  });

  it('no budget number is inlined outside `src/config/budgets.ts` (spot check)', () => {
    // This is a lightweight static guard: ensure motion.ts does not hard-code 16.67 etc.
    // Full CI (`scripts/conformance.sh` S2) does the same grep excluding budgets.ts
    // and test files — spec tests assert imported values, they cannot ship drift.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const srcRoot = path.resolve(__dirname, '..');
    const forbidden = ['16.67', '8.33']; // frame budgets must only come from budgets.ts
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else if (/\.(ts|tsx)$/.test(e.name) && e.name !== 'budgets.ts') files.push(full);
      }
      return files;
    };
    const violations: string[] = [];
    for (const file of walk(srcRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const lit of forbidden) {
        if (content.includes(lit) && !file.endsWith('motion.test.ts')) {
          // allow in tests that assert the value, but not in source
          if (file.includes('.test.')) continue;
          violations.push(`${path.relative(srcRoot, file)} contains inlined "${lit}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
