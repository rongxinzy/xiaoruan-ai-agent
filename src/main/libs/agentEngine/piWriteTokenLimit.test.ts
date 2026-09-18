import { expect, test, vi } from 'vitest';

import {
  calculatePiWriteChunkCharacterLimit,
  createPiLargeFileWriteSystemPrompt,
  PiAssistantStopReason,
  PiBuiltinFileToolName,
  PiContentBlockType,
  PiFileMutationRecoveryCause,
  PiWriteTokenLimitRecovery,
} from './piWriteTokenLimit';

const writeCall = (id: string, path: string) => ({
  type: PiContentBlockType.ToolCall,
  id,
  name: PiBuiltinFileToolName.Write,
  arguments: { path, content: 'partial' },
});

const truncatedWriteCall = (id: string, path: string) => ({
  type: PiContentBlockType.ToolCall,
  id,
  name: PiBuiltinFileToolName.Write,
  arguments: { path },
});

const editCall = (id: string, path: string, argumentsValue: Record<string, unknown>) => ({
  type: PiContentBlockType.ToolCall,
  id,
  name: PiBuiltinFileToolName.Edit,
  arguments: { path, ...argumentsValue },
});

test('caps normal write chunks at 4000 characters while respecting small output budgets', () => {
  expect(calculatePiWriteChunkCharacterLimit(4096)).toBe(4000);
  expect(calculatePiWriteChunkCharacterLimit(16384)).toBe(4000);
  expect(calculatePiWriteChunkCharacterLimit(512)).toBe(512);
  expect(calculatePiWriteChunkCharacterLimit(1)).toBe(1);
  expect(calculatePiWriteChunkCharacterLimit(Number.NaN)).toBe(4000);
});

test('instructs Pi to reuse write, edit, read, grep, and bash for chunked writes', () => {
  const prompt = createPiLargeFileWriteSystemPrompt(4096);

  expect(prompt).toContain('built-in write tool');
  expect(prompt).toContain('4000 characters');
  expect(prompt).toContain('use edit');
  expect(prompt).toContain('read or grep');
  expect(prompt).toContain('built-in bash tool');
  expect(prompt).toContain('only one content-bearing write or edit call');
  expect(prompt).toContain('transport interruption');
});

test('does not steer normal responses or truncated non-write calls', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  expect(
    recovery.queueIfNeeded(
      { stopReason: PiAssistantStopReason.Stop, content: [writeCall('write-1', 'src/file.ts')] },
      session,
    ),
  ).toBe(false);
  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Length,
        content: [
          {
            type: PiContentBlockType.ToolCall,
            id: 'bash-1',
            name: PiBuiltinFileToolName.Bash,
            arguments: {},
          },
        ],
      },
      session,
    ),
  ).toBe(false);
  expect(session.steer).not.toHaveBeenCalled();
});

test('steers a write call that a transport failure interrupted mid-stream', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Error,
        errorMessage: 'Stream ended without finish_reason',
        content: [
          {
            type: PiContentBlockType.ToolCall,
            id: 'call_ee8e3fb90cf64cfaad4a95ea',
            name: PiBuiltinFileToolName.Write,
            arguments: {},
          },
        ],
      },
      session,
    ),
  ).toBe(true);
  expect(session.steer).toHaveBeenCalledWith(
    expect.stringContaining('interrupted by a transport failure'),
  );
  expect(session.steer).toHaveBeenCalledWith(expect.stringContaining('2000 characters'));
});

test('keeps the token-limit wording for truncated write calls', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Length,
        content: [writeCall('write-1', 'invite.html')],
      },
      session,
    ),
  ).toBe(true);
  expect(session.steer).toHaveBeenCalledWith(expect.stringContaining('output token limit'));
});

test('does not steer aborted turns, non-transport errors, or errors without a write call', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Aborted,
        content: [writeCall('write-1', 'invite.html')],
      },
      session,
    ),
  ).toBe(false);
  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Error,
        errorMessage: 'Request failed with status 401',
        content: [writeCall('write-unauthorized', 'invite.html')],
      },
      session,
    ),
  ).toBe(false);
  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Error,
        errorMessage: 'Stream ended without finish_reason',
        content: [{ type: PiContentBlockType.Text, text: 'boom' }],
      },
      session,
    ),
  ).toBe(false);
  expect(
    recovery.queueIfNeeded({ stopReason: PiAssistantStopReason.Error, content: 'boom' }, session),
  ).toBe(false);
  expect(session.steer).not.toHaveBeenCalled();
});

test('steers each truncated write call once and resets for the next user turn', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };
  const firstMessage = {
    stopReason: PiAssistantStopReason.Length,
    content: [writeCall('write-1', 'src\\large.ts'), writeCall('write-2', 'src/other.ts')],
  };

  expect(recovery.queueIfNeeded(firstMessage, session)).toBe(true);
  expect(recovery.queueIfNeeded(firstMessage, session)).toBe(false);
  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Length,
        content: [writeCall('write-3', 'src/other.ts')],
      },
      session,
    ),
  ).toBe(true);
  expect(session.steer).toHaveBeenCalledTimes(2);
  expect(session.steer).toHaveBeenCalledWith(expect.stringContaining('2000 characters'));

  recovery.reset();
  expect(recovery.queueIfNeeded(firstMessage, session)).toBe(true);
  expect(session.steer).toHaveBeenCalledTimes(3);
});

test('backs write chunks off from 2000 to 1000 characters and caps recovery attempts', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    expect(
      recovery.queueIfNeeded(
        {
          stopReason: PiAssistantStopReason.Length,
          content: [writeCall(`write-${attempt}`, 'large.md')],
        },
        session,
      ),
    ).toBe(true);
  }
  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Length,
        content: [writeCall('write-5', 'large.md')],
      },
      session,
    ),
  ).toBe(false);
  expect(session.steer).toHaveBeenCalledTimes(4);
  expect(session.steer).toHaveBeenNthCalledWith(1, expect.stringContaining('2000 characters'));
  expect(session.steer).toHaveBeenNthCalledWith(2, expect.stringContaining('1000 characters'));
  expect(session.steer).toHaveBeenNthCalledWith(4, expect.stringContaining('1000 characters'));
});

test('reports an exhausted recovery budget instead of ending the turn silently', () => {
  const onBudgetExhausted = vi.fn();
  const recovery = new PiWriteTokenLimitRecovery(4096, { onBudgetExhausted });
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Length,
        content: [truncatedWriteCall(`write-${attempt}`, 'large.md')],
      },
      session,
    );
  }
  expect(onBudgetExhausted).not.toHaveBeenCalled();

  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Length,
        content: [truncatedWriteCall('write-5', 'large.md')],
      },
      session,
    ),
  ).toBe(false);
  expect(onBudgetExhausted).toHaveBeenCalledWith({
    cause: PiFileMutationRecoveryCause.OutputLimit,
    callKeys: ['call:write-5'],
  });
});

test('does not report an exhausted budget for a call it already steered', () => {
  const onBudgetExhausted = vi.fn();
  const recovery = new PiWriteTokenLimitRecovery(4096, { onBudgetExhausted });
  const session = { steer: vi.fn().mockResolvedValue(undefined) };
  const message = {
    stopReason: PiAssistantStopReason.Length,
    content: [truncatedWriteCall('write-1', 'large.md')],
  };

  expect(recovery.queueIfNeeded(message, session)).toBe(true);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    expect(recovery.queueIfNeeded(message, session)).toBe(false);
  }
  expect(onBudgetExhausted).not.toHaveBeenCalled();
});

test('steers a write call whose payload never arrived despite a normal stop', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Stop,
        content: [truncatedWriteCall('call_ee8e3fb90cf64cfaad4a95ea', 'scratch/gen_ppt.py')],
      },
      session,
    ),
  ).toBe(true);
  expect(session.steer).toHaveBeenCalledWith(
    expect.stringContaining('ended before its payload arrived'),
  );
  expect(session.steer).toHaveBeenCalledWith(expect.stringContaining('2000 characters'));
});

test('steers a truncated edit call reported as a completed tool use', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.ToolUse,
        content: [editCall('edit-1', 'large.md', { edits: [{ oldText: 'marker' }] })],
      },
      session,
    ),
  ).toBe(true);
  expect(session.steer).toHaveBeenCalledWith(
    expect.stringContaining('ended before its payload arrived'),
  );
});

test('ignores edit arguments the built-in tool can repair or apply as-is', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };
  const cases = [
    editCall('edit-legacy', 'large.md', { oldText: 'marker', newText: 'chunk' }),
    editCall('edit-json', 'large.md', { edits: '[{"oldText":"a","newText":"b"}]' }),
    editCall('edit-delete', 'large.md', { edits: [{ oldText: 'marker', newText: '' }] }),
    editCall('edit-insert', 'large.md', { edits: [{ oldText: '', newText: '# head' }] }),
  ];

  for (const block of cases) {
    expect(
      recovery.queueIfNeeded({ stopReason: PiAssistantStopReason.Stop, content: [block] }, session),
    ).toBe(false);
  }
  expect(session.steer).not.toHaveBeenCalled();
});

test('never steers a truncated call from an aborted turn', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const session = { steer: vi.fn().mockResolvedValue(undefined) };

  expect(
    recovery.queueIfNeeded(
      {
        stopReason: PiAssistantStopReason.Aborted,
        content: [truncatedWriteCall('write-aborted', 'large.md')],
      },
      session,
    ),
  ).toBe(false);
  expect(session.steer).not.toHaveBeenCalled();
});

test('allows recovery to be queued again when Pi rejects steering', async () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const steerError = new Error('session stopped');
  const session = { steer: vi.fn().mockRejectedValueOnce(steerError).mockResolvedValue(undefined) };
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const message = {
    stopReason: PiAssistantStopReason.Length,
    content: [writeCall('write-1', 'large.md')],
  };

  expect(recovery.queueIfNeeded(message, session)).toBe(true);
  await vi.waitFor(() =>
    expect(warning).toHaveBeenCalledWith(
      '[PiWriteRecovery] failed to queue chunked write guidance:',
      steerError,
    ),
  );
  expect(recovery.queueIfNeeded(message, session)).toBe(true);
  expect(session.steer).toHaveBeenCalledTimes(2);

  warning.mockRestore();
});

test('allows recovery after a synchronous steering failure', () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  const steerError = new Error('session stopped');
  const session = {
    steer: vi.fn(() => {
      throw steerError;
    }),
  };
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const message = {
    stopReason: PiAssistantStopReason.Length,
    content: [writeCall('write-1', 'large.md')],
  };

  expect(recovery.queueIfNeeded(message, session)).toBe(false);
  expect(recovery.queueIfNeeded(message, session)).toBe(false);
  expect(session.steer).toHaveBeenCalledTimes(2);
  expect(warning).toHaveBeenCalledWith(
    '[PiWriteRecovery] failed to queue chunked write guidance:',
    steerError,
  );

  warning.mockRestore();
});

test('does not let a delayed failure clear recovery state from a newer user turn', async () => {
  const recovery = new PiWriteTokenLimitRecovery(4096);
  let rejectFirstSteer: ((error: Error) => void) | undefined;
  const session = {
    steer: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirstSteer = reject;
          }),
      )
      .mockResolvedValue(undefined),
  };
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const message = {
    stopReason: PiAssistantStopReason.Length,
    content: [writeCall('write-1', 'large.md')],
  };

  expect(recovery.queueIfNeeded(message, session)).toBe(true);
  recovery.reset();
  expect(recovery.queueIfNeeded(message, session)).toBe(true);

  rejectFirstSteer?.(new Error('late failure'));
  await vi.waitFor(() => expect(warning).toHaveBeenCalled());
  expect(recovery.queueIfNeeded(message, session)).toBe(false);

  warning.mockRestore();
});
