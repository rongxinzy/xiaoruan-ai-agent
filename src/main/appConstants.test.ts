import fs from 'node:fs';
import { expect, test } from 'vitest';
import { APP_DATA_DIR_NAME, APP_ID, APP_NAME, DB_FILENAME } from './appConstants';

test('uses a separate product and storage identity', () => {
  expect(APP_NAME).toBe('晓软AI智能体');
  expect(APP_ID).toBe('xiaoruan-ai-agent');
  expect(APP_DATA_DIR_NAME).toBe('XiaoruanAgent');
  expect(DB_FILENAME).toBe('xiaoruan.sqlite');
  const builder = JSON.parse(fs.readFileSync('electron-builder.json', 'utf8'));
  expect(builder.appId).toBe('com.xiaoruan.agent');
  expect(builder.productName).toBe(APP_NAME);
  expect(builder.protocols).toBeUndefined();
  expect(builder.publish).toBeNull();
  for (const platform of ['mac', 'win', 'linux']) {
    expect(builder[platform].publish).toBeUndefined();
  }
});

test('does not expose product authentication, free-model or updater bridges', () => {
  const preload = fs.readFileSync('src/main/preload.ts', 'utf8');
  const main = fs.readFileSync('src/main/main.ts', 'utf8');
  for (const text of [preload, main]) {
    expect(text).not.toMatch(/CommunityAuth|ModelPoolIpc|AppUpdateIpc/);
    expect(text).not.toMatch(
      /account\.rongxzyai\.com|model\.rongxzyai\.com|updates\.rongxzyai\.com/,
    );
  }
  expect(preload).not.toMatch(/^  (auth|modelPool|appUpdate):/m);
});
