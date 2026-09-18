import { expect, test } from 'vitest';

import { ScheduleKind } from './constants';
import { computeNextRunAtMs, planStartupSchedule } from './scheduleOccurrences';
import type { Schedule } from './types';

const CRON_QUARTER_HOURLY: Schedule = { kind: ScheduleKind.Cron, expr: '*/15 * * * *' };
const CREATED_AT_MS = Date.parse('2026-09-18T01:50:00.000Z');

function minute(iso: string): number {
  return Date.parse(iso);
}

test('places the next cron run on the next wall-clock boundary', () => {
  expect(
    computeNextRunAtMs({
      schedule: CRON_QUARTER_HOURLY,
      enabled: true,
      nowMs: minute('2026-09-18T03:07:00.000Z'),
      lastRunAtMs: null,
      createdAtMs: CREATED_AT_MS,
    }),
  ).toBe(minute('2026-09-18T03:15:00.000Z'));
});

test('honors the declared time zone when placing a cron run', () => {
  expect(
    computeNextRunAtMs({
      schedule: { kind: ScheduleKind.Cron, expr: '0 9 * * *', tz: 'UTC' },
      enabled: true,
      nowMs: minute('2026-09-18T00:00:00.000Z'),
      lastRunAtMs: null,
      createdAtMs: CREATED_AT_MS,
    }),
  ).toBe(minute('2026-09-18T09:00:00.000Z'));
});

test('returns null for a disabled task or an unparsable expression', () => {
  expect(
    computeNextRunAtMs({
      schedule: CRON_QUARTER_HOURLY,
      enabled: false,
      nowMs: minute('2026-09-18T03:07:00.000Z'),
      lastRunAtMs: null,
      createdAtMs: CREATED_AT_MS,
    }),
  ).toBeNull();
  expect(
    computeNextRunAtMs({
      schedule: { kind: ScheduleKind.Cron, expr: 'not a cron' },
      enabled: true,
      nowMs: minute('2026-09-18T03:07:00.000Z'),
      lastRunAtMs: null,
      createdAtMs: CREATED_AT_MS,
    }),
  ).toBeNull();
});

test('estimates the next interval run from the last known anchor', () => {
  expect(
    computeNextRunAtMs({
      schedule: { kind: ScheduleKind.Every, everyMs: 15 * 60_000 },
      enabled: true,
      nowMs: minute('2026-09-18T03:07:00.000Z'),
      lastRunAtMs: minute('2026-09-18T01:50:00.000Z'),
      createdAtMs: CREATED_AT_MS,
    }),
  ).toBe(minute('2026-09-18T03:20:00.000Z'));
});

test('reports the newest boundary a short outage missed for one catch-up run', () => {
  expect(
    planStartupSchedule({
      schedule: CRON_QUARTER_HOURLY,
      enabled: true,
      nowMs: minute('2026-09-18T03:20:00.000Z'),
      lastRunAtMs: minute('2026-09-18T01:50:00.000Z'),
      createdAtMs: CREATED_AT_MS,
    }),
  ).toEqual({
    firstMissedAtMs: minute('2026-09-18T02:00:00.000Z'),
    lastDueAtMs: minute('2026-09-18T03:15:00.000Z'),
    missedCount: 6,
    missedCountTruncated: false,
    catchUpDueAtMs: minute('2026-09-18T03:15:00.000Z'),
  });
});

test('drops the catch-up once the newest missed boundary is older than the window', () => {
  const plan = planStartupSchedule({
    schedule: { kind: ScheduleKind.Cron, expr: '0 * * * *' },
    enabled: true,
    nowMs: minute('2026-09-18T03:45:00.000Z'),
    lastRunAtMs: minute('2026-09-18T01:10:00.000Z'),
    createdAtMs: CREATED_AT_MS,
  });
  expect(plan).toMatchObject({
    firstMissedAtMs: minute('2026-09-18T02:00:00.000Z'),
    lastDueAtMs: minute('2026-09-18T03:00:00.000Z'),
    missedCount: 2,
    catchUpDueAtMs: null,
  });
});

test('stops counting after the scan bound and never catches up a truncated outage', () => {
  const plan = planStartupSchedule({
    schedule: { kind: ScheduleKind.Cron, expr: '* * * * *' },
    enabled: true,
    nowMs: minute('2026-09-18T03:00:00.000Z'),
    lastRunAtMs: minute('2026-09-15T02:00:00.000Z'),
    createdAtMs: CREATED_AT_MS,
  });
  expect(plan).toMatchObject({
    firstMissedAtMs: minute('2026-09-15T02:01:00.000Z'),
    missedCount: 200,
    missedCountTruncated: true,
    catchUpDueAtMs: null,
  });
});

test('summarizes a one-shot run that fired while the app was closed', () => {
  const schedule: Schedule = { kind: ScheduleKind.At, at: '2026-09-18T02:30:00.000Z' };
  expect(
    planStartupSchedule({
      schedule,
      enabled: true,
      nowMs: minute('2026-09-18T02:31:00.000Z'),
      lastRunAtMs: minute('2026-09-18T00:00:00.000Z'),
      createdAtMs: CREATED_AT_MS,
    }),
  ).toEqual({
    firstMissedAtMs: minute('2026-09-18T02:30:00.000Z'),
    lastDueAtMs: minute('2026-09-18T02:30:00.000Z'),
    missedCount: 1,
    missedCountTruncated: false,
    catchUpDueAtMs: minute('2026-09-18T02:30:00.000Z'),
  });
  expect(
    planStartupSchedule({
      schedule,
      enabled: true,
      nowMs: minute('2026-09-18T03:00:00.000Z'),
      lastRunAtMs: minute('2026-09-18T00:00:00.000Z'),
      createdAtMs: CREATED_AT_MS,
    })?.catchUpDueAtMs,
  ).toBeNull();
});

test('leaves interval schedules to the sidecar because it re-anchors them', () => {
  expect(
    planStartupSchedule({
      schedule: { kind: ScheduleKind.Every, everyMs: 60_000 },
      enabled: true,
      nowMs: minute('2026-09-18T03:20:00.000Z'),
      lastRunAtMs: minute('2026-09-18T01:50:00.000Z'),
      createdAtMs: CREATED_AT_MS,
    }),
  ).toBeNull();
});
