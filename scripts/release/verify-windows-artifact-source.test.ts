import { expect, test, vi } from 'vitest';
import { verifyWindowsArtifactSource } from './verify-windows-artifact-source.mjs';

const baseEnv = {
  SOURCE_RUN_ID: '34199804070',
  GITHUB_REPOSITORY: 'rongxinzy/xiaoruan-ai-agent',
  GITHUB_REF: 'refs/heads/main',
  GH_TOKEN: 'test-token',
};

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      path: '.github/workflows/build-platforms.yml',
      head_branch: 'main',
      event: 'workflow_dispatch',
      head_sha: 'a'.repeat(40),
      head_repository: { full_name: 'rongxinzy/xiaoruan-ai-agent' },
      ...overrides,
    },
    jobs: {
      jobs: [
        {
          name: 'build-platforms (windows, windows-latest)',
          conclusion: 'cancelled',
          steps: [
            { name: 'Build Windows', conclusion: 'success' },
            { name: 'Verify Windows package runtimes with a clean PATH', conclusion: 'success' },
            { name: 'Run actions/upload-artifact@v6', conclusion: 'skipped' },
            { name: 'Run actions/upload-artifact@v6', conclusion: 'success' },
          ],
        },
      ],
    },
    artifacts: { artifacts: [{ id: 123, name: 'windows-build', expired: false }] },
  };
}

function mockedFetch(payloads: ReturnType<typeof fixture>) {
  return vi.fn(async (url: string) => {
    const body = url.includes('/jobs?') ? payloads.jobs : url.includes('/artifacts?') ? payloads.artifacts : payloads.run;
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

test('accepts a cancelled source run when the Windows job and artifact succeeded', async () => {
  const fetchMock = mockedFetch(fixture({ conclusion: 'cancelled' }));
  await expect(verifyWindowsArtifactSource(baseEnv, fetchMock)).resolves.toEqual({
    sourceCommit: 'a'.repeat(40),
    sourceRunId: '34199804070',
    artifactId: '123',
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test.each([
  ['other repository', { head_repository: { full_name: 'evil/example' } }],
  ['other branch', { head_branch: 'feature' }],
  ['wrong workflow', { path: '.github/workflows/ci.yml' }],
])('rejects %s source provenance', async (_name, override) => {
  await expect(verifyWindowsArtifactSource(baseEnv, mockedFetch(fixture(override)))).rejects.toThrow(
    'Source run provenance',
  );
});

test('rejects a failed Windows smoke step', async () => {
  const payloads = fixture();
  payloads.jobs.jobs[0].steps[1].conclusion = 'failure';
  await expect(verifyWindowsArtifactSource(baseEnv, mockedFetch(payloads))).rejects.toThrow(
    'Required Windows step',
  );
});

test('rejects an expired or missing windows-build artifact', async () => {
  const expired = fixture();
  expired.artifacts.artifacts[0].expired = true;
  await expect(verifyWindowsArtifactSource(baseEnv, mockedFetch(expired))).rejects.toThrow(
    'unexpired windows-build',
  );
  const missing = fixture();
  missing.artifacts.artifacts = [];
  await expect(verifyWindowsArtifactSource(baseEnv, mockedFetch(missing))).rejects.toThrow(
    'unexpired windows-build',
  );
});
