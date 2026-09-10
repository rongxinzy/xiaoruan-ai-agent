import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { describe, expect, test } from 'vitest';

const retiredBrand = ['rongxin', 'ai'].join('');
const allowedTechnicalIdentifiers = [
  `rongxinzy/${retiredBrand}`,
  `${retiredBrand}.krli.org`,
  `${retiredBrand}-ui-adapter`,
  `${retiredBrand}-ci`,
];

describe('brand identity', () => {
  test('bundled model-facing instructions do not advertise the upstream brand', () => {
    const skillFiles = execFileSync('git', ['ls-files', ':(glob)SKILLs/**/SKILL.md'], {
      encoding: 'utf8',
    }).trim().split('\n').filter(Boolean);
    for (const filename of ['resources/SYSTEM_PROMPT.md', ...skillFiles]) {
      const text = fs.readFileSync(filename, 'utf8');
      expect(text, filename).not.toMatch(
        /容芯致远|北京容芯|(?:ZhiYuan|Zhiyuan)(?:\/Pi|\s)|zhiyuan_AutoResearch/,
      );
    }
  });

  test('uses the current product name in the renderer title', () => {
    expect(fs.readFileSync('index.html', 'utf8')).toContain('<title>晓软Agent</title>');
  });

  test('keeps the retired product name out of tracked copy', () => {
    const matches = execFileSync('git', ['grep', '-n', '-i', retiredBrand], {
      encoding: 'utf8',
    })
      .split(/\r?\n/u)
      .filter(Boolean);
    const violations = matches.filter(match => {
      const normalized = allowedTechnicalIdentifiers.reduce(
        (value, identifier) => value.replaceAll(identifier, ''),
        match.toLowerCase(),
      );
      return normalized.includes(retiredBrand);
    });

    expect(violations).toEqual([]);
  });
});
