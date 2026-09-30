import fs from 'node:fs/promises';
import path from 'node:path';

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
  const runtimeDirectory = path.join(cacheRoot, version);
  const completionPath = path.join(runtimeDirectory, '.ready');
  try {
    await fs.access(completionPath);
    await fs.access(path.join(runtimeDirectory, 'electron.exe'));
    return runtimeDirectory;
  } catch {
    // A completed copy is required before using the isolated runtime.
  }

  await fs.mkdir(cacheRoot, { recursive: true });
  const stagingDirectory = await fs.mkdtemp(path.join(cacheRoot, `${version}-staging-`));
  await fs.cp(sourceDirectory, stagingDirectory, { recursive: true });
  await fs.writeFile(path.join(stagingDirectory, '.ready'), `${version}\n`);
  await fs.rename(stagingDirectory, runtimeDirectory);
  console.log('[ElectronDev] Prepared an isolated runtime for shared Windows dependencies.');
  return runtimeDirectory;
}
