import { afterEach, expect, test, vi } from 'vitest';
import { ModelCapabilityStatus } from '../../shared/providers';
import { ChatToolCapabilityPolicy, isToolCapabilityRejection } from './chatToolCapabilityPolicy';
import { WebSearchToolEventType } from './webSearchToolEvents';

afterEach(() => vi.restoreAllMocks());

function rejection(statusCode = 400, message = 'This model does not support tools') {
  return Object.assign(new Error(message), { statusCode });
}

function request() {
  return {
    provider: 'custom_0',
    model: 'new-model',
    config: { baseUrl: 'https://example.test/v1', apiKey: 'test-key', apiFormat: 'openai' },
    capability: ModelCapabilityStatus.Unknown,
    attempt: vi.fn(async () => ({ content: 'tool answer' })),
    plain: vi.fn(async () => ({ content: 'plain answer' })),
  };
}

test('unknown models are attempted without notices even if no tool was called', async () => {
  const policy = new ChatToolCapabilityPolicy();
  const input = { ...request(), onProgress: vi.fn() };
  await expect(policy.run(input)).resolves.toEqual({ content: 'tool answer' });
  await policy.run(input);
  expect(input.attempt).toHaveBeenCalledTimes(2);
  expect(input.plain).not.toHaveBeenCalled();
  expect(input.onProgress).not.toHaveBeenCalled();
});

test('only explicit tool support rejections are classified, not schema or transient failures', () => {
  for (const message of [
    'tools are not supported',
    "Unsupported parameter: 'tools'",
    'Unrecognized request argument supplied: tools',
  ]) {
    expect(isToolCapabilityRejection(rejection(400, message))).toBe(true);
  }
  for (const error of [
    rejection(401),
    rejection(403),
    rejection(429),
    rejection(500),
    new Error('network timeout'),
    rejection(400, 'Invalid tools schema: required property is missing'),
    rejection(400, 'tools schema type is not supported'),
    rejection(400, "Unsupported parameter: 'tools.function.strict'"),
  ]) {
    expect(isToolCapabilityRejection(error)).toBe(false);
  }
});

test('caches a rejection for the endpoint and retains the fallback notice in streamed and final text', async () => {
  const policy = new ChatToolCapabilityPolicy();
  const base = request();
  base.attempt.mockRejectedValue(rejection());
  const onProgress = vi.fn();
  const plain = vi.fn(async (progress: (content: string) => void) => {
    progress('plain');
    return { content: 'plain answer' };
  });
  const input = { ...base, plain, onProgress };
  const result = await policy.run(input);
  const prefix = onProgress.mock.calls[0][0];
  expect(prefix).toContain('未执行联网搜索');
  expect(onProgress).toHaveBeenLastCalledWith(prefix + 'plain', undefined);
  expect(result.content).toBe(prefix + 'plain answer');
  await policy.run(input);
  expect(base.attempt).toHaveBeenCalledTimes(1);
});

test('provider, model, URL, credentials, format and settings refresh invalidate cached evidence', async () => {
  const policy = new ChatToolCapabilityPolicy();
  const base = request();
  base.attempt.mockRejectedValue(rejection());
  await policy.run(base);
  for (const input of [
    { ...base, provider: 'custom_1' },
    { ...base, model: 'other-model' },
    { ...base, config: { ...base.config, baseUrl: 'https://other.test/v1' } },
    { ...base, config: { ...base.config, apiKey: 'changed-key' } },
    { ...base, config: { ...base.config, apiFormat: 'anthropic' } },
  ])
    await policy.run(input);
  policy.clear();
  await policy.run(base);
  expect(base.attempt).toHaveBeenCalledTimes(7);
});

test('explicit user support bypasses rejection cache and explicit lack of support skips tools', async () => {
  const policy = new ChatToolCapabilityPolicy();
  const input = request();
  input.attempt.mockRejectedValue(rejection());
  await policy.run(input);
  await expect(
    policy.run({ ...input, configuredCapability: ModelCapabilityStatus.Supported }),
  ).rejects.toThrow('support tools');
  expect(input.attempt).toHaveBeenCalledTimes(2);
  await policy.run({ ...input, configuredCapability: ModelCapabilityStatus.Unsupported });
  expect(input.attempt).toHaveBeenCalledTimes(2);
  expect(input.plain).toHaveBeenCalledTimes(2);
});

test('expired endpoint evidence allows another tool attempt', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const policy = new ChatToolCapabilityPolicy();
  const input = request();
  input.attempt.mockRejectedValueOnce(rejection());
  await policy.run(input);
  now.mockReturnValue(1000 + 30 * 60 * 1000);
  await expect(policy.run(input)).resolves.toEqual({ content: 'tool answer' });
  expect(input.attempt).toHaveBeenCalledTimes(2);
});

test('transient and malformed-schema failures propagate without poisoning the cache', async () => {
  for (const error of [
    rejection(429),
    rejection(401),
    new Error('timeout'),
    rejection(400, 'Invalid tools schema'),
  ]) {
    const policy = new ChatToolCapabilityPolicy();
    const input = request();
    input.attempt.mockRejectedValueOnce(error);
    await expect(policy.run(input)).rejects.toBe(error);
    await policy.run(input);
    expect(input.attempt).toHaveBeenCalledTimes(2);
    expect(input.plain).not.toHaveBeenCalled();
  }
});

test('never replays a request after visible output or a tool event', async () => {
  for (const toolStarted of [true, false]) {
    const policy = new ChatToolCapabilityPolicy();
    const input = request();
    await expect(
      policy.run({
        ...input,
        attempt: async (progress, toolEvent) => {
          if (toolStarted)
            toolEvent({ type: WebSearchToolEventType.Start, toolCallId: 'search-1', input: {} });
          else progress('partial answer');
          throw rejection();
        },
      }),
    ).rejects.toThrow('support tools');
    expect(input.plain).not.toHaveBeenCalled();
    await policy.run(input);
    expect(input.attempt).toHaveBeenCalledOnce();
  }
});

test('cancellation during a rejected attempt prevents fallback', async () => {
  const controller = new AbortController();
  const input = request();
  await expect(
    new ChatToolCapabilityPolicy().run({
      ...input,
      signal: controller.signal,
      attempt: async () => {
        controller.abort();
        throw rejection();
      },
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(input.plain).not.toHaveBeenCalled();
});

test('an in-flight rejection cannot repopulate evidence after a settings refresh', async () => {
  const policy = new ChatToolCapabilityPolicy();
  const input = request();
  await policy.run({
    ...input,
    attempt: async () => {
      policy.clear();
      throw rejection();
    },
  });
  await policy.run(input);
  expect(input.attempt).toHaveBeenCalledOnce();
});
