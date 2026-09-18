import { expect, test, vi } from 'vitest';

import {
  formatPiTurnStallMessage,
  PI_TURN_STALL_LIMITS,
  PiTurnStallKind,
  PiTurnStallWatchdog,
  type PiTurnStallTimerHandle,
  type PiTurnStallTimers,
} from './piTurnStallWatchdog';

// Derived from the shipped limits so a threshold change cannot silently leave
// these cases asserting the old number.
const IDLE_MS = PI_TURN_STALL_LIMITS.idleMs;

const createHarness = (options?: { running?: boolean; suspended?: boolean }) => {
  let nowSeconds = 1_000_000;
  let running = options?.running ?? true;
  let suspended = options?.suspended ?? false;
  let nextHandle = 0;
  const cancelled = new Set<number>();
  const graceCallbacks: Array<() => void> = [];

  const timers: PiTurnStallTimers = {
    every: () => (nextHandle += 1) as unknown as PiTurnStallTimerHandle,
    later: handler => {
      nextHandle += 1;
      graceCallbacks.push(handler);
      return nextHandle as unknown as PiTurnStallTimerHandle;
    },
    cancel: handle => cancelled.add(handle as unknown as number),
  };

  const onStall = vi.fn();
  const onUnsettled = vi.fn();
  const watchdog = new PiTurnStallWatchdog({
    onStall,
    onUnsettled,
    isRunning: () => running,
    isSuspended: () => suspended,
    timers,
    now: () => nowSeconds * 1000,
  });

  return {
    watchdog,
    onStall,
    onUnsettled,
    advance: (seconds: number) => {
      nowSeconds += seconds;
    },
    setRunning: (value: boolean) => {
      running = value;
    },
    setSuspended: (value: boolean) => {
      suspended = value;
    },
    runGraceCallback: () => {
      const handler = graceCallbacks.shift();
      expect(handler).toBeDefined();
      handler?.();
    },
    hasGraceCallback: () => graceCallbacks.length > 0,
  };
};

test('reports a stalled turn once the idle limit passes, and only once', () => {
  const harness = createHarness();
  harness.watchdog.arm();

  harness.advance(IDLE_MS / 1000 - 1);
  expect(harness.watchdog.check()).toBeNull();

  harness.advance(1);
  const verdict = harness.watchdog.check();
  expect(verdict).toMatchObject({ kind: PiTurnStallKind.Idle, idleMs: IDLE_MS });
  expect(harness.onStall).toHaveBeenCalledTimes(1);

  harness.advance(60);
  expect(harness.watchdog.check()).toBeNull();
  expect(harness.onStall).toHaveBeenCalledTimes(1);
});

test('treats activity as progress', () => {
  const harness = createHarness();
  harness.watchdog.arm();

  for (let elapsed = 0; elapsed < 10; elapsed += 1) {
    harness.advance(60);
    harness.watchdog.noteActivity();
    expect(harness.watchdog.check()).toBeNull();
  }
  expect(harness.onStall).not.toHaveBeenCalled();
});

test('does not count time owned by a tool or a pending approval', () => {
  const harness = createHarness();
  harness.watchdog.arm();
  harness.setSuspended(true);

  harness.advance(600);
  expect(harness.watchdog.check()).toBeNull();

  harness.setSuspended(false);
  // Resuming restarts the silence clock: tool time never counts as model time.
  expect(harness.watchdog.check()).toBeNull();
  harness.advance(IDLE_MS / 1000 - 1);
  expect(harness.watchdog.check()).toBeNull();

  harness.advance(1);
  expect(harness.watchdog.check()).toMatchObject({ kind: PiTurnStallKind.Idle });
});

test('reports a runaway turn even while it keeps producing output', () => {
  const harness = createHarness();
  harness.watchdog.arm();

  const steps = PI_TURN_STALL_LIMITS.durationMs / 30_000;
  for (let step = 1; step <= steps; step += 1) {
    harness.advance(30);
    harness.watchdog.noteActivity();
    const verdict = harness.watchdog.check();
    if (step < steps) {
      expect(verdict).toBeNull();
      continue;
    }
    expect(verdict).toMatchObject({ kind: PiTurnStallKind.Duration });
    expect(verdict?.idleMs).toBe(0);
  }
  expect(harness.onStall).toHaveBeenCalledTimes(1);
});

test('disarms itself once the session is no longer running', () => {
  const harness = createHarness();
  harness.watchdog.arm();
  harness.setRunning(false);

  harness.advance(10_000);
  expect(harness.watchdog.check()).toBeNull();

  harness.setRunning(true);
  harness.advance(10_000);
  expect(harness.watchdog.check()).toBeNull();
  expect(harness.onStall).not.toHaveBeenCalled();
});

test('re-arms for the next turn after a stall', () => {
  const harness = createHarness();
  harness.watchdog.arm();
  harness.advance(IDLE_MS / 1000);
  expect(harness.watchdog.check()).not.toBeNull();

  harness.watchdog.arm();
  harness.advance(IDLE_MS / 1000);
  expect(harness.watchdog.check()).not.toBeNull();
  expect(harness.onStall).toHaveBeenCalledTimes(2);
});

test('reports an unsettled stall when the runtime never settles the turn', () => {
  const harness = createHarness();
  harness.watchdog.arm();
  harness.advance(IDLE_MS / 1000);
  const verdict = harness.watchdog.check();
  expect(harness.hasGraceCallback()).toBe(true);

  harness.runGraceCallback();
  expect(harness.onUnsettled).toHaveBeenCalledWith(verdict);
});

test('skips the unsettled report when the runtime settles in time', () => {
  const harness = createHarness();
  harness.watchdog.arm();
  harness.advance(IDLE_MS / 1000);
  harness.watchdog.check();

  harness.setRunning(false);
  harness.runGraceCallback();
  expect(harness.onUnsettled).not.toHaveBeenCalled();
});

test('formats a user-facing reason for each stall kind', () => {
  expect(
    formatPiTurnStallMessage({ kind: PiTurnStallKind.Idle, idleMs: 132_000, waitingMs: 132_000 }),
  ).toContain('132s');
  expect(
    formatPiTurnStallMessage({
      kind: PiTurnStallKind.Duration,
      idleMs: 800,
      waitingMs: 900_000,
    }),
  ).toContain('900s');
});
