import fs from 'node:fs/promises';

const REPOSITORY = 'rongxinzy/xiaoruan-ai-agent';
const WORKFLOW_PATH = '.github/workflows/build-platforms.yml';
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`;

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

export async function verifyWindowsArtifactSource(env, fetchImpl = fetch) {
  const sourceRunId = env.SOURCE_RUN_ID;
  if (!/^\d+$/.test(sourceRunId || '')) throw new Error('SOURCE_RUN_ID must be numeric');
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Windows artifact reuse requires the Xiaoruan repository main branch');
  }
  if (!env.GH_TOKEN) throw new Error('GH_TOKEN is required');

  const run = await githubJson(fetchImpl, `${API_BASE}/actions/runs/${sourceRunId}`, env.GH_TOKEN);
  if (
    run.path !== WORKFLOW_PATH ||
    run.head_branch !== 'main' ||
    run.event !== 'workflow_dispatch' ||
    run.head_repository?.full_name !== REPOSITORY ||
    !/^[a-f0-9]{40}$/.test(run.head_sha || '')
  ) {
    throw new Error('Source run provenance is not an approved Windows build');
  }

  const jobs = await githubJson(
    fetchImpl,
    `${API_BASE}/actions/runs/${sourceRunId}/jobs?per_page=100`,
    env.GH_TOKEN,
  );
  const matchingJobs = (jobs.jobs || []).filter(job => /^build-platforms(?: \(windows,|$)/.test(job.name || ''));
  if (matchingJobs.length !== 1) throw new Error('Expected exactly one Windows build job');
  const job = matchingJobs[0];
  const requiredSteps = [
    'Build Windows',
    'Verify Windows package runtimes with a clean PATH',
    'Run actions/upload-artifact@v6',
  ];
  for (const name of requiredSteps) {
    const succeeded = (job.steps || []).some(
      candidate => candidate.name === name && candidate.conclusion === 'success',
    );
    if (!succeeded) throw new Error(`Required Windows step did not succeed: ${name}`);
  }

  const artifacts = await githubJson(
    fetchImpl,
    `${API_BASE}/actions/runs/${sourceRunId}/artifacts?per_page=100`,
    env.GH_TOKEN,
  );
  const windowsArtifacts = (artifacts.artifacts || []).filter(artifact => artifact.name === 'windows-build');
  if (windowsArtifacts.length !== 1 || windowsArtifacts[0].expired) {
    throw new Error('Expected one unexpired windows-build artifact');
  }

  return {
    sourceCommit: run.head_sha,
    sourceRunId,
    artifactId: String(windowsArtifacts[0].id),
  };
}

async function main() {
  const result = await verifyWindowsArtifactSource(process.env);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `source-commit=${result.sourceCommit}\nsource-run-id=${result.sourceRunId}\nartifact-id=${result.artifactId}\n`,
    );
  }
  console.log(`Verified Windows artifact ${result.artifactId} from source run ${result.sourceRunId}`);
}

if (process.argv[1]?.endsWith('verify-windows-artifact-source.mjs')) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
