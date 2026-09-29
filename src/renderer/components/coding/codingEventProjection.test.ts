import { describe, expect, test } from 'vitest';

import {
  CodingEventKind,
  CodingStreamUpdateMode,
  CodingToolCallStatus,
  type CodingEvent,
} from '../../../shared/codingAgent';
import {
  CoworkToolActivityEventType,
  CoworkToolActivityPhase,
} from '../../../shared/cowork/toolActivity';
import {
  CodingConversationActivityKind,
  CodingConversationRole,
  CodingConversationTimelineItemKind,
  CodingConversationTurnStatus,
} from './constants';
import { getCodingEventText, projectCodingEvents } from './codingEventProjection';

const event = (
  sequence: number,
  kind: CodingEvent['kind'],
  payload: Record<string, unknown>,
): CodingEvent => ({
  id: `event-${sequence}`,
  laneId: 'lane-1',
  sequence,
  kind,
  payload,
  createdAt: sequence,
});

describe('projectCodingEvents', () => {
  test('keeps tools next to the reasoning and messages that produced them', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: CodingConversationRole.User, content: 'Fix it' }),
      event(2, CodingEventKind.Reasoning, { content: 'Inspect the failing test. ' }),
      event(3, CodingEventKind.ToolCall, {
        toolCallId: 'call-1',
        toolName: 'bash',
        toolInput: { command: 'npm test' },
        status: CodingToolCallStatus.Pending,
      }),
      event(4, CodingEventKind.Reasoning, { content: 'Apply the narrowest fix. ' }),
      event(5, CodingEventKind.ToolCall, {
        toolCallId: 'call-1',
        output: 'passed',
        status: CodingToolCallStatus.Completed,
      }),
      event(6, CodingEventKind.Message, {
        role: CodingConversationRole.Assistant,
        messageId: 'answer-1',
        content: 'Fixed.',
      }),
    ]);

    expect(turns[0].timeline.map(item => item.kind)).toEqual([
      CodingConversationTimelineItemKind.Reasoning,
      CodingConversationTimelineItemKind.Activity,
      CodingConversationTimelineItemKind.Reasoning,
      CodingConversationTimelineItemKind.AssistantMessage,
    ]);
    const toolItem = turns[0].timeline[1];
    expect(toolItem?.kind).toBe(CodingConversationTimelineItemKind.Activity);
    if (toolItem?.kind !== CodingConversationTimelineItemKind.Activity) return;
    expect(turns[0].bodyMessageId).toBe('answer-1');
    expect(toolItem.activity.event.payload).toMatchObject({
      toolCallId: 'call-1',
      toolInput: { command: 'npm test' },
      output: 'passed',
      status: CodingToolCallStatus.Completed,
    });
  });

  test('groups a complete agent turn and merges reasoning chunks', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: 'user', content: '修复登录问题' }),
      event(2, CodingEventKind.Reasoning, { content: '先检查' }),
      event(3, CodingEventKind.Reasoning, { content: '认证流程。' }),
      event(4, CodingEventKind.MessageDelta, {
        role: 'assistant',
        messageId: 'answer-1',
        content: '已经修复。',
        streamUpdateMode: CodingStreamUpdateMode.Replace,
      }),
      event(5, CodingEventKind.TurnComplete, {}),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].userMessage?.content).toBe('修复登录问题');
    expect(turns[0].reasoning?.content).toBe('先检查认证流程。');
    expect(turns[0].assistantMessages).toHaveLength(1);
    expect(turns[0].assistantMessages[0].content).toBe('已经修复。');
    expect(turns[0].assistantMessages[0].isFinalAnswer).toBe(true);
    expect(turns[0].bodyMessageId).toBe('answer-1');
    expect(turns[0].status).toBe(CodingConversationTurnStatus.Complete);
  });

  test('selects the streamed assistant output for the body before completion', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Reasoning, { content: 'Preparing the final response.' }),
      event(2, CodingEventKind.MessageDelta, {
        role: CodingConversationRole.Assistant,
        messageId: 'answer-1',
        content: 'Streaming final response.',
        streamUpdateMode: CodingStreamUpdateMode.Replace,
      }),
    ]);

    expect(turns[0].bodyMessageId).toBe('answer-1');
    expect(turns[0].assistantMessages[0].isFinalAnswer).toBe(false);
    expect(turns[0].status).toBeNull();
  });

  test('preserves whitespace reasoning chunks between streamed text updates', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: CodingConversationRole.User, content: 'Inspect it' }),
      event(2, CodingEventKind.Reasoning, { content: 'Plan the summary.' }),
      event(3, CodingEventKind.Reasoning, { content: '\n\n' }),
      event(4, CodingEventKind.Reasoning, { content: 'Refine the device specifications.' }),
    ]);

    expect(turns[0].timeline.map(item => item.kind)).toEqual([
      CodingConversationTimelineItemKind.Reasoning,
    ]);
    expect(turns[0].reasoning?.content).toBe(
      'Plan the summary.\n\nRefine the device specifications.',
    );
  });

  test('replaces cumulative built-in reasoning snapshots', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: 'user', content: '分析问题' }),
      event(2, CodingEventKind.Reasoning, {
        content: '先检查',
        streamUpdateMode: CodingStreamUpdateMode.Replace,
      }),
      event(3, CodingEventKind.Reasoning, {
        content: '先检查认证流程。',
        streamUpdateMode: CodingStreamUpdateMode.Replace,
      }),
    ]);

    expect(turns[0].reasoning?.content).toBe('先检查认证流程。');
  });

  test('keeps tool activity but leaves file and terminal events to the inspector', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: 'user', content: '运行测试' }),
      event(2, CodingEventKind.ToolCall, {
        title: 'Run tests',
        status: CodingToolCallStatus.Completed,
      }),
      event(3, CodingEventKind.FileChange, { path: 'src/a.ts', newText: 'changed' }),
      event(4, CodingEventKind.Terminal, { output: '1 test passed' }),
      event(5, CodingEventKind.Usage, { tokens: 10 }),
      event(6, CodingEventKind.TurnComplete, {}),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].activities).toHaveLength(1);
    expect(turns[0].activities[0].kind).toBe(CodingConversationActivityKind.Tool);
  });

  test('creates a new turn after a terminal status event', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: 'user', content: '第一轮' }),
      event(2, CodingEventKind.TurnComplete, {}),
      event(3, CodingEventKind.Message, { role: 'user', content: '第二轮' }),
      event(4, CodingEventKind.TurnFailed, { error: { message: 'Agent disconnected' } }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].status).toBe(CodingConversationTurnStatus.Complete);
    expect(turns[1].status).toBe(CodingConversationTurnStatus.Failed);
    expect(turns[1].statusDetail).toBe('Agent disconnected');
  });

  test('extracts text from built-in nested message payloads', () => {
    const nested = event(1, CodingEventKind.Message, {
      message: { type: 'assistant', content: [{ type: 'text', text: '嵌套消息' }] },
    });

    expect(getCodingEventText(nested)).toBe('嵌套消息');
    expect(projectCodingEvents([nested])[0].assistantMessages[0].content).toBe('嵌套消息');
  });

  test('replaces a streamed built-in message with its final nested message', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.MessageDelta, {
        messageId: 'assistant-1',
        content: '流式内容',
        streamUpdateMode: CodingStreamUpdateMode.Replace,
      }),
      event(2, CodingEventKind.Message, {
        message: { id: 'assistant-1', type: 'assistant', content: '最终内容' },
      }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].assistantMessages).toHaveLength(1);
    expect(turns[0].assistantMessages[0].content).toBe('最终内容');
  });

  test('keeps a final-answer marker supplied by a nested Pi message', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, {
        message: {
          id: 'answer-1',
          type: 'assistant',
          content: 'Created C:/work/mother.txt',
          metadata: { isFinalAnswer: true },
        },
      }),
    ]);

    expect(turns[0].assistantMessages[0].isFinalAnswer).toBe(true);
  });

  test('coalesces updates for the same tool call', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.ToolCall, {
        toolCallId: 'call-1',
        title: 'Run tests',
        status: CodingToolCallStatus.Pending,
      }),
      event(2, CodingEventKind.ToolCall, {
        toolCallId: 'call-1',
        title: 'Run tests',
        status: CodingToolCallStatus.Completed,
      }),
    ]);

    expect(turns[0].activities).toHaveLength(1);
    expect(turns[0].activities[0].event.payload.status).toBe(CodingToolCallStatus.Completed);
  });

  test('coalesces legacy nested Pi tool activity updates and hides tool messages', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, {
        message: { id: 'tool-use', type: 'tool_use', content: 'Using tool: bash' },
      }),
      event(2, CodingEventKind.ToolCall, {
        event: {
          type: CoworkToolActivityEventType.Upsert,
          activity: {
            toolCallId: 'call-1',
            toolName: 'bash',
            phase: CoworkToolActivityPhase.Preparing,
          },
        },
      }),
      event(3, CodingEventKind.ToolCall, {
        event: {
          type: CoworkToolActivityEventType.Upsert,
          activity: {
            toolCallId: 'call-1',
            toolName: 'bash',
            phase: CoworkToolActivityPhase.Running,
          },
        },
      }),
      event(4, CodingEventKind.Message, {
        message: { id: 'tool-result', type: 'tool_result', content: 'source code' },
      }),
    ]);

    expect(turns[0].activities).toHaveLength(1);
    expect(turns[0].assistantMessages).toHaveLength(0);
  });

  test('ignores an echoed user chunk when it matches the persisted prompt', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: 'user', content: '同一条输入' }),
      event(2, CodingEventKind.MessageDelta, {
        role: 'user',
        messageId: 'echo-1',
        content: '同一条输入',
      }),
      event(3, CodingEventKind.MessageDelta, {
        role: 'assistant',
        messageId: 'answer-1',
        content: '收到',
      }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].assistantMessages[0].content).toBe('收到');
  });
});

describe('ACP tool_call_update merging', () => {
  test('merges intermediate updates into the initial tool call payload', () => {
    const turns = projectCodingEvents([
      event(1, CodingEventKind.Message, { role: 'user', content: '改文件' }),
      event(2, CodingEventKind.ToolCall, {
        toolCallId: 'call-1',
        title: 'Edit src/app.ts',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: 'src/app.ts', line: 3 }],
      }),
      event(3, CodingEventKind.ToolCall, {
        toolCallId: 'call-1',
        status: 'in_progress',
      }),
      event(4, CodingEventKind.ToolCall, {
        toolCallId: 'call-1',
        status: 'completed',
        rawOutput: 'done',
      }),
    ]);

    expect(turns[0].activities).toHaveLength(1);
    expect(turns[0].activities[0].event.payload).toEqual({
      toolCallId: 'call-1',
      title: 'Edit src/app.ts',
      kind: 'edit',
      status: 'completed',
      locations: [{ path: 'src/app.ts', line: 3 }],
      rawOutput: 'done',
    });
  });
});
