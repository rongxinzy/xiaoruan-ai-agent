/**
 * Detects a model turn that stopped making progress.
 *
 * Every layer between the runtime and the model caps a *silent* stream: the
 * upstream nginx `proxy_read_timeout`, and the local AISphere gateway. Both end
 * the stream by dropping the connection, and the OpenAI-compatible proxy then
 * synthesizes a normal `finish_reason` plus `[DONE]`. A stall therefore reaches
 * the runtime looking exactly like a successful turn: streamed tool arguments
 * are executed truncated, and the user keeps watching a spinner that will never
 * resolve on its own.
 *
 * This watchdog is the runtime-side answer. It measures how long the model has
 * been silent while the runtime is actually waiting on it, and hands a verdict
 * to the caller so the stall becomes a visible error instead of a silent one.
 *
 * Two rules keep it from killing healthy turns:
 * - Time owned by a tool (including a pending approval or a question waiting on
 *   the user) never counts as model silence, so long commands cannot trip it.
 * - Only time spent waiting on the model accumulates toward the duration limit,
 *   so a turn that runs many tools is not penalized for them.
 */

export const PiTurnStallKind = {
  /** The model produced nothing for longer than the idle limit. */
  Idle: 'idle',
  /** The turn spent longer than the duration limit waiting on the model. */
  Duration: 'duration',
} as const;

export type PiTurnStallKind = (typeof PiTurnStallKind)[keyof typeof PiTurnStallKind];

export type PiTurnStallVerdict = {
  kind: PiTurnStallKind;
  /** Milliseconds since the runtime last received an event from the model. */
  idleMs: number;
  /** Milliseconds this turn spent waiting on the model, excluding tool time. */
  waitingMs: number;
};

export type PiTurnStallLimits = {
  idleMs: number;
  durationMs: number;
  tickMs: number;
  settleGraceMs: number;
};

/**
 * Defaults are chosen from measured behaviour on the local 35B deployment:
 * the worst observed inter-chunk gap is under 500ms and the worst first-token
 * latency under 5s, so minutes of silence is a stall rather than a slow model.
 * The idle limit must also stay below the upstream silent-stream cap
 * ({@link PI_TURN_STALL_UPSTREAM_LIMIT_MS}) so the runtime reports the stall
 * before the connection is cut. The margin is deliberately wide: a deployment
 * that queues requests above its concurrency limit sends nothing at all while a
 * request waits, and that queue time is indistinguishable from model silence.
 * The longest legitimate single model request observed is 295s, so the duration
 * limit only catches runaway turns.
 */
export const PI_TURN_STALL_LIMITS: PiTurnStallLimits = {
  idleMs: 240_000,
  durationMs: 15 * 60_000,
  tickMs: 5_000,
  settleGraceMs: 5_000,
};

/**
 * Silent-stream cap of the deployment that fronts the local model server (the
 * nginx `proxy_read_timeout` the team configures). It is an external fact this
 * app does not own, but the idle limit is only meaningful while it stays below
 * it: a shorter upstream cap cuts the connection before the runtime can report
 * the stall, which is the silent truncation this watchdog exists to surface.
 */
export const PI_TURN_STALL_UPSTREAM_LIMIT_MS = 300_000;

export type PiTurnStallTimerHandle = ReturnType<typeof setTimeout>;

/** Indirection so tests can drive time without real timers. */
export type PiTurnStallTimers = {
  every(handler: () => void, ms: number): PiTurnStallTimerHandle;
  later(handler: () => void, ms: number): PiTurnStallTimerHandle;
  cancel(handle: PiTurnStallTimerHandle): void;
};

export const defaultPiTurnStallTimers: PiTurnStallTimers = {
  every: (handler, ms) => setInterval(handler, ms),
  later: (handler, ms) => setTimeout(handler, ms),
  cancel: handle => {
    clearTimeout(handle);
    clearInterval(handle);
  },
};

export type PiTurnStallWatchdogOptions = {
  /** Called once when the turn stalls, before any abort. */
  onStall: (verdict: PiTurnStallVerdict) => void;
  /** Called when the runtime is still running after the settle grace period. */
  onUnsettled: (verdict: PiTurnStallVerdict) => void;
  /** False once the session settled or was stopped; disarms the watchdog. */
  isRunning: () => boolean;
  /** True while a tool, approval, or question owns the turn. */
  isSuspended: () => boolean;
  limits?: PiTurnStallLimits;
  timers?: PiTurnStallTimers;
  now?: () => number;
};

export const formatPiTurnStallMessage = (verdict: PiTurnStallVerdict): string => {
  const seconds = Math.round(verdict.idleMs / 1000);
  const waitingSeconds = Math.round(verdict.waitingMs / 1000);

  return verdict.kind === PiTurnStallKind.Idle
    ? `The model produced no output for ${seconds}s, so the turn was stopped.`
    : `The model turn exceeded ${waitingSeconds}s without finishing, so it was stopped.`;
};

export class PiTurnStallWatchdog {
  private readonly limits: PiTurnStallLimits;
  private readonly timers: PiTurnStallTimers;
  private readonly now: () => number;
  private interval: PiTurnStallTimerHandle | null = null;
  private grace: PiTurnStallTimerHandle | null = null;
  private armed = false;
  private fired = false;
  private suspended = false;
  private lastActivityAt = 0;
  private waitingStartedAt = 0;

  constructor(private readonly options: PiTurnStallWatchdogOptions) {
    this.limits = options.limits ?? PI_TURN_STALL_LIMITS;
    this.timers = options.timers ?? defaultPiTurnStallTimers;
    this.now = options.now ?? Date.now;
  }

  /** Starts (or restarts) the window for a new model turn. */
  arm(): void {
    const now = this.now();
    this.armed = true;
    this.fired = false;
    this.suspended = this.options.isSuspended();
    this.waitingStartedAt = now;
    this.lastActivityAt = now;

    if (this.grace) {
      this.timers.cancel(this.grace);
      this.grace = null;
    }
    if (!this.interval) {
      this.interval = this.timers.every(() => this.check(), this.limits.tickMs);
    }
  }

  /** Records progress. Any event from the runtime means the model is alive. */
  noteActivity(): void {
    if (!this.armed) return;
    this.lastActivityAt = this.now();
  }

  /** Returns a verdict when the turn counts as stalled, otherwise null. */
  check(): PiTurnStallVerdict | null {
    if (!this.armed || this.fired) return null;
    if (!this.options.isRunning()) {
      this.dispose();
      return null;
    }

    const now = this.now();
    const suspended = this.options.isSuspended();
    if (suspended || this.suspended !== suspended) {
      // Tool-owned time is not model wait time: restart both clocks so a long
      // command, a pending approval, or a question cannot trip the watchdog.
      this.suspended = suspended;
      this.lastActivityAt = now;
      this.waitingStartedAt = now;
      if (suspended) return null;
    }

    const idleMs = now - this.lastActivityAt;
    // Only time spent waiting on the model counts: a suspended stretch resets
    // waitingStartedAt, so tool time never accumulates here.
    const waitingMs = now - this.waitingStartedAt;
    if (idleMs < this.limits.idleMs && waitingMs < this.limits.durationMs) return null;

    const verdict: PiTurnStallVerdict = {
      kind: idleMs >= this.limits.idleMs ? PiTurnStallKind.Idle : PiTurnStallKind.Duration,
      idleMs,
      waitingMs,
    };
    this.fired = true;
    this.fire(verdict);
    return verdict;
  }

  /** Stops the watchdog and any pending grace callback. */
  dispose(): void {
    this.armed = false;
    if (this.interval) {
      this.timers.cancel(this.interval);
      this.interval = null;
    }
    if (this.grace) {
      this.timers.cancel(this.grace);
      this.grace = null;
    }
  }

  private fire(verdict: PiTurnStallVerdict): void {
    if (this.interval) {
      this.timers.cancel(this.interval);
      this.interval = null;
    }
    this.options.onStall(verdict);
    // The runtime normally settles the aborted turn and surfaces the error on
    // its own. If it never does, this is the last chance to stop the spinner.
    this.grace = this.timers.later(() => {
      this.grace = null;
      if (this.armed && this.options.isRunning()) this.options.onUnsettled(verdict);
    }, this.limits.settleGraceMs);
  }
}
