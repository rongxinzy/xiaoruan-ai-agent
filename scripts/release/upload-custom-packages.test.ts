import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { CUSTOM_PUBLIC_BASE_URL, collectPackages, uploadCustomPackages, uploadIdentity } from './upload-custom-packages.mjs';

const directories: string[] = [];
const env = {
  GITHUB_REPOSITORY: 'rongxinzy/xiaoruan-ai-agent',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  R2_BUCKET: 'xiaoruan-releases',
  XIAORUAN_R2_ACCOUNT_ID: 'b'.repeat(32),
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaoruan-upload-'));
  directories.push(directory);
  const root = path.join(directory, 'packages');
  await fs.mkdir(path.join(root, 'windows-build'), { recursive: true });
  await fs.writeFile(path.join(root, 'windows-build', '晓软智能体.exe'), 'test installer bytes');
  await fs.writeFile(path.join(root, 'windows-build', 'latest.yml'), 'must not publish this feed');
  return { root, outputDirectory: path.join(directory, 'receipt') };
}

test('rejects the original bucket, other repositories, PRs, and missing credentials', () => {
  for (const override of [
    { R2_BUCKET: 'zhiyuan-releases' },
    { GITHUB_REPOSITORY: 'rongxinzy/RongxinAI' },
    { GITHUB_REF: 'refs/pull/1/merge' },
    { AWS_SECRET_ACCESS_KEY: '' },
    { XIAORUAN_R2_ACCOUNT_ID: 'invalid' },
  ]) expect(() => uploadIdentity({ ...env, ...override })).toThrow();
});

test('keeps each workflow run and rerun in a distinct immutable prefix', () => {
  expect(uploadIdentity(env).prefix).not.toBe(uploadIdentity({ ...env, GITHUB_RUN_ATTEMPT: '2' }).prefix);
});

test('collects only installers and fails if a selected platform is missing', async () => {
  const { root } = await fixture();
  expect((await collectPackages(root, 1)).map(entry => entry.relativePath)).toEqual(['windows-build/晓软智能体.exe']);
  await expect(collectPackages(root, 2)).rejects.toThrow('count');
  await fs.unlink(path.join(root, 'windows-build', '晓软智能体.exe'));
  await expect(collectPackages(root, 1)).rejects.toThrow('No installer');
});

test('rejects symlink artifacts before uploading', async () => {
  const { root } = await fixture();
  await fs.symlink('晓软智能体.exe', path.join(root, 'windows-build', 'linked.exe'));
  await expect(collectPackages(root, 1)).rejects.toThrow('symlinks');
});

test('uploads verified packages and a receipt without publishing update feeds', async () => {
  const options = await fixture();
  const summaryPath = path.join(path.dirname(options.root), 'summary.md');
  const uploadEnv = { ...env, GITHUB_STEP_SUMMARY: summaryPath };
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const objects = new Map<string, { ContentLength: number; Metadata: { sha256: string } }>();
  const runAws = vi.fn((args: string[]) => {
    const key = args[args.indexOf('--key') + 1];
    if (args[1] === 'head-object') {
      return objects.has(key)
        ? { status: 0, stdout: JSON.stringify(objects.get(key)), stderr: '' }
        : { status: 1, stdout: '', stderr: '404 Not Found' };
    }
    expect(args[args.indexOf('--bucket') + 1]).toBe('xiaoruan-releases');
    expect(args).toContain('--if-none-match');
    const body = args[args.indexOf('--body') + 1];
    const size = statSync(body).size;
    objects.set(key, { ContentLength: size, Metadata: { sha256: args[args.indexOf('--metadata') + 1].slice('sha256='.length) } });
    return { status: 0, stdout: '{}', stderr: '' };
  });
  const receipt = await uploadCustomPackages({ ...options, expectedArtifacts: 1, env: uploadEnv, runAws });
  expect(receipt.objects).toHaveLength(1);
  const downloadUrl = `${CUSTOM_PUBLIC_BASE_URL}/builds/${env.GITHUB_SHA}/123/1/windows-build/${encodeURIComponent('晓软智能体.exe')}`;
  expect(receipt.objects[0].downloadUrl).toBe(downloadUrl);
  expect(new URL(downloadUrl).pathname).toContain('%E6%99%93');
  expect(await fs.readFile(summaryPath, 'utf8')).toContain(`[Download installer 1](${downloadUrl})`);
  expect(log).toHaveBeenCalledWith(`Public download: ${downloadUrl}`);
  expect(objects.size).toBe(2);
  expect([...objects.keys()].every(key => key.startsWith('builds/') && !key.endsWith('.yml'))).toBe(true);
  const writes = runAws.mock.calls.filter(([args]) => args[1] === 'put-object').length;
  await uploadCustomPackages({ ...options, expectedArtifacts: 1, env, runAws });
  expect(runAws.mock.calls.filter(([args]) => args[1] === 'put-object')).toHaveLength(writes);
});

test('fails closed on access errors and conflicting existing objects', async () => {
  const options = await fixture();
  for (const response of [
    { status: 1, stdout: '', stderr: '403 AccessDenied' },
    { status: 0, stdout: JSON.stringify({ ContentLength: 1, Metadata: { sha256: 'wrong' } }), stderr: '' },
  ]) {
    const runAws = vi.fn(() => response);
    await expect(uploadCustomPackages({ ...options, expectedArtifacts: 1, env, runAws })).rejects.toThrow();
    expect(runAws).toHaveBeenCalledTimes(1);
  }
});
