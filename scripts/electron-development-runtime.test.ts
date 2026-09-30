import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import { publishRuntimeCache } from './electron-development-runtime.mjs';

const VERSION = '40.10.6';
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })),
  );
});

async function createTemporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'electron-dev-runtime-'));
  temporaryRoots.push(root);
  return root;
}

async function createSourceDirectory() {
  const source = await createTemporaryRoot();
  await fs.writeFile(path.join(source, 'electron.exe'), 'binary');
  await fs.writeFile(path.join(source, 'version'), `${VERSION}\n`);
  return source;
}

test('publishes a complete runtime on the first call', async () => {
  const sourceDirectory = await createSourceDirectory();
  const cacheRoot = await createTemporaryRoot();

  const runtimeDirectory = await publishRuntimeCache({ sourceDirectory, cacheRoot, version: VERSION });

  expect(runtimeDirectory).toBe(path.join(cacheRoot, VERSION));
  expect(await fs.readFile(path.join(runtimeDirectory, '.ready'), 'utf8')).toBe(`${VERSION}\n`);
  expect(await fs.readFile(path.join(runtimeDirectory, 'electron.exe'), 'utf8')).toBe('binary');
});

test('reuses a complete runtime instead of copying it again', async () => {
  const sourceDirectory = await createSourceDirectory();
  const cacheRoot = await createTemporaryRoot();
  const runtimeDirectory = await publishRuntimeCache({ sourceDirectory, cacheRoot, version: VERSION });
  await fs.writeFile(path.join(runtimeDirectory, 'electron.exe'), 'patched');

  expect(await publishRuntimeCache({ sourceDirectory, cacheRoot, version: VERSION })).toBe(
    runtimeDirectory,
  );
  expect(await fs.readFile(path.join(runtimeDirectory, 'electron.exe'), 'utf8')).toBe('patched');
});

test('rebuilds a cache directory whose runtime went missing', async () => {
  const sourceDirectory = await createSourceDirectory();
  const cacheRoot = await createTemporaryRoot();
  const runtimeDirectory = path.join(cacheRoot, VERSION);
  await fs.mkdir(runtimeDirectory, { recursive: true });
  await fs.writeFile(path.join(runtimeDirectory, '.ready'), `${VERSION}\n`);
  await fs.writeFile(path.join(runtimeDirectory, 'leftover.txt'), 'stale');

  expect(await publishRuntimeCache({ sourceDirectory, cacheRoot, version: VERSION })).toBe(
    runtimeDirectory,
  );
  expect(await fs.readFile(path.join(runtimeDirectory, 'electron.exe'), 'utf8')).toBe('binary');
  await expect(fs.access(path.join(runtimeDirectory, 'leftover.txt'))).rejects.toThrow();
});

test('lets two concurrent first starts share the published runtime', async () => {
  const sourceDirectory = await createSourceDirectory();
  const cacheRoot = await createTemporaryRoot();

  const published = await Promise.all([
    publishRuntimeCache({ sourceDirectory, cacheRoot, version: VERSION }),
    publishRuntimeCache({ sourceDirectory, cacheRoot, version: VERSION }),
  ]);

  expect(published[0]).toBe(published[1]);
  expect(await fs.access(path.join(published[0], '.ready')).then(() => true, () => false)).toBe(true);
  const entries = await fs.readdir(cacheRoot);
  expect(entries.filter(entry => entry.includes('staging'))).toEqual([]);
});
