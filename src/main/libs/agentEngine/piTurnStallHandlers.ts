/**
 * Turns a stall verdict into one visible timeout for the session.
 *
 * The adapter owns session state, so it supplies the actions; this module owns
 * the decision of when a stall becomes user-visible and in what order the work
 * happens. Two rules live here:
 * - A stall is reported only when no other error already owns the turn, so a
 *   stalled turn never produces a second error bubble.
 * - The timeout is recorded before the turn is aborted, because the abort makes
 *   Pi settle the turn with a plain `aborted` stop reason, which must not be
 *   mistaken for a completed turn.
 */
import { CoworkErrorKind, makeCoworkError, type CoworkError } from '../../../common/coworkError';
import { formatPiTurnStallMessage, type PiTurnStallVerdict } from './piTurnStallWatchdog';

export type PiTurnStallActions = {
  /** False once another error owns this turn or the turn is already aborted. */
  isReportable: () => boolean;
  /** True while a recorded timeout is still waiting to be surfaced. */
  hasPendingError: () => boolean;
  /** Records the timeout as the turn's deferred, sticky error. */
  reportTimeout: (classified: CoworkError) => void;
  /** Stops the stalled turn and any tool it is still running. */
  abortTurn: () => void;
  /** Surfaces a timeout the runtime never settled (the settle grace expired). */
  surfaceUnsettled: () => void;
  /** Diagnostics sink; defaults to the main-process console. */
  log?: (message: string) => void;
};

export type PiTurnStallHandlers = {
  onStall: (verdict: PiTurnStallVerdict) => void;
  onUnsettled: () => void;
};

export const createPiTurnStallHandlers = (actions: PiTurnStallActions): PiTurnStallHandlers => {
  const log = actions.log ?? ((message: string): void => console.warn(`[PiRuntime] ${message}`));

  return {
    onStall: verdict => {
      if (!actions.isReportable()) return;
      const message = formatPiTurnStallMessage(verdict);
      log(message);
      actions.reportTimeout(makeCoworkError(CoworkErrorKind.TurnTimeout, message));
      actions.abortTurn();
    },
    onUnsettled: () => {
      if (!actions.hasPendingError()) return;
      log('stalled turn did not settle, reporting the timeout directly');
      actions.surfaceUnsettled();
    },
  };
};
