import { describe, expect, test, vi } from 'vitest';

import {
  createPiBoundedFileMutationTools,
  createPiBoundedReadTool,
  PiFileMutationCharacterLimit,
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

const createTools = (): {
  write: PiFileMutationToolDefinition;
  edit: PiFileMutationToolDefinition;
} => ({
  write: createTool('write', {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
  }),
  edit: createTool('edit', {
    type: 'object',
    properties: {
      path: { type: 'string' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            oldText: { type: 'string' },
            newText: { type: 'string' },
          },
        },
      },
    },
  }),
});

describe('createPiBoundedFileMutationTools', () => {
  test('publishes 4000-character JSON schema limits for write and edit', () => {
    const bounded = createPiBoundedFileMutationTools(createTools());
    const writeParameters = bounded[0].parameters;
    const editParameters = bounded[1].parameters;

    expect(writeParameters.properties?.content?.maxLength).toBe(PiFileMutationCharacterLimit);
    expect(editParameters.properties?.edits?.items?.properties?.newText?.maxLength).toBe(
      PiFileMutationCharacterLimit,
    );
  });

  test('delegates a write within the limit to Pi built-in behavior', async () => {
    const tools = createTools();
    const [write] = createPiBoundedFileMutationTools(tools);
    const params = { path: 'notes.md', content: 'hello' };

    await write.execute('write-1', params);

    expect(tools.write.execute).toHaveBeenCalledWith('write-1', params, undefined, undefined);
  });

  test('blocks an oversized write before Pi can mutate a file', async () => {
    const tools = createTools();
    const [write] = createPiBoundedFileMutationTools(tools);

    await expect(
      write.execute('write-1', {
        path: 'notes.md',
        content: 'a'.repeat(PiFileMutationCharacterLimit + 1),
      }),
    ).rejects.toThrow('must be at most 4000 characters');
    expect(tools.write.execute).not.toHaveBeenCalled();
  });

  test('blocks an oversized edit replacement before Pi can mutate a file', async () => {
    const tools = createTools();
    const [, edit] = createPiBoundedFileMutationTools(tools);

    await expect(
      edit.execute('edit-1', {
        path: 'notes.md',
        edits: [{ oldText: 'old', newText: 'a'.repeat(PiFileMutationCharacterLimit + 1) }],
      }),
    ).rejects.toThrow('must be at most 4000 characters');
    expect(tools.edit.execute).not.toHaveBeenCalled();
  });
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
