import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const input = readFileSync(new URL('./CoworkPromptInput.tsx', import.meta.url), 'utf8');
const view = readFileSync(new URL('./CoworkView.tsx', import.meta.url), 'utf8');

test('uses shared session-aware selection for the picker and execution routes', () => {
  expect(input).toContain('selectedModel: effectiveSelectedModel');
  expect(input).toContain('useCoworkModelSelection({');
  expect(view).toContain('useCoworkSelectedModel({');
  expect(view).toContain('const directChatModel = currentAgentSelectedModel;');
  expect(view).not.toContain('state.model.defaultSelectedModel');
  expect(input).not.toContain('dispatch(setDefaultSelectedModel(');
});

test('validates selection before either starting or continuing a session', () => {
  expect(input).toContain('if (!validateModelSelection()) return;');
  expect(
    view.match(/if \(!validateModelSelection\(\) \|\| !directChatModel\) return false;/g),
  ).toHaveLength(2);
  const submit = input.slice(input.indexOf('const handleSubmit ='));
  expect(submit.indexOf('isPatchingModel')).toBeLessThan(
    submit.indexOf('validateModelSelection()'),
  );
});
