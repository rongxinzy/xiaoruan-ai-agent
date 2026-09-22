import { expect, test } from 'vitest';

import { shouldShowRuntimeInstallCta } from './RuntimeInstallCard';

test('prompts install when runtime is not ready yet', () => {
  expect(
    shouldShowRuntimeInstallCta({
      ready: false,
      selectedBackend: undefined,
      selectedInstalled: false,
    }),
  ).toBe(true);
});

test('hides install when runtime is already open or ready without a pending backend', () => {
  // 已打开/已就绪：不再催下载（#799）
  expect(
    shouldShowRuntimeInstallCta({
      ready: true,
      selectedBackend: undefined,
      selectedInstalled: false,
    }),
  ).toBe(false);
});

test('still offers install when switching to an uninstalled backend version', () => {
  expect(
    shouldShowRuntimeInstallCta({
      ready: true,
      selectedBackend: {
        versionBackend: 'b1-macos-arm64',
        version: 'b1',
        backend: 'macos-arm64',
        platform: 'darwin',
        arch: 'arm64',
        accelerator: 'metal',
        installed: false,
        current: false,
        recommended: true,
      },
      selectedInstalled: false,
    }),
  ).toBe(true);
});

test('hides install for the already installed selected backend', () => {
  expect(
    shouldShowRuntimeInstallCta({
      ready: true,
      selectedBackend: {
        versionBackend: 'b1-macos-arm64',
        version: 'b1',
        backend: 'macos-arm64',
        platform: 'darwin',
        arch: 'arm64',
        accelerator: 'metal',
        installed: true,
        current: true,
        recommended: true,
      },
      selectedInstalled: true,
    }),
  ).toBe(false);
});
