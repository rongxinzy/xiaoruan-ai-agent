import {
  classifyCoworkError,
  CoworkErrorKind,
  getUserErrorI18nKey,
} from '../../common/coworkError';
import { CodingErrorTranslationKeys } from '../../shared/codingAgent';
import { WorkbenchErrorI18nKey } from '../../shared/workbenchTask';
import { i18nService } from './i18n';

export const TOAST_DEFAULT_DURATION_MS = 2200;
export const TOAST_MAX_DURATION_MS = 3000;

const CATEGORY_KEYS = {
  network: 'networkError',
  auth: 'authenticationExpired',
  apiKey: 'apiKeyMissing',
  model: 'modelNotFound',
  timeout: 'requestTimeout',
  permission: 'permissionDenied',
  file: 'fileNotFound',
  git: 'gitConflict',
  mcp: 'mcpEndpointInvalid',
} as const;

const patterns: Array<[keyof typeof CATEGORY_KEYS, RegExp]> = [
  ['auth', /\b(401|unauthori[sz]ed|token expired|authentication expired)\b/i],
  ['apiKey', /api\s*key.{0,20}(missing|required|invalid)|missing.{0,20}api\s*key/i],
  ['model', /model.{0,20}(not found|does not exist|unknown)/i],
  ['timeout', /\b(timeout|timed out|etimedout|deadline exceeded)\b/i],
  ['permission', /\b(403|forbidden|permission denied|access denied)\b/i],
  ['file', /(enoent|file|path).{0,30}(not found|does not exist)|no such file/i],
  ['git', /git.{0,30}(conflict|merge conflict)|would be overwritten by merge/i],
  ['mcp', /mcp.{0,30}(endpoint|url).{0,20}(invalid|malformed)|invalid mcp endpoint/i],
  ['network', /network error|failed to fetch|fetch failed|econnrefused|enotfound|offline/i],
];

/** Extract the raw message from anything that was thrown or returned. */
export function readErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return '';
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : String(error);
}

/** Any CJK character means the text is already human-readable for zh users. */
const CONTAINS_CJK = /[\u3400-\u9fff]/;

/** 2026/09/15 lixiang  Prefer extracting error.message from JSON when present **/
const tryExtractMessageFromJson = (value: string): string | null => {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const errorObj = parsed.error;
    if (errorObj && typeof errorObj === 'object' && !Array.isArray(errorObj)) {
      const message = (errorObj as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Not JSON.
  }
  return null;
};

/**
 * 2026/09/15 lixiang  User-facing error text:
 * use error.message directly when present; do not wrap with a request-failed prefix
 */
export const extractUserFacingErrorMessage = (raw: string): string => {
  const value = raw.trim();
  if (!value) return raw;

  const fromJson = tryExtractMessageFromJson(value);
  if (fromJson) return fromJson;

  // 2026/09/15 lixiang  Support JSON embedded after a prefix, e.g. "xxx: {...}"
  const jsonMatch = value.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const fromEmbedded = tryExtractMessageFromJson(jsonMatch[0]);
    if (fromEmbedded) return fromEmbedded;
  }

  return value;
};

const APP_COPY_KEYS = [
  ...new Set([
    ...CodingErrorTranslationKeys,
    ...Object.values(WorkbenchErrorI18nKey),
    ...Object.values(CoworkErrorKind).map(getUserErrorI18nKey),
    ...Object.values(CATEGORY_KEYS),
    // Copy `appErrorText` returns when the caller has no error to translate:
    // the isError toast consumer would otherwise prefix 操作失败 a second time.
    'operationFailed',
    'runtimeRetryNotice',
    'codingAgentActionFailed',
    'codingAgentTurnFailed',
    'codingAgentTurnCancelled',
    'codingGitActionFailed',
    'codingSessionCreateFailed',
    'codingAgentFilesPreviewUnavailable',
    'coworkQueueUpdateFailed',
    'coworkQueueDeleteFailed',
    'coworkQueueSteerFailed',
    'coworkQueueRetryFailed',
  ]),
];

/**
 * Whether the text is error copy this app produced, in the active language.
 *
 * Toasts dispatch through {@link normalizeError} a second time, so our own
 * sentences — already translated by the catalog — must survive unchanged
 * instead of being wrapped a second time ("操作失败：加载待发送消息失败。").
 * Templates with a `{detail}` placeholder are compared on their fixed head.
 */
export function isLocalizedAppErrorText(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return APP_COPY_KEYS.some(key => {
    const [head] = i18nService.t(key).split('{');
    return head.trim().length > 1 && trimmed.startsWith(head.trim());
  });
}

export function cleanErrorReason(input: string): string {
  let value = input.replace(/<[^>]*>/g, ' ').replace(/```[\s\S]*?```/g, ' ');
  value = value.replace(/https?:\/\/[^\s)]+/gi, '[URL]');
  value = value.replace(/[A-Za-z]:\\[^\s)]+|\/(?:[^\s/]+\/)+[^\s)]+/g, '[path]');
  value = value.replace(/\{[\s\S]*\}|\[[\s\S]*\]/g, ' ');
  value = value.split(/\n\s*at\s|\nTraceback|\nError:/i)[0];
  value = value.replace(/\s+/g, ' ').replace(/[\s.;:,]+$/, '').trim();
  if (!value || value.length < 2 || /^(error|exception|failed)$/i.test(value)) return '';
  return value.slice(0, 140);
}

export function normalizeError(error: unknown): string {
  const message = readErrorMessage(error);
  const operationPrefix = i18nService.t('operationFailed');
  if (message === operationPrefix || message.startsWith(`${operationPrefix}：`) || message.startsWith(`${operationPrefix}:`)) {
    return message;
  }
  if (isLocalizedAppErrorText(message)) return message;
  
  const category = patterns.find(([, pattern]) => pattern.test(message))?.[0];
  if (category) {
    return i18nService.t(CATEGORY_KEYS[category]);
  }
  const reason = cleanErrorReason(message);
  if (!reason) return i18nService.t('operationFailed');
  return i18nService.getLanguage() === 'zh' ? `${i18nService.t('operationFailed')}：${reason}` : `${i18nService.t('operationFailed')}: ${reason}`;
}

/**
 * Display text for an error string persisted by the main process — activity
 * rows, scheduled-task run history and terminal error bubbles.
 *
 * Resolution order: a stored kind wins (it survives upstream wording changes),
 * then the raw text is classified (status codes are still present), then text
 * that already contains Chinese is kept verbatim, and only unknown English text
 * falls back to the generic localized sentence described by `normalizeError`.
 */
export function appErrorTextFromStored(raw: string | undefined, storedKind?: string): string {
  const text = raw?.trim() ?? '';
  if (storedKind && (Object.values(CoworkErrorKind) as string[]).includes(storedKind)) {
    const kind = storedKind as CoworkErrorKind;
    if (kind !== CoworkErrorKind.Unknown) return i18nService.t(getUserErrorI18nKey(kind));
  }
  if (!text) return '';
  const kind = classifyCoworkError(text).kind;
  if (kind !== CoworkErrorKind.Unknown) return i18nService.t(getUserErrorI18nKey(kind));

  const unwrapped = extractUserFacingErrorMessage(text);
  if (unwrapped !== text) {
    const unwrappedKind = classifyCoworkError(unwrapped).kind;
    if (unwrappedKind !== CoworkErrorKind.Unknown) {
      return i18nService.t(getUserErrorI18nKey(unwrappedKind));
    }
  }
  if (CONTAINS_CJK.test(unwrapped)) {
    // 我们自己的文案原样保留；上游的中文原文先清洗（URL、路径、堆栈、JSON 载荷、长度），
    // 否则一段中文前缀会把后面的整条技术细节带进活动行、失败详情或气泡。
    if (isLocalizedAppErrorText(unwrapped)) return unwrapped;
    return cleanErrorReason(unwrapped) || i18nService.t('operationFailed');
  }
  // 2026/10/08  持久化的失败文本（活动流、运行历史、终端气泡）不展示英文原文：
  // 分类不出时给中文通用句。原文可查两处：主进程写库时的 [Activity] warn 日志、
  // 以及数据库里的原始字段（如 zhiyuan_activity_runs.error_message）。
  return i18nService.t('operationFailed');
}

export function reportError(error: unknown): string {
  console.error('[ErrorNormalization] operation failed:', error);
  return normalizeError(error);
}



