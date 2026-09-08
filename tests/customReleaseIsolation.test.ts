import fs from 'node:fs';
import yaml from 'js-yaml';
import { expect, test } from 'vitest';

function workflow(name: string) {
  return yaml.load(fs.readFileSync(`.github/workflows/${name}.yml`, 'utf8')) as {
    jobs: Record<
      string,
      {
        if?: string;
        needs?: string[];
        uses?: string;
        environment?: string;
        env?: Record<string, string>;
      }
    >;
  };
}

test('candidate and official publishing workflows are removed', () => {
  for (const name of [
    'online-update-release',
    'release-candidate-promotion',
    'online-update-cleanup',
    'release-candidate',
  ]) {
    expect(fs.existsSync(`.github/workflows/${name}.yml`), name).toBe(false);
  }
});

test('the normal package workflow uploads only after its build dependency passes', () => {
  expect(workflow('build-platforms').jobs['upload-packages'].needs).toContain('build-platforms');
  expect(workflow('build-platforms').jobs['upload-packages'].uses).toBe(
    './.github/workflows/upload-custom-packages.yml',
  );
});

test('the normal private package build is Windows x64 only', () => {
  const content = fs.readFileSync('.github/workflows/build-platforms.yml', 'utf8');
  expect(content).toContain('runs-on: windows-latest');
  expect(content).toContain('engram:runtime:win-x64');
  expect(content).toContain('name: windows-build');
  expect(content).not.toContain('plan-platforms');
  expect(content).not.toContain('matrix:');
  expect(content).not.toContain('build_macos:');
  expect(content).not.toContain('build_linux:');
  expect(content).not.toContain('Build macOS');
  expect(content).not.toContain('Build Linux');
  expect(content).not.toContain('bun run dist:mac');
  expect(content).not.toContain('bun run dist:linux');
});

test('the custom upload job uses only dedicated storage and main-branch credentials', () => {
  const job = workflow('upload-custom-packages').jobs.upload;
  expect(job.environment).toBe('xiaoruan-release');
  expect(job.if).toContain("github.ref == 'refs/heads/main'");
  expect(job.if).toContain("github.repository == 'rongxinzy/xiaoruan-ai-agent'");
  expect(job.env?.R2_BUCKET).toBe('xiaoruan-releases');
  const content = fs.readFileSync('.github/workflows/upload-custom-packages.yml', 'utf8');
  expect(content).toContain('secrets.XIAORUAN_R2_ACCESS_KEY_ID');
  expect(content).toContain('secrets.XIAORUAN_R2_SECRET_ACCESS_KEY');
  expect(content).toContain('name: windows-build');
  expect(content).toContain('path: packages/windows-build');
  expect(content).not.toMatch(
    /zhiyuan-releases|rongxzyai\.com|secrets\.R2_ACCESS_KEY_ID|publish-update-manifest|wrangler pages/,
  );
});
