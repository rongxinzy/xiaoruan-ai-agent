import { afterEach, expect, test, vi } from 'vitest';

import { ModelCapabilityStatus, ProviderName } from '../../shared/providers';
import { store } from '../store';
import { setAvailableModels, setDefaultSelectedModel } from '../store/slices/modelSlice';
import { ApiError, apiService } from './api';
import { configService } from './config';
import { i18nService } from './i18n';
import { WebSearchToolEventType, type WebSearchToolEvent } from './webSearchToolEvents';

type WebSearchLoopResult = {
  content: string;
  reasoning?: string;
  usage?: { inputTokens: number; outputTokens: number };
};

type ApiServiceWebSearchTestSurface = {
  config: unknown;
  runOpenAIWebSearchLoop: (...args: never[]) => Promise<WebSearchLoopResult>;
  runAnthropicWebSearchLoop: (...args: never[]) => Promise<WebSearchLoopResult>;
  streamOpenAIChatResponse: (...args: never[]) => Promise<unknown>;
  getRuntimeModelCapabilities: (
    ...args: never[]
  ) => Promise<{ toolCalling: ModelCapabilityStatus }>;
};

const privateApiService = apiService as unknown as ApiServiceWebSearchTestSurface;

afterEach(() => {
  i18nService.setLanguage('zh', { persist: false });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('restores the legacy API config when app bootstrap has not synced it yet', async () => {
  const model = {
    id: 'custom-bootstrap-race',
    name: 'Custom Bootstrap Race',
    providerKey: 'custom_0',
    supportsImage: false,
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  const appConfig = configService.getConfig();
  vi.spyOn(configService, 'getConfig').mockReturnValue({
    ...appConfig,
    api: { key: 'key', baseUrl: 'https://example.test/v1' },
  });
  privateApiService.config = null;
  const loop = vi
    .spyOn(privateApiService, 'runAnthropicWebSearchLoop')
    .mockResolvedValue({ content: 'searched answer' });

  await expect(apiService.chatWithWebSearch('latest news')).resolves.toEqual({
    content: 'searched answer',
  });
  expect(loop).toHaveBeenCalledOnce();
});

test('unknown tool capability attempts the native loop', async () => {
  const model = {
    id: 'custom-unknown',
    name: 'Custom Unknown',
    providerKey: 'custom_0',
    supportsImage: false,
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  apiService.setConfig({ apiKey: 'key', baseUrl: 'https://example.test/v1', apiFormat: 'openai' });
  const loop = vi
    .spyOn(privateApiService, 'runOpenAIWebSearchLoop')
    .mockResolvedValue({ content: 'searched answer' });
  const progress = vi.fn();

  await expect(apiService.chatWithWebSearch('latest news', progress)).resolves.toEqual({
    content: 'searched answer',
  });
  expect(loop).toHaveBeenCalledOnce();
});

test('explicit supported capability keeps the native tool loop enabled', async () => {
  const model = {
    id: 'custom-tools',
    name: 'Custom Tools',
    providerKey: 'custom_0',
    supportsImage: false,
    capabilities: { toolCalling: ModelCapabilityStatus.Supported },
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  apiService.setConfig({ apiKey: 'key', baseUrl: 'https://example.test/v1', apiFormat: 'openai' });
  const loop = vi
    .spyOn(privateApiService, 'runOpenAIWebSearchLoop')
    .mockResolvedValue({ content: 'searched answer' });

  await expect(apiService.chatWithWebSearch('latest news')).resolves.toEqual({
    content: 'searched answer',
  });

  expect(loop).toHaveBeenCalledOnce();
});

test('OpenRouter model metadata enables the tool loop only when tools are declared', async () => {
  const model = {
    id: 'vendor/tool-model',
    name: 'OpenRouter Tool Model',
    providerKey: 'openrouter',
    supportsImage: false,
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  apiService.setConfig({
    apiKey: 'openrouter-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiFormat: 'openai',
  });
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      data: [{ id: model.id, supported_parameters: ['tools'] }],
    },
  });
  vi.stubGlobal('window', { electron: { api: { fetch } } });
  const loop = vi
    .spyOn(privateApiService, 'runOpenAIWebSearchLoop')
    .mockResolvedValue({ content: 'searched answer' });

  await expect(apiService.chatWithWebSearch('latest news')).resolves.toEqual({
    content: 'searched answer',
  });

  expect(fetch).toHaveBeenCalledWith({
    url: 'https://openrouter.ai/api/v1/models',
    method: 'GET',
    headers: { Authorization: 'Bearer openrouter-key' },
  });
  expect(loop).toHaveBeenCalledOnce();
});

test('regular chat uses and caches runtime image capability metadata', async () => {
  const model = {
    id: 'vendor/vision-model',
    name: 'OpenRouter Vision Model',
    providerKey: ProviderName.OpenRouter,
    supportsImage: false,
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  apiService.setConfig({
    apiKey: 'openrouter-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiFormat: 'openai',
  });
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      data: [
        {
          id: model.id,
          supported_parameters: [],
          architecture: { input_modalities: ['text', 'image'] },
        },
      ],
    },
  });
  vi.stubGlobal('window', { electron: { api: { fetch } } });
  const regularChat = vi
    .spyOn(apiService as any, 'chatWithOpenAICompatible')
    .mockResolvedValue({ content: 'vision answer' });
  const input = {
    content: 'describe this image',
    images: [
      {
        id: 'image-1',
        name: 'image.png',
        type: 'image/png',
        size: 10,
        dataUrl: 'data:image/png;base64,AAAA',
      },
    ],
  };

  await apiService.chat(input);
  await apiService.chat(input);

  expect(fetch).toHaveBeenCalledOnce();
  expect(regularChat).toHaveBeenCalledTimes(2);
  expect(regularChat.mock.calls[0][5]).toBe(true);
});

test('provider hints are resolved from the registry instead of a stale allowlist', () => {
  expect(
    (
      apiService as unknown as { detectProvider: (modelId: string, hint?: string) => string }
    ).detectProvider('qianfan-code-latest', ProviderName.Qianfan),
  ).toBe(ProviderName.Qianfan);
});

test('a catalog model absent from the provider support table attempts the native loop', async () => {
  const model = {
    id: 'ernie-4.5-8k',
    name: 'ERNIE 4.5 8K',
    providerKey: ProviderName.Qianfan,
    supportsImage: false,
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  apiService.setConfig({
    apiKey: 'qianfan-key',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    apiFormat: 'openai',
  });
  const toolLoop = vi
    .spyOn(privateApiService, 'runOpenAIWebSearchLoop')
    .mockResolvedValue({ content: 'searched answer' });

  await expect(apiService.chatWithWebSearch('latest news')).resolves.toEqual({
    content: 'searched answer',
  });

  expect(toolLoop).toHaveBeenCalledOnce();
});

test('web-search fallback message follows the selected UI language', async () => {
  i18nService.setLanguage('en', { persist: false });
  const model = {
    id: 'custom-unknown-en',
    name: 'Custom Unknown',
    providerKey: 'custom_0',
    supportsImage: false,
    capabilities: { toolCalling: ModelCapabilityStatus.Unsupported },
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  apiService.setConfig({ apiKey: 'key', baseUrl: 'https://example.test/v1', apiFormat: 'openai' });
  vi.spyOn(apiService, 'chat').mockResolvedValue({ content: 'plain answer' });
  const progress = vi.fn();

  const result = await apiService.chatWithWebSearch('latest news', progress);

  expect(result.content).toContain(
    'This model does not support tool calling. Switched to regular chat without web search.',
  );

  expect(progress).toHaveBeenCalledWith(
    'This model does not support tool calling. Switched to regular chat without web search.\n\n',
  );
});

test('endpoint tool rejection falls back, caches per endpoint and clears on config refresh', async () => {
  const model = {
    id: 'custom-rejects-tools',
    name: 'Custom Rejects Tools',
    providerKey: 'custom_0',
    supportsImage: false,
    capabilities: { toolCalling: ModelCapabilityStatus.Supported },
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  const config = {
    apiKey: 'key',
    baseUrl: 'https://example.test/v1',
    apiFormat: 'openai' as const,
  };
  apiService.setConfig(config);
  const loop = vi
    .spyOn(privateApiService, 'runOpenAIWebSearchLoop')
    .mockRejectedValueOnce(new ApiError('This model does not support tools', 400))
    .mockResolvedValue({ content: 'searched answer' });
  const regularChat = vi.spyOn(apiService, 'chat').mockResolvedValue({ content: 'plain answer' });

  const first = await apiService.chatWithWebSearch('latest news');
  const second = await apiService.chatWithWebSearch('latest news');

  expect(first.content).toBe(
    '该接口暂不支持工具调用，已继续普通对话，本次未执行联网搜索。\n\nplain answer',
  );
  expect(second.content).toBe(first.content);
  expect(loop).toHaveBeenCalledOnce();
  expect(regularChat).toHaveBeenCalledTimes(2);

  apiService.setConfig(config);
  await expect(apiService.chatWithWebSearch('latest news')).resolves.toEqual({
    content: 'searched answer',
  });
  expect(loop).toHaveBeenCalledTimes(2);
});

test('configured provider model capability overrides detected capability', async () => {
  const model = {
    id: 'custom-configured-capability',
    name: 'Configured Capability',
    providerKey: 'custom_0',
    supportsImage: false,
    capabilities: { toolCalling: ModelCapabilityStatus.Supported },
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  const appConfig = configService.getConfig();
  vi.spyOn(configService, 'getConfig').mockReturnValue({
    ...appConfig,
    providers: {
      ...appConfig.providers,
      custom_0: {
        ...appConfig.providers?.custom_0,
        enabled: true,
        apiKey: 'key',
        baseUrl: 'https://example.test/v1',
        apiFormat: 'openai',
        models: [
          {
            id: model.id,
            name: model.name,
            capabilities: { toolCalling: ModelCapabilityStatus.Unsupported },
          },
        ],
      },
    },
  });
  apiService.setConfig({ apiKey: 'key', baseUrl: 'https://example.test/v1', apiFormat: 'openai' });
  const loop = vi.spyOn(privateApiService, 'runOpenAIWebSearchLoop');
  const regularChat = vi.spyOn(apiService, 'chat').mockResolvedValue({ content: 'plain answer' });

  const result = await apiService.chatWithWebSearch('latest news');

  expect(result.content).toBe(
    '当前模型不支持工具调用，已改用普通对话，未执行联网搜索。\n\nplain answer',
  );
  expect(regularChat).toHaveBeenCalledOnce();
  expect(loop).not.toHaveBeenCalled();
});

test('local model preference overrides runtime detection', async () => {
  const model = {
    id: 'local-manual-tools',
    name: 'Local Manual Tools',
    providerKey: ProviderName.LlamaCpp,
    supportsImage: false,
    capabilities: { toolCalling: ModelCapabilityStatus.Supported },
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  apiService.setConfig({ apiKey: '', baseUrl: 'http://localhost:8080/v1', apiFormat: 'openai' });
  vi.spyOn(privateApiService, 'getRuntimeModelCapabilities').mockResolvedValue({
    toolCalling: ModelCapabilityStatus.Unsupported,
  });
  const loop = vi
    .spyOn(privateApiService, 'runOpenAIWebSearchLoop')
    .mockResolvedValue({ content: 'local answer' });

  await expect(apiService.chatWithWebSearch('latest news')).resolves.toEqual({
    content: 'local answer',
  });
  expect(loop).toHaveBeenCalledOnce();
});

test('configured supported capability retries after a cached endpoint rejection', async () => {
  const model = {
    id: 'custom-supported-override',
    name: 'Supported Override',
    providerKey: 'custom_0',
    supportsImage: false,
  };
  store.dispatch(setAvailableModels([model]));
  store.dispatch(setDefaultSelectedModel(model));
  const appConfig = configService.getConfig();
  const provider = {
    ...appConfig.providers?.custom_0,
    enabled: true,
    apiKey: 'key',
    baseUrl: 'https://example.test/v1',
    apiFormat: 'openai' as const,
  };
  let configuredModels: NonNullable<typeof provider.models> = [];
  vi.spyOn(configService, 'getConfig').mockImplementation(() => ({
    ...appConfig,
    providers: { ...appConfig.providers, custom_0: { ...provider, models: configuredModels } },
  }));
  apiService.setConfig({ apiKey: 'key', baseUrl: 'https://example.test/v1', apiFormat: 'openai' });
  const loop = vi
    .spyOn(privateApiService, 'runOpenAIWebSearchLoop')
    .mockRejectedValueOnce(new ApiError('This model does not support tools', 400))
    .mockResolvedValue({ content: 'searched answer' });
  vi.spyOn(apiService, 'chat').mockResolvedValue({ content: 'plain answer' });

  await apiService.chatWithWebSearch('latest news');
  configuredModels = [
    {
      id: model.id,
      name: model.name,
      capabilities: { toolCalling: ModelCapabilityStatus.Supported },
    },
  ];

  await expect(apiService.chatWithWebSearch('latest news')).resolves.toEqual({
    content: 'searched answer',
  });
  expect(loop).toHaveBeenCalledTimes(2);
});

test('OpenAI Responses returns an output for every parallel tool call', async () => {
  const streamResponse = vi
    .spyOn(apiService as any, 'streamOpenAIResponsesResponse')
    .mockResolvedValueOnce({
      output: Array.from({ length: 4 }, (_, index) => ({
        type: 'function_call',
        call_id: `call-${index}`,
        name: 'web_search',
        arguments: JSON.stringify({ query: `query ${index}` }),
      })),
    })
    .mockResolvedValueOnce({ output_text: 'final answer' });
  const webSearch = vi.fn().mockResolvedValue({
    ok: true,
    data: { query: 'test', results: [] },
  });
  const toolEvents: Array<{ type: WebSearchToolEvent['type']; toolCallId: string }> = [];
  vi.stubGlobal('window', { electron: { api: { webSearch } } });

  const result = await (apiService as any).runOpenAIResponsesWebSearchLoop(
    [],
    'system',
    'gpt-test',
    { apiKey: 'model-key', baseUrl: 'https://api.openai.com/v1' },
    undefined,
    'request-1',
    undefined,
    (event: WebSearchToolEvent) =>
      toolEvents.push({ type: event.type, toolCallId: event.toolCallId }),
  );

  expect(result.content).toBe('final answer');
  expect(webSearch).toHaveBeenCalledTimes(3);
  const secondBody = streamResponse.mock.calls[1][2] as { input: any[] };
  const outputs = secondBody.input.filter(
    (item: { type?: string }) => item.type === 'function_call_output',
  );
  expect(outputs).toHaveLength(4);
  expect(JSON.parse(outputs[3].output)).toEqual({
    error: 'Only three web_search calls are allowed per model turn.',
  });
  expect(toolEvents).toEqual([
    { type: WebSearchToolEventType.Start, toolCallId: 'call-0' },
    { type: WebSearchToolEventType.Complete, toolCallId: 'call-0' },
    { type: WebSearchToolEventType.Start, toolCallId: 'call-1' },
    { type: WebSearchToolEventType.Complete, toolCallId: 'call-1' },
    { type: WebSearchToolEventType.Start, toolCallId: 'call-2' },
    { type: WebSearchToolEventType.Complete, toolCallId: 'call-2' },
    { type: WebSearchToolEventType.Start, toolCallId: 'call-3' },
    { type: WebSearchToolEventType.Error, toolCallId: 'call-3' },
  ]);
  expect(streamResponse.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
});

test('OpenAI-compatible Copilot requests retain required headers', async () => {
  const streamResponse = vi.spyOn(apiService as any, 'streamOpenAIChatResponse').mockResolvedValue({
    choices: [{ message: { role: 'assistant', content: 'answer' } }],
  });
  vi.stubGlobal('window', {
    electron: { api: { webSearch: vi.fn() } },
  });

  await (apiService as any).runOpenAIWebSearchLoop(
    [],
    'copilot-model',
    { apiKey: 'copilot-token', baseUrl: 'https://api.githubcopilot.com' },
    'github-copilot',
    undefined,
    'request-2',
  );

  expect(streamResponse.mock.calls[0][1]).toMatchObject({
    'Copilot-Integration-Id': 'vscode-chat',
    'Openai-Intent': 'conversation-panel',
  });
});

test('native OpenAI tool calls are assembled from the cancellable SSE channel', async () => {
  let onData: ((chunk: string) => void) | undefined;
  let onDone: (() => void) | undefined;
  const progress = vi.fn();
  const api = {
    onStreamData: vi.fn((_requestId: string, callback: (chunk: string) => void) => {
      onData = callback;
      return vi.fn();
    }),
    onStreamDone: vi.fn((_requestId: string, callback: () => void) => {
      onDone = callback;
      return vi.fn();
    }),
    onStreamError: vi.fn(() => vi.fn()),
    onStreamAbort: vi.fn(() => vi.fn()),
    stream: vi.fn(async () => {
      queueMicrotask(() => {
        onData?.(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  content: 'Checking ',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-1',
                      function: { name: 'web_search', arguments: '{"query":' },
                    },
                  ],
                },
              },
            ],
          })}\n\n`,
        );
        onData?.(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  content: 'now',
                  tool_calls: [{ index: 0, function: { arguments: '"latest"}' } }],
                },
              },
            ],
          })}\n\n`,
        );
        onDone?.();
      });
      return { ok: true, status: 200, statusText: 'OK' };
    }),
  };
  vi.stubGlobal('window', { electron: { api } });

  const response = await (apiService as any).streamOpenAIChatResponse(
    'https://example.com/v1/chat/completions',
    {},
    { model: 'test' },
    'request-stream',
    progress,
  );

  expect(progress).toHaveBeenLastCalledWith('Checking now', undefined);
  expect(response.choices[0].message.tool_calls[0]).toMatchObject({
    id: 'call-1',
    function: { name: 'web_search', arguments: '{"query":"latest"}' },
  });
});

test('OpenAI-compatible streams preserve provider reasoning fields for tool replay', async () => {
  let onData: ((chunk: string) => void) | undefined;
  let onDone: (() => void) | undefined;
  const api = {
    onStreamData: vi.fn((_requestId: string, callback: (chunk: string) => void) => {
      onData = callback;
      return vi.fn();
    }),
    onStreamDone: vi.fn((_requestId: string, callback: () => void) => {
      onDone = callback;
      return vi.fn();
    }),
    onStreamError: vi.fn(() => vi.fn()),
    onStreamAbort: vi.fn(() => vi.fn()),
    stream: vi.fn(async () => {
      queueMicrotask(() => {
        onData?.(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  reasoning_content: 'inspect ',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-reasoning',
                      function: { name: 'web_search', arguments: '{"query":"status"}' },
                    },
                  ],
                },
              },
            ],
          })}\n\n`,
        );
        onData?.(
          `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'sources' } }] })}\n\n`,
        );
        onDone?.();
      });
      return { ok: true, status: 200, statusText: 'OK' };
    }),
  };
  vi.stubGlobal('window', { electron: { api } });

  const response = await (apiService as any).streamOpenAIChatResponse(
    'https://example.com/v1/chat/completions',
    {},
    { model: 'deepseek-v4-flash' },
    'request-reasoning',
  );

  expect(response.choices[0].message).toMatchObject({
    content: null,
    reasoning_content: 'inspect sources',
  });
});

test('DeepSeek tool turns replay reasoning and a non-null assistant content field', async () => {
  const streamResponse = vi
    .spyOn(apiService as any, 'streamOpenAIChatResponse')
    .mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            reasoning_content: 'need current sources',
            tool_calls: [
              {
                id: 'call-deepseek',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"latest"}' },
              },
            ],
          },
        },
      ],
    })
    .mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'final answer' } }],
    });
  vi.stubGlobal('window', {
    electron: {
      api: { webSearch: vi.fn().mockResolvedValue({ ok: true, data: { results: [] } }) },
    },
  });

  await (apiService as any).runOpenAIWebSearchLoop(
    [],
    'deepseek-v4-flash',
    { apiKey: 'deepseek-key', baseUrl: 'https://api.deepseek.com' },
    ProviderName.DeepSeek,
    undefined,
    'request-deepseek',
  );

  const secondBody = streamResponse.mock.calls[1][2] as { messages: any[] };
  const firstBody = streamResponse.mock.calls[0][2] as Record<string, unknown>;
  expect(firstBody).not.toHaveProperty('tool_choice');
  expect(firstBody).not.toHaveProperty('stream_options');
  expect(secondBody.messages[0]).toMatchObject({
    role: 'assistant',
    content: '',
    reasoning_content: 'need current sources',
  });
});

test('Anthropic streams preserve thinking text and signatures for the next tool turn', async () => {
  let onData: ((chunk: string) => void) | undefined;
  let onDone: (() => void) | undefined;
  const api = {
    onStreamData: vi.fn((_requestId: string, callback: (chunk: string) => void) => {
      onData = callback;
      return vi.fn();
    }),
    onStreamDone: vi.fn((_requestId: string, callback: () => void) => {
      onDone = callback;
      return vi.fn();
    }),
    onStreamError: vi.fn(() => vi.fn()),
    onStreamAbort: vi.fn(() => vi.fn()),
    stream: vi.fn(async () => {
      queueMicrotask(() => {
        const events = [
          { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'inspect' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'signature_delta', signature: 'signed' },
          },
          {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'tool_use', id: 'tool-1', name: 'web_search', input: {} },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'input_json_delta', partial_json: '{"query":"latest"}' },
          },
        ];
        events.forEach(event => onData?.(`data: ${JSON.stringify(event)}\n\n`));
        onDone?.();
      });
      return { ok: true, status: 200, statusText: 'OK' };
    }),
  };
  vi.stubGlobal('window', { electron: { api } });

  const response = await (apiService as any).streamAnthropicResponse(
    'https://example.com/v1/messages',
    {},
    { model: 'claude-sonnet-4-6' },
    'request-anthropic-thinking',
  );

  expect(response.content).toEqual([
    { type: 'thinking', thinking: 'inspect', signature: 'signed' },
    {
      type: 'tool_use',
      id: 'tool-1',
      name: 'web_search',
      input: { query: 'latest' },
    },
  ]);
});

test('an already-aborted signal never starts the provider stream', async () => {
  const abortController = new AbortController();
  abortController.abort();
  const api = {
    onStreamData: vi.fn(() => vi.fn()),
    onStreamDone: vi.fn(() => vi.fn()),
    onStreamError: vi.fn(() => vi.fn()),
    onStreamAbort: vi.fn(() => vi.fn()),
    cancelStream: vi.fn().mockResolvedValue(false),
    stream: vi.fn(),
  };
  vi.stubGlobal('window', { electron: { api } });

  await expect(
    (apiService as any).streamOpenAIChatResponse(
      'https://example.com/v1/chat/completions',
      {},
      { model: 'test' },
      'request-aborted',
      undefined,
      abortController.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });

  expect(api.cancelStream).not.toHaveBeenCalled();
  expect(api.stream).not.toHaveBeenCalled();
});

test('Anthropic receives a tool_result for every parallel call', async () => {
  const streamResponse = vi
    .spyOn(apiService as any, 'streamAnthropicResponse')
    .mockResolvedValueOnce({
      content: Array.from({ length: 4 }, (_, index) => ({
        type: 'tool_use',
        id: `tool-${index}`,
        name: 'web_search',
        input: { query: `query ${index}` },
      })),
    })
    .mockResolvedValueOnce({ content: [{ type: 'text', text: 'done' }] });
  const webSearch = vi.fn().mockResolvedValue({
    ok: true,
    data: { query: 'test', results: [] },
  });
  vi.stubGlobal('window', { electron: { api: { webSearch } } });

  await (apiService as any).runAnthropicWebSearchLoop(
    [],
    'system',
    'claude-test',
    { apiKey: 'key', baseUrl: 'https://api.anthropic.com' },
    undefined,
    'request-anthropic',
  );

  const secondBody = streamResponse.mock.calls[1][2] as { messages: any[] };
  expect(secondBody.messages.at(-1).content).toHaveLength(4);
  expect(JSON.parse(secondBody.messages.at(-1).content[3].content)).toEqual({
    error: 'Only three web_search calls are allowed per model turn.',
  });
});

test('Gemini uses streamGenerateContent and answers every parallel function call', async () => {
  const streamResponse = vi
    .spyOn(apiService as any, 'streamGeminiResponse')
    .mockResolvedValueOnce({
      candidates: [
        {
          content: {
            role: 'model',
            parts: Array.from({ length: 4 }, (_, index) => ({
              functionCall: { name: 'web_search', args: { query: `query ${index}` } },
            })),
          },
        },
      ],
    })
    .mockResolvedValueOnce({
      candidates: [{ content: { role: 'model', parts: [{ text: 'done' }] } }],
    });
  const webSearch = vi.fn().mockResolvedValue({
    ok: true,
    data: { query: 'test', results: [] },
  });
  vi.stubGlobal('window', { electron: { api: { webSearch } } });

  await (apiService as any).runGeminiWebSearchLoop(
    [],
    'system',
    'gemini-test',
    { apiKey: 'key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    undefined,
    'request-gemini',
  );

  expect(streamResponse.mock.calls[0][0]).toContain(':streamGenerateContent');
  const secondBody = streamResponse.mock.calls[1][2] as { contents: any[] };
  expect(secondBody.contents.at(-1).parts).toHaveLength(4);
  expect(secondBody.contents.at(-1).parts[3].functionResponse.response).toEqual({
    error: 'Only three web_search calls are allowed per model turn.',
  });
});
