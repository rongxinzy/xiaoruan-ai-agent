import { BrowserWindow, ipcMain } from 'electron';

import {
  CodingAgentIpc,
  CodingEventWindowPageSize,
  type AddCodingAgentProfileInput,
  type CodingGitCommitInput,
  type CodingGitBranchInput,
  type CodingGitPullRequestInput,
  type CodingGitDiffInput,
  type CodingGitPathActionInput,
  type CodingGitTargetInput,
  type CodingWorkspaceFileInput,
  type CodingLaneViewStateInput,
  type CodingLaneConfigOptionInput,
  type CodingPermissionResponse,
  type CodingElicitationResponse,
  type CodingPendingMessagesChangedEvent,
  type CreateCodingCollaborationPresetInput,
  type CodingPromptInput,
  type CreateCodingSessionInput,
  type StartCodingSessionInput,
  type CreateCodingWorkspaceInput,
  type CreateCodingMissionInput,
  type UpdateCodingWorkspaceInput,
} from '../../shared/codingAgent';
import type { CodingRoomService } from '../codingAgent/codingRoomService';
import { GitWorktreeConflictError } from '../codingAgent/gitWorktreeService';
import { agentResourceDiagnostics } from '../agentResourceDiagnostics';

type CodingHandler<T> = () => T | Promise<T>;

/**
 * Single entry point for every coding IPC handler: a failure is logged with its
 * channel and normalised into the `{ success: false, error }` shape the
 * renderer already understands. `describeFailure` adds channel-specific fields
 * on top of that shape (e.g. the Git worktree conflict flag).
 */
async function runCodingHandler<T>(
  channel: string,
  run: CodingHandler<T>,
  describeFailure?: (error: unknown) => Record<string, unknown>,
): Promise<T | { success: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    console.error(`[CodingAgentIpc] ${channel} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      ...describeFailure?.(error),
    };
  }
}

export function registerCodingAgentIpcHandlers(getService: () => CodingRoomService): void {
  const service = getService();
  service.on('changed', snapshot => {
    agentResourceDiagnostics.recordRoomSnapshot(snapshot.events.length, snapshot.lanes.length);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(CodingAgentIpc.Changed, snapshot);
    }
  });
  service.on('pendingMessagesChanged', (event: CodingPendingMessagesChangedEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(CodingAgentIpc.PendingMessagesChanged, event);
    }
  });
  service.on('authTerminalData', event => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(CodingAgentIpc.AuthTerminalData, event);
    }
  });
  service.on('authTerminalExit', event => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(CodingAgentIpc.AuthTerminalExit, event);
    }
  });
  ipcMain.handle(CodingAgentIpc.ListProfiles, () =>
    runCodingHandler(CodingAgentIpc.ListProfiles, () => ({
      success: true,
      profiles: service.listProfiles(),
    })),
  );
  ipcMain.handle(CodingAgentIpc.ListWorkspaces, () =>
    runCodingHandler(CodingAgentIpc.ListWorkspaces, () => ({
      success: true,
      workspaces: service.listWorkspaces(),
    })),
  );
  ipcMain.handle(CodingAgentIpc.CreateWorkspace, (_event, input: CreateCodingWorkspaceInput) =>
    runCodingHandler(CodingAgentIpc.CreateWorkspace, () => ({
      success: true,
      workspaces: service.createWorkspace(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.UpdateWorkspace, (_event, input: UpdateCodingWorkspaceInput) =>
    runCodingHandler(CodingAgentIpc.UpdateWorkspace, () => ({
      success: true,
      workspaces: service.updateWorkspace(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.DeleteWorkspace, (_event, workspaceId: string) =>
    runCodingHandler(CodingAgentIpc.DeleteWorkspace, () => ({
      success: true,
      workspaces: service.deleteWorkspace(workspaceId),
    })),
  );
  ipcMain.handle(
    CodingAgentIpc.DeleteSession,
    (_event, input: { workspaceRoot: string; laneId: string }) =>
      runCodingHandler(CodingAgentIpc.DeleteSession, () => ({
        success: true,
        workspaces: service.deleteSession(input.workspaceRoot, input.laneId),
      })),
  );
  ipcMain.handle(CodingAgentIpc.GetProfileConfigOptions, (_event, profileId: string) =>
    runCodingHandler(CodingAgentIpc.GetProfileConfigOptions, () => ({
      success: true,
      configOptions: service.getProfileConfigOptions(profileId),
    })),
  );
  ipcMain.handle(CodingAgentIpc.CreateSession, async (_event, input: CreateCodingSessionInput) =>
    runCodingHandler(CodingAgentIpc.CreateSession, async () => ({
      success: true,
      snapshot: await service.createSession(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.StartSession, async (_event, input: StartCodingSessionInput) =>
    runCodingHandler(CodingAgentIpc.StartSession, async () => ({
      success: true,
      snapshot: await service.startSession(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.Bootstrap, (_event, workspaceRoot: string) =>
    runCodingHandler(CodingAgentIpc.Bootstrap, () => ({
      success: true,
      snapshot: service.bootstrap(workspaceRoot, {
        eventLimitPerLane: CodingEventWindowPageSize,
      }),
    })),
  );
  ipcMain.handle(CodingAgentIpc.GetProfileAvailableCommands, (_event, profileId: string) => {
    try {
      return { success: true, commands: service.getProfileAvailableCommands(profileId) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  service.on('eventDelta', (delta: import('../../shared/codingAgent').CodingRoomEventDelta) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(CodingAgentIpc.EventDelta, delta);
    }
  });
  ipcMain.handle(
    CodingAgentIpc.LoadEventPage,
    (_event, input: { workspaceRoot: string; laneId: string; beforeSequence: number | null }) => {
      try {
        return {
          success: true,
          page: service.loadEventPage(input.workspaceRoot, input.laneId, input.beforeSequence),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  ipcMain.handle(
    CodingAgentIpc.PrepareLane,
    async (_event, input: { workspaceRoot: string; laneId: string }) =>
      runCodingHandler(CodingAgentIpc.PrepareLane, async () => ({
        success: true,
        snapshot: await service.prepareLane(input.workspaceRoot, input.laneId),
      })),
  );
  ipcMain.handle(CodingAgentIpc.CreateMission, async (_event, input: CreateCodingMissionInput) =>
    runCodingHandler(CodingAgentIpc.CreateMission, async () => ({
      success: true,
      snapshot: await service.createMission(input),
    })),
  );
  ipcMain.handle(
    CodingAgentIpc.SelectLane,
    (_event, input: { workspaceRoot: string; laneId: string }) =>
      runCodingHandler(CodingAgentIpc.SelectLane, () => ({
        success: true,
        snapshot: service.selectLane(input.workspaceRoot, input.laneId),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.Prompt,
    async (_event, input: { workspaceRoot: string; prompt: CodingPromptInput }) =>
      runCodingHandler(CodingAgentIpc.Prompt, async () => ({
        success: true,
        snapshot: await service.prompt(input.workspaceRoot, input.prompt),
      })),
  );
  ipcMain.handle(CodingAgentIpc.ListPendingMessages, (_event, laneId: string) =>
    runCodingHandler(CodingAgentIpc.ListPendingMessages, () => ({
      success: true,
      items: service.listPendingMessages(laneId),
    })),
  );
  ipcMain.handle(
    CodingAgentIpc.EnqueuePendingMessage,
    (_event, input: { laneId: string; text: string }) =>
      runCodingHandler(CodingAgentIpc.EnqueuePendingMessage, () =>
        service.enqueuePendingMessage(input.laneId, input.text),
      ),
  );
  ipcMain.handle(
    CodingAgentIpc.UpdatePendingMessage,
    (_event, input: { laneId: string; itemId: string; text: string }) =>
      runCodingHandler(CodingAgentIpc.UpdatePendingMessage, () =>
        service.updatePendingMessage(input.laneId, input.itemId, input.text),
      ),
  );
  ipcMain.handle(
    CodingAgentIpc.DeletePendingMessage,
    (_event, input: { laneId: string; itemId: string }) =>
      runCodingHandler(CodingAgentIpc.DeletePendingMessage, () =>
        service.deletePendingMessage(input.laneId, input.itemId),
      ),
  );
  ipcMain.handle(
    CodingAgentIpc.SteerPendingMessage,
    async (_event, input: { workspaceRoot: string; laneId: string; itemId: string }) =>
      runCodingHandler(CodingAgentIpc.SteerPendingMessage, async () => ({
        success: true,
        snapshot: await service.steerPendingMessage(
          input.workspaceRoot,
          input.laneId,
          input.itemId,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.FollowUpPendingMessage,
    async (_event, input: { workspaceRoot: string; laneId: string; itemId: string }) =>
      runCodingHandler(CodingAgentIpc.FollowUpPendingMessage, async () => ({
        success: true,
        snapshot: await service.followUpPendingMessage(
          input.workspaceRoot,
          input.laneId,
          input.itemId,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.ConfirmSessionRecovery,
    async (
      _event,
      input: { workspaceRoot: string; laneId: string; includeRecoveryContext: boolean },
    ) =>
      runCodingHandler(CodingAgentIpc.ConfirmSessionRecovery, async () => ({
        success: true,
        snapshot: await service.confirmSessionRecovery(
          input.workspaceRoot,
          input.laneId,
          input.includeRecoveryContext,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.Cancel,
    async (_event, input: { workspaceRoot: string; laneId: string }) =>
      runCodingHandler(CodingAgentIpc.Cancel, async () => ({
        success: true,
        snapshot: await service.cancel(input.workspaceRoot, input.laneId),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.PreviewHandoff,
    async (
      _event,
      input: { workspaceRoot: string; sourceLaneId: string; targetLaneId: string },
    ) =>
      runCodingHandler(CodingAgentIpc.PreviewHandoff, async () => ({
        success: true,
        content: await service.previewHandoff(
          input.workspaceRoot,
          input.sourceLaneId,
          input.targetLaneId,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.Handoff,
    async (
      _event,
      input: { workspaceRoot: string; sourceLaneId: string; targetLaneId: string },
    ) =>
      runCodingHandler(CodingAgentIpc.Handoff, async () => ({
        success: true,
        snapshot: await service.handoff(
          input.workspaceRoot,
          input.sourceLaneId,
          input.targetLaneId,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.CreateCollaborationPreset,
    async (_event, input: CreateCodingCollaborationPresetInput) =>
      runCodingHandler(CodingAgentIpc.CreateCollaborationPreset, async () => ({
        success: true,
        snapshot: await service.createImplementationReviewVerificationPreset(input),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.AddLane,
    async (_event, input: { workspaceRoot: string; missionId: string; profileId: string }) =>
      runCodingHandler(CodingAgentIpc.AddLane, async () => ({
        success: true,
        snapshot: await service.addLane(input.workspaceRoot, input.missionId, input.profileId),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.SaveLaneView,
    (_event, input: { workspaceRoot: string; view: CodingLaneViewStateInput }) =>
      runCodingHandler(CodingAgentIpc.SaveLaneView, () => ({
        success: true,
        snapshot: service.saveLaneView(input.workspaceRoot, input.view),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.PreviewLaneChanges,
    async (_event, input: { workspaceRoot: string; laneId: string }) =>
      runCodingHandler(CodingAgentIpc.PreviewLaneChanges, async () => ({
        success: true,
        preview: await service.previewLaneChanges(input.workspaceRoot, input.laneId),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.ApplyLaneChanges,
    async (_event, input: { workspaceRoot: string; laneId: string }) =>
      runCodingHandler(
        CodingAgentIpc.ApplyLaneChanges,
        async () => ({
          success: true,
          snapshot: await service.applyLaneChanges(input.workspaceRoot, input.laneId),
        }),
        error => ({ conflict: error instanceof GitWorktreeConflictError }),
      ),
  );
  ipcMain.handle(CodingAgentIpc.GetGitStatus, async (_event, input: CodingGitTargetInput) =>
    runCodingHandler(CodingAgentIpc.GetGitStatus, async () => ({
      success: true,
      status: await service.getGitStatus(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.GetGitDiff, async (_event, input: CodingGitDiffInput) =>
    runCodingHandler(CodingAgentIpc.GetGitDiff, async () => ({
      success: true,
      diff: await service.getGitDiff(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.StageGitPaths, async (_event, input: CodingGitPathActionInput) =>
    runCodingHandler(CodingAgentIpc.StageGitPaths, async () => ({
      success: true,
      status: await service.stageGitPaths(input),
    })),
  );
  ipcMain.handle(
    CodingAgentIpc.UnstageGitPaths,
    async (_event, input: CodingGitPathActionInput) =>
      runCodingHandler(CodingAgentIpc.UnstageGitPaths, async () => ({
        success: true,
        status: await service.unstageGitPaths(input),
      })),
  );
  ipcMain.handle(CodingAgentIpc.CommitGitChanges, async (_event, input: CodingGitCommitInput) =>
    runCodingHandler(CodingAgentIpc.CommitGitChanges, async () => ({
      success: true,
      status: await service.commitGitChanges(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.PushGitBranch, async (_event, input: CodingGitTargetInput) =>
    runCodingHandler(CodingAgentIpc.PushGitBranch, async () => ({
      success: true,
      status: await service.pushGitBranch(input),
    })),
  );
  ipcMain.handle(CodingAgentIpc.SwitchGitBranch, async (_event, input: CodingGitBranchInput) =>
    runCodingHandler(CodingAgentIpc.SwitchGitBranch, async () => ({
      success: true,
      status: await service.switchGitBranch(input),
    })),
  );
  ipcMain.handle(
    CodingAgentIpc.CreateGitPullRequest,
    async (_event, input: CodingGitPullRequestInput) =>
      runCodingHandler(CodingAgentIpc.CreateGitPullRequest, async () => ({
        success: true,
        url: await service.createGitPullRequest(input),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.ListWorkspaceFiles,
    async (_event, input: CodingWorkspaceFileInput) =>
      runCodingHandler(CodingAgentIpc.ListWorkspaceFiles, async () => ({
        success: true,
        entries: await service.listWorkspaceFiles(input),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.ReadWorkspaceFile,
    async (_event, input: CodingWorkspaceFileInput) =>
      runCodingHandler(CodingAgentIpc.ReadWorkspaceFile, async () => ({
        success: true,
        file: await service.readWorkspaceFile(input),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.SetLaneConfigOption,
    async (_event, input: { workspaceRoot: string; option: CodingLaneConfigOptionInput }) =>
      runCodingHandler(CodingAgentIpc.SetLaneConfigOption, async () => ({
        success: true,
        snapshot: await service.setLaneConfigOption(input.workspaceRoot, input.option),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.SetLaneModelOverride,
    async (
      _event,
      input: { workspaceRoot: string; laneId: string; modelOverride: string | null },
    ) =>
      runCodingHandler(CodingAgentIpc.SetLaneModelOverride, async () => ({
        success: true,
        snapshot: await service.setLaneModelOverride(
          input.workspaceRoot,
          input.laneId,
          input.modelOverride,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.DiscoverAgents,
    async (_event, input: { workspaceRoot: string }) =>
      runCodingHandler(CodingAgentIpc.DiscoverAgents, async () => ({
        success: true,
        snapshot: await service.discoverAgents(input.workspaceRoot),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.ProbeAgent,
    async (_event, input: { workspaceRoot: string; profileId: string }) =>
      runCodingHandler(CodingAgentIpc.ProbeAgent, async () => ({
        success: true,
        snapshot: await service.probeAgent(input.workspaceRoot, input.profileId),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.AddProfile,
    (_event, input: { workspaceRoot: string; profile: AddCodingAgentProfileInput }) =>
      runCodingHandler(CodingAgentIpc.AddProfile, () => ({
        success: true,
        snapshot: service.addProfile(input.workspaceRoot, input.profile),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.TrustProfile,
    (_event, input: { workspaceRoot: string; profileId: string }) =>
      runCodingHandler(CodingAgentIpc.TrustProfile, () => ({
        success: true,
        snapshot: service.trustProfile(input.workspaceRoot, input.profileId),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.AuthenticateProfile,
    async (_event, input: { workspaceRoot: string; profileId: string; methodId: string }) =>
      runCodingHandler(CodingAgentIpc.AuthenticateProfile, async () => ({
        success: true,
        snapshot: await service.authenticateProfile(
          input.workspaceRoot,
          input.profileId,
          input.methodId,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.StartAuthTerminal,
    (_event, input: { workspaceRoot: string; profileId: string; methodId: string }) =>
      runCodingHandler(CodingAgentIpc.StartAuthTerminal, () => ({
        success: true,
        terminal: service.startTerminalAuthentication(
          input.workspaceRoot,
          input.profileId,
          input.methodId,
        ),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.WriteAuthTerminal,
    (_event, input: { id: string; data: string }) =>
      runCodingHandler(CodingAgentIpc.WriteAuthTerminal, () => {
        service.writeAuthTerminal(input.id, input.data);
        return { success: true };
      }),
  );
  ipcMain.handle(
    CodingAgentIpc.ResizeAuthTerminal,
    (_event, input: { id: string; columns: number; rows: number }) =>
      runCodingHandler(CodingAgentIpc.ResizeAuthTerminal, () => {
        service.resizeAuthTerminal(input.id, input.columns, input.rows);
        return { success: true };
      }),
  );
  ipcMain.handle(CodingAgentIpc.CancelAuthTerminal, (_event, id: string) =>
    runCodingHandler(CodingAgentIpc.CancelAuthTerminal, () => {
      service.cancelAuthTerminal(id);
      return { success: true };
    }),
  );
  ipcMain.handle(
    CodingAgentIpc.RespondPermission,
    async (_event, input: { workspaceRoot: string; response: CodingPermissionResponse }) =>
      runCodingHandler(CodingAgentIpc.RespondPermission, async () => ({
        success: true,
        snapshot: await service.respondToPermission(input.workspaceRoot, input.response),
      })),
  );
  ipcMain.handle(
    CodingAgentIpc.RespondElicitation,
    async (_event, input: { workspaceRoot: string; response: CodingElicitationResponse }) => {
      try {
        return {
          success: true,
          snapshot: await service.respondElicitation(input.workspaceRoot, input.response),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  ipcMain.handle(
    CodingAgentIpc.CancelElicitation,
    async (_event, input: { workspaceRoot: string; requestId: string }) => {
      try {
        return {
          success: true,
          snapshot: await service.cancelElicitation(input.workspaceRoot, input.requestId),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
}
