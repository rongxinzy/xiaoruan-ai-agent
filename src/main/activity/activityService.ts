import { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';

import {
  ActivityIpc,
  ActivityRetention,
  ActivityStatus,
} from '../../shared/activity/constants';
import { classifyCoworkError, CoworkErrorKind } from '../../common/coworkError';
import { shouldAcceptActivityUpdate } from '../../shared/activity/ordering';
import type { ActivityRun, ActivityRunUpdate } from '../../shared/activity/types';

/**
 * Stored code for a run failure. `unknown` is never persisted: surfaces then
 * fall back to classifying the message themselves.
 */
function classifyActivityErrorCode(message: string): string | undefined {
  const kind = classifyCoworkError(message).kind;
  return kind === CoworkErrorKind.Unknown ? undefined : kind;
}

type ActivityRow = {
  id: string; source: ActivityRun['source']; status: ActivityRun['status']; started_at: number; updated_at: number;
  session_id: string | null; platform: string | null; conversation_id: string | null; task_name: string | null;
  input_preview: string | null; reply_preview: string | null; error_message: string | null; error_code: string | null;
};

export class ActivityService {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS zhiyuan_activity_runs (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, status TEXT NOT NULL,
        started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        session_id TEXT, platform TEXT, conversation_id TEXT, task_name TEXT,
        input_preview TEXT, reply_preview TEXT, error_message TEXT, error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_zhiyuan_activity_runs_updated
        ON zhiyuan_activity_runs(updated_at DESC);
    `);
    this.migrateErrorCodeColumn();
  }

  /** Existing databases predate `error_code`; the column is additive and nullable. */
  private migrateErrorCodeColumn(): void {
    const columns = this.db.prepare('PRAGMA table_info(zhiyuan_activity_runs)').all() as Array<{ name: string }>;
    if (columns.some(column => column.name === 'error_code')) return;
    this.db.exec('ALTER TABLE zhiyuan_activity_runs ADD COLUMN error_code TEXT');
  }

  list(limit = 100): ActivityRun[] {
    return (this.db.prepare('SELECT * FROM zhiyuan_activity_runs ORDER BY updated_at DESC LIMIT ?').all(limit) as ActivityRow[])
      .map(row => this.fromRow(row));
  }

  /** Removes display-only snapshots that are outside the documented retention window. */
  pruneExpired(nowMs = Date.now()): number {
    const cutoffMs = nowMs - ActivityRetention.Milliseconds;
    return this.db
      .prepare('DELETE FROM zhiyuan_activity_runs WHERE updated_at < ?')
      .run(cutoffMs).changes;
  }

  /**
   * A force-closed app cannot emit a terminal event. Clear those stale
   * in-progress projections during startup so the sidebar indicator reflects
   * work that is actually running in this process.
   */
  recoverInterruptedRuns(nowMs = Date.now()): number {
    return this.db
      .prepare(
        `UPDATE zhiyuan_activity_runs
         SET status = ?, updated_at = ?, error_message = COALESCE(error_message, ?),
             error_code = COALESCE(error_code, ?)
         WHERE status = ?`,
      )
      .run(
        ActivityStatus.Failed,
        nowMs,
        'Run was interrupted when the application closed.',
        CoworkErrorKind.SchedulerInterrupted,
        ActivityStatus.Running,
      ).changes;
  }

  upsert(update: ActivityRunUpdate): ActivityRun {
    const existing = this.db.prepare('SELECT * FROM zhiyuan_activity_runs WHERE id = ?').get(update.id) as ActivityRow | undefined;
    const now = update.updatedAt ?? Date.now();
    if (existing) {
      const current = this.fromRow(existing);
      const candidate = { ...current, ...update, startedAt: update.startedAt ?? current.startedAt, updatedAt: now };
      if (!shouldAcceptActivityUpdate(current, candidate)) return current;
    }
    // 2026/10/08  界面只显示中文，原始英文只在日志里可查：每次写入新的失败文案记一条带上下文的 warn
    const nextErrorMessage = update.errorMessage ?? existing?.error_message ?? undefined;
    if (nextErrorMessage && nextErrorMessage !== existing?.error_message) {
      console.warn(
        `[Activity] run ${update.id} (${update.source}${update.taskName ? `/${update.taskName}` : ''}) reported: ${nextErrorMessage}`,
      );
    }
    const run: ActivityRun = {
      id: update.id, source: update.source, status: update.status,
      startedAt: update.startedAt ?? existing?.started_at ?? now, updatedAt: now,
      sessionId: update.sessionId ?? existing?.session_id ?? undefined,
      platform: update.platform ?? existing?.platform ?? undefined,
      conversationId: update.conversationId ?? existing?.conversation_id ?? undefined,
      taskName: update.taskName ?? existing?.task_name ?? undefined,
      inputPreview: update.inputPreview ?? existing?.input_preview ?? undefined,
      replyPreview: update.replyPreview ?? existing?.reply_preview ?? undefined,
      errorMessage: update.errorMessage ?? existing?.error_message ?? undefined,
      errorCode:
        update.errorCode ??
        (update.errorMessage ? classifyActivityErrorCode(update.errorMessage) : undefined) ??
        existing?.error_code ??
        undefined,
    };
    this.db.prepare(`INSERT INTO zhiyuan_activity_runs (
      id, source, status, started_at, updated_at, session_id, platform, conversation_id, task_name, input_preview, reply_preview, error_message, error_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET source=excluded.source, status=excluded.status, started_at=excluded.started_at,
      updated_at=excluded.updated_at, session_id=excluded.session_id, platform=excluded.platform,
      conversation_id=excluded.conversation_id, task_name=excluded.task_name, input_preview=excluded.input_preview,
      reply_preview=excluded.reply_preview, error_message=excluded.error_message, error_code=excluded.error_code`).run(
      run.id, run.source, run.status, run.startedAt, run.updatedAt, run.sessionId ?? null, run.platform ?? null,
      run.conversationId ?? null, run.taskName ?? null, run.inputPreview ?? null, run.replyPreview ?? null,
      run.errorMessage ?? null, run.errorCode ?? null,
    );
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(ActivityIpc.Updated, run);
    return run;
  }

  upsertBestEffort(update: ActivityRunUpdate): ActivityRun | null {
    try {
      return this.upsert(update);
    } catch (error) {
      console.error('[Activity] failed to persist run projection:', error);
      return null;
    }
  }

  private fromRow(row: ActivityRow): ActivityRun {
    return { id: row.id, source: row.source, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at,
      sessionId: row.session_id ?? undefined, platform: row.platform ?? undefined, conversationId: row.conversation_id ?? undefined,
      taskName: row.task_name ?? undefined, inputPreview: row.input_preview ?? undefined, replyPreview: row.reply_preview ?? undefined,
      errorMessage: row.error_message ?? undefined, errorCode: row.error_code ?? undefined };
  }
}
