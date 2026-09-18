import Database from 'better-sqlite3';
import { expect, test, vi } from 'vitest';

import {
  DeliveryMode,
  PayloadKind,
  ScheduleKind,
  SessionTarget,
  TaskStatus,
  WakeMode,
} from './constants';
import { recoverScheduledTasksOnStartup } from './scheduledTaskStartupRecovery';
import { SqliteScheduledTaskStore } from './sqliteScheduledTaskStore';
import type { Schedule, ScheduledTask } from './types';

const NOW_MS = Date.parse('2026-09-18T03:20:00.000Z');
/** Two interval widths past the 03:00 boundary, so it is no longer replayable. */
const STALE_NOW_MS = Date.parse('2026-09-18T03:45:00.000Z');

function setup(schedule: Schedule) {
  const db = new Database(':memory:');
  const store = new SqliteScheduledTaskStore(db);
  const task = store.create({
    name: 'weather',
    description: '',
    enabled: true,
    schedule,
    sessionTarget: SessionTarget.Isolated,
    wakeMode: WakeMode.NextHeartbeat,
    payload: { kind: PayloadKind.AgentTurn, message: 'forecast' },
    delivery: { mode: DeliveryMode.None },
  });
  const runtime = { runCatchUp: vi.fn(async () => undefined) };
  return { db, store, task, runtime };
}

/** Rewrites the task as if the app had been closed since the given run. */
function seedOfflineGap(
  db: Database.Database,
  task: ScheduledTask,
  input: { createdAt: string; lastRunAtMs: number | null },
): void {
  db.prepare('UPDATE zhiyuan_scheduled_tasks SET created_at = ?, state_json = ? WHERE id = ?').run(
    input.createdAt,
    JSON.stringify({ ...task.state, lastRunAtMs: input.lastRunAtMs }),
    task.id,
  );
}

test('replays the newest missed boundary and summarizes the rest', async () => {
  const { db, store, task, runtime } = setup({ kind: ScheduleKind.Cron, expr: '*/15 * * * *' });
  seedOfflineGap(db, task, {
    createdAt: '2026-09-17T08:56:28.731Z',
    lastRunAtMs: Date.parse('2026-09-18T01:50:00.000Z'),
  });

  await recoverScheduledTasksOnStartup({ store, runtime, now: () => NOW_MS });

  expect(runtime.runCatchUp).toHaveBeenCalledTimes(1);
  expect(runtime.runCatchUp.mock.calls[0][0].id).toBe(task.id);
  expect(runtime.runCatchUp.mock.calls[0][1]).toBe('2026-09-18T03:15:00.000Z');
  const runs = store.listRuns(task.id);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ status: TaskStatus.Skipped, durationMs: 0, sessionId: null });
  // Five missed boundaries plus the replayed one, which is not a skip.
  expect(runs[0].error).toContain('5');
  expect(runs[0].error).not.toContain('{count}');
  expect(store.get(task.id)?.state.nextRunAtMs).toBe(Date.parse('2026-09-18T03:30:00.000Z'));
});

test('summarizes an outage that is too old to replay', async () => {
  const { db, store, task, runtime } = setup({ kind: ScheduleKind.Cron, expr: '0 * * * *' });
  seedOfflineGap(db, task, {
    createdAt: '2026-09-17T08:56:28.731Z',
    lastRunAtMs: Date.parse('2026-09-18T01:10:00.000Z'),
  });

  await recoverScheduledTasksOnStartup({ store, runtime, now: () => STALE_NOW_MS });

  expect(runtime.runCatchUp).not.toHaveBeenCalled();
  const runs = store.listRuns(task.id);
  expect(runs).toHaveLength(1);
  expect(runs[0].status).toBe(TaskStatus.Skipped);
  expect(runs[0].error).toContain('2');
});

test('records the offline summary once, even after a second startup', async () => {
  const { db, store, task, runtime } = setup({ kind: ScheduleKind.Cron, expr: '0 * * * *' });
  seedOfflineGap(db, task, {
    createdAt: '2026-09-17T08:56:28.731Z',
    lastRunAtMs: Date.parse('2026-09-18T01:10:00.000Z'),
  });

  await recoverScheduledTasksOnStartup({ store, runtime, now: () => STALE_NOW_MS });
  await recoverScheduledTasksOnStartup({ store, runtime, now: () => STALE_NOW_MS });

  expect(runtime.runCatchUp).not.toHaveBeenCalled();
  expect(store.listRuns(task.id)).toHaveLength(1);
});

test('leaves interval schedules to the re-anchoring sidecar', async () => {
  const { db, store, task, runtime } = setup({ kind: ScheduleKind.Every, everyMs: 60_000 });
  seedOfflineGap(db, task, {
    createdAt: '2026-09-17T08:56:28.731Z',
    lastRunAtMs: Date.parse('2026-09-18T01:50:00.000Z'),
  });

  await recoverScheduledTasksOnStartup({ store, runtime, now: () => NOW_MS });

  expect(runtime.runCatchUp).not.toHaveBeenCalled();
  expect(store.listRuns(task.id)).toHaveLength(0);
});

test('ignores disabled tasks and survives a failed catch-up run', async () => {
  const { db, store, task, runtime } = setup({ kind: ScheduleKind.Cron, expr: '*/15 * * * *' });
  store.update(task.id, { enabled: false });

  await recoverScheduledTasksOnStartup({ store, runtime, now: () => NOW_MS });
  expect(runtime.runCatchUp).not.toHaveBeenCalled();
  expect(store.listRuns(task.id)).toHaveLength(0);

  const enabled = store.update(task.id, { enabled: true });
  seedOfflineGap(db, enabled, {
    createdAt: '2026-09-17T08:56:28.731Z',
    lastRunAtMs: Date.parse('2026-09-18T03:00:00.000Z'),
  });
  runtime.runCatchUp.mockRejectedValueOnce(new Error('pi unavailable'));
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(
    recoverScheduledTasksOnStartup({ store, runtime, now: () => NOW_MS }),
  ).resolves.toBeUndefined();
  consoleError.mockRestore();
  expect(runtime.runCatchUp).toHaveBeenCalledTimes(1);
});
