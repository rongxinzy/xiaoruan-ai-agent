import type {
  ScheduledTask,
  ScheduledTaskInput,
  ScheduledTaskRun,
  ScheduledTaskRunEvent,
  ScheduledTaskStatusEvent,
} from './types';

/** Transport-neutral scheduler boundary. ZhiYuan owns task and run records. */
export interface SchedulerRuntime {
  reconcile(tasks: readonly ScheduledTask[]): Promise<void>;
  register(task: ScheduledTask): Promise<void>;
  remove(taskId: string): Promise<void>;
  runNow(taskId: string): Promise<void>;
  /** Runs one boundary that elapsed while the app was not running. */
  runCatchUp(task: ScheduledTask, scheduledAt: string): Promise<void>;
  handleTrigger(input: { accountId: string; taskId: string; scheduleVersion: string; scheduledAt: string }): Promise<void>;
}

export interface ScheduledTaskStore {
  create(input: ScheduledTaskInput): Promise<ScheduledTask>;
  update(id: string, input: Partial<ScheduledTaskInput>): Promise<ScheduledTask>;
  remove(id: string): Promise<void>;
  list(): Promise<ScheduledTask[]>;
  get(id: string): Promise<ScheduledTask | null>;
  listRuns(taskId: string): Promise<ScheduledTaskRun[]>;
}

/**
 * Renderer fan-out for canonical Run and task-state changes. Implementations
 * must never throw: a failed push must not fail an already durable Run.
 */
export interface SchedulerNotifier {
  runUpdated(event: ScheduledTaskRunEvent): void;
  statusUpdated(event: ScheduledTaskStatusEvent): void;
}
