import Database from 'better-sqlite3';
import { expect, test } from 'vitest';

import {
  CodingAgentProfileId,
  CodingEventKind,
  CodingStreamUpdateMode,
  CodingToolCallStatus,
} from '../../shared/codingAgent';
import { CodingAgentRegistry } from './codingAgentRegistry';
import { CodingRoomRepository } from './codingRoomRepository';
import { CodingRoomService } from './codingRoomService';
import { initializeCodingAgentSchema } from './schema';
import { CodingEventWindowReader } from './codingEventWindowReader';

test('published windows retain the latest answer before the stream write timer fires', () => {
  const db = new Database(':memory:');
  initializeCodingAgentSchema(db);
  const repository = new CodingRoomRepository(db);
  const service = new CodingRoomService(repository, new CodingAgentRegistry(), {
    startBuiltinSession: async () => undefined,
    cancelBuiltinSession: async () => undefined,
    getBuiltinWorkbenchLink: () => null,
    beginExternalWorkbenchRun: () => ({ taskId: 'task', runId: 'run' }),
    completeExternalWorkbenchRun: () => undefined,
  });
  try {
    const room = repository.getOrCreateRoom('/workspace/reply');
    const mission = repository.createMission(room.id, 'Reply');
    const lane = repository.createLane(
      mission.id,
      CodingAgentProfileId.Builtin,
      room.workspaceRoot,
    );
    repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.MessageDelta, {
      messageId: 'answer',
      content: '',
      streamUpdateMode: CodingStreamUpdateMode.Append,
    });
    repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.MessageDelta, {
      messageId: 'answer',
      content: '你好，有什么需要帮助的？',
      streamUpdateMode: CodingStreamUpdateMode.Append,
    });
    repository.appendEvent(lane.id, CodingEventKind.TurnComplete, {});
    const snapshot = service.bootstrap(room.workspaceRoot, { eventLimitPerLane: 100 });
    expect(snapshot.events[0].payload.content).toBe('你好，有什么需要帮助的？');
    expect(service.loadEventPage(room.workspaceRoot, lane.id, null).events[0].payload.content).toBe(
      '你好，有什么需要帮助的？',
    );
  } finally {
    repository.flushPendingStreamWrites();
    db.close();
  }
});

test('live overlays preserve pagination, lane isolation and persisted event identities', () => {
  const db = new Database(':memory:');
  initializeCodingAgentSchema(db);
  const repository = new CodingRoomRepository(db);
  const reader = new CodingEventWindowReader(db, events =>
    repository.overlayPendingStreamEvents(events),
  );
  try {
    const room = repository.getOrCreateRoom('/workspace/boundaries');
    const mission = repository.createMission(room.id, 'Boundaries');
    const lanes = ['first', 'second'].map(id =>
      repository.createLane(
        mission.id,
        CodingAgentProfileId.Builtin,
        room.workspaceRoot,
        room.workspaceRoot,
        id,
      ),
    );
    for (const lane of lanes) {
      repository.appendEvent(lane.id, CodingEventKind.Message, { content: 'Older message' });
      repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.MessageDelta, {
        messageId: 'shared-message-id',
        content: lane.id,
        streamUpdateMode: CodingStreamUpdateMode.Append,
      });
      repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.MessageDelta, {
        messageId: 'shared-message-id',
        content: ' latest',
        streamUpdateMode: CodingStreamUpdateMode.Append,
      });
      repository.appendEvent(lane.id, CodingEventKind.TurnComplete, {});
    }
    const recent = reader.listRecent(
      lanes.map(lane => lane.id),
      1,
    );
    expect(recent.events).toHaveLength(2);
    expect(recent.events.every(event => event.kind === CodingEventKind.TurnComplete)).toBe(true);
    expect(recent.windows.every(window => window.hasMore && window.oldestSequence === 3)).toBe(
      true,
    );
    const firstPage = reader.loadPage(lanes[0].id, 3, 1);
    const secondPage = reader.loadPage(lanes[1].id, 3, 1);
    expect(firstPage.events[0].payload.content).toBe('first latest');
    expect(secondPage.events[0].payload.content).toBe('second latest');
    expect(firstPage.nextCursor).toBe(2);
    expect(firstPage.hasMore).toBe(true);
    expect(reader.loadPage(lanes[0].id, firstPage.nextCursor, 1).events[0].sequence).toBe(1);
    expect(repository.listEvents([lanes[0].id])[1]).toEqual(firstPage.events[0]);
    repository.flushPendingStreamWrites();
    expect(reader.loadPage(lanes[0].id, 3, 1)).toEqual(firstPage);
    expect(reader.loadPage(lanes[1].id, 3, 1)).toEqual(secondPage);
  } finally {
    repository.flushPendingStreamWrites();
    db.close();
  }
});

test('replacement and tool updates do not mutate older snapshots or resurrect deleted lanes', () => {
  const db = new Database(':memory:');
  initializeCodingAgentSchema(db);
  const repository = new CodingRoomRepository(db);
  const reader = new CodingEventWindowReader(db, events =>
    repository.overlayPendingStreamEvents(events),
  );
  try {
    const room = repository.getOrCreateRoom('/workspace/updates');
    const mission = repository.createMission(room.id, 'Updates');
    const lane = repository.createLane(
      mission.id,
      CodingAgentProfileId.Builtin,
      room.workspaceRoot,
    );
    repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.MessageDelta, {
      messageId: 'answer',
      content: 'Initial',
      streamUpdateMode: CodingStreamUpdateMode.Replace,
    });
    const initial = reader.listRecent([lane.id]);
    repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.MessageDelta, {
      messageId: 'answer',
      content: 'Final',
      streamUpdateMode: CodingStreamUpdateMode.Replace,
    });
    repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.ToolCall, {
      toolCallId: 'tool',
      title: 'Check',
      status: CodingToolCallStatus.Pending,
    });
    repository.appendOrMergeStreamEvent(lane.id, CodingEventKind.ToolCall, {
      toolCallId: 'tool',
      status: CodingToolCallStatus.Completed,
    });
    const latest = reader.listRecent([lane.id]);
    expect(initial.events[0].payload.content).toBe('Initial');
    expect(latest.events[0].payload.content).toBe('Final');
    expect(latest.events[0].id).toBe(initial.events[0].id);
    expect(latest.events[1].payload).toMatchObject({
      title: 'Check',
      status: CodingToolCallStatus.Completed,
    });
    repository.deleteLane(room.id, lane.id);
    expect(reader.listRecent([lane.id]).events).toEqual([]);
    expect(reader.loadPage(lane.id, null).events).toEqual([]);
  } finally {
    repository.flushPendingStreamWrites();
    db.close();
  }
});
