import {
  CoworkSessionSource,
  normalizeRenamedSessionTitle,
  stripScheduledSessionTitlePrefix,
} from '../../shared/cowork/constants';

interface SessionTitleStore {
  getSession(id: string, messageLimit: number): { source?: CoworkSessionSource } | null;
  updateSession(id: string, updates: { title: string }): void;
}

/** Main process owns validation and the title returned to renderer state. */
export function renameCoworkSession(
  store: SessionTitleStore,
  options: { sessionId: string; title: string },
): { success: boolean; title?: string; error?: string } {
  const existing = store.getSession(options.sessionId, 0);
  if (!existing) return { success: false, error: 'Session not found' };
  const isScheduled = existing.source === CoworkSessionSource.Scheduled;
  const name = isScheduled ? stripScheduledSessionTitlePrefix(options.title) : options.title.trim();
  if (!name) return { success: false, error: 'Title is required' };
  const title = normalizeRenamedSessionTitle(options.title, isScheduled).trim();
  store.updateSession(options.sessionId, { title });
  return { success: true, title };
}
