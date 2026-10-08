import Database from 'better-sqlite3';
import { expect, test, vi } from 'vitest';

import {
  ActivityRetention,
  ActivitySource,
  ActivityStatus,
} from '../../shared/activity/constants';

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));

test('persists activity snapshots by run id and returns newest updates first', async () => {
  const { ActivityService } = await import('./activityService');
  const service = new ActivityService(new Database(':memory:'));
  service.upsert({ id: 'channel', source: ActivitySource.Channel, status: ActivityStatus.Running, inputPreview: 'hello', updatedAt: 1 });
  service.upsert({ id: 'task', source: ActivitySource.ScheduledTask, status: ActivityStatus.Running, taskName: 'Daily report', updatedAt: 2 });
  service.upsert({ id: 'channel', source: ActivitySource.Channel, status: ActivityStatus.Completed, replyPreview: 'done', updatedAt: 3 });

  expect(service.list()).toEqual([
    expect.objectContaining({ id: 'channel', status: ActivityStatus.Completed, inputPreview: 'hello', replyPreview: 'done' }),
    expect.objectContaining({ id: 'task', taskName: 'Daily report' }),
  ]);
});

test('ignores an out-of-order update without broadcasting it', async () => {
  const sends: unknown[] = [];
  vi.doMock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (_channel: string, run: unknown) => sends.push(run) } }] } }));
  const { ActivityService } = await import('./activityService');
  const service = new ActivityService(new Database(':memory:'));
  service.upsert({ id: 'run', source: ActivitySource.Channel, status: ActivityStatus.Running, updatedAt: 10 });
  const result = service.upsert({ id: 'run', source: ActivitySource.Channel, status: ActivityStatus.Failed, errorMessage: 'late', updatedAt: 5 });
  expect(result).toMatchObject({ status: ActivityStatus.Running, updatedAt: 10 });
  expect(service.list()[0]).toMatchObject({ status: ActivityStatus.Running, updatedAt: 10 });
});

test('prunes only activity snapshots older than 180 days', async () => {
  const { ActivityService } = await import('./activityService');
  const service = new ActivityService(new Database(':memory:'));
  const now = Date.UTC(2026, 7, 13);
  service.upsert({ id: 'expired', source: ActivitySource.Channel, status: ActivityStatus.Completed, updatedAt: now - ActivityRetention.Milliseconds - 1 });
  service.upsert({ id: 'boundary', source: ActivitySource.Channel, status: ActivityStatus.Completed, updatedAt: now - ActivityRetention.Milliseconds });
  service.upsert({ id: 'recent', source: ActivitySource.ScheduledTask, status: ActivityStatus.Completed, updatedAt: now - 1 });

  expect(service.pruneExpired(now)).toBe(1);
  expect(service.list().map(run => run.id)).toEqual(['recent', 'boundary']);
});

test('recovers interrupted running snapshots during startup', async () => {
  const { ActivityService } = await import('./activityService');
  const service = new ActivityService(new Database(':memory:'));
  service.upsert({ id: 'stale', source: ActivitySource.ScheduledTask, status: ActivityStatus.Running, updatedAt: 10 });
  service.upsert({ id: 'channel', source: ActivitySource.Channel, status: ActivityStatus.Running, platform: 'weixin', updatedAt: 12 });
  service.upsert({ id: 'done', source: ActivitySource.Channel, status: ActivityStatus.Completed, updatedAt: 11 });

  expect(service.recoverInterruptedRuns(20)).toBe(2);
  const runs = service.list();
  const recovered = runs
    .filter(run => run.status === ActivityStatus.Failed)
    .map(run => ({ id: run.id, errorCode: run.errorCode, errorMessage: run.errorMessage, updatedAt: run.updatedAt }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Recovery covers every source, so the copy must not promise another
  // scheduled execution for an interrupted channel run.
  expect(recovered).toEqual([
    {
      id: 'channel',
      errorCode: 'app_interrupted',
      errorMessage: 'Run was interrupted when the application closed.',
      updatedAt: 20,
    },
    {
      id: 'stale',
      errorCode: 'app_interrupted',
      errorMessage: 'Run was interrupted when the application closed.',
      updatedAt: 20,
    },
  ]);
  expect(runs.find(run => run.id === 'done')).toMatchObject({
    status: ActivityStatus.Completed,
    updatedAt: 11,
  });
});

test('logs the raw failure wording once per distinct message so the English stays retrievable', async () => {
  const warnings: string[] = [];
  const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  });
  try {
    const { ActivityService } = await import('./activityService');
    const service = new ActivityService(new Database(':memory:'));
    service.upsert({ id: 'run', source: ActivitySource.ScheduledTask, status: ActivityStatus.Failed, taskName: '天气预报', errorMessage: 'No running instances available', updatedAt: 1 });
    service.upsert({ id: 'run', source: ActivitySource.ScheduledTask, status: ActivityStatus.Failed, taskName: '天气预报', errorMessage: 'No running instances available', updatedAt: 2 });

    const logged = warnings.filter(line => line.includes('No running instances available'));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('[Activity] run run (scheduledTask/天气预报) reported:');
  } finally {
    spy.mockRestore();
  }
});

test('stores the classified code next to the raw failure wording', async () => {
  const { ActivityService } = await import('./activityService');
  const service = new ActivityService(new Database(':memory:'));
  service.upsert({ id: 'timeout', source: ActivitySource.ScheduledTask, status: ActivityStatus.Failed, errorMessage: 'Scheduled task Pi run timed out after 3600000ms', updatedAt: 1 });
  service.upsert({ id: 'platform', source: ActivitySource.ScheduledTask, status: ActivityStatus.Failed, errorMessage: '503: {"message":"No running instances available","code":503,"type":"ServiceUnavailable"}', updatedAt: 2 });
  service.upsert({ id: 'chinese', source: ActivitySource.ScheduledTask, status: ActivityStatus.Failed, errorMessage: '无法连接 AISphere 平台，请检查平台地址。', updatedAt: 3 });

  const runs = service.list();
  expect(runs[2]).toMatchObject({ id: 'timeout', errorCode: 'scheduled_task_timeout' });
  expect(runs[1]).toMatchObject({ id: 'platform', errorCode: 'server_error' });
  // Already-localized copy stays unclassified so surfaces keep its own wording.
  expect(runs[0]).toMatchObject({ id: 'chinese' });
  expect(runs[0].errorCode).toBeUndefined();
});
