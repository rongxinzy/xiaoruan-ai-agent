import { expect, test } from 'vitest';

import { AISphere } from '../../../shared/aisphere';
import { AgentProviderId, ProviderName } from '../../../shared/providers';
import type { Model } from '../../store/slices/modelSlice';
import { toAgentModelRef } from '../../utils/agentModelRef';
import { resolveAISphereTurnModel } from './aisphereTurnModel';

const platformModel: Model = {
  id: 'Qwen3.6-35B-A3B-FP8',
  name: 'Platform Qwen',
  providerKey: AISphere.Provider,
};
const otherModel: Model = {
  id: 'other-model',
  name: 'Other model',
  providerKey: AISphere.Provider,
};
const availableModels = [platformModel, otherModel];

test('uses the explicit session choice rather than a different default or agent model', () => {
  expect(
    resolveAISphereTurnModel({
      sessionModel: toAgentModelRef(otherModel),
      candidateModel: platformModel,
      availableModels,
    }),
  ).toBe(otherModel);
});

test('does not substitute a real platform model for an invalid old-provider reference', () => {
  expect(
    resolveAISphereTurnModel({
      sessionModel: `${AgentProviderId.OpenAI}/${platformModel.id}`,
      candidateModel: platformModel,
      availableModels,
    }),
  ).toBeNull();
});

test('does not silently replace a removed session model with the default', () => {
  expect(
    resolveAISphereTurnModel({
      sessionModel: `${AISphere.Provider}/removed-model`,
      candidateModel: platformModel,
      availableModels,
    }),
  ).toBeNull();
});

test('requires the same qualified model reference accepted by the main process', () => {
  expect(
    resolveAISphereTurnModel({
      sessionModel: platformModel.id,
      candidateModel: platformModel,
      availableModels,
    }),
  ).toBeNull();
});

test('resolves an initial candidate from the current catalog, not its stale metadata', () => {
  expect(
    resolveAISphereTurnModel({
      candidateModel: { ...platformModel, contextWindow: 1 },
      availableModels,
    }),
  ).toBe(platformModel);
});

test('rejects non-platform candidates and an empty catalog', () => {
  expect(
    resolveAISphereTurnModel({
      candidateModel: { ...platformModel, providerKey: ProviderName.OpenAI },
      availableModels,
    }),
  ).toBeNull();
  expect(
    resolveAISphereTurnModel({ candidateModel: platformModel, availableModels: [] }),
  ).toBeNull();
  expect(resolveAISphereTurnModel({ availableModels })).toBeNull();
});
