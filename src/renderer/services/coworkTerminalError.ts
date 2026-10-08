import {
  classifyCoworkError,
  type CoworkError,
  CoworkErrorKind,
  ENGINE_NOT_READY_CODE,
} from '../../common/coworkError';
import type { CoworkMessage, CoworkSession } from '../types/cowork';
import { appErrorTextFromStored, extractUserFacingErrorMessage } from './errorNormalization';

type CoworkMessageSession = Pick<CoworkSession, 'id' | 'messages'>;

export const isCoworkTerminalErrorMessage = (message: CoworkMessage): boolean => {
  if (message.type !== 'system') return false;
  if (typeof message.metadata?.error === 'string') return true;
  if (typeof message.content !== 'string' || !message.content.trim()) return false;
  // 2026/09/15 lixiang  Legacy sessions store error JSON in content; treat as terminal so it is not folded under "Working"
  return extractUserFacingErrorMessage(message.content) !== message.content.trim();
};

export const resolveCoworkTerminalError = (message: string, code?: string): CoworkError =>
  code === ENGINE_NOT_READY_CODE
    ? {
        kind: CoworkErrorKind.EngineNotReady,
        message,
        raw: message,
      }
    : classifyCoworkError(message);

export const createCoworkTerminalErrorMessage = (
  error: CoworkError,
  timestamp = Date.now(),
): CoworkMessage => ({
  id: `error-${timestamp}`,
  type: 'system',
  content: '',
  timestamp,
  metadata: {
    error: error.message,
    errorKind: error.kind,
  },
});

/** 2026/09/15 lixiang  Persist Direct Chat failures as canonical terminal errors for TurnBlock **/
export const createDirectChatTerminalErrorMessage = (
  error: unknown,
  timestamp = Date.now(),
): CoworkMessage => {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const message = extractUserFacingErrorMessage(raw);
  return createCoworkTerminalErrorMessage(resolveCoworkTerminalError(message), timestamp);
};

/** 2026/09/15 lixiang  Terminal error bubble text; prefer metadata.error and unwrap JSON payloads **/
export const getTerminalErrorDisplayText = (message: CoworkMessage): string => {
  const raw =
    typeof message.metadata?.error === 'string' && message.metadata.error.trim()
      ? message.metadata.error
      : typeof message.content === 'string'
        ? message.content
        : '';
  if (!raw.trim()) return '';
  // 2026/10/08  未分类的错误也必须出中文：统一走 appErrorTextFromStored，英文原文只进日志
  return appErrorTextFromStored(raw, message.metadata?.errorKind);
};

export const hasMatchingLatestTerminalError = (
  sessions: Array<CoworkMessageSession | null | undefined>,
  sessionId: string,
  error: CoworkError,
): boolean =>
  sessions.some(session => {
    if (session?.id !== sessionId) return false;
    const latestMessage = session.messages[session.messages.length - 1];
    return (
      Boolean(latestMessage) &&
      isCoworkTerminalErrorMessage(latestMessage) &&
      latestMessage.metadata?.error === error.message &&
      latestMessage.metadata?.errorKind === error.kind
    );
  });
