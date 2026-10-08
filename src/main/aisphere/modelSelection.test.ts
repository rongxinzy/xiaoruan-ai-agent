import { afterEach, expect, test, vi } from 'vitest';

import { AISphere, AISphereError, AISphereStatus } from '../../shared/aisphere';
import { selectAISphereModel } from './modelSelection';
import { aisphereService } from './service';

afterEach(() => {
  vi.restoreAllMocks();
});

const catalog = {
  address: 'http://platform',
  status: AISphereStatus.Ready,
  models: [{ id: 'first-model', name: 'First', capabilities: {} }],
};

test('falls back to the first catalog model when the stored default is gone', () => {
  vi.spyOn(aisphereService, 'selection').mockImplementation((model?: string) => {
    if (model !== 'first-model') throw new Error(AISphereError.MissingModel);
    return { model, config: aisphereService.provider() };
  });
  vi.spyOn(aisphereService, 'snapshot').mockReturnValue(catalog);

  expect(
    selectAISphereModel({ model: { defaultModel: '', defaultModelProvider: AISphere.Provider } }),
  ).toMatchObject({ model: 'first-model' });
});

test('keeps the platform error when the catalog itself is empty', () => {
  vi.spyOn(aisphereService, 'selection').mockImplementation(() => {
    throw new Error(AISphereError.Unavailable);
  });
  vi.spyOn(aisphereService, 'snapshot').mockReturnValue({
    address: 'http://platform',
    status: AISphereStatus.Unavailable,
    models: [],
  });

  expect(() => selectAISphereModel({ model: {} })).toThrow(AISphereError.Unavailable);
});

test('does not substitute a platform model for an explicitly selected external provider', () => {
  vi.spyOn(aisphereService, 'selection').mockImplementation(() => {
    throw new Error(AISphereError.MissingModel);
  });
  const snapshot = vi.spyOn(aisphereService, 'snapshot').mockReturnValue(catalog);

  expect(() =>
    selectAISphereModel({ model: { defaultModel: 'gpt-x', defaultModelProvider: 'openai' } }),
  ).toThrow(AISphereError.MissingModel);
  expect(snapshot).not.toHaveBeenCalled();
});

test('does not resolve an explicit model reference through the fallback', () => {
  const selection = vi.spyOn(aisphereService, 'selection').mockImplementation(() => {
    throw new Error(AISphereError.MissingModel);
  });
  const snapshot = vi.spyOn(aisphereService, 'snapshot').mockReturnValue(catalog);

  expect(() => selectAISphereModel({}, `${AISphere.Provider}/removed-model`)).toThrow(
    AISphereError.MissingModel,
  );
  expect(selection).toHaveBeenCalledWith('removed-model', AISphere.Provider);
  expect(snapshot).not.toHaveBeenCalled();
});
