import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  verifySignedPackageReceipt,
  verifySignedPackageSource,
} from './verify-signed-package-source.mjs';

const baseEnv = {
  SIGNED_RUN_ID: '37009810186',
  GITHUB_REPOSITORY: 'rongxinzy/xiaoruan-ai-agent',
  GITHUB_REF: 'refs/heads/main',
  GH_TOKEN: 'test-token',
};

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      path: '.github/workflows/sign-xiaoruan-windows.yml',
      head_branch: 'main',
      event: 'workflow_dispatch',
      head_repository: { full_name: 'rongxinzy/RongxinAI' },
      status: 'completed',
      conclusion: 'success',
      ...overrides,
    },
    jobs: {
      jobs: [
        {
          name: 'sign',
          conclusion: 'success',
          steps: [
            { name: 'Build signed Windows package', conclusion: 'success' },
            { name: 'Verify Windows Authenticode signatures', conclusion: 'success' },
            { name: 'Run actions/upload-artifact@v6', conclusion: 'success' },
          ],
        },
      ],
    },
    artifacts: { artifacts: [{ id: 456, name: 'signed-windows-build', expired: false }] },
  };
}

function mockedFetch(payloads: ReturnType<typeof fixture>) {
  return vi.fn(async (url: string) => {
    const body = url.includes('/jobs?') ? payloads.jobs : url.includes('/artifacts?') ? payloads.artifacts : payloads.run;
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

test('accepts a successful central signing run with one signed artifact', async () => {
  const fetchMock = mockedFetch(fixture());
  await expect(verifySignedPackageSource(baseEnv, fetchMock)).resolves.toEqual({
    signingRunId: '37009810186',
    artifactId: '456',
  });
});

test('rejects a run from a different workflow', async () => {
  const fetchMock = mockedFetch(fixture({ path: '.github/workflows/release-candidate.yml' }));
  await expect(verifySignedPackageSource(baseEnv, fetchMock)).rejects.toThrow(
    'not an approved Xiaoruan signing run',
  );
});

test('rejects a signing run whose signature verification step failed', async () => {
  const payload = fixture();
  payload.jobs.jobs[0].steps[1].conclusion = 'failure';
  const fetchMock = mockedFetch(payload);
  await expect(verifySignedPackageSource(baseEnv, fetchMock)).rejects.toThrow(
    'Verify Windows Authenticode signatures',
  );
});

const receiptEnv = {
  SOURCE_RUN_ID: '37007682809',
  PACKAGE_SOURCE_COMMIT: 'b'.repeat(40),
  SIGNED_RUN_ID: '37009810186',
};

function receiptFor(name: string, content: string) {
  return {
    version: 1,
    sourceRepository: 'rongxinzy/xiaoruan-ai-agent',
    sourceRunId: '37007682809',
    sourceSha: 'b'.repeat(40),
    packageVersion: '1.0.2',
    signingRepository: 'rongxinzy/RongxinAI',
    signingRunId: '37009810186',
    files: [
      {
        name,
        sha256: createHash('sha256').update(content).digest('hex'),
        size: content.length,
      },
    ],
  };
}

function withArtifactDir(files: Record<string, string>, fn: (dir: string) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'signed-package-'));
    try {
      for (const [name, content] of Object.entries(files)) {
        writeFileSync(path.join(dir, name), content);
      }
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  'accepts a receipt whose installer matches name, size and hash',
  withArtifactDir({}, async dir => {
    writeFileSync(path.join(dir, 'Setup-1.0.2.exe'), 'signed-bytes');
    writeFileSync(
      path.join(dir, 'signing-receipt.json'),
      JSON.stringify(receiptFor('Setup-1.0.2.exe', 'signed-bytes')),
    );
    await expect(verifySignedPackageReceipt(receiptEnv, dir)).resolves.toMatchObject({
      packageVersion: '1.0.2',
    });
  }),
);

test(
  'rejects a receipt bound to a different source run',
  withArtifactDir({}, async dir => {
    writeFileSync(path.join(dir, 'Setup-1.0.2.exe'), 'signed-bytes');
    const receipt = { ...receiptFor('Setup-1.0.2.exe', 'signed-bytes'), sourceRunId: '1' };
    writeFileSync(path.join(dir, 'signing-receipt.json'), JSON.stringify(receipt));
    await expect(verifySignedPackageReceipt(receiptEnv, dir)).rejects.toThrow(
      'does not match the unsigned source run',
    );
  }),
);

test(
  'rejects a tampered installer',
  withArtifactDir({}, async dir => {
    writeFileSync(path.join(dir, 'Setup-1.0.2.exe'), 'tampered-bytes');
    writeFileSync(
      path.join(dir, 'signing-receipt.json'),
      JSON.stringify(receiptFor('Setup-1.0.2.exe', 'signed-bytes')),
    );
    await expect(verifySignedPackageReceipt(receiptEnv, dir)).rejects.toThrow(
      'failed integrity verification',
    );
  }),
);

test(
  'rejects an installer that is not listed in the receipt',
  withArtifactDir({}, async dir => {
    writeFileSync(path.join(dir, 'Setup-1.0.2.exe'), 'signed-bytes');
    writeFileSync(path.join(dir, 'extra.exe'), 'smuggled');
    writeFileSync(
      path.join(dir, 'signing-receipt.json'),
      JSON.stringify(receiptFor('Setup-1.0.2.exe', 'signed-bytes')),
    );
    await expect(verifySignedPackageReceipt(receiptEnv, dir)).rejects.toThrow(
      'unlisted installer',
    );
  }),
);

test(
  'rejects a missing receipt',
  withArtifactDir({ 'Setup-1.0.2.exe': 'signed-bytes' }, async dir => {
    await expect(verifySignedPackageReceipt(receiptEnv, dir)).rejects.toThrow(
      'missing a readable signing-receipt.json',
    );
  }),
);
