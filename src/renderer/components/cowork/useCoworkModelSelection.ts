import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { AISphereError } from '../../../shared/aisphere';
import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import { updateCurrentSessionModelOverride } from '../../store/slices/coworkSlice';
import {
  selectAgentSelectedModel,
  setDefaultSelectedModel,
  setSelectedModel,
  type Model,
} from '../../store/slices/modelSlice';
import { toAgentModelRef } from '../../utils/agentModelRef';
import { resolveAISphereTurnModel } from './aisphereTurnModel';
import { usePersistAgentModelSelection } from './usePersistAgentModelSelection';

interface ModelSelectionOptions {
  sessionId?: string;
  agentId: string;
  agentModelRef: string;
  isDirectChat: boolean;
}

const showModelNotice = (key: string): void => {
  window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t(key) }));
};

export function useCoworkSelectedModel({
  sessionId,
  agentId,
  agentModelRef,
  isDirectChat,
}: ModelSelectionOptions) {
  const modelState = useSelector((state: RootState) => state.model);
  const currentSession = useSelector((state: RootState) => state.cowork.currentSession);
  // 2026/09/22 lixiang  会话有 modelOverride 时优先用；设置页改默认会同步写 override，Chat 才能立刻跟上
  const selectedModel = resolveAISphereTurnModel({
    sessionModel: currentSession?.id === sessionId ? currentSession?.modelOverride : undefined,
    candidateModel: isDirectChat
      ? modelState.defaultSelectedModel
      : selectAgentSelectedModel(modelState, agentId, agentModelRef),
    availableModels: modelState.availableModels,
  });
  const validateModelSelection = useCallback((): boolean => {
    if (selectedModel) return true;
    showModelNotice(AISphereError.MissingModel);
    return false;
  }, [selectedModel]);

  return { selectedModel, validateModelSelection };
}

export function useCoworkModelSelection(
  options: ModelSelectionOptions & { syncDefaultModel: boolean },
) {
  const { sessionId, agentId, isDirectChat, syncDefaultModel } = options;
  const dispatch = useDispatch();
  const currentSession = useSelector((state: RootState) => state.cowork.currentSession);
  const { selectedModel, validateModelSelection } = useCoworkSelectedModel(options);
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const { isPersistingAgentModel, persistAgentModelSelection } = usePersistAgentModelSelection({
    agentId,
    syncDefaultModel,
  });
  const [isPatchingSession, setIsPatchingSession] = useState(false);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);

  useEffect(() => {
    requestIdRef.current += 1;
    pendingRef.current = false;
    setIsPatchingSession(false);
  }, [sessionId, agentId]);

  const handleModelSelect = useCallback(
    async (model: Model): Promise<void> => {
      if (pendingRef.current || isPersistingAgentModel) return;
      if (!resolveAISphereTurnModel({ candidateModel: model, availableModels })) {
        showModelNotice(AISphereError.MissingModel);
        return;
      }
      if (!sessionId) {
        pendingRef.current = true;
        try {
          const saved = await persistAgentModelSelection(model);
          if (saved && isDirectChat) dispatch(setDefaultSelectedModel(model));
        } finally {
          pendingRef.current = false;
        }
        return;
      }

      const requestId = ++requestIdRef.current;
      pendingRef.current = true;
      const previousRef = currentSession?.id === sessionId ? currentSession.modelOverride : '';
      const modelRef = toAgentModelRef(model);
      setIsPatchingSession(true);
      dispatch(updateCurrentSessionModelOverride({ sessionId, modelOverride: modelRef }));
      try {
        const saved = await coworkService.updateSessionModel(sessionId, modelRef);
        if (requestId !== requestIdRef.current) return;
        if (!saved) throw new Error('Session model update failed.');
        // Commit global choices only after SQLite accepts the session choice.
        dispatch(setSelectedModel({ agentId, model }));
        if (isDirectChat || syncDefaultModel) dispatch(setDefaultSelectedModel(model));
        if (
          previousRef &&
          !resolveAISphereTurnModel({ sessionModel: previousRef, availableModels })
        ) {
          void agentService.updateAgent(agentId, { model: modelRef }).catch(error => {
            console.error('[CoworkModelSelection] failed to repair the agent model:', error);
          });
        }
      } catch {
        if (requestId !== requestIdRef.current) return;
        dispatch(updateCurrentSessionModelOverride({ sessionId, modelOverride: previousRef }));
        showModelNotice('coworkModelSwitchFailed');
      } finally {
        if (requestId === requestIdRef.current) {
          pendingRef.current = false;
          setIsPatchingSession(false);
        }
      }
    },
    [
      agentId,
      availableModels,
      currentSession,
      dispatch,
      isDirectChat,
      isPersistingAgentModel,
      persistAgentModelSelection,
      sessionId,
      syncDefaultModel,
    ],
  );

  return {
    selectedModel,
    handleModelSelect,
    validateModelSelection,
    isPatchingModel: isPatchingSession || isPersistingAgentModel,
  };
}
