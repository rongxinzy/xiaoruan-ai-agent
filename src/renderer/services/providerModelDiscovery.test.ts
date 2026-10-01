import { describe, expect, test } from 'vitest';

import {
  DiscoveryCapabilitiesSource,
  ModelCapabilityStatus,
  ProviderModelDiscoveryErrorCode,
} from '@shared/providers';

import {
  applyProviderModelDiscoveryResult,
  isCurrentProviderModelDiscoveryRequest,
  mergeDiscoveredProviderModels,
} from './providerModelDiscovery';

describe('mergeDiscoveredProviderModels', () => {
  test('adds missing IDs without replacing existing metadata or deleting models', () => {
    const existing = [
      {
        id: 'model-a',
        name: 'Custom A',
        supportsImage: true,
        contextWindow: 128_000,
      },
      { id: 'local-only', name: 'Local only' },
    ];

    const result = mergeDiscoveredProviderModels(existing, [
      { id: 'model-a', displayName: 'Remote A' },
      { id: 'model-b', displayName: 'Remote B' },
    ]);

    expect(result).toEqual({
      models: [...existing, { id: 'model-b', name: 'Remote B' }],
      addedCount: 1,
      changed: true,
    });
    expect(result.models[0]).toBe(existing[0]);
  });

  test('merges against the latest draft after concurrent manual edits', () => {
    const latestDraft = [
      { id: 'model-a', name: 'Renamed while loading' },
      { id: 'manual-model', name: 'Added while loading' },
    ];

    expect(
      mergeDiscoveredProviderModels(latestDraft, [
        { id: 'model-a', displayName: 'Remote A' },
        { id: 'model-b', displayName: 'Remote B' },
      ]).models,
    ).toEqual([...latestDraft, { id: 'model-b', name: 'Remote B' }]);
  });

  test('updates an existing context length from explicit discovery metadata', () => {
    const existing = [
      {
        id: 'model-a',
        name: 'Model A',
        contextWindow: 8192,
        capabilities: { toolCalling: ModelCapabilityStatus.Unsupported },
      },
    ];

    expect(
      mergeDiscoveredProviderModels(existing, [
        {
          id: 'model-a',
          contextWindow: 32768,
          maxTokens: 4096,
          capabilities: {
            toolCalling: ModelCapabilityStatus.Supported,
            imageInput: ModelCapabilityStatus.Supported,
            reasoning: ModelCapabilityStatus.Supported,
          },
        },
      ]).models,
    ).toEqual([
      {
        id: 'model-a',
        name: 'Model A',
        contextWindow: 32768,
        maxTokens: 4096,
        supportsImage: true,
        capabilities: {
          toolCalling: ModelCapabilityStatus.Unsupported,
          imageInput: ModelCapabilityStatus.Supported,
          reasoning: ModelCapabilityStatus.Supported,
        },
      },
    ]);
  });

  test('lets a runtime-probe verdict override a stale supported capability', () => {
    const existing = [
      {
        id: 'qwen3-vl',
        name: 'Qwen3 VL',
        supportsImage: true,
        capabilities: { imageInput: ModelCapabilityStatus.Supported },
      },
    ];

    const result = mergeDiscoveredProviderModels(existing, [
      {
        id: 'qwen3-vl',
        capabilities: { imageInput: ModelCapabilityStatus.Unsupported },
        capabilitiesSource: DiscoveryCapabilitiesSource.RuntimeProbe,
      },
    ]);

    expect(result.changed).toBe(true);
    expect(result.models).toEqual([
      {
        id: 'qwen3-vl',
        name: 'Qwen3 VL',
        supportsImage: false,
        capabilities: { imageInput: ModelCapabilityStatus.Unsupported },
      },
    ]);
  });

  test('does not overwrite a stored capability verdict without a probe marker', () => {
    const existing = [
      {
        id: 'qwen3-vl',
        name: 'Qwen3 VL',
        supportsImage: true,
        capabilities: { imageInput: ModelCapabilityStatus.Supported },
      },
    ];

    const result = mergeDiscoveredProviderModels(existing, [
      {
        id: 'qwen3-vl',
        capabilities: { imageInput: ModelCapabilityStatus.Unsupported },
      },
    ]);

    expect(result.changed).toBe(false);
    expect(result.models[0]).toBe(existing[0]);
  });

  test('leaves the draft unchanged after a failed or empty discovery', () => {
    const existing = [{ id: 'model-a', name: 'Model A' }];
    const failed = applyProviderModelDiscoveryResult(existing, {
      success: false,
      code: ProviderModelDiscoveryErrorCode.Network,
      error: 'Network error',
    });
    const empty = applyProviderModelDiscoveryResult(existing, { success: true, models: [] });

    expect(failed.models).toBe(existing);
    expect(empty.models).toBe(existing);
    expect(failed.changed).toBe(false);
    expect(empty.changed).toBe(false);
  });
});

test('rejects stale model discovery responses', () => {
  expect(isCurrentProviderModelDiscoveryRequest(2, 2, 'provider-a:key-1', 'provider-a:key-1')).toBe(
    true,
  );
  expect(isCurrentProviderModelDiscoveryRequest(1, 2, 'provider-a:key-1', 'provider-a:key-1')).toBe(
    false,
  );
  expect(isCurrentProviderModelDiscoveryRequest(2, 2, 'provider-a:key-1', 'provider-b:key-2')).toBe(
    false,
  );
});
