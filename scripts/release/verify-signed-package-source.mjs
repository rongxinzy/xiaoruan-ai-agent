import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const REPOSITORY = 'rongxinzy/xiaoruan-ai-agent';
const SIGNING_REPOSITORY = 'rongxinzy/RongxinAI';
const SIGNING_WORKFLOW_PATH = '.github/workflows/sign-xiaoruan-windows.yml';
const SIGNED_ARTIFACT = 'signed-windows-build';
const RECEIPT_NAME = 'signing-receipt.json';
const RECEIPT_VERSION = 1;

async function githubJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}): ${url}`);
  return response.json();
}

/**
 * Verifies that SIGNED_RUN_ID is a successful central signing run on the
 * ZhiYuan main branch carrying exactly one unexpired signed-windows-build
 * artifact. Returns the artifact identity for the download step.
 */
export async function verifySignedPackageSource(env, fetchImpl = fetch) {
  const signedRunId = env.SIGNED_RUN_ID;
  if (!/^\d+$/.test(signedRunId || '')) throw new Error('SIGNED_RUN_ID must be numeric');
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Signed package uploads require the Xiaoruan repository main branch');
  }
  if (!env.GH_TOKEN) throw new Error('GH_TOKEN (ZHIYUAN_ARTIFACT_READ_TOKEN) is required');

  const apiBase = `https://api.github.com/repos/${SIGNING_REPOSITORY}`;
  const run = await githubJson(fetchImpl, `${apiBase}/actions/runs/${signedRunId}`, env.GH_TOKEN);
  if (
    run.path !== SIGNING_WORKFLOW_PATH ||
    run.head_branch !== 'main' ||
    run.event !== 'workflow_dispatch' ||
    run.head_repository?.full_name !== SIGNING_REPOSITORY ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  ) {
    throw new Error('Signed run provenance is not an approved Xiaoruan signing run');
  }

  const jobs = await githubJson(
    fetchImpl,
    `${apiBase}/actions/runs/${signedRunId}/jobs?per_page=100`,
    env.GH_TOKEN,
  );
  const signJobs = (jobs.jobs || []).filter(job => job.name === 'sign');
  if (signJobs.length !== 1) throw new Error('Expected exactly one signing job');
  const requiredSteps = [
    'Build signed Windows package',
    'Verify Windows Authenticode signatures',
    'Run actions/upload-artifact@v6',
  ];
  for (const name of requiredSteps) {
    const succeeded = (signJobs[0].steps || []).some(
      candidate => candidate.name === name && candidate.conclusion === 'success',
    );
    if (!succeeded) throw new Error(`Required signing step did not succeed: ${name}`);
  }

  const artifacts = await githubJson(
    fetchImpl,
    `${apiBase}/actions/runs/${signedRunId}/artifacts?per_page=100`,
    env.GH_TOKEN,
  );
  const signedArtifacts = (artifacts.artifacts || []).filter(
    artifact => artifact.name === SIGNED_ARTIFACT,
  );
  if (signedArtifacts.length !== 1 || signedArtifacts[0].expired) {
    throw new Error('Expected one unexpired signed-windows-build artifact');
  }

  return { signingRunId: signedRunId, artifactId: String(signedArtifacts[0].id) };
}

async function sha256File(file) {
  return createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

/**
 * Verifies the signing receipt shipped inside the signed artifact: it must
 * point at the unsigned source run/commit being published, and every listed
 * installer must exist with a matching SHA-256 and size. Unlisted installers
 * in the directory are rejected so nothing smuggles into the bucket.
 */
export async function verifySignedPackageReceipt(env, directory) {
  const receiptPath = path.join(directory, RECEIPT_NAME);
  let receipt;
  try {
    receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  } catch {
    throw new Error(`Signed artifact is missing a readable ${RECEIPT_NAME}`);
  }
  if (receipt.version !== RECEIPT_VERSION) throw new Error('Unsupported signing receipt version');
  if (receipt.sourceRepository !== REPOSITORY) {
    throw new Error('Signing receipt names an unexpected source repository');
  }
  if (receipt.sourceRunId !== env.SOURCE_RUN_ID) {
    throw new Error('Signing receipt does not match the unsigned source run');
  }
  if (!/^[a-f0-9]{40}$/.test(receipt.sourceSha || '') || receipt.sourceSha !== env.PACKAGE_SOURCE_COMMIT) {
    throw new Error('Signing receipt does not match the unsigned source commit');
  }
  if (!receipt.packageVersion) throw new Error('Signing receipt is missing the package version');
  if (receipt.signingRepository !== SIGNING_REPOSITORY) {
    throw new Error('Signing receipt names an unexpected signing repository');
  }
  if (receipt.signingRunId !== env.SIGNED_RUN_ID) {
    throw new Error('Signing receipt does not match the signing run');
  }
  if (!Array.isArray(receipt.files) || receipt.files.length === 0) {
    throw new Error('Signing receipt lists no installers');
  }

  const seen = new Set();
  for (const entry of receipt.files) {
    if (
      !entry ||
      path.basename(entry.name || '') !== entry.name ||
      !entry.name.toLowerCase().endsWith('.exe') ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 || '') ||
      !Number.isSafeInteger(entry.size) ||
      entry.size <= 0
    ) {
      throw new Error('Signing receipt contains an invalid file entry');
    }
    if (seen.has(entry.name)) throw new Error('Signing receipt lists a duplicate installer');
    seen.add(entry.name);
    const file = path.join(directory, entry.name);
    const stat = await fs.stat(file).catch(() => {
      throw new Error(`Signed installer missing from artifact: ${entry.name}`);
    });
    if (stat.size !== entry.size || (await sha256File(file)) !== entry.sha256) {
      throw new Error(`Signed installer failed integrity verification: ${entry.name}`);
    }
  }

  const onDisk = (await fs.readdir(directory)).filter(name => name.toLowerCase().endsWith('.exe'));
  for (const name of onDisk) {
    if (!seen.has(name)) throw new Error(`Signed artifact carries an unlisted installer: ${name}`);
  }
  return receipt;
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'receipt') {
    const directory = path.resolve(process.argv[3] || 'packages/signed-windows-build');
    const receipt = await verifySignedPackageReceipt(process.env, directory);
    console.log(
      `Verified signing receipt for ${receipt.files.length} installer(s) ` +
        `from signing run ${receipt.signingRunId} (source run ${receipt.sourceRunId})`,
    );
    return;
  }
  const result = await verifySignedPackageSource(process.env);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `signing-run-id=${result.signingRunId}\nartifact-id=${result.artifactId}\n`,
    );
  }
  console.log(
    `Verified signed artifact ${result.artifactId} from signing run ${result.signingRunId}`,
  );
}

if (process.argv[1]?.endsWith('verify-signed-package-source.mjs')) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
