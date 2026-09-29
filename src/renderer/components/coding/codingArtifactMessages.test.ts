import { expect, test } from 'vitest';

import { CodingEventKind, type CodingEvent } from '../../../shared/codingAgent';
import { detectArtifactsFromMessages } from '../../services/artifactParser';
import { CodingConversationRole } from './constants';
import { toDetectableCodingMessages } from './codingArtifactMessages';
import { projectCodingEvents } from './codingEventProjection';

test('marks only the final projected assistant message as an artifact candidate', () => {
  const messages = toDetectableCodingMessages([
    {
      id: 'turn-1',
      userMessage: null,
      reasoning: null,
      activities: [],
      assistantMessages: [
        {
          id: 'assistant-intermediate',
          content: 'Writing C:/work/mother.txt',
          createdAt: 1,
          role: CodingConversationRole.Assistant,
          isFinalAnswer: false,
        },
        {
          id: 'assistant-final',
          content: 'Created [mother.txt](file:///C:/work/mother.txt).',
          createdAt: 2,
          role: CodingConversationRole.Assistant,
          isFinalAnswer: true,
        },
      ],
      status: null,
      statusDetail: null,
    },
  ]);

  expect(messages).toEqual([
    expect.objectContaining({ id: 'assistant-intermediate', metadata: undefined }),
    expect.objectContaining({
      id: 'assistant-final',
      metadata: { isFinalAnswer: true },
    }),
  ]);
});

test('keeps a final local file link anchored to its assistant message', () => {
  const events: CodingEvent[] = [
    {
      id: 'assistant-1',
      laneId: 'lane-1',
      sequence: 1,
      kind: CodingEventKind.MessageDelta,
      payload: {
        role: CodingConversationRole.Assistant,
        messageId: 'assistant-1',
        content: 'Created [mother.txt](file:///C:/work/mother.txt).',
      },
      createdAt: 1,
    },
    {
      id: 'complete-1',
      laneId: 'lane-1',
      sequence: 2,
      kind: CodingEventKind.TurnComplete,
      payload: {},
      createdAt: 2,
    },
  ];

  const artifacts = detectArtifactsFromMessages(
    toDetectableCodingMessages(projectCodingEvents(events)),
    'lane-1',
  );

  expect(artifacts).toEqual([
    expect.objectContaining({
      needsFileLoad: true,
      artifact: expect.objectContaining({
        messageId: 'assistant-1',
        fileName: 'mother.txt',
        filePath: 'C:/work/mother.txt',
      }),
    }),
  ]);
});
