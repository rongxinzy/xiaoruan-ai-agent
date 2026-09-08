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

test('every job in inherited official publishing and cleanup workflows is disabled', () => {
  for (const name of [
    'online-update-release',
    'release-candidate-promotion',
    'online-update-cleanup',
  ]) {
    const jobs = Object.values(workflow(name).jobs);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) expect(job.if, name).toBe('${{ false }}');
  }
});

test('both package workflows upload only after their verification dependencies pass', () => {
  expect(workflow('build-platforms').jobs['upload-packages'].needs).toContain('build-platforms');
  expect(workflow('release-candidate').jobs['upload-packages'].needs).toContain('verify-candidate');
  for (const name of ['build-platforms', 'release-candidate']) {
    expect(workflow(name).jobs['upload-packages'].uses).toBe(
      './.github/workflows/upload-custom-packages.yml',
    );
  }
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
  expect(content).not.toMatch(
    /zhiyuan-releases|rongxzyai\.com|secrets\.R2_ACCESS_KEY_ID|publish-update-manifest|wrangler pages/,
  );
});
