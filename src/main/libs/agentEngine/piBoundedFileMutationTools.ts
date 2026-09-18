// Bounds Pi's built-in read tool only. Write and edit payload limits were
// removed: the schema rejects an oversized payload after the model has already
// generated it, so the limit discarded completed work without preventing the
// long response it was meant to avoid.
export const PiReadResultCharacterLimit = 12000;
export const PiReadLineLimit = 300;

type PiToolParameterSchema = {
  properties?: Record<string, PiToolParameterSchema>;
  items?: PiToolParameterSchema;
  maximum?: number;
  [key: string]: unknown;
};

type PiToolExecute = (
  toolCallId: string,
  params: unknown,
  signal?: AbortSignal,
  onUpdate?: unknown,
) => Promise<unknown>;

export type PiFileMutationToolDefinition = Record<string, unknown> & {
  name: string;
  parameters: PiToolParameterSchema;
  execute: PiToolExecute;
};

type PiReadInput = {
  offset?: unknown;
};

type PiToolResultContent = {
  type?: unknown;
  text?: unknown;
  [key: string]: unknown;
};

type PiToolResult = {
  content?: unknown;
  [key: string]: unknown;
};

const getSchemaProperty = (
  parameters: PiToolParameterSchema,
  name: string,
): PiToolParameterSchema => {
  const property = parameters.properties?.[name];
  if (!property) {
    throw new Error(`The built-in tool schema is missing the "${name}" parameter.`);
  }
  return property;
};

const constrainReadParameters = (parameters: PiToolParameterSchema): PiToolParameterSchema => ({
  ...parameters,
  properties: {
    ...parameters.properties,
    limit: {
      ...getSchemaProperty(parameters, 'limit'),
      maximum: PiReadLineLimit,
    },
  },
});

const isToolResult = (value: unknown): value is PiToolResult =>
  typeof value === 'object' && value !== null;

const isTextContent = (value: unknown): value is PiToolResultContent =>
  typeof value === 'object' && value !== null && (value as PiToolResultContent).type === 'text';

const getReadOffset = (params: unknown): number => {
  const offset =
    typeof params === 'object' && params !== null ? (params as PiReadInput).offset : undefined;
  return typeof offset === 'number' && Number.isInteger(offset) && offset > 0 ? offset : 1;
};

const truncateReadResult = (result: unknown, params: unknown): unknown => {
  if (!isToolResult(result) || !Array.isArray(result.content)) return result;

  let remainingCharacters = PiReadResultCharacterLimit;
  let truncated = false;
  let shownLines = 0;
  const content = result.content.map(item => {
    if (!isTextContent(item) || typeof item.text !== 'string') {
      return item;
    }
    if (remainingCharacters === 0) {
      truncated = true;
      return { ...item, text: '' };
    }
    if (item.text.length <= remainingCharacters) {
      remainingCharacters -= item.text.length;
      shownLines += item.text.split('\n').length - 1;
      return item;
    }

    const candidate = item.text.slice(0, remainingCharacters);
    const lastLineBreak = candidate.lastIndexOf('\n');
    const text = lastLineBreak > 0 ? candidate.slice(0, lastLineBreak + 1) : candidate;
    shownLines += text.split('\n').length - 1;
    remainingCharacters = 0;
    truncated = true;
    return { ...item, text };
  });

  if (!truncated) return result;

  const nextOffset = getReadOffset(params) + shownLines;
  return {
    ...result,
    content: [
      ...content,
      {
        type: 'text',
        text: `\n\n[Read output was capped at ${PiReadResultCharacterLimit} characters to keep the agent request reliable. Continue with offset=${nextOffset} and limit=${PiReadLineLimit}.]`,
      },
    ],
  };
};

/**
 * Re-register Pi's read tool with a bounded result. The stock tool can return
 * 50 KiB in one call; retaining that response in the next model request can
 * leave the upstream silent long enough for a gateway read timeout.
 */
export const createPiBoundedReadTool = (
  tool: PiFileMutationToolDefinition,
): PiFileMutationToolDefinition => ({
  ...tool,
  parameters: constrainReadParameters(tool.parameters),
  execute: async (toolCallId, params, signal, onUpdate) =>
    truncateReadResult(await tool.execute(toolCallId, params, signal, onUpdate), params),
});
