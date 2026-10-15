/** Host-owned RN launch measurements. Layout is not compositor paint. */
export type MiniAppLoadEventName =
  | 'mini_app_load_started'
  | 'mini_app_load_finished';

type Sink = (
  name: MiniAppLoadEventName,
  data: Record<string, unknown>,
  occurredAtMs: number,
) => Promise<unknown>;

type Frame = { appId: string; sessionId: string; history: string[] };
type StopReason =
  | 'superseded'
  | 'navigation_left'
  | 'route_changed'
  | 'background'
  | 'tenant_changed'
  | 'host_unmounted';

export type MiniAppLoadRequestTime = {
  monotonicMs: number;
  occurredAtMs: number;
};

export type MiniAppLoadSignals = {
  committed: () => void;
  contentLaidOut: () => void;
};

type Attempt = {
  frame: Pick<Frame, 'appId' | 'sessionId'>;
  route: string | undefined;
  requestedAt: number;
  committedAt: number | null;
  data: Record<string, unknown>;
  signals: MiniAppLoadSignals;
};

function monotonicNow(): number {
  // RN installs this Web API, but the project's TS libs omit DOM declarations.
  const host = globalThis as unknown as { performance: { now(): number } };
  return host.performance.now();
}

export class MiniAppLoadTracker {
  private pending: Attempt | null = null;
  private sequence = 0;

  constructor(
    private readonly sink: Sink,
    private readonly now: () => number = monotonicNow,
    private readonly wallNow: () => number = () => Date.now(),
  ) {}

  requestTime(): MiniAppLoadRequestTime {
    return { monotonicMs: this.now(), occurredAtMs: this.wallNow() };
  }

  begin(
    frame: Frame,
    version: number,
    source: string,
    launchKind: 'new_session' | 'existing_session',
    requested: MiniAppLoadRequestTime,
  ): void {
    this.cancel('superseded');
    const attempt: Attempt = {
      frame: { appId: frame.appId, sessionId: frame.sessionId },
      route: frame.history.at(-1),
      requestedAt: requested.monotonicMs,
      committedAt: null,
      data: {
        mini_app_id: frame.appId,
        mini_app_version: version,
        mini_app_session_id: frame.sessionId,
        load_id: `${frame.sessionId}:load:${++this.sequence}`,
        source,
        runtime: 'react_native_poc',
        launch_kind: launchKind,
      },
      signals: {
        committed: () => {
          if (this.pending === attempt && attempt.committedAt === null) {
            attempt.committedAt = this.now();
          }
        },
        contentLaidOut: () => {
          if (this.pending === attempt) {
            this.finish('content_laid_out', null);
          }
        },
      },
    };
    this.pending = attempt;
    this.emit('mini_app_load_started', attempt.data, requested.occurredAtMs);
  }

  signalsFor(frame: Frame): MiniAppLoadSignals | undefined {
    const attempt = this.pending;
    return attempt?.frame.sessionId === frame.sessionId &&
      attempt.frame.appId === frame.appId &&
      attempt.route === frame.history.at(-1)
      ? attempt.signals
      : undefined;
  }

  navigationChanged(frame: Frame | undefined): void {
    if (!this.pending) return;
    if (
      this.pending.frame.sessionId !== frame?.sessionId ||
      this.pending.frame.appId !== frame?.appId
    ) {
      this.cancel('navigation_left');
    } else if (this.pending.route !== frame?.history.at(-1)) {
      this.cancel('route_changed');
    }
  }

  cancel(reason: StopReason): void {
    this.finish('interrupted', reason);
  }

  private finish(
    outcome: 'content_laid_out' | 'interrupted',
    reason: StopReason | null,
  ): void {
    const attempt = this.pending;
    if (!attempt) return;
    this.pending = null; // Settle before delivery; duplicate/late signals are inert.
    const endedAt = this.now();
    const layoutAt = outcome === 'content_laid_out' ? endedAt : null;
    this.emit(
      'mini_app_load_finished',
      {
        ...attempt.data,
        outcome,
        reason,
        elapsed_ms: endedAt - attempt.requestedAt,
        navigation_commit_ms:
          attempt.committedAt === null
            ? null
            : attempt.committedAt - attempt.requestedAt,
        content_layout_ms:
          layoutAt === null ? null : layoutAt - attempt.requestedAt,
        commit_to_layout_ms:
          layoutAt === null || attempt.committedAt === null
            ? null
            : layoutAt - attempt.committedAt,
      },
      this.wallNow(),
    );
  }

  private emit(
    name: MiniAppLoadEventName,
    data: Record<string, unknown>,
    at: number,
  ): void {
    try {
      this.sink(name, data, at).catch(() => undefined);
    } catch {
      // Telemetry must never prevent navigation, even if its adapter throws.
    }
  }
}
