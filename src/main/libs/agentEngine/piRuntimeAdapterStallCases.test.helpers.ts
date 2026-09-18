/**
 * Turn-stall integration cases for PiRuntimeAdapter.
 *
 * These drive the real path (Pi event -> handlePiEvent -> watchdog ->
 * flushPendingError) against the caller's mocked Pi session, so they assert the
 * wiring rather than the watchdog in isolation. They live in their own module
 * because piRuntimeAdapter.test.ts has outgrown the repository file limit; the
 * test file imports this registration helper and supplies the harness.
 *
 * The .test.helpers.ts suffix keeps the electron build out of it: the build
 * excludes *.test.*, and vitest only collects *.test.ts, so this module is
 * neither shipped with the app nor collected as a suite of its own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoworkErrorKind, type CoworkError } from '../../../common/coworkError';
import type { CoworkMessage } from '../../coworkStore';
import type { PiRuntimeAdapter } from './piRuntimeAdapter';
import { PI_TURN_STALL_LIMITS } from './piTurnStallWatchdog';

export type PiTurnStallCaseHarness = {
  /** The adapter under test; the caller recreates it before every case. */
  getAdapter: () => PiRuntimeAdapter;
  /** Starts a session so the adapter subscribes to Pi events. */
  startSession: (sessionId: string, prompt: string) => Promise<void>;
  /** The Pi event listener captured from the mocked session subscription. */
  getPiListener: () => (event: unknown) => void;
  /** True once the runtime aborted the in-flight Pi turn. */
  hasAbortedTurn: () => boolean;
};

/** The silence clock fires on the first tick at or past the idle limit. */
const IDLE_MS = PI_TURN_STALL_LIMITS.idleMs;

/** Leaves room for the next tick after a tool hands the turn back to the model. */
const IDLE_TICK_MS = PI_TURN_STALL_LIMITS.idleMs + PI_TURN_STALL_LIMITS.tickMs;

/**
 * Date must be faked as well as the timers: the watchdog measures silence with
 * Date.now(), so advancing timers alone would leave every verdict at zero.
 */
const enableFakeClock = (): void => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
};

const truncatedWrite = (id: string) => ({
  type: 'message_end',
  message: {
    role: 'assistant',
    stopReason: 'length',
    content: [{ type: 'toolCall', id, name: 'write', arguments: { path: 'large.md' } }],
  },
});

export const registerPiTurnStallCases = (harness: PiTurnStallCaseHarness): void => {
  describe('turn stall integration', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const collect = (adapter: PiRuntimeAdapter) => {
      const errors: CoworkError[] = [];
      const messages: CoworkMessage[] = [];
      const completions: unknown[] = [];
      adapter.on('error', (_sessionId, error) => errors.push(error));
      adapter.on('message', (_sessionId, message) => messages.push(message));
      adapter.on('complete', (_sessionId, payload) => completions.push(payload));
      return { errors, messages, completions };
    };

    it('stops a silent turn without completing it', async () => {
      const adapter = harness.getAdapter();
      const { errors, completions } = collect(adapter);
      enableFakeClock();
      await harness.startSession('test', 'Write a report');

      harness.getPiListener()({ type: 'turn_start' });

      vi.advanceTimersByTime(IDLE_MS);

      expect(harness.hasAbortedTurn()).toBe(true);
      // The error stays deferred until Pi settles the aborted turn.
      expect(errors).toHaveLength(0);
      expect(completions).toHaveLength(0);
    });

    it('reports the timeout once the aborted turn settles', async () => {
      const adapter = harness.getAdapter();
      const { errors, messages, completions } = collect(adapter);
      enableFakeClock();
      await harness.startSession('test', 'Write a report');
      const listener = harness.getPiListener();

      listener({ type: 'turn_start' });
      vi.advanceTimersByTime(IDLE_MS);
      // Pi reports the aborted turn as a plain stop; that must not clear it.
      listener({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'partial answer' }],
          stopReason: 'aborted',
        },
      });
      expect(errors).toHaveLength(0);

      listener({ type: 'agent_settled' });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.kind).toBe(CoworkErrorKind.TurnTimeout);
      expect(
        messages.some(message => message.metadata?.errorKind === CoworkErrorKind.TurnTimeout),
      ).toBe(true);
      expect(completions).toHaveLength(0);
    });

    it('reports the timeout directly when the aborted turn never settles', async () => {
      const adapter = harness.getAdapter();
      const { errors } = collect(adapter);
      enableFakeClock();
      await harness.startSession('test', 'Write a report');

      harness.getPiListener()({ type: 'turn_start' });

      vi.advanceTimersByTime(IDLE_TICK_MS + PI_TURN_STALL_LIMITS.settleGraceMs);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.kind).toBe(CoworkErrorKind.TurnTimeout);
    });

    it('does not count time owned by a running tool', async () => {
      const adapter = harness.getAdapter();
      const { errors } = collect(adapter);
      enableFakeClock();
      await harness.startSession('test', 'Write a report');
      const listener = harness.getPiListener();

      listener({ type: 'turn_start' });
      listener({ type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'Bash', args: {} });
      vi.advanceTimersByTime(PI_TURN_STALL_LIMITS.idleMs * 2);

      expect(harness.hasAbortedTurn()).toBe(false);
      expect(errors).toHaveLength(0);

      listener({
        type: 'tool_execution_end',
        toolCallId: 'call-1',
        toolName: 'Bash',
        result: 'done',
        isError: false,
      });
      vi.advanceTimersByTime(IDLE_TICK_MS);

      expect(harness.hasAbortedTurn()).toBe(true);
    });

    it('reports a truncated write the guidance budget could not recover', async () => {
      const adapter = harness.getAdapter();
      const { errors } = collect(adapter);
      await harness.startSession('test', 'Write a large file');
      const listener = harness.getPiListener();

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        listener(truncatedWrite(`write-${attempt}`));
      }
      expect(errors).toHaveLength(0);

      listener(truncatedWrite('write-5'));
      listener({ type: 'agent_settled' });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.kind).toBe(CoworkErrorKind.FileWriteTruncated);
    });
  });
};
