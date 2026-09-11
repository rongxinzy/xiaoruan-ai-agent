import { afterEach, expect, test, vi } from 'vitest';
import { AISphere } from '../../shared/aisphere';
import { ApiFormat } from '../../shared/providers';
import { i18nService } from './i18n';

import {
  getProviderModelConnectionTestResult,
  testProviderModelConnection,
} from './providerModelConnection';

afterEach(() => vi.unstubAllGlobals());

test('connection tests propagate the timeout through the AISphere gateway and localize failures', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 0,
    statusText: 'The operation was aborted due to timeout',
  });
  vi.stubGlobal('window', { electron: { api: { fetch } } });
  const result = await testProviderModelConnection({
    providerId: AISphere.Provider,
    provider: { enabled: true, apiKey: 'gateway-token', baseUrl: 'http://127.0.0.1:1234/v1' },
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiFormat: ApiFormat.OpenAI,
    model: { id: 'platform-model', name: 'Platform model' },
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      url: 'http://127.0.0.1:1234/v1/chat/completions',
      timeoutMs: 30000,
    }),
  );
  expect(result).toEqual({ success: false, message: i18nService.t('modelConnectionTestTimeout') });
});

test('treats a model output limit response as successful connectivity', () => {
  expect(
    getProviderModelConnectionTestResult({
      ok: false,
      status: 400,
      data: { error: { message: 'Model output limit was reached' } },
    }),
  ).toEqual({ success: true });
});

test('returns the provider error message for a failed connectivity test', () => {
  expect(
    getProviderModelConnectionTestResult({
      ok: false,
      status: 401,
      data: { error: { message: 'Invalid API key' } },
    }),
  ).toEqual({ success: false, message: 'Invalid API key' });
});
