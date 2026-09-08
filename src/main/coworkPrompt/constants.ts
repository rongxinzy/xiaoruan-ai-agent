export const CoworkManagedPromptMarker = {
  IdentityStart: '<cowork-managed-identity>',
  IdentityEnd: '</cowork-managed-identity>',
  ScheduledTasksStart: '<cowork-managed-scheduled-tasks>',
  ScheduledTasksEnd: '</cowork-managed-scheduled-tasks>',
  ExpertsStart: '<cowork-managed-experts>',
  ExpertsEnd: '</cowork-managed-experts>',
} as const;

// Unlike managed additions, this block belongs to the bundled base prompt and
// survives recomposition, including switching to an expert and back.
export const CoworkBundledPromptMarker = {
  IdentityStart: '<cowork-bundled-identity>',
  IdentityEnd: '</cowork-bundled-identity>',
} as const;
