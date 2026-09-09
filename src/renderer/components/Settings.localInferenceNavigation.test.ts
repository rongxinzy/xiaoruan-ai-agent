import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const settingsSource = readFileSync(fileURLToPath(new URL('./Settings.tsx', import.meta.url)), 'utf8');
const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');

test('supports selecting an initial local model provider in settings', () => {
  expect(settingsSource).toContain('initialProvider?: ProviderName;');
  expect(settingsSource).toContain('initialProvider ?? getDefaultActiveProvider()');
  expect(settingsSource).toContain('if (!providers[initialProvider]) return;');
  expect(settingsSource).toContain('initialProviderAppliedRef.current = true;');
  expect(settingsSource).toContain('if (!initialProviderRef.current) setActiveProvider(provider);');
});

test('uses the success indicator color for local models before connection testing', () => {
  expect(settingsSource).toContain('activeProvider === ProviderName.LlamaCpp ||');
  expect(settingsSource).toContain("? 'bg-success'");
  expect(settingsSource).toContain("? 'bg-destructive'");
});

test('routes the local inference settings action to the llama.cpp provider', () => {
  expect(appSource).toContain('initialProvider: options?.initialProvider');
  expect(appSource).toContain('await configService.updateConfig({');
  expect(appSource).toContain('[ProviderName.LlamaCpp]: {');
  expect(appSource).toContain('enabled: true,');
  expect(appSource).toContain('userEnabled: true,');
  expect(appSource).toContain('initialProvider: ProviderName.LlamaCpp');
  expect(appSource).toContain('initialProvider={settingsOptions.initialProvider}');
});
