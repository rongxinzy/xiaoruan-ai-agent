import type { ActivitySource, ActivityStatus } from './constants';

/** Durable, display-only snapshot of a channel or scheduled-task execution. */
export interface ActivityRun {
  id: string;
  source: ActivitySource;
  status: ActivityStatus;
  startedAt: number;
  updatedAt: number;
  sessionId?: string;
  platform?: string;
  conversationId?: string;
  taskName?: string;
  inputPreview?: string;
  replyPreview?: string;
  errorMessage?: string;
  /**
   * Classification of {@link errorMessage} (a CoworkErrorKind value) so surfaces
   * can show localized copy even when the stored message is English. Absent for
   * messages that could not be classified.
   */
  errorCode?: string;
}

export type ActivityRunUpdate = Omit<ActivityRun, 'startedAt' | 'updatedAt'> & {
  startedAt?: number;
  updatedAt?: number;
};
