import { afterAll, beforeAll, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { AISphere } from '../../shared/aisphere';
import { aisphereService } from '../aisphere/service';
import type { SqliteStore } from '../sqliteStore';
import {
  resolveAllEnabledProviderConfigs,
  resolveRawApiConfig,
  resolveRawApiConfigForModelRef,
  setStoreGetter,
} from './claudeSettings';

const data = new Map<string, unknown>();
const store = {
  get: <T>(key: string) => data.get(key) as T | undefined,
  set: (key: string, value: unknown) => {
    data.set(key, value);
  },
};
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(
    JSON.stringify(
      request.url === AISphere.VerifyPath
        ? { data: 'ok' }
        : {
            code: 0,
            model_list: [
              {
                name: 'test-model',
                url: 'https://model.test/exact/endpoint',
                api_key: 'real-secret',
                context_length: 262144,
              },
            ],
          },
    ),
  );
});
beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  await aisphereService.initialize(store, 'http://127.0.0.1:9911');
  await aisphereService.connect(`http://127.0.0.1:${address.port}`);
  setStoreGetter(() => store as unknown as SqliteStore);
});
afterAll(async () => {
  setStoreGetter(() => null);
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('default and explicit agent models resolve only to the gateway with platform capacity', () => {
  for (const result of [
    resolveRawApiConfig(),
    resolveRawApiConfigForModelRef(AISphere.Provider + '/test-model'),
  ]) {
    expect(result.config).toMatchObject({
      baseURL: 'http://127.0.0.1:9911/v1',
      model: 'test-model',
    });
    expect(result.providerMetadata).toMatchObject({
      providerName: AISphere.Provider,
      contextWindow: 262144,
    });
    expect(JSON.stringify(result)).not.toContain('real-secret');
  }
});

test('old task overrides, changed config URLs, and provider registration cannot select an external model', () => {
  const current = data.get(AISphere.AppConfigKey) as {
    model: { defaultModel: string; defaultModelProvider: string };
  };
  data.set(AISphere.AppConfigKey, {
    ...current,
    providers: {
      openai: {
        enabled: true,
        apiKey: 'evil',
        baseUrl: 'https://evil.test',
        models: [{ id: 'test-model', name: 'test-model' }],
      },
    },
  });
  expect(resolveRawApiConfigForModelRef('openai/test-model').config).toBeNull();
  expect(resolveRawApiConfigForModelRef(AISphere.Provider + '/removed-model').config).toBeNull();
  expect(resolveRawApiConfig().config?.baseURL).toBe('http://127.0.0.1:9911/v1');
  expect(resolveAllEnabledProviderConfigs().map(provider => provider.providerName)).toEqual([
    AISphere.Provider,
  ]);
  data.set(AISphere.AppConfigKey, {
    model: { defaultModel: 'test-model', defaultModelProvider: 'openai' },
  });
  expect(resolveRawApiConfig().config).toBeNull();
});
