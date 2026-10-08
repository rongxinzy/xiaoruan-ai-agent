import { beforeEach, describe, expect, test } from 'vitest';
import { i18nService } from './i18n';
import {
  appErrorTextFromStored,
  cleanErrorReason,
  normalizeError,
} from './errorNormalization';

describe('error normalization', () => {
  beforeEach(() => i18nService.setLanguage('zh', { persist: false }));

  test('maps common categories to Chinese', () => {
    expect(normalizeError(new Error('401 Unauthorized'))).toContain('登录状态');
    expect(normalizeError('request timed out')).toContain('超时');
    expect(normalizeError('permission denied')).toContain('权限');
    expect(normalizeError('MCP endpoint is invalid')).toContain('MCP');
  });

  test('preserves a safe reason for unknown errors', () => {
    expect(normalizeError('Widget could not be loaded')).toBe('操作失败：Widget could not be loaded');
  });

  test('leaves the app copy it already produced untouched', () => {
    // Toasts dispatch through this function a second time; wrapping our own
    // sentence again would read as "操作失败：加载待发送消息失败。".
    const queueCopy = i18nService.t('codingErrorQueueLoadFailed');
    expect(normalizeError(queueCopy)).toBe(queueCopy);
    expect(normalizeError(i18nService.t('coworkErrorStreamInterrupted'))).toBe(
      i18nService.t('coworkErrorStreamInterrupted'),
    );
  });

  test('leaves the caller fallback copy untouched too', () => {
    // appErrorText returns this copy when there is no error to translate; the
    // isError toast path must not prefix it a second time.
    for (const key of ['codingAgentActionFailed', 'codingGitActionFailed', 'operationFailed']) {
      const copy = i18nService.t(key);
      expect(normalizeError(copy)).toBe(copy);
    }
  });

  test('classifies Chinese failures and sanitizes sensitive values', () => {
    expect(normalizeError('保存失败')).not.toContain('Operation failed');
    const result = normalizeError('文件读取失败：https://example.com/a C:\\Users\\me\\secret.json');
    expect(result).not.toContain('example.com');
    expect(result).not.toContain('secret.json');
  });

  test('removes markup, payloads, urls, paths and stacks', () => {
    const cleaned = cleanErrorReason('<b>Failed</b> https://secret.test/x {"token":"x"} C:\\Users\\me\\a.txt\n at internal.js');
    expect(cleaned).not.toContain('secret.test');
    expect(cleaned).not.toContain('token');
    expect(cleaned).not.toContain('internal.js');
  });
});

describe('stored error text (activity rows, run history, terminal bubbles)', () => {
  beforeEach(() => i18nService.setLanguage('zh', { persist: false }));

  test('translates the platform pool failure behind the reported activity row', () => {
    expect(
      appErrorTextFromStored(
        '503: {"message":"No running instances available","code":503,"type":"ServiceUnavailable"}',
      ),
    ).toBe(i18nService.t('coworkErrorServerError'));
  });

  test('translates scheduler wording written by the main process', () => {
    expect(appErrorTextFromStored('Scheduled task Pi run timed out after 3600000ms')).toBe(
      i18nService.t('coworkErrorScheduledTaskTimeout'),
    );
    expect(appErrorTextFromStored('Scheduler interrupted before Pi completion')).toBe(
      i18nService.t('coworkErrorSchedulerInterrupted'),
    );
  });

  test('prefers the stored error code over the stored wording', () => {
    expect(appErrorTextFromStored('anything at all', 'scheduled_task_timeout')).toBe(
      i18nService.t('coworkErrorScheduledTaskTimeout'),
    );
  });

  test('keeps text that is already Chinese untouched', () => {
    const chinese = '无法连接 AISphere 平台，请检查平台地址和网络后重试。';
    expect(appErrorTextFromStored(chinese)).toBe(chinese);
  });

  test('sanitizes upstream Chinese text before showing it', () => {
    const noisy =
      '保存失败：{\\"token\\":\\"secret\\"} https://platform.test/a?token=secret C:\\Users\\me\\secret.json\n    at C:\\app\\main.js:10';
    const result = appErrorTextFromStored(noisy);

    expect(result.startsWith('保存失败')).toBe(true);
    expect(result).not.toContain('platform.test');
    expect(result).not.toContain('secret.json');
    expect(result).not.toContain('main.js');
    expect(result).not.toContain('token');
  });

  test('never returns English for an unclassified upstream message', () => {
    const result = appErrorTextFromStored('Widget could not be loaded');
    expect(result).toBe(i18nService.t('operationFailed'));
    expect(/[A-Za-z]{4,}/.test(result)).toBe(false);
  });

  test('returns an empty string when nothing was stored', () => {
    expect(appErrorTextFromStored(undefined)).toBe('');
  });
});
