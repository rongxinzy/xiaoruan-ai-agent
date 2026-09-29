import { expect, test, vi } from 'vitest';

import { CoworkSessionSource } from '../../shared/cowork/constants';
import { renameCoworkSession } from './rename';

test('persists and returns a canonical scheduled title for every supported input prefix', () => {
  const store = {
    getSession: vi.fn(() => ({ source: CoworkSessionSource.Scheduled })),
    updateSession: vi.fn(),
  };
  for (const title of [' report ', '[Cron] report', '[定时]report', 'Scheduled: report']) {
    expect(renameCoworkSession(store, { sessionId: 'session', title })).toEqual({
      success: true,
      title: '[定时]report',
    });
    expect(store.updateSession).toHaveBeenLastCalledWith('session', { title: '[定时]report' });
  }
});

test('keeps a manual title literal and rejects empty names or a missing session', () => {
  const store = {
    getSession: vi.fn<() => { source: CoworkSessionSource } | null>(() => ({
      source: CoworkSessionSource.Manual,
    })),
    updateSession: vi.fn(),
  };
  expect(renameCoworkSession(store, { sessionId: 'session', title: ' [Cron] report ' }).title).toBe(
    '[Cron] report',
  );
  store.getSession.mockReturnValue({ source: CoworkSessionSource.Scheduled });
  store.updateSession.mockClear();
  for (const title of [' ', '[Cron]', '[定时]', 'Scheduled: ']) {
    expect(renameCoworkSession(store, { sessionId: 'session', title }).success).toBe(false);
  }
  store.getSession.mockReturnValue(null);
  expect(renameCoworkSession(store, { sessionId: 'missing', title: 'report' })).toEqual({
    success: false,
    error: 'Session not found',
  });
  expect(store.updateSession).not.toHaveBeenCalled();
});
