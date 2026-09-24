import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

import { CHAT_SKILL_SHORTCUTS, getChatSkillShortcutIds } from '../chat/constants';
import {
  findQuickActionForShortcut,
  isQuickActionBundleActive,
  isQuickActionBundleAvailable,
  isQuickActionBundleSelected,
  QuickActionEffect,
  quickActionSkillIds,
  resolveQuickActionEffect,
} from './quickActionSelection';

const action = {
  id: 'education',
  label: 'Education & Learning',
  icon: 'GraduationCap',
  color: '#10B981',
  skillMapping: 'frontend-design',
  prompts: [],
};

const skill = {
  id: 'frontend-design',
  name: 'Frontend Design',
  description: '',
  enabled: true,
  pinned: false,
  isOfficial: true,
  isBuiltIn: true,
  updatedAt: 0,
  prompt: '',
  skillPath: '',
};

const quickActionsConfig = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../public/quick-actions.json', import.meta.url)),
    'utf8',
  ),
) as { actions: Array<{ id: string; skillMapping: string; skillIds?: string[] }> };

test('treats a bundle as active only while every skill stays attached', () => {
  const researchAction = {
    id: 'academic-research',
    skillMapping: 'deli-autoresearch',
    skillIds: ['deli-autoresearch', 'deep-research', 'web-search'],
  };

  expect(quickActionSkillIds(researchAction)).toEqual(researchAction.skillIds);
  expect(isQuickActionBundleActive(researchAction, [...researchAction.skillIds])).toBe(true);
  // Removing any one of the instance's skills closes it.
  expect(isQuickActionBundleActive(researchAction, ['deli-autoresearch'])).toBe(false);
  expect(isQuickActionBundleActive(action, [])).toBe(false);
  expect(isQuickActionBundleActive(action, ['frontend-design'])).toBe(true);
});

test('treats a bundle as attachable only while every skill is installed and enabled', () => {
  expect(isQuickActionBundleAvailable(action, [skill])).toBe(true);
  expect(isQuickActionBundleAvailable(action, [])).toBe(false);
  expect(isQuickActionBundleAvailable(action, [{ ...skill, enabled: false }])).toBe(false);
});

test('treats a bundle as selected only for an exact match', () => {
  expect(isQuickActionBundleSelected(action, ['frontend-design'])).toBe(true);
  expect(isQuickActionBundleSelected(action, ['frontend-design', 'docx'])).toBe(false);
  expect(isQuickActionBundleSelected(action, [])).toBe(false);
});

test('attaches the bundle for a fresh selection and waits while it is unavailable', () => {
  expect(resolveQuickActionEffect({ action, activated: false, activeSkillIds: [], skills: [skill] })).toBe(
    QuickActionEffect.Open,
  );
  // A skill that is still loading or not installed keeps the prompt-only panel
  // instead of closing it.
  expect(resolveQuickActionEffect({ action, activated: false, activeSkillIds: [], skills: [] })).toBe(
    QuickActionEffect.Wait,
  );
  // The Chat shortcut attaches the bundle in the same tick as the selection, so
  // the instance must open (and be marked as opened) without attaching again.
  expect(
    resolveQuickActionEffect({
      action,
      activated: false,
      activeSkillIds: ['frontend-design'],
      skills: [skill],
    }),
  ).toBe(QuickActionEffect.Open);
});

test('keeps an open instance while its skills stay attached', () => {
  expect(
    resolveQuickActionEffect({
      action,
      activated: true,
      activeSkillIds: ['frontend-design'],
      skills: [skill],
    }),
  ).toBe(QuickActionEffect.Open);
});

test('closes an open instance as soon as one of its skills goes away', () => {
  // Detached by the user.
  expect(
    resolveQuickActionEffect({ action, activated: true, activeSkillIds: [], skills: [skill] }),
  ).toBe(QuickActionEffect.Close);
  // Disabled or deleted: still listed as attached, but no longer available.
  expect(
    resolveQuickActionEffect({
      action,
      activated: true,
      activeSkillIds: ['frontend-design'],
      skills: [],
    }),
  ).toBe(QuickActionEffect.Close);
});

test('every chat shortcut opens an instance running exactly its skills', () => {
  for (const shortcut of CHAT_SKILL_SHORTCUTS) {
    const shortcutSkillIds = getChatSkillShortcutIds(shortcut);
    const resolved = findQuickActionForShortcut(
      quickActionsConfig.actions,
      shortcut.id,
      shortcutSkillIds,
    );

    expect(resolved, `shortcut ${shortcut.id} has no instance`).toBeDefined();
    // An instance whose bundle differs from the shortcut's would attach a second
    // skill badge next to the shortcut's own skill.
    expect(quickActionSkillIds(resolved!), `shortcut ${shortcut.id}`).toEqual([
      ...shortcutSkillIds,
    ]);
  }
});

test('the slides shortcut and instance share presentation-studio', () => {
  const slides = quickActionsConfig.actions.find(action => action.id === 'pptx');

  expect(slides?.skillMapping).toBe('presentation-studio');
  expect(
    findQuickActionForShortcut(quickActionsConfig.actions, 'ppt', ['presentation-studio'])?.id,
  ).toBe('pptx');
});

test('an id-colliding shortcut resolves to its own instance, not the first bundle match', () => {
  // education and website both run frontend-design, and education comes first in
  // the configuration: only the id match can keep the website shortcut on its own
  // instance (label and prompt set differ).
  expect(
    findQuickActionForShortcut(quickActionsConfig.actions, 'website', ['frontend-design'])?.id,
  ).toBe('website');
});

test('every quick action maps to a bundled skill', () => {
  for (const configAction of quickActionsConfig.actions) {
    for (const skillId of quickActionSkillIds(configAction)) {
      expect(
        existsSync(fileURLToPath(new URL(`../../../../SKILLs/${skillId}/SKILL.md`, import.meta.url))),
        `${configAction.id} maps to unbundled skill ${skillId}`,
      ).toBe(true);
    }
  }
});
