import { planStartupSchedule } from './scheduleOccurrences';
import type { SchedulerRuntime } from './schedulerRuntime';
import type { SqliteScheduledTaskStore } from './sqliteScheduledTaskStore';
import type { ScheduledTask } from './types';

/**
 * One startup pass over the canonical schedule.
 *
 * Closing the app silently discards every sidecar trigger, so the durable
 * records must be reconstructed from the schedule itself: refresh the displayed
 * next trigger, summarize the boundaries that were missed while the app was
 * closed, and replay the newest one when the app came back inside the catch-up
 * window. `every` schedules are deliberately left alone: the sidecar re-anchors
 * them on every registration, so nothing was actually skipped.
 */
export async function recoverScheduledTasksOnStartup(input: {
  store: SqliteScheduledTaskStore;
  runtime: Pick<SchedulerRuntime, 'runCatchUp'>;
  now?: () => number;
}): Promise<void> {
  const nowMs = (input.now ?? Date.now)();
  const catchUps: Array<{ task: ScheduledTask; scheduledAt: string }> = [];

  for (const task of input.store.list()) {
    const createdAtMs = Date.parse(task.createdAt);
    const plan = planStartupSchedule({
      schedule: task.schedule,
      enabled: task.enabled,
      nowMs,
      lastRunAtMs: task.state.lastRunAtMs,
      createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : nowMs,
    });
    if (!plan) continue;
    // The boundary replayed below is not a skip, so it stays out of the summary.
    const missedCount = plan.catchUpDueAtMs === null ? plan.missedCount : plan.missedCount - 1;
    if (missedCount > 0) {
      const skipped = input.store.recordSkippedRun({
        taskId: task.id,
        firstMissedAtMs: plan.firstMissedAtMs,
        missedCount,
        missedCountTruncated: plan.missedCountTruncated,
      });
      if (skipped) {
        console.log(`[Scheduler] recorded ${missedCount} skipped run(s) for task ${task.name}`);
      }
    }
    if (plan.catchUpDueAtMs !== null) {
      catchUps.push({ task, scheduledAt: new Date(plan.catchUpDueAtMs).toISOString() });
    }
  }

  // The refresh runs last so the displayed trigger wins over the skip summary.
  input.store.refreshAllNextRunAtMs(nowMs);

  for (const catchUp of catchUps) {
    try {
      console.log(
        `[Scheduler] catching up the ${catchUp.scheduledAt} run of task ${catchUp.task.name} after startup`,
      );
      await input.runtime.runCatchUp(catchUp.task, catchUp.scheduledAt);
    } catch (error) {
      // A failed catch-up is already recorded as a failed Run; startup continues.
      console.error(`[Scheduler] catch-up run failed for task ${catchUp.task.id}:`, error);
    }
  }
}
