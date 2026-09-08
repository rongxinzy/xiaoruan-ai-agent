import { afterEach, expect, test, vi } from 'vitest';

import { IpcChatTransport, SseChunkParser } from './ipcChatTransport';
import { ApiFormat, ProviderName } from '../../shared/providers';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('streams configured provider responses and cancels the next request through generic IPC', async () => {
  const genericStream = vi.fn(async (_request: Record<string, unknown>) => ({
    ok: true,
    status: 200,
  }));
  const cancelStream = vi.fn(async () => true);
  const callbacks: { onData?: (chunk: string) => void } = {};
  vi.stubGlobal('window', {
    electron: {
      api: {
        stream: genericStream,
        cancelStream,
        onStreamData: vi.fn((_requestId: string, callback: (chunk: string) => void) => {
          callbacks.onData = callback;
          return () => undefined;
        }),
        onStreamDone: vi.fn(() => () => undefined),
        onStreamError: vi.fn(() => () => undefined),
        onStreamAbort: vi.fn(() => () => undefined),
      },
    },
  });
  const transport = new IpcChatTransport({
    provider: ProviderName.DeepSeek,
    model: 'deepseek-chat',
    apiKey: 'test-user-key',
    baseUrl: 'https://provider.example/v1',
    apiFormat: ApiFormat.OpenAI,
  });

  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat-1',
    messageId: undefined,
    messages: [
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    ],
    abortSignal: undefined,
  });
  await vi.waitFor(() => expect(genericStream).toHaveBeenCalledTimes(1));

  expect(genericStream).toHaveBeenCalledWith({
    requestId: expect.stringMatching(/^ipcchat_chat-1_/u),
    url: 'https://provider.example/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-key' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
    }),
  });

  const reader = stream.getReader();
  callbacks.onData?.('data: {"choices":[{"delta":{"content":"hel');
  callbacks.onData?.('lo"}}]}\n\ndata: [DONE]\n\n');
  await expect(reader.read()).resolves.toMatchObject({ value: { type: 'text-start' } });
  await expect(reader.read()).resolves.toMatchObject({
    value: { type: 'text-delta', delta: 'hello' },
  });
  await expect(reader.read()).resolves.toMatchObject({ value: { type: 'finish' } });
  await expect(reader.read()).resolves.toMatchObject({ done: true });
  const nextStream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat-1',
    messageId: undefined,
    messages: [{ id: 'message-2', role: 'user', parts: [{ type: 'text', text: 'continue' }] }],
    abortSignal: undefined,
  });
  await vi.waitFor(() => expect(genericStream).toHaveBeenCalledTimes(2));
  const firstId = genericStream.mock.calls[0][0].requestId;
  const nextId = genericStream.mock.calls[1][0].requestId;
  expect(nextId).not.toBe(firstId);
  await nextStream.cancel();
  expect(cancelStream).toHaveBeenLastCalledWith(nextId);
});

test('closes reasoning before starting the visible text segment', () => {
  const parser = new SseChunkParser('openai');

  const reasoningChunks = parser.feed({
    choices: [{ delta: { reasoning_content: 'Inspect the request.' } }],
  });
  const textChunks = parser.feed({
    choices: [{ delta: { content: 'Here is the answer.' } }],
  });

  expect(reasoningChunks.map(chunk => chunk.type)).toEqual(['reasoning-start', 'reasoning-delta']);
  expect(textChunks.map(chunk => chunk.type)).toEqual([
    'reasoning-end',
    'text-start',
    'text-delta',
  ]);
});

test('closes an unfinished reasoning segment when the stream completes', () => {
  const parser = new SseChunkParser('openai');
  parser.feed({ choices: [{ delta: { reasoning_content: 'Inspect the request.' } }] });

  expect(parser.flush().map(chunk => chunk.type)).toEqual(['reasoning-end']);
});
