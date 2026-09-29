import { Message, MessageContent, MessageResponse } from '@shared/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@shared/components/ai-elements/reasoning';
import { Shimmer } from '@shared/components/ai-elements/shimmer';
import { CheckCircle2, CircleStop, TriangleAlert } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import { appErrorText } from '../../services/appErrorText';
import { i18nService } from '../../services/i18n';
import type { Artifact } from '../../types/artifact';
import ArtifactPreviewCard from '../artifacts/ArtifactPreviewCard';
import { CodingActivity } from './CodingActivityView';
import { CodingAgentWorkingIndicator } from './CodingAgentWorkingIndicator';
import { CodingConversationTimelineItemKind, CodingConversationTurnStatus } from './constants';
import {
  type CodingConversationTimelineItem,
  type CodingConversationTurn as CodingConversationTurnModel,
} from './codingEventProjection';
import { replaceLocalFileLinksWithLabels } from './codingMessageContent';

interface CodingConversationTurnProps {
  isStreaming: boolean;
  showWaitingIndicator: boolean;
  turn: CodingConversationTurnModel;
  /** Artifacts detected in this lane, keyed by the assistant message id. */
  artifactsByMessageId?: ReadonlyMap<string, Artifact[]>;
  /** File artifacts keyed by the tool call that produced them. */
  artifactsByToolCallId?: ReadonlyMap<string, Artifact[]>;
  /** Path-backed artifacts that are still being read from disk. */
  loadingArtifactIds?: ReadonlySet<string>;
}

const TurnStatus = ({ turn }: { turn: CodingConversationTurnModel }) => {
  if (turn.status === null) return null;
  if (turn.status === CodingConversationTurnStatus.Complete) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5" />
        <span>{i18nService.t('codingAgentTurnComplete')}</span>
      </div>
    );
  }
  if (turn.status === CodingConversationTurnStatus.Cancelled) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CircleStop className="size-3.5" />
        <span>{turn.statusDetail ? appErrorText(turn.statusDetail, 'codingAgentTurnCancelled') : i18nService.t('codingAgentTurnCancelled')}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-destructive">
      <TriangleAlert className="size-3.5" />
      <span>{turn.statusDetail ? appErrorText(turn.statusDetail, 'codingAgentTurnFailed') : i18nService.t('codingAgentTurnFailed')}</span>
    </div>
  );
};

const CodingConversationTurnComponent = ({
  isStreaming,
  showWaitingIndicator,
  turn,
  artifactsByMessageId,
  artifactsByToolCallId,
  loadingArtifactIds,
}: CodingConversationTurnProps) => {
  const bodyMessage = turn.bodyMessageId
    ? turn.assistantMessages.find(message => message.id === turn.bodyMessageId) ?? null
    : null;
  const thoughtItems = turn.timeline.filter(
    item =>
      item.kind !== CodingConversationTimelineItemKind.AssistantMessage ||
      item.message.id !== bodyMessage?.id,
  );
  const renderTimelineItem = (
    item: CodingConversationTimelineItem,
    previousItem?: CodingConversationTimelineItem,
  ): ReactNode => {
    if (item.kind === CodingConversationTimelineItemKind.Reasoning) {
      const content = item.reasoning.content.trim();
      if (!content) return null;
      return (
        <div key={item.reasoning.id} className="whitespace-pre-wrap break-words text-sm">
          {content}
        </div>
      );
    }

    if (item.kind === CodingConversationTimelineItemKind.Activity) {
      const toolCallId =
        typeof item.activity.event.payload.toolCallId === 'string'
          ? item.activity.event.payload.toolCallId
          : null;
      return (
        <div
          key={item.activity.id}
          data-slot="coding-thought-tool"
          className={
            previousItem?.kind === CodingConversationTimelineItemKind.Reasoning &&
            previousItem.reasoning.content.trim()
              ? 'pt-1'
              : undefined
          }
        >
          <CodingActivity
            activity={item.activity}
            artifacts={toolCallId ? artifactsByToolCallId?.get(toolCallId) : undefined}
            loadingArtifactIds={loadingArtifactIds}
          />
        </div>
      );
    }

    const artifacts = artifactsByMessageId?.get(item.message.id) ?? [];
    return (
      <Message key={item.message.id} from="assistant" className="animate-message-in">
        <MessageContent>
          <MessageResponse isAnimating={isStreaming}>
            {replaceLocalFileLinksWithLabels(item.message.content)}
          </MessageResponse>
          {artifacts.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {artifacts.map(artifact => (
                <ArtifactPreviewCard
                  key={artifact.id}
                  artifact={artifact}
                  isLoading={loadingArtifactIds?.has(artifact.id) ?? false}
                />
              ))}
            </div>
          )}
        </MessageContent>
      </Message>
    );
  };

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={i18nService.t('codingAgentConversationTurn')}
    >
      {turn.userMessage && (
        <Message from="user" className="animate-message-in">
          <MessageContent className="theme-message-code-user whitespace-pre-wrap">
            {turn.userMessage.content}
          </MessageContent>
        </Message>
      )}

      <div className="flex flex-col gap-3">
        {showWaitingIndicator ? <CodingAgentWorkingIndicator /> : null}

        {thoughtItems.length > 0 && (
          <Reasoning
            isStreaming={isStreaming}
            defaultOpen={isStreaming}
            autoOpenOnStreaming={false}
          >
            <ReasoningTrigger
              getThinkingMessage={streaming =>
                streaming ? (
                  <Shimmer duration={1}>{i18nService.t('codingAgentReasoningActive')}</Shimmer>
                ) : (
                  <span>{i18nService.t('codingAgentReasoningComplete')}</span>
                )
              }
            />
            <ReasoningContent contentClassName="max-h-none overflow-y-visible">
              <div className="flex flex-col gap-1">
                {thoughtItems.map((item, index) => renderTimelineItem(item, thoughtItems[index - 1]))}
              </div>
            </ReasoningContent>
          </Reasoning>
        )}

        {bodyMessage &&
          renderTimelineItem({
            kind: CodingConversationTimelineItemKind.AssistantMessage,
            message: bodyMessage,
          })}

        <TurnStatus turn={turn} />
      </div>
    </section>
  );
};

const messageContentsEqual = (
  a:
    | { id: string; content: string; createdAt: number; role: string; isFinalAnswer: boolean }
    | null,
  b:
    | { id: string; content: string; createdAt: number; role: string; isFinalAnswer: boolean }
    | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.id === b.id &&
    a.content === b.content &&
    a.createdAt === b.createdAt &&
    a.role === b.role &&
    a.isFinalAnswer === b.isFinalAnswer);

const reasoningContentsEqual = (
  a: { id: string; content: string; createdAt: number } | null,
  b: { id: string; content: string; createdAt: number } | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.id === b.id &&
    a.content === b.content &&
    a.createdAt === b.createdAt);

const timelineContentsEqual = (
  a: CodingConversationTurnModel['timeline'],
  b: CodingConversationTurnModel['timeline'],
): boolean =>
  a.length === b.length &&
  a.every((item, index) => {
    const next = b[index];
    if (!next || item.kind !== next.kind) return false;
    if (item.kind === CodingConversationTimelineItemKind.Reasoning) {
      return (
        next.kind === CodingConversationTimelineItemKind.Reasoning &&
        reasoningContentsEqual(item.reasoning, next.reasoning)
      );
    }
    if (item.kind === CodingConversationTimelineItemKind.Activity) {
      return (
        next.kind === CodingConversationTimelineItemKind.Activity &&
        item.activity.id === next.activity.id &&
        item.activity.kind === next.activity.kind &&
        item.activity.event.kind === next.activity.event.kind &&
        JSON.stringify(item.activity.event.payload) === JSON.stringify(next.activity.event.payload)
      );
    }
    return (
      next.kind === CodingConversationTimelineItemKind.AssistantMessage &&
      messageContentsEqual(item.message, next.message)
    );
  });

const turnContentsEqual = (a: CodingConversationTurnModel, b: CodingConversationTurnModel): boolean =>
  a === b ||
  (a.id === b.id &&
    a.status === b.status &&
    a.statusDetail === b.statusDetail &&
    messageContentsEqual(a.userMessage, b.userMessage) &&
    reasoningContentsEqual(a.reasoning, b.reasoning) &&
    timelineContentsEqual(a.timeline, b.timeline) &&
    a.assistantMessages.length === b.assistantMessages.length &&
    a.assistantMessages.every((message, index) =>
      messageContentsEqual(message, b.assistantMessages[index]),
    ) &&
    a.activities.length === b.activities.length &&
    a.activities.every(
      (activity, index) =>
        activity.id === b.activities[index].id &&
        activity.kind === b.activities[index].kind &&
        activity.event.kind === b.activities[index].event.kind &&
        JSON.stringify(activity.event.payload) ===
          JSON.stringify(b.activities[index].event.payload),
    ));

// CodingEventStream re-projects every event on each streamed chunk, which
// re-creates all turn objects and defeats the default shallow memo. Comparing
// the actual turn content lets unchanged completed turns skip re-rendering
// while the streaming turn (and any turn whose content changed) still updates.
const conversationTurnPropsEqual = (
  prev: CodingConversationTurnProps,
  next: CodingConversationTurnProps,
): boolean =>
  prev.isStreaming === next.isStreaming &&
  prev.showWaitingIndicator === next.showWaitingIndicator &&
  prev.artifactsByMessageId === next.artifactsByMessageId &&
  prev.artifactsByToolCallId === next.artifactsByToolCallId &&
  prev.loadingArtifactIds === next.loadingArtifactIds &&
  turnContentsEqual(prev.turn, next.turn);

export const CodingConversationTurn = memo(
  CodingConversationTurnComponent,
  conversationTurnPropsEqual,
);
