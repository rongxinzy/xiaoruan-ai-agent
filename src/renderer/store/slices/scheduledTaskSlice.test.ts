import { expect, test } from 'vitest';

import { TaskStatus } from '../../../scheduledTask/constants';
import type { ScheduledTaskRunWithName } from '../../../scheduledTask/types';
import scheduledTaskReducer, {
  addOrUpdateRun,
  setAllRuns,
  setListError,
  setTasks,
} from './scheduledTaskSlice';

function runWithName(
  id: string,
  status: TaskStatus,
  startedAt: string,
): ScheduledTaskRunWithName {
  return {
    id,
    taskId: 'task-1',
    taskName: 'task',
    sessionId: null,
    sessionKey: null,
    status,
    startedAt,
    finishedAt: null,
    durationMs: null,
    error: null,
  };
}

test('keeps task-list errors separate from operation errors', () => {
  const failedState = scheduledTaskReducer(undefined, setListError('gateway unavailable'));

  expect(failedState.listError).toBe('gateway unavailable');
  expect(failedState.error).toBeNull();

  const recoveredState = scheduledTaskReducer(failedState, setTasks([]));
  expect(recoveredState.listError).toBeNull();
});

test('routes a pushed run into both the task history and the all-task history', () => {
  const existing = runWithName('run-1', TaskStatus.Success, '2026-09-17T09:45:00.000Z');
  const loaded = scheduledTaskReducer(undefined, setAllRuns({ runs: [existing], hasMore: false }));

  const pushed = runWithName('run-2', TaskStatus.Running, '2026-09-18T03:00:00.000Z');
  const state = scheduledTaskReducer(loaded, addOrUpdateRun(pushed));

  expect(state.runs['task-1'].map(run => run.id)).toEqual(['run-2']);
  expect(state.allRuns.map(run => run.id)).toEqual(['run-2', 'run-1']);
});

test('replaces a pushed run in both lists when it finishes', () => {
  const running = runWithName('run-2', TaskStatus.Running, '2026-09-18T03:00:00.000Z');
  const loaded = scheduledTaskReducer(undefined, setAllRuns({ runs: [running], hasMore: false }));
  const claimed = scheduledTaskReducer(loaded, addOrUpdateRun(running));

  const finished = {
    ...running,
    status: TaskStatus.Success,
    finishedAt: '2026-09-18T03:00:31.000Z',
    durationMs: 31_000,
  };
  const state = scheduledTaskReducer(claimed, addOrUpdateRun(finished));

  expect(state.runs['task-1']).toHaveLength(1);
  expect(state.runs['task-1'][0].status).toBe(TaskStatus.Success);
  expect(state.allRuns).toHaveLength(1);
  expect(state.allRuns[0].status).toBe(TaskStatus.Success);
});

test('does not materialize the all-task history before it has been loaded', () => {
  const state = scheduledTaskReducer(
    undefined,
    addOrUpdateRun(runWithName('run-2', TaskStatus.Running, '2026-09-18T03:00:00.000Z')),
  );

  expect(state.allRuns).toEqual([]);
});
