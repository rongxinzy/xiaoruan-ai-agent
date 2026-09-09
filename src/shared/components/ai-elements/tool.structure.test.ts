import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./tool.tsx', import.meta.url)), 'utf8');

test('uses a bounded reduced-motion-safe transition for the tool expand control', () => {
  expect(source).toContain(
    'transition-transform duration-200 ease-out motion-reduce:transition-none',
  );
  expect(source).toContain("isOpen === undefined");
  expect(source).toContain("? 'rotate-180'");
  expect(source).toContain(": 'rotate-0'");
});

test('animates tool content with the shared expand and collapse motion', () => {
  expect(source).toContain(
    'duration-200 ease-out data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none',
  );
});
