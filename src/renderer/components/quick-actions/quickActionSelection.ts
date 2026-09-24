import type { Skill } from '../../types/skill';

/** Structural minimum shared by the raw config entry and its localized form. */
export interface QuickActionSkillSource {
  id: string;
  skillMapping: string;
  skillIds?: string[];
}

export const quickActionSkillIds = (action: QuickActionSkillSource): string[] =>
  action.skillIds?.length ? action.skillIds : [action.skillMapping];

/**
 * Resolves the quick action (instance) a Chat shortcut activates.
 *
 * Derived from the configuration on purpose: the previous hand-written
 * shortcut→action table silently dropped a shortcut's instance panel whenever
 * an entry was missing, and a stale entry could point at an action running a
 * different skill, which attached a second skill badge on top of the
 * shortcut's own skill.
 *
 * The action sharing the shortcut's id wins; otherwise the action running
 * exactly the shortcut's skills matches. Several actions may map to the same
 * skill (education and website both use frontend-design), so an exact set
 * match — not a subset — is required.
 */
export const findQuickActionForShortcut = <T extends QuickActionSkillSource>(
  actions: T[],
  shortcutId: string,
  shortcutSkillIds: readonly string[],
): T | undefined =>
  actions.find(action => action.id === shortcutId) ??
  actions.find(action => {
    const skillIds = quickActionSkillIds(action);
    return (
      skillIds.length === shortcutSkillIds.length &&
      skillIds.every(skillId => shortcutSkillIds.includes(skillId))
    );
  });

/** Every skill of the action's bundle is attached to the input right now. */
export const isQuickActionBundleActive = (
  action: QuickActionSkillSource,
  activeSkillIds: readonly string[],
): boolean => quickActionSkillIds(action).every(skillId => activeSkillIds.includes(skillId));

/** Every skill of the action's bundle is installed and enabled. */
export const isQuickActionBundleAvailable = (
  action: QuickActionSkillSource,
  skills: Skill[],
): boolean =>
  quickActionSkillIds(action).every(skillId =>
    skills.some(skill => skill.id === skillId && skill.enabled),
  );

/** The attached skills are exactly this action's bundle, in any order. */
export const isQuickActionBundleSelected = (
  action: QuickActionSkillSource,
  activeSkillIds: readonly string[],
): boolean =>
  activeSkillIds.length === quickActionSkillIds(action).length &&
  isQuickActionBundleActive(action, activeSkillIds);

/** What the home instance effect must do for the current selection. */
export const QuickActionEffect = {
  /** The bundle cannot be attached at all (skill still loading, or not installed):
   *  keep the prompt-only instance panel and leave the selection unopened. */
  Wait: 'wait',
  /** The instance is (or is becoming) open: mark the selection as opened and make
   *  sure its skill bundle is attached. Both are required — an instance whose
   *  bundle is already attached must still be marked, otherwise a later detach
   *  would look like a fresh selection and re-attach the removed skill. */
  Open: 'open',
  /** The instance lost its skills (removed, disabled, or deleted): close it and
   *  bring the instance chips back. */
  Close: 'close',
} as const;
export type QuickActionEffect = (typeof QuickActionEffect)[keyof typeof QuickActionEffect];

export const resolveQuickActionEffect = (params: {
  action: QuickActionSkillSource;
  /** This selection already took effect, i.e. the instance panel is open. */
  activated: boolean;
  activeSkillIds: readonly string[];
  skills: Skill[];
}): QuickActionEffect => {
  const { action, activated, activeSkillIds, skills } = params;
  const bundleActive = isQuickActionBundleActive(action, activeSkillIds);

  if (activated) {
    const bundleReady = bundleActive && isQuickActionBundleAvailable(action, skills);
    return bundleReady ? QuickActionEffect.Open : QuickActionEffect.Close;
  }

  // Not opened yet: a bundle that cannot be attached at all keeps the prompt-only
  // panel instead of closing it.
  return isQuickActionBundleAvailable(action, skills) ? QuickActionEffect.Open : QuickActionEffect.Wait;
};
