// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { CodingEventKind } from '../../../shared/codingAgent';
import {
  CodingConversationActivityKind,
  CodingConversationRole,
  CodingConversationTimelineItemKind,
} from './constants';
import { CodingConversationTurn } from './CodingConversationTurn';
import type { CodingConversationTurn as CodingConversationTurnModel } from './codingEventProjection';

test('places tool cards inside the collapsible reasoning content before the final answer', () => {
  const activity = {
    id: 'tool-1',
    kind: CodingConversationActivityKind.Tool,
    event: {
      id: 'event-2',
      laneId: 'lane-1',
      sequence: 2,
      kind: CodingEventKind.ToolCall,
      payload: { title: 'Run checks', status: 'completed' },
      createdAt: 2,
    },
  };
  const finalMessage = {
    id: 'message-1',
    content: 'Final answer',
    createdAt: 3,
    role: CodingConversationRole.Assistant,
    isFinalAnswer: true,
  };
  const turn: CodingConversationTurnModel = {
    id: 'turn-1',
    userMessage: null,
    reasoning: {
      id: 'reasoning-1',
      content: '\nInspect the result.\n\nRefine the output.\n',
      createdAt: 1,
    },
    activities: [activity],
    assistantMessages: [finalMessage],
    bodyMessageId: finalMessage.id,
    timeline: [
      {
        kind: CodingConversationTimelineItemKind.Reasoning,
        reasoning: { id: 'reasoning-blank', content: '\n\n', createdAt: 0 },
      },
      {
        kind: CodingConversationTimelineItemKind.Reasoning,
        reasoning: {
          id: 'reasoning-1',
          content: '\nInspect the result.\n\nRefine the output.\n',
          createdAt: 1,
        },
      },
      { kind: CodingConversationTimelineItemKind.Activity, activity },
      { kind: CodingConversationTimelineItemKind.AssistantMessage, message: finalMessage },
    ],
    status: null,
    statusDetail: null,
  };

  const { container } = render(
    <CodingConversationTurn isStreaming={false} showWaitingIndicator={false} turn={turn} />,
  );

  fireEvent.click(container.querySelector('button')!);

  const toolCard = screen.getByText('Run checks');
  const reasoningContent = container.querySelector('[data-slot="reasoning-content"]');
  expect(reasoningContent).toContainElement(toolCard);
  expect(reasoningContent?.querySelector('[data-slot="reasoning-scroll-container"]')).toHaveClass(
    'max-h-none',
    'overflow-y-visible',
  );
  expect(reasoningContent?.querySelector('[data-slot="coding-thought-tool"]')).toHaveClass('pt-1');
  expect(reasoningContent?.querySelector('.whitespace-pre-wrap')?.textContent).toBe(
    'Inspect the result.\n\nRefine the output.',
  );
  expect(reasoningContent?.querySelectorAll('.whitespace-pre-wrap')).toHaveLength(1);

  const finalAnswer = screen.getByText('Final answer');
  expect(reasoningContent).not.toContainElement(finalAnswer);
});

test('keeps a manually collapsed thought panel closed while the answer streams outside it', () => {
  const streamingMessage = {
    id: 'answer-1',
    content: 'Streaming final answer',
    createdAt: 2,
    role: CodingConversationRole.Assistant,
    isFinalAnswer: false,
  };
  const turn: CodingConversationTurnModel = {
    id: 'turn-1',
    userMessage: null,
    reasoning: { id: 'reasoning-1', content: 'Inspect the result.', createdAt: 1 },
    activities: [],
    assistantMessages: [streamingMessage],
    bodyMessageId: streamingMessage.id,
    timeline: [
      {
        kind: CodingConversationTimelineItemKind.Reasoning,
        reasoning: { id: 'reasoning-1', content: 'Inspect the result.', createdAt: 1 },
      },
      {
        kind: CodingConversationTimelineItemKind.AssistantMessage,
        message: streamingMessage,
      },
    ],
    status: null,
    statusDetail: null,
  };

  const { container, rerender } = render(
    <CodingConversationTurn isStreaming showWaitingIndicator={false} turn={turn} />,
  );

  const reasoningContent = container.querySelector('[data-slot="reasoning-content"]');
  expect(reasoningContent).toContainElement(screen.getByText('Inspect the result.'));
  expect(reasoningContent).not.toContainElement(screen.getByText('Streaming final answer'));

  const reasoningTrigger = container.querySelector('[data-slot="collapsible-trigger"]')!;
  fireEvent.click(reasoningTrigger);
  expect(reasoningTrigger).toHaveAttribute('aria-expanded', 'false');

  rerender(<CodingConversationTurn isStreaming showWaitingIndicator={false} turn={turn} />);
  expect(reasoningTrigger).toHaveAttribute('aria-expanded', 'false');
});
