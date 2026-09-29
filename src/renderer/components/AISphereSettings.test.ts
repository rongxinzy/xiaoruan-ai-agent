// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { AISphere, AISphereStatus } from '../../shared/aisphere';
import { AISphereSettings } from './AISphereSettings';

const mocks = vi.hoisted(() => ({
  config: { model: { defaultModel: '', defaultModelProvider: '' } },
  updateConfig: vi.fn(),
  updateAgent: vi.fn(async () => {}),
  unsubscribe: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (select: (state: unknown) => unknown) => select({ model: { availableModels: [] } }),
}));
vi.mock('../store', () => ({ store: { getState: () => ({ cowork: { currentSession: null } }) } }));
vi.mock('../services/agent', () => ({ agentService: { updateAgent: mocks.updateAgent } }));
vi.mock('../services/cowork', () => ({ coworkService: {} }));
vi.mock('../services/config', () => ({
  configService: { getConfig: () => mocks.config, updateConfig: mocks.updateConfig },
}));
vi.mock('../services/i18n', () => ({ i18nService: { t: (key: string) => key } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.model.defaultModel = 'removed';
  mocks.config.model.defaultModelProvider = AISphere.Provider;
  mocks.updateConfig.mockImplementation(async (config: typeof mocks.config) => {
    mocks.config = config;
  });
  window.electron = {
    managedProviders: {
      onChanged: () => mocks.unsubscribe,
      aisphereSnapshot: async () => ({
        address: '',
        status: AISphereStatus.Ready,
        models: [
          { id: 'first', name: 'First', capabilities: {} },
          { id: 'second', name: 'Second', capabilities: {} },
        ],
      }),
    },
  } as unknown as typeof window.electron;
});
afterEach(cleanup);

test('corrects a removed default once using the current catalog and keeps the selection on rerender', async () => {
  const view = render(createElement(AISphereSettings));
  await waitFor(() => expect(mocks.config.model.defaultModel).toBe('first'));
  expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
  expect(mocks.updateAgent).toHaveBeenCalledWith('main', {
    model: `${AISphere.Provider}/first`,
  });
  view.rerender(createElement(AISphereSettings));
  expect(screen.getByRole('combobox')).toHaveTextContent('first');
  expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
});

test('preserves an existing valid default without updating the model or persisted config', async () => {
  mocks.config.model.defaultModel = 'second';
  render(createElement(AISphereSettings));
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('second'));
  expect(mocks.updateConfig).not.toHaveBeenCalled();
  expect(mocks.updateAgent).not.toHaveBeenCalled();
});
