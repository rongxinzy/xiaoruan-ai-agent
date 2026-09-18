import { expect, test, vi } from 'vitest';

import { CoworkErrorKind } from '../../../common/coworkError';
import { createPiTurnStallHandlers, type PiTurnStallActions } from './piTurnStallHandlers';
import { PiTurnStallKind, type PiTurnStallVerdict } from './piTurnStallWatchdog';

const IDLE_VERDICT: PiTurnStallVerdict = {
  kind: PiTurnStallKind.Idle,
  idleMs: 240_000,
  waitingMs: 240_000,
};

const createActions = (overrides: Partial<PiTurnStallActions> = {}) => {
  const calls: string[] = [];
  const actions: PiTurnStallActions = {
    isReportable: () => true,
    hasPendingError: () => true,
    reportTimeout: vi.fn(() => calls.push('report')),
    abortTurn: vi.fn(() => calls.push('abort')),
    surfaceUnsettled: vi.fn(() => calls.push('surface')),
    log: vi.fn(),
    ...overrides,
  };
  return { actions, calls };
};

test('records the timeout before aborting the turn', () => {
  const { actions, calls } = createActions();
  createPiTurnStallHandlers(actions).onStall(IDLE_VERDICT);

  expect(calls).toEqual(['report', 'abort']);
  expect(actions.reportTimeout).toHaveBeenCalledWith({
    kind: CoworkErrorKind.TurnTimeout,
    message: expect.stringContaining('240s'),
  });
  expect(actions.log).toHaveBeenCalledWith(expect.stringContaining('240s'));
});

test('leaves a turn another error already owns alone', () => {
  const { actions } = createActions({ isReportable: () => false });
  createPiTurnStallHandlers(actions).onStall(IDLE_VERDICT);

  expect(actions.reportTimeout).not.toHaveBeenCalled();
  expect(actions.abortTurn).not.toHaveBeenCalled();
  expect(actions.log).not.toHaveBeenCalled();
});

test('surfaces a timeout the runtime never settled', () => {
  const { actions } = createActions();
  createPiTurnStallHandlers(actions).onUnsettled();

  expect(actions.surfaceUnsettled).toHaveBeenCalledOnce();
});

test('does not surface an unsettled stall when nothing is pending', () => {
  const { actions } = createActions({ hasPendingError: () => false });
  createPiTurnStallHandlers(actions).onUnsettled();

  expect(actions.surfaceUnsettled).not.toHaveBeenCalled();
  expect(actions.log).not.toHaveBeenCalled();
});
