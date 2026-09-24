import { describe, expect, test } from 'vitest';

import { ChatExecution, resolveChatExecution } from './chatExecutionRouter';

describe('resolveChatExecution', () => {
  test('returns direct when no skills and no session', () => {
    expect(resolveChatExecution({ activeSkillIds: [] })).toBe(ChatExecution.Direct);
  });

  test('returns agent when submission has skills', () => {
    expect(resolveChatExecution({ activeSkillIds: ['docx'] })).toBe(ChatExecution.Agent);
  });

  test('returns agent when session has persisted skill ids but submission has none', () => {
    expect(
      resolveChatExecution({
        activeSkillIds: [],
        session: { activeSkillIds: ['docx'] },
      }),
    ).toBe(ChatExecution.Agent);
  });

  test('returns direct when neither submission nor session has skills', () => {
    expect(
      resolveChatExecution({
        activeSkillIds: [],
        session: { activeSkillIds: [] },
      }),
    ).toBe(ChatExecution.Direct);
  });

  test('returns direct when session has no activeSkillIds field', () => {
    expect(resolveChatExecution({ activeSkillIds: [], session: {} })).toBe(ChatExecution.Direct);
  });

  test('returns direct when session is null', () => {
    expect(resolveChatExecution({ activeSkillIds: [], session: null })).toBe(ChatExecution.Direct);
  });
});
