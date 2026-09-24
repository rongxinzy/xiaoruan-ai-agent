import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('../skillRuntimeRunner', () => ({ runManagedSkillScript: vi.fn() }));
import { runManagedSkillScript, type SkillScriptRunResult } from '../skillRuntimeRunner';
import { buildPiSkillScriptTool } from './piSkillScriptTool';

const failedResult: SkillScriptRunResult = {
  ok: false,
  status: 'failed',
  errorCode: 'SKILL_SCRIPT_FAILED',
  error: 'exit code 1',
  runtime: 'python',
  command: '/managed/python',
  args: [],
  scriptPath: '/skills/text-to-cad/check.py',
  exitCode: 1,
  stdout: 'partial output',
  stderr: 'dependency failure',
  durationMs: 1,
  timedOut: false,
};

beforeEach(() => {
  vi.mocked(runManagedSkillScript).mockReset();
});

test('propagates failed script results as tool errors', async () => {
  vi.mocked(runManagedSkillScript).mockResolvedValue(failedResult);
  const tool = buildPiSkillScriptTool({
    workspaceRoot: '/workspace',
    allowedSkillIds: ['text-to-cad'],
    skillRoots: { 'text-to-cad': '/skills/experts' },
  }) as {
    execute: (
      toolCallId: string,
      params: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<unknown>;
  };

  await expect(tool.execute('call', { skillId: 'text-to-cad', script: 'check.py' })).rejects.toThrow(
    'SKILL_SCRIPT_FAILED',
  );
  expect(runManagedSkillScript).toHaveBeenCalledWith(
    expect.objectContaining({ skillsRoot: '/skills/experts' }),
  );
});

test('rejects scripts from skills that are not selected', async () => {
  const tool = buildPiSkillScriptTool({ workspaceRoot: '/workspace', allowedSkillIds: [] }) as {
    execute: (
      toolCallId: string,
      params: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<unknown>;
  };

  await expect(tool.execute('call', { skillId: 'text-to-cad', script: 'check.py' })).rejects.toThrow(
    'SKILL_NOT_SELECTED',
  );
  expect(runManagedSkillScript).not.toHaveBeenCalled();
});
