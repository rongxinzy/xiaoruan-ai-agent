// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { UnknownAction } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { AISphere, AISphereError } from '../../../shared/aisphere';
import { ProviderName } from '../../../shared/providers';
import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { updateCurrentSessionModelOverride } from '../../store/slices/coworkSlice';
import modelReducer, { type Model } from '../../store/slices/modelSlice';
import { toAgentModelRef } from '../../utils/agentModelRef';
import { useCoworkModelSelection } from './useCoworkModelSelection';

vi.mock('../../services/agent', () => ({ agentService: { updateAgent: vi.fn() } }));
vi.mock('../../services/cowork', () => ({ coworkService: { updateSessionModel: vi.fn() } }));
vi.mock('../../services/i18n', () => ({ i18nService: { t: (key: string) => key } }));
vi.mock('react-redux', () => ({
  useSelector: (selector: (value: typeof state) => unknown) => selector(state),
  useDispatch: () => dispatch,
}));

const modelA: Model = { id: 'model-a', name: 'Model A', providerKey: AISphere.Provider };
const modelB: Model = { id: 'model-b', name: 'Model B', providerKey: AISphere.Provider };
let state: {
  model: ReturnType<typeof modelReducer>;
  cowork: { currentSession: { id: string; modelOverride: string } | null };
};
const dispatch = vi.fn((action: UnknownAction) => {
  state.model = modelReducer(state.model, action);
  if (
    updateCurrentSessionModelOverride.match(action) &&
    state.cowork.currentSession?.id === action.payload.sessionId
  ) {
    state.cowork.currentSession.modelOverride = action.payload.modelOverride;
  }
});
const options = {
  sessionId: 'session-1',
  agentId: 'main',
  agentModelRef: toAgentModelRef(modelA),
  isDirectChat: true,
  syncDefaultModel: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    model: {
      ...modelReducer(undefined, { type: 'init' }),
      availableModels: [modelA, modelB],
      defaultSelectedModel: modelA,
      selectedModelByAgent: {},
    },
    cowork: { currentSession: { id: options.sessionId, modelOverride: toAgentModelRef(modelA) } },
  };
  vi.mocked(coworkService.updateSessionModel).mockResolvedValue(null);
  vi.mocked(agentService.updateAgent).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('keeps the session model when attaching or removing skills changes the route', () => {
  state.cowork.currentSession!.modelOverride = toAgentModelRef(modelB);
  const { result, rerender } = renderHook(props => useCoworkModelSelection(props), {
    initialProps: options,
  });
  expect(result.current.selectedModel).toBe(modelB);
  rerender({ ...options, isDirectChat: false });
  expect(result.current.selectedModel).toBe(modelB);
  rerender(options);
  expect(result.current.selectedModel).toBe(modelB);
});

test('persists a direct-chat selection to the session before committing global selections', async () => {
  vi.mocked(coworkService.updateSessionModel).mockResolvedValue({
    modelOverride: toAgentModelRef(modelB),
  } as Awaited<ReturnType<typeof coworkService.updateSessionModel>>);
  const { result, rerender } = renderHook(props => useCoworkModelSelection(props), {
    initialProps: options,
  });
  await act(async () => {
    await result.current.handleModelSelect(modelB);
  });
  expect(coworkService.updateSessionModel).toHaveBeenCalledWith(
    options.sessionId,
    toAgentModelRef(modelB),
  );
  expect(state.cowork.currentSession?.modelOverride).toBe(toAgentModelRef(modelB));
  expect(state.model.defaultSelectedModel).toEqual(modelB);
  expect(state.model.selectedModelByAgent.main).toEqual(modelB);
  rerender({ ...options, isDirectChat: false });
  expect(result.current.selectedModel).toEqual(modelB);
});

test('rolls back a failed save without changing the default or agent model', async () => {
  const toast = vi.spyOn(window, 'dispatchEvent');
  const { result } = renderHook(() => useCoworkModelSelection(options));
  await act(async () => {
    await result.current.handleModelSelect(modelB);
  });
  expect(state.cowork.currentSession?.modelOverride).toBe(toAgentModelRef(modelA));
  expect(state.model.defaultSelectedModel).toEqual(modelA);
  expect(state.model.selectedModelByAgent).toEqual({});
  expect(result.current.isPatchingModel).toBe(false);
  expect(
    toast.mock.calls.some(([event]) => (event as CustomEvent).detail === 'coworkModelSwitchFailed'),
  ).toBe(true);
});

test('handles a rejected save with the same rollback and feedback', async () => {
  vi.mocked(coworkService.updateSessionModel).mockRejectedValue(new Error('IPC failed.'));
  const { result } = renderHook(() => useCoworkModelSelection(options));
  await act(async () => {
    await result.current.handleModelSelect(modelB);
  });
  expect(state.cowork.currentSession?.modelOverride).toBe(toAgentModelRef(modelA));
  expect(state.model.defaultSelectedModel).toEqual(modelA);
  expect(result.current.isPatchingModel).toBe(false);
});

test('rejects unavailable selections before submission instead of displaying a fallback', () => {
  state.cowork.currentSession!.modelOverride = `${AISphere.Provider}/removed-model`;
  const toast = vi.spyOn(window, 'dispatchEvent');
  const { result } = renderHook(() => useCoworkModelSelection(options));
  expect(result.current.selectedModel).toBeNull();
  expect(result.current.validateModelSelection()).toBe(false);
  expect((toast.mock.calls[0][0] as CustomEvent).detail).toBe(AISphereError.MissingModel);
});

test('rejects a model removed by a catalog refresh', () => {
  const { result, rerender } = renderHook(() => useCoworkModelSelection(options));
  state.model.availableModels = [modelB];
  rerender();
  expect(result.current.selectedModel).toBeNull();
  expect(result.current.validateModelSelection()).toBe(false);
});

test('recovers an invalid session only after an explicit valid reselection', async () => {
  state.cowork.currentSession!.modelOverride = `${ProviderName.OpenAI}/${modelB.id}`;
  vi.mocked(coworkService.updateSessionModel).mockResolvedValue({
    modelOverride: toAgentModelRef(modelB),
  } as Awaited<ReturnType<typeof coworkService.updateSessionModel>>);
  const { result, rerender } = renderHook(() => useCoworkModelSelection(options));
  expect(result.current.selectedModel).toBeNull();
  await act(async () => {
    await result.current.handleModelSelect(modelB);
  });
  rerender();
  expect(result.current.selectedModel).toEqual(modelB);
  expect(result.current.validateModelSelection()).toBe(true);
  expect(agentService.updateAgent).toHaveBeenCalledWith(options.agentId, {
    model: toAgentModelRef(modelB),
  });
});

test('persists the same session choice from the agent-backed route', async () => {
  vi.mocked(coworkService.updateSessionModel).mockResolvedValue({
    modelOverride: toAgentModelRef(modelB),
  } as Awaited<ReturnType<typeof coworkService.updateSessionModel>>);
  const { result, rerender } = renderHook(props => useCoworkModelSelection(props), {
    initialProps: { ...options, isDirectChat: false },
  });
  await act(async () => {
    await result.current.handleModelSelect(modelB);
  });
  rerender(options);
  expect(result.current.selectedModel).toEqual(modelB);
  expect(state.cowork.currentSession?.modelOverride).toBe(toAgentModelRef(modelB));
});

test('does not persist an arbitrary provider passed to the selection handler', async () => {
  const { result } = renderHook(() => useCoworkModelSelection(options));
  await act(async () => {
    await result.current.handleModelSelect({ ...modelB, providerKey: ProviderName.OpenAI });
  });
  expect(coworkService.updateSessionModel).not.toHaveBeenCalled();
  expect(agentService.updateAgent).not.toHaveBeenCalled();
});

test('ignores late results after switching to another session', async () => {
  let complete: (
    value: Awaited<ReturnType<typeof coworkService.updateSessionModel>>,
  ) => void = () => {};
  vi.mocked(coworkService.updateSessionModel).mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      }),
  );
  const { result, rerender } = renderHook(props => useCoworkModelSelection(props), {
    initialProps: options,
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.handleModelSelect(modelB);
  });
  expect(result.current.isPatchingModel).toBe(true);
  state.cowork.currentSession = { id: 'session-2', modelOverride: toAgentModelRef(modelA) };
  rerender({ ...options, sessionId: 'session-2' });
  await act(async () => {
    complete({ modelOverride: toAgentModelRef(modelB) } as Awaited<
      ReturnType<typeof coworkService.updateSessionModel>
    >);
    await pending;
  });
  expect(state.cowork.currentSession.modelOverride).toBe(toAgentModelRef(modelA));
  expect(state.model.defaultSelectedModel).toEqual(modelA);
  expect(state.model.selectedModelByAgent).toEqual({});
});

test('blocks rapid duplicate selections while the first save is pending', async () => {
  let complete: (
    value: Awaited<ReturnType<typeof coworkService.updateSessionModel>>,
  ) => void = () => {};
  vi.mocked(coworkService.updateSessionModel).mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      }),
  );
  const { result } = renderHook(() => useCoworkModelSelection(options));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.handleModelSelect(modelB);
  });
  await act(async () => {
    await result.current.handleModelSelect(modelA);
  });
  expect(coworkService.updateSessionModel).toHaveBeenCalledTimes(1);
  await act(async () => {
    complete(null);
    await pending;
  });
});

test('persists a home-page direct selection for the next agent-backed request', async () => {
  vi.mocked(agentService.updateAgent).mockResolvedValue({ id: 'main' } as Awaited<
    ReturnType<typeof agentService.updateAgent>
  >);
  const props = { ...options, sessionId: undefined };
  const { result, rerender } = renderHook(value => useCoworkModelSelection(value), {
    initialProps: props,
  });
  await act(async () => {
    await result.current.handleModelSelect(modelB);
  });
  expect(agentService.updateAgent).toHaveBeenCalledWith('main', { model: toAgentModelRef(modelB) });
  rerender({ ...props, isDirectChat: false });
  expect(result.current.selectedModel).toEqual(modelB);
});
