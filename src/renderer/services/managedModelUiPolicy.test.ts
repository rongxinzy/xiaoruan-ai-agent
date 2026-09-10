import { describe, expect, test } from 'vitest';

import {
  filterManagedModelSettingsTabs,
  resolveManagedModelSettingsTab,
  shouldShowLocalInferenceNavigation,
} from './managedModelUiPolicy';

describe('managed model UI policy', () => {
  test('keeps the model tab for AISphere connection settings', () => {
    expect(
      filterManagedModelSettingsTabs(
        [{ key: 'general' }, { key: 'model' }, { key: 'extension:models' }],
        true,
      ),
    ).toEqual([{ key: 'general' }, { key: 'model' }, { key: 'extension:models' }]);
    expect(resolveManagedModelSettingsTab('model', true, 'extension:models')).toBe(
      'model',
    );
  });

  test('hides local inference navigation only for exclusive managed models', () => {
    expect(shouldShowLocalInferenceNavigation(false, true)).toBe(false);
    expect(shouldShowLocalInferenceNavigation(false, false)).toBe(true);
    expect(shouldShowLocalInferenceNavigation(true, false)).toBe(false);
  });
});
