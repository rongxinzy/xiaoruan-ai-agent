import fs from 'node:fs/promises';
import path from 'node:path';

/** A published runtime is only reusable when the marker and the binary are both present. */
async function isUsableRuntime(runtimeDirectory) {
  try {
    await fs.access(path.join(runtimeDirectory, '.ready'));
    await fs.access(path.join(runtimeDirectory, 'electron.exe'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Publishes a complete copy of the runtime under `cacheRoot/<version>`.
 *
 * Exported for tests: the cache has to survive an interrupted or half-removed
 * copy, and two concurrent first starts must agree on one directory instead of
 * failing the later publisher.
 */
export async function publishRuntimeCache({ sourceDirectory, cacheRoot, version }) {
  const runtimeDirectory = path.join(cacheRoot, version);
  if (await isUsableRuntime(runtimeDirectory)) return runtimeDirectory;

  // A directory that exists without a usable runtime is a leftover from an
  // interrupted copy (the marker can survive while the binary is missing), and
  // `rename` cannot replace a non-empty directory, so it has to go first.
  if (await fs.stat(runtimeDirectory).then(() => true, () => false)) {
    try {
      await fs.rm(runtimeDirectory, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `Cannot rebuild the Electron development runtime at ${runtimeDirectory}; close any process using it and retry. (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  await fs.mkdir(cacheRoot, { recursive: true });
  const stagingDirectory = await fs.mkdtemp(path.join(cacheRoot, `${version}-staging-`));
  try {
    await fs.cp(sourceDirectory, stagingDirectory, { recursive: true });
    await fs.writeFile(path.join(stagingDirectory, '.ready'), `${version}\n`);
    try {
      await fs.rename(stagingDirectory, runtimeDirectory);
    } catch (error) {
      // Another process publishing the same version wins the rename; its
      // directory is complete by construction, so reuse it instead of failing.
      if (await isUsableRuntime(runtimeDirectory)) return runtimeDirectory;
      throw error;
    }
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }

  console.log('[ElectronDev] Prepared an isolated runtime for shared Windows dependencies.');
  return runtimeDirectory;
}

/** Keep a junction-backed Windows runtime in this checkout's own permissions. */
export async function resolveElectronDevelopmentRuntime(projectRoot) {
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    return process.env.ELECTRON_OVERRIDE_DIST_PATH;
  }
  if (process.platform !== 'win32') return undefined;

  const dependencyDirectory = path.join(projectRoot, 'node_modules');
  const dependencyStat = await fs.lstat(dependencyDirectory);
  if (!dependencyStat.isSymbolicLink()) return undefined;

  const sourceDirectory = path.join(dependencyDirectory, 'electron', 'dist');
  const version = (await fs.readFile(path.join(sourceDirectory, 'version'), 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    throw new Error('The installed Electron runtime has an invalid version.');
  }
  const cacheRoot = path.join(projectRoot, '.cache', 'electron-development');
  return publishRuntimeCache({ sourceDirectory, cacheRoot, version });
}
