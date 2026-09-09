import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CUSTOM_BUCKET = 'xiaoruan-releases';
export const CUSTOM_PUBLIC_BASE_URL = 'https://pub-d84d8bc650334c12afc7ce47bc8fcdda.r2.dev';
const CUSTOM_REPOSITORY = 'rongxinzy/xiaoruan-ai-agent';
const PACKAGE_EXTENSIONS = new Set(['.exe', '.dmg', '.deb', '.appimage']);
const MAX_OBJECT_BYTES = 5 * 1024 ** 3;

export function uploadIdentity(env) {
  const sourceCommit = env.PACKAGE_SOURCE_COMMIT || env.GITHUB_SHA;
  if (env.GITHUB_REPOSITORY !== CUSTOM_REPOSITORY || env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Custom package uploads require the Xiaoruan repository main branch');
  }
  if (env.R2_BUCKET !== CUSTOM_BUCKET) throw new Error('Only xiaoruan-releases is allowed');
  if (!/^[a-f0-9]{32}$/.test(env.XIAORUAN_R2_ACCOUNT_ID || '')) {
    throw new Error('XIAORUAN_R2_ACCOUNT_ID is required');
  }
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')
    || !/^\d+$/.test(env.GITHUB_RUN_ID || '')
    || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '')) {
    throw new Error('Invalid immutable build identity');
  }
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('Dedicated Xiaoruan R2 credentials are required');
  }
  return {
    endpoint: `https://${env.XIAORUAN_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    sourceCommit,
    prefix: `builds/${sourceCommit}/${env.GITHUB_RUN_ID}/${env.GITHUB_RUN_ATTEMPT}`,
  };
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function collectPackages(root, expectedArtifacts) {
  const result = [];
  const groups = await fsp.readdir(root, { withFileTypes: true });
  if (!Number.isInteger(expectedArtifacts) || expectedArtifacts < 1
    || groups.length !== expectedArtifacts) {
    throw new Error('Downloaded platform artifact count does not match the build plan');
  }
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Package artifacts must not contain symlinks');
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && PACKAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const relativePath = path.relative(root, file).split(path.sep).join('/');
        if (/[\r\n\x00-\x1f]/u.test(relativePath)) throw new Error('Invalid artifact filename');
        const { size } = await fsp.stat(file);
        if (size === 0 || size > MAX_OBJECT_BYTES) throw new Error('Package size is outside upload limits');
        result.push({ file, relativePath, size, sha256: await sha256(file) });
      }
    }
  }
  for (const group of groups) {
    if (!group.isDirectory() || group.isSymbolicLink()) throw new Error('Expected platform artifact directories');
    const previousCount = result.length;
    await walk(path.join(root, group.name));
    if (result.length === previousCount) throw new Error(`No installer in platform artifact: ${group.name}`);
  }
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function uploadCustomPackages({ root, expectedArtifacts, env = process.env, runAws, outputDirectory }) {
  const identity = uploadIdentity(env);
  const aws = runAws || (args => {
    const result = spawnSync('aws', [
      '--endpoint-url', identity.endpoint, '--region', 'auto', ...args,
    ], { encoding: 'utf8', env: { ...env, AWS_PAGER: '', AWS_MAX_ATTEMPTS: '5' } });
    if (result.error) throw result.error;
    return result;
  });
  const packages = await collectPackages(root, expectedArtifacts);
  const objects = [];
  async function upload(file, key, size, digest) {
    const headArgs = ['s3api', 'head-object', '--bucket', CUSTOM_BUCKET, '--key', key, '--output', 'json'];
    let head = aws(headArgs);
    if (head.status !== 0) {
      if (!/404|Not Found|NoSuchKey/i.test(head.stderr || '')) throw new Error(`Cannot inspect R2 object: ${key}`);
      const put = aws([
        's3api', 'put-object', '--bucket', CUSTOM_BUCKET, '--key', key,
        '--body', file, '--metadata', `sha256=${digest}`, '--if-none-match', '*',
        '--content-type', key.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      ]);
      if (put.status !== 0) throw new Error(`R2 upload failed: ${key}`);
      head = aws(headArgs);
    }
    if (head.status !== 0) throw new Error(`Cannot verify R2 object: ${key}`);
    const remote = JSON.parse(head.stdout);
    if (remote.ContentLength !== size || remote.Metadata?.sha256 !== digest) {
      throw new Error(`R2 content conflict or verification failure: ${key}`);
    }
  }
  for (const entry of packages) {
    const key = `${identity.prefix}/${entry.relativePath}`;
    await upload(entry.file, key, entry.size, entry.sha256);
    const downloadUrl = `${CUSTOM_PUBLIC_BASE_URL}/${key.split('/').map(encodeURIComponent).join('/')}`;
    objects.push({ key, size: entry.size, sha256: entry.sha256, downloadUrl });
  }
  const manifest = {
    repository: env.GITHUB_REPOSITORY,
    commit: identity.sourceCommit,
    runId: env.GITHUB_RUN_ID,
    sourceRunId: env.SOURCE_BUILD_RUN_ID || env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    bucket: CUSTOM_BUCKET,
    objects,
  };
  await fsp.mkdir(outputDirectory, { recursive: true });
  const manifestPath = path.join(outputDirectory, 'packages.json');
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestKey = `${identity.prefix}/packages.json`;
  await upload(manifestPath, manifestKey, (await fsp.stat(manifestPath)).size, await sha256(manifestPath));
  if (env.GITHUB_STEP_SUMMARY) {
    await fsp.appendFile(env.GITHUB_STEP_SUMMARY,
      `### Xiaoruan installer downloads\n\n- Bucket: \`${CUSTOM_BUCKET}\`\n- Commit: \`${identity.sourceCommit}\`\n- Manifest: \`${manifestKey}\`\n\n`
      + objects.map((entry, index) => `- [Download installer ${index + 1}](${entry.downloadUrl}) (${entry.size} bytes)\n  - SHA-256: \`${entry.sha256}\`\n`).join(''));
  }
  console.log(`Verified ${objects.length} packages in ${CUSTOM_BUCKET}/${identity.prefix}`);
  for (const entry of objects) console.log(`Public download: ${entry.downloadUrl}`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  uploadCustomPackages({
    root: path.resolve(process.argv[2] || 'packages'),
    expectedArtifacts: Number(process.argv[3]),
    outputDirectory: path.resolve('custom-upload-receipt'),
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
