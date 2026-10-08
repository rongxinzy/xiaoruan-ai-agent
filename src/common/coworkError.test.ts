import { expect, test } from 'vitest';

import {
  classifyCoworkError,
  CoworkErrorKind,
  getErrorLogLevel,
  getUserErrorI18nKey,
  isTransient,
} from './coworkError';

// ─── Model capability unsupported (Fix: deterministic capability errors) ────

const LLAMACPP_MM_PROJ_500 =
  '500 {"code":500,"message":"image input is not supported - hint: the model may not support vision or the mmproj file is missing","type":"server_error"}';

test('llama.cpp mmproj 500 classifies as ModelCapabilityUnsupported, not ServerError', () => {
  const result = classifyCoworkError(LLAMACPP_MM_PROJ_500);
  expect(result.kind).toBe(CoworkErrorKind.ModelCapabilityUnsupported);
  expect(result.statusCode).toBe(500);
});

test('a bare mmproj mention without failure wording is not a capability error', () => {
  expect(classifyCoworkError('loaded the mmproj projector in 240ms').kind).not.toBe(
    CoworkErrorKind.ModelCapabilityUnsupported,
  );
  expect(classifyCoworkError('using mmproj file at /models/vision.mmproj').kind).not.toBe(
    CoworkErrorKind.ModelCapabilityUnsupported,
  );
});

test('capability errors from other wordings classify as ModelCapabilityUnsupported', () => {
  expect(classifyCoworkError('model does not support image input').kind).toBe(
    CoworkErrorKind.ModelCapabilityUnsupported,
  );
  expect(classifyCoworkError('this model does not support vision input').kind).toBe(
    CoworkErrorKind.ModelCapabilityUnsupported,
  );
  expect(classifyCoworkError('modality not supported by this endpoint').kind).toBe(
    CoworkErrorKind.ModelCapabilityUnsupported,
  );
});

test('ModelCapabilityUnsupported is not transient', () => {
  expect(isTransient(CoworkErrorKind.ModelCapabilityUnsupported)).toBe(false);
});

test('ModelCapabilityUnsupported logs at error level', () => {
  expect(getErrorLogLevel(CoworkErrorKind.ModelCapabilityUnsupported)).toBe('error');
});

test('ModelCapabilityUnsupported maps to its own i18n key', () => {
  expect(getUserErrorI18nKey(CoworkErrorKind.ModelCapabilityUnsupported)).toBe(
    'coworkErrorModelCapabilityUnsupported',
  );
});

test('plain 500 without capability wording still classifies as ServerError', () => {
  const result = classifyCoworkError('Request failed with status 500');
  expect(result.kind).toBe(CoworkErrorKind.ServerError);
  expect(isTransient(result.kind)).toBe(true);
});

// ─── Provider unavailable (Fix: actionable continue errors) ─────────────────

test('disabled provider error classifies as ProviderUnavailable', () => {
  expect(classifyCoworkError('Provider custom_0 is not enabled.').kind).toBe(
    CoworkErrorKind.ProviderUnavailable,
  );
});

test('missing provider model error classifies as ProviderUnavailable', () => {
  expect(classifyCoworkError('No enabled provider found for model: qwen-local').kind).toBe(
    CoworkErrorKind.ProviderUnavailable,
  );
});

test('ProviderUnavailable is not transient', () => {
  expect(isTransient(CoworkErrorKind.ProviderUnavailable)).toBe(false);
});

test('ProviderUnavailable logs at error level', () => {
  expect(getErrorLogLevel(CoworkErrorKind.ProviderUnavailable)).toBe('error');
});

test('ProviderUnavailable maps to its own i18n key', () => {
  expect(getUserErrorI18nKey(CoworkErrorKind.ProviderUnavailable)).toBe(
    'coworkErrorProviderUnavailable',
  );
});

// ─── Main-process wording that reaches the UI (#105) ────────────────────────

test('scheduler wording written by the main process classifies into localized kinds', () => {
  expect(classifyCoworkError('Scheduled task Pi run timed out after 3600000ms').kind).toBe(
    CoworkErrorKind.ScheduledTaskTimeout,
  );
  expect(classifyCoworkError('Scheduler interrupted before Pi completion').kind).toBe(
    CoworkErrorKind.SchedulerInterrupted,
  );
  expect(classifyCoworkError('Run was interrupted when the application closed.').kind).toBe(
    CoworkErrorKind.SchedulerInterrupted,
  );
  expect(
    classifyCoworkError('Scheduled task Pi session stopped before completion: session-1').kind,
  ).toBe(CoworkErrorKind.StreamInterrupted);
});

test('a platform pool answer without a status code still classifies as ServerError', () => {
  expect(classifyCoworkError('No running instances available').kind).toBe(
    CoworkErrorKind.ServerError,
  );
});

test('scheduler kinds expose log level and their own i18n keys', () => {
  expect(getErrorLogLevel(CoworkErrorKind.ScheduledTaskTimeout)).toBe('warn');
  expect(getErrorLogLevel(CoworkErrorKind.SchedulerInterrupted)).toBe('info');
  expect(isTransient(CoworkErrorKind.ScheduledTaskTimeout)).toBe(false);
  expect(getUserErrorI18nKey(CoworkErrorKind.ScheduledTaskTimeout)).toBe(
    'coworkErrorScheduledTaskTimeout',
  );
  expect(getUserErrorI18nKey(CoworkErrorKind.SchedulerInterrupted)).toBe(
    'coworkErrorSchedulerInterrupted',
  );
});

test('config resolution wording from claudeSettings classifies instead of leaking English', () => {
  expect(classifyCoworkError('OpenAI compatibility proxy is not running.').kind).toBe(
    CoworkErrorKind.EngineNotReady,
  );
  expect(classifyCoworkError('OpenAI compatibility proxy token is unavailable.').kind).toBe(
    CoworkErrorKind.EngineNotReady,
  );
  expect(classifyCoworkError('Store is not initialized.').kind).toBe(
    CoworkErrorKind.EngineNotReady,
  );
  expect(classifyCoworkError('No available model configured in enabled providers.').kind).toBe(
    CoworkErrorKind.ProviderUnavailable,
  );
  expect(classifyCoworkError('Model validation timed out after 30s.').kind).toBe(
    CoworkErrorKind.TurnTimeout,
  );
  expect(classifyCoworkError('Model validation failed: 503 service unavailable').kind).toBe(
    CoworkErrorKind.ServerError,
  );
});
