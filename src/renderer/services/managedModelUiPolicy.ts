export function filterManagedModelSettingsTabs<T extends { readonly key: string }>(
  tabs: readonly T[],
  _managedModelsOnly: boolean,
): T[] {
  return [...tabs];
}

export function resolveManagedModelSettingsTab<T extends string>(
  activeTab: T,
  _managedModelsOnly: boolean,
  _enterpriseTab: T | undefined,
): T {
  return activeTab;
}

export function shouldShowLocalInferenceNavigation(
  isChatMode: boolean,
  managedModelsOnly: boolean,
): boolean {
  return !isChatMode && !managedModelsOnly;
}
