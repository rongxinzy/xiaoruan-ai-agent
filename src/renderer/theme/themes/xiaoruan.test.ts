import { expect, test } from 'vitest';
import { classicLight } from './classic-light';
import { classicDark } from './classic-dark';
import { DEFAULT_THEME_PLUGIN_ID, resolveThemePlugin, validateTheme } from './plugins';
import { xiaoruanDark, xiaoruanLight } from './xiaoruan';

test('the default brand package provides complete independent appearances', () => {
  expect(resolveThemePlugin(DEFAULT_THEME_PLUGIN_ID).appearances).toEqual({
    light: xiaoruanLight,
    dark: xiaoruanDark,
  });
  for (const [theme, base] of [[xiaoruanLight, classicLight], [xiaoruanDark, classicDark]]) {
    expect(() => validateTheme(theme)).not.toThrow();
    expect(theme.tokens.primary).not.toBe(base.tokens.primary);
    expect(theme.components['fluid-tab']).not.toBe(base.components['fluid-tab']);
  }
  expect(resolveThemePlugin('codex').appearances.light).toBe(classicLight);
  expect(resolveThemePlugin('codex').appearances.dark).toBe(classicDark);
});
