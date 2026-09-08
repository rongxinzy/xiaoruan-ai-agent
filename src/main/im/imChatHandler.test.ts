import axios from 'axios';
import { afterEach, expect, test, vi } from 'vitest';

import { ProductIdentityPrompt } from '../productIdentity';
import { IMChatHandler } from './imChatHandler';
import { DEFAULT_IM_SETTINGS, type IMMessage } from './types';

afterEach(() => vi.restoreAllMocks());

test('IM chat and stream requests carry the shared identity and preserve custom instructions', async () => {
  const post = vi.spyOn(axios, 'post').mockResolvedValue({
    data: { choices: [{ message: { content: 'Test reply' } }] },
  });
  const handler = new IMChatHandler({
    getLLMConfig: async () => ({ baseUrl: 'https://example.invalid/v1', apiKey: 'test-key' }),
    imSettings: { ...DEFAULT_IM_SETTINGS, systemPrompt: 'Customer instructions.' },
    getSkillsPrompt: async () => 'Customer skill instructions.',
  });
  const message: IMMessage = {
    platform: 'dingtalk',
    messageId: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'sender-1',
    content: 'Who are you?',
    chatType: 'direct',
    timestamp: 0,
  };
  expect(await handler.processMessage(message)).toBe('Test reply');
  for await (const chunk of handler.processMessageStream(message)) {
    expect(chunk).toEqual({ content: 'Test reply', done: true });
  }
  expect(post).toHaveBeenCalledTimes(2);
  for (const [, body] of post.mock.calls) {
    const request = body as { messages: Array<{ content: string }> };
    expect(request.messages[0].content).toContain(ProductIdentityPrompt);
    expect(request.messages[0].content).toContain('Customer instructions.');
    expect(request.messages[0].content).toContain('Customer skill instructions.');
    expect(request.messages[0].content).not.toMatch(/容芯|致远|知远|zhiyuan|rongxin/i);
  }
});
