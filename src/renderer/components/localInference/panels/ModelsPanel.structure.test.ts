import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./ModelsPanel.tsx', import.meta.url)), 'utf8');

test('keeps the loading overlay from blocking the card cancel action', () => {
  expect(source).toContain(
    'pointer-events-none absolute inset-0 z-10 flex flex-wrap items-center justify-center',
  );
  expect(source).toContain('data-local-inference-cancel-load-button="true"');
  expect(source.indexOf('data-local-inference-cancel-load-button="true"')).toBeGreaterThan(
    source.indexOf('pointer-events-none absolute inset-0'),
  );
  expect(source).toContain('data-local-inference-unload-button="true"');
});

test('keeps loading overlay actions clickable', () => {
  expect(source).toContain('className="pointer-events-auto"');
});
