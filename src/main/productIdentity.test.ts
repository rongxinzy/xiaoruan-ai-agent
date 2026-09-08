import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import { APP_NAME, APP_NAME_EN } from './appConstants';
import { composeCoworkSystemPrompt } from './coworkPrompt/composer';
import { ensureDefaultIdentity } from './libs/agentMemoryFile';
import { DefaultIdentityEn, DefaultIdentityZh, ProductIdentityPrompt } from './productIdentity';

const locale = vi.hoisted(() => ({ value: 'zh-CN' }));
vi.mock('electron', () => ({ app: { getLocale: () => locale.value } }));

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

test('all built-in identity sources use the custom product without company attribution', () => {
  const sources = [
    ProductIdentityPrompt,
    DefaultIdentityZh,
    DefaultIdentityEn,
    fs.readFileSync('resources/SYSTEM_PROMPT.md', 'utf8'),
    composeCoworkSystemPrompt({ language: 'zh' }),
    composeCoworkSystemPrompt({ language: 'en' }),
  ];
  for (const source of sources) {
    expect(source).toContain(APP_NAME);
    expect(source).toContain(APP_NAME_EN);
    expect(source).not.toMatch(/容芯|致远|知远|\brongxin(?:ai)?\b|\bzhiyuan\b/i);
    expect(source).not.toMatch(/is a product of|由.+打造|全栈自研|fully self-developed/i);
  }
});

test.each(['zh-CN', 'en-US'])('new %s workspaces receive the shared identity', language => {
  locale.value = language;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoruan-identity-'));
  directories.push(directory);
  ensureDefaultIdentity(directory);
  const filename = path.join(directory, 'IDENTITY.md');
  expect(fs.readFileSync(filename, 'utf8')).toBe(
    language.startsWith('zh') ? DefaultIdentityZh : DefaultIdentityEn,
  );

  const customIdentity = 'Customer-authored instructions must remain intact.';
  fs.writeFileSync(filename, customIdentity);
  ensureDefaultIdentity(directory);
  expect(fs.readFileSync(filename, 'utf8')).toBe(customIdentity);
});
