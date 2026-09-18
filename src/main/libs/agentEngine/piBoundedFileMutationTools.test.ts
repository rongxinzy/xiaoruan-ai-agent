import { describe, expect, test, vi } from 'vitest';

import {
  createPiBoundedReadTool,
  PiReadLineLimit,
  PiReadResultCharacterLimit,
  type PiFileMutationToolDefinition,
} from './piBoundedFileMutationTools';

const createTool = (
  name: string,
  parameters: Record<string, unknown>,
): PiFileMutationToolDefinition => ({
  name,
  label: name,
  description: name,
  parameters,
  execute: vi.fn(async () => ({ content: [], details: undefined })),
});

describe('createPiBoundedReadTool', () => {
  test('limits read line requests and caps oversized tool output', async () => {
    const tool = createTool('read', {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'number' },
        limit: { type: 'number' },
      },
    });
    const output = `${'line\n'.repeat(PiReadResultCharacterLimit)}tail`;
    const execute = vi.fn(async () => ({ content: [{ type: 'text', text: output }], details: {} }));
    tool.execute = execute;
    const read = createPiBoundedReadTool(tool);

    const result = await read.execute('read-1', { path: 'notes.md', offset: 1, limit: 300 });

    expect(read.parameters.properties?.limit?.maximum).toBe(PiReadLineLimit);
    expect(execute).toHaveBeenCalledWith(
      'read-1',
      { path: 'notes.md', offset: 1, limit: 300 },
      undefined,
      undefined,
    );
    expect(result).toEqual(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining(`offset=${PiReadResultCharacterLimit / 5 + 1}`),
          }),
        ]),
      }),
    );
  });
});
