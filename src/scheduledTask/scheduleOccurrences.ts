import { CronExpressionParser } from 'cron-parser';

import { ScheduleKind } from './constants';
import type { Schedule } from './types';

/** Shortest gap between a missed boundary and startup that still runs once now. */
export const CATCH_UP_MIN_WINDOW_MS = 5 * 60_000;
/** Longest gap, so a stale boundary is never replayed much later. */
export const CATCH_UP_MAX_WINDOW_MS = 30 * 60_000;

/**
 * Bound on the forward scan that locates the newest missed boundary. Hitting it
 * means at least 200 intervals elapsed, which is far beyond any catch-up window.
 */
const MAX_MISSED_SCAN_STEPS = 200;

/** What a task's schedule implies for one startup pass. */
export interface StartupSchedulePlan {
  /** Oldest boundary that elapsed while the app was not running. */
  firstMissedAtMs: number;
  /** Newest boundary at or before startup. */
  lastDueAtMs: number;
  missedCount: number;
  /** True when the scan stopped at its bound, so missedCount is a lower bound. */
  missedCountTruncated: boolean;
  /** Boundary to run once now, or null when the schedule must not catch up. */
  catchUpDueAtMs: number | null;
}

/**
 * The value shown as the next run. `cron` is wall-clock aligned, so it matches
 * the sidecar clock exactly. `every` stores no anchor, so after a restart the
 * phase belongs to the sidecar: a value derived from a stale anchor would
 * already be in the past, so fall back to one interval from now and let the
 * first real trigger correct it.
 */
export function computeNextRunAtMs(input: {
  schedule: Schedule;
  enabled: boolean;
  nowMs: number;
  lastRunAtMs: number | null;
  createdAtMs: number;
}): number | null {
  if (!input.enabled) return null;
  const { schedule } = input;
  if (schedule.kind === ScheduleKind.At) {
    const atMs = Date.parse(schedule.at);
    return Number.isFinite(atMs) && atMs > input.nowMs ? atMs : null;
  }
  if (schedule.kind === ScheduleKind.Every) {
    const everyMs = schedule.everyMs;
    if (!Number.isFinite(everyMs) || everyMs <= 0) return null;
    const anchorMs = schedule.anchorMs ?? input.lastRunAtMs ?? input.createdAtMs;
    const next = anchorMs + (Math.floor((input.nowMs - anchorMs) / everyMs) + 1) * everyMs;
    return next > input.nowMs ? next : input.nowMs + everyMs;
  }
  if (schedule.kind === ScheduleKind.Cron) {
    return nextCronBoundaryAfter(schedule.expr, schedule.tz, input.nowMs);
  }
  return null;
}

/**
 * Identifies the boundaries missed since the last recorded run.
 *
 * `every` returns null: the sidecar re-anchors that kind on every registration,
 * so no cycle was actually skipped and catching up would run one extra time.
 */
export function planStartupSchedule(input: {
  schedule: Schedule;
  enabled: boolean;
  nowMs: number;
  lastRunAtMs: number | null;
  createdAtMs: number;
}): StartupSchedulePlan | null {
  if (!input.enabled) return null;
  const { schedule } = input;
  const referenceMs = input.lastRunAtMs ?? input.createdAtMs;

  if (schedule.kind === ScheduleKind.At) {
    const atMs = Date.parse(schedule.at);
    if (!Number.isFinite(atMs) || atMs > input.nowMs || atMs <= referenceMs) return null;
    return {
      firstMissedAtMs: atMs,
      lastDueAtMs: atMs,
      missedCount: 1,
      missedCountTruncated: false,
      catchUpDueAtMs: catchUpTarget(atMs, CATCH_UP_MIN_WINDOW_MS, input.nowMs),
    };
  }

  if (schedule.kind !== ScheduleKind.Cron) return null;

  const firstMissedAtMs = nextCronBoundaryAfter(schedule.expr, schedule.tz, referenceMs);
  if (firstMissedAtMs === null || firstMissedAtMs > input.nowMs) return null;

  let lastDueAtMs = firstMissedAtMs;
  let missedCount = 1;
  while (missedCount < MAX_MISSED_SCAN_STEPS) {
    const boundary = nextCronBoundaryAfter(schedule.expr, schedule.tz, lastDueAtMs);
    if (boundary === null || boundary > input.nowMs) break;
    lastDueAtMs = boundary;
    missedCount += 1;
  }
  const missedCountTruncated = missedCount >= MAX_MISSED_SCAN_STEPS;
  const periodMs =
    (nextCronBoundaryAfter(schedule.expr, schedule.tz, lastDueAtMs) ?? lastDueAtMs) - lastDueAtMs;
  const windowMs = Math.min(Math.max(periodMs, CATCH_UP_MIN_WINDOW_MS), CATCH_UP_MAX_WINDOW_MS);

  return {
    firstMissedAtMs,
    lastDueAtMs,
    missedCount,
    missedCountTruncated,
    // A truncated scan cannot vouch for how old the newest boundary is.
    catchUpDueAtMs: missedCountTruncated ? null : catchUpTarget(lastDueAtMs, windowMs, input.nowMs),
  };
}

function catchUpTarget(dueAtMs: number, windowMs: number, nowMs: number): number | null {
  return nowMs - dueAtMs <= windowMs ? dueAtMs : null;
}

function nextCronBoundaryAfter(
  expr: string,
  tz: string | undefined,
  afterMs: number,
): number | null {
  try {
    const interval = CronExpressionParser.parse(expr, {
      currentDate: new Date(afterMs),
      ...(tz ? { tz } : {}),
    });
    return interval.hasNext() ? interval.next().getTime() : null;
  } catch {
    // An expression the canonical clock rejected must not break the caller.
    return null;
  }
}
