/**
 * App-owned trace markers — every profiler merely reads.
 * Treat the tool (Perfetto, Instruments, etc.) as replaceable.
 * Markers from budgets.md TRACE_MARKERS.
 */

export type Marker = typeof import('../config/budgets').TRACE_MARKERS[number];

const marks: { marker: string; at: number; meta?: Record<string, unknown> }[] = [];

export function mark(marker: string, meta?: Record<string, unknown>): void {
  marks.push({ marker, at: Date.now(), meta });
  // In production, emit via native trace API (e.g. Performance.mark or TurboModule).
  // Here we keep an in-memory ring for tests.
  if (marks.length > 500) marks.shift();
}

export function getMarks(): readonly { marker: string; at: number; meta?: Record<string, unknown> }[] {
  return marks;
}

export function clearMarks(): void {
  marks.length = 0;
}

// Convenience: measure between two markers
export function durationMs(from: string, to: string): number | null {
  const a = [...marks].reverse().find(m => m.marker === from);
  const b = [...marks].reverse().find(m => m.marker === to);
  if (!a || !b) return null;
  return b.at - a.at;
}
