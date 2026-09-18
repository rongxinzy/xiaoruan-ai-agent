import { AISphere } from '../../../shared/aisphere';
import type { Model } from '../../store/slices/modelSlice';
import { toAgentModelRef } from '../../utils/agentModelRef';

/** A session choice remains authoritative when skills change the execution route. */
export function resolveAISphereTurnModel({
  sessionModel,
  candidateModel,
  availableModels,
}: {
  sessionModel?: string;
  candidateModel?: Model | null;
  availableModels: Model[];
}): Model | null {
  const requestedRef =
    sessionModel?.trim() || (candidateModel ? toAgentModelRef(candidateModel) : '');
  return (
    availableModels.find(
      model => model.providerKey === AISphere.Provider && toAgentModelRef(model) === requestedRef,
    ) ?? null
  );
}
