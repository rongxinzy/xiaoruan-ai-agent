import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPOSITORY = 'rongxinzy/xiaoruan-ai-agent';
const DOWNLOAD_DIRECTORY = 'packages/signed-windows-build';

function runGh(args, env) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: env.GH_TOKEN },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifySignedReleaseSource(env) {
  const tag = env.SIGNED_RELEASE_TAG;
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(tag || '')) {
    throw new Error('SIGNED_RELEASE_TAG is required and must be a valid tag name');
  }
  if (!/^[a-f0-9]{64}$/.test(env.SIGNED_SHA256 || '')) {
    throw new Error('SIGNED_SHA256 must be the lowercase SHA-256 of the signed installer');
  }
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Signed installer uploads require the Xiaoruan repository main branch');
  }
  if (!env.GH_TOKEN) throw new Error('GH_TOKEN is required');
  if (env.SIGNED_SOURCE_RUN_ID && !/^\d+$/.test(env.SIGNED_SOURCE_RUN_ID)) {
    throw new Error('SIGNED_SOURCE_RUN_ID must be numeric');
  }

  const release = JSON.parse(runGh(
    ['release', 'view', tag, '--repo', REPOSITORY, '--json', 'targetCommitish,assets'],
    env,
  ));
  if (!/^[a-f0-9]{40}$/.test(release.targetCommitish || '')) {
    throw new Error('Signed installer release must target a full commit SHA');
  }
  const installerAssets = (release.assets || []).filter(asset =>
    typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.exe'));
  if (installerAssets.length !== 1) {
    throw new Error(`Expected exactly one .exe asset on release ${tag}, found ${installerAssets.length}`);
  }

  const directory = path.resolve(DOWNLOAD_DIRECTORY);
  await fsp.rm(directory, { recursive: true, force: true });
  await fsp.mkdir(directory, { recursive: true });
  runGh([
    'release', 'download', tag, '--repo', REPOSITORY,
    '--pattern', '*.exe', '--dir', directory, '--clobber',
  ], env);

  const downloaded = (await fsp.readdir(directory)).filter(name => name.toLowerCase().endsWith('.exe'));
  if (downloaded.length !== 1) throw new Error('Signed installer download did not produce exactly one .exe');
  const installerPath = path.join(directory, downloaded[0]);
  const digest = await sha256(installerPath);
  if (digest !== env.SIGNED_SHA256) {
    throw new Error(`Signed installer SHA-256 mismatch: expected ${env.SIGNED_SHA256}, got ${digest}`);
  }

  return {
    sourceCommit: release.targetCommitish,
    sourceRunId: env.SIGNED_SOURCE_RUN_ID || env.GITHUB_RUN_ID,
    installer: downloaded[0],
  };
}

async function main() {
  const result = await verifySignedReleaseSource(process.env);
  if (process.env.GITHUB_OUTPUT) {
    await fsp.appendFile(
      process.env.GITHUB_OUTPUT,
      `source-commit=${result.sourceCommit}\nsource-run-id=${result.sourceRunId}\n`,
    );
  }
  console.log(`Verified signed installer ${result.installer} from release ${process.env.SIGNED_RELEASE_TAG}`);
}

if (process.argv[1]?.endsWith('verify-signed-release-source.mjs')) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
