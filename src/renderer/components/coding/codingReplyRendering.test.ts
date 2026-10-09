// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, test } from 'vitest';

import {
  CodingEventKind,
  CodingStreamUpdateMode,
  type CodingEvent,
} from '../../../shared/codingAgent';
import { CodingConversationTurn } from './CodingConversationTurn';
import { projectCodingEvents } from './codingEventProjection';

afterEach(cleanup);

test('renders received answer chunks and completion without another user turn', () => {
  const events: CodingEvent[] = [
    {
      id: 'user',
      laneId: 'lane',
      sequence: 1,
      kind: CodingEventKind.Message,
      payload: { role: 'user', content: 'Hello' },
      createdAt: 1,
    },
    {
      id: 'thought',
      laneId: 'lane',
      sequence: 2,
      kind: CodingEventKind.Reasoning,
      payload: { content: 'Thinking' },
      createdAt: 2,
    },
  ];
  const element = (streaming: boolean) =>
    createElement(CodingConversationTurn, {
      turn: projectCodingEvents(events)[0],
      isStreaming: streaming,
      showWaitingIndicator: false,
    });
  const view = render(element(true));
  events.push({
    id: 'answer',
    laneId: 'lane',
    sequence: 3,
    kind: CodingEventKind.MessageDelta,
    payload: {
      messageId: 'answer',
      content: '你好',
      streamUpdateMode: CodingStreamUpdateMode.Replace,
    },
    createdAt: 3,
  });
  view.rerender(element(true));
  expect(view.container.textContent).toContain('你好');
  events[2] = {
    ...events[2],
    payload: { ...events[2].payload, content: '你好，有什么需要帮助的？' },
  };
  events.push({
    id: 'complete',
    laneId: 'lane',
    sequence: 4,
    kind: CodingEventKind.TurnComplete,
    payload: {},
    createdAt: 4,
  });
  view.rerender(element(false));
  expect(view.container.textContent).toContain('你好，有什么需要帮助的？');
});
