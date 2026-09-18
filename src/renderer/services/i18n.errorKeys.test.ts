import { afterEach, describe, expect, test } from 'vitest';

import { CoworkErrorKind, getUserErrorI18nKey } from '../../common/coworkError';
import { i18nService } from './i18n';

const CJK = /[\u4e00-\u9fff]/;

afterEach(() => {
  i18nService.setLanguage('zh', { persist: false });
});

describe('cowork error translations', () => {
  // Every kind can reach the error bubble, and the bubble shows the i18n text
  // for known kinds. i18nService.t() falls back to the raw key when a key is
  // absent from both catalogs, so a missing entry shows the user
  // "coworkErrorToolTimeout" instead of a sentence.
  test.each(Object.values(CoworkErrorKind))(
    'resolves %s to translated copy in both languages',
    kind => {
      const key = getUserErrorI18nKey(kind);

      i18nService.setLanguage('zh', { persist: false });
      const zh = i18nService.t(key);
      expect(zh, `${kind} must not fall back to its key`).not.toBe(key);
      expect(zh, `${kind} needs Chinese copy`).toMatch(CJK);

      i18nService.setLanguage('en', { persist: false });
      const en = i18nService.t(key);
      expect(en, `${kind} must not fall back to its key`).not.toBe(key);
      // English falling back to the Chinese catalog means the copy is missing.
      expect(CJK.test(en), `${kind} needs English copy`).toBe(false);
    },
  );
});
